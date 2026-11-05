// Runs beside the web server on Railway. Safe to restart: finished chunks are skipped by id.
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const VOYAGE_KEY = process.env.VOYAGE_API_KEY?.trim();
// Keys created in MongoDB Atlas only work on its own host.
const VOYAGE_URL = VOYAGE_KEY?.startsWith("al-")
  ? "https://ai.mongodb.com/v1/embeddings"
  : "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-4-large";
const INSERT_BATCH = 500;
const EMBED_BATCH = 64;
const MIN_EMBED_BATCH = 8;
const MAX_ATTEMPTS = 8;
const RATE_LIMIT_WAIT_MS = 65_000;
const RATE_LIMITED_PACE_MS = 21_000;
const LOG_EVERY = 500;

const prisma = new PrismaClient();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readChunks() {
  return readFileSync("data/knowledge/chunks.jsonl", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function syncRows(chunks) {
  const wanted = new Set(chunks.map((chunk) => chunk.id));
  const existing = await prisma.documentChunk.findMany({ select: { id: true } });
  const known = new Set(existing.map((row) => row.id));

  const stale = [...known].filter((id) => !wanted.has(id));
  for (let i = 0; i < stale.length; i += INSERT_BATCH) {
    await prisma.documentChunk.deleteMany({ where: { id: { in: stale.slice(i, i + INSERT_BATCH) } } });
  }

  const missing = chunks.filter((chunk) => !known.has(chunk.id));
  for (let i = 0; i < missing.length; i += INSERT_BATCH) {
    await prisma.documentChunk.createMany({
      data: missing.slice(i, i + INSERT_BATCH),
      skipDuplicates: true,
    });
  }
  console.log(`[index] rows: ${missing.length} added, ${stale.length} removed`);
}

class RateLimited extends Error {}

async function embed(texts) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VOYAGE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: "document" }),
    });
    if (response.ok) {
      const body = await response.json();
      return body.data.map((item) => item.embedding);
    }
    if (response.status === 429) throw new RateLimited();
    if (response.status < 500 || attempt >= MAX_ATTEMPTS) {
      throw new Error(`Voyage returned ${response.status}: ${await response.text()}`);
    }
    const waitSeconds = Math.min(5 * 2 ** attempt, 120);
    console.log(`[index] Voyage ${response.status}, retrying in ${waitSeconds}s`);
    await sleep(waitSeconds * 1000);
  }
}

async function embedMissing() {
  if (!VOYAGE_KEY) {
    console.log("[index] VOYAGE_API_KEY is not set; only text search is available.");
    return;
  }
  let done = 0;
  let batchSize = EMBED_BATCH;
  let paceMs = 0;
  for (;;) {
    const rows = await prisma.$queryRaw`
      SELECT "id", "title", "content" FROM "DocumentChunk"
      WHERE "embedding" IS NULL ORDER BY "id" LIMIT ${batchSize}`;
    if (rows.length === 0) break;

    let vectors;
    try {
      vectors = await embed(rows.map((row) => `${row.title}\n\n${row.content}`));
    } catch (error) {
      if (!(error instanceof RateLimited)) throw error;
      batchSize = Math.max(MIN_EMBED_BATCH, Math.floor(batchSize / 2));
      paceMs = RATE_LIMITED_PACE_MS;
      console.log(`[index] rate limited, waiting a minute; batch is now ${batchSize}`);
      await sleep(RATE_LIMIT_WAIT_MS);
      continue;
    }
    await prisma.$transaction(
      rows.map((row, index) =>
        prisma.$executeRaw`
          UPDATE "DocumentChunk" SET "embedding" = ${JSON.stringify(vectors[index])}::vector
          WHERE "id" = ${row.id}`,
      ),
    );
    const before = done;
    done += rows.length;
    if (Math.floor(done / LOG_EVERY) > Math.floor(before / LOG_EVERY)) {
      console.log(`[index] embedded ${done} chunks`);
    }
    await sleep(paceMs);
  }
  console.log(`[index] embedding finished, ${done} chunks this run`);
}

try {
  await syncRows(readChunks());
  await embedMissing();
} catch (error) {
  console.error("[index] stopped:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
