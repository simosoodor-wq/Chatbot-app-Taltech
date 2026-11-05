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
const MAX_ATTEMPTS = 8;

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
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
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
  for (;;) {
    const rows = await prisma.$queryRaw`
      SELECT "id", "title", "content" FROM "DocumentChunk"
      WHERE "embedding" IS NULL ORDER BY "id" LIMIT ${EMBED_BATCH}`;
    if (rows.length === 0) break;

    const vectors = await embed(rows.map((row) => `${row.title}\n\n${row.content}`));
    await prisma.$transaction(
      rows.map((row, index) =>
        prisma.$executeRaw`
          UPDATE "DocumentChunk" SET "embedding" = ${JSON.stringify(vectors[index])}::vector
          WHERE "id" = ${row.id}`,
      ),
    );
    done += rows.length;
    if (done % (EMBED_BATCH * 25) === 0) console.log(`[index] embedded ${done} chunks`);
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
