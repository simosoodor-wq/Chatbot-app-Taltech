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

/** The trial volume is small, and Postgres keeps up to 1 GB of write-ahead log by default. */
async function limitDiskUse() {
  const statements = [
    `ALTER SYSTEM SET max_wal_size = '128MB'`,
    `ALTER SYSTEM SET min_wal_size = '32MB'`,
    `SELECT pg_reload_conf()`,
    `CHECKPOINT`,
    `VACUUM "DocumentChunk"`,
  ];
  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      console.error(`[index] "${statement}" failed:`, error.message);
    }
  }
}

/** Returns chunks still to store, and drops rows whose text no longer exists. */
async function pendingChunks(chunks) {
  const wanted = new Set(chunks.map((chunk) => chunk.id));
  const existing = await prisma.$queryRaw`
    SELECT "id", "embedding" IS NOT NULL AS "embedded" FROM "DocumentChunk"`;

  const stale = existing.map((row) => row.id).filter((id) => !wanted.has(id));
  for (let i = 0; i < stale.length; i += INSERT_BATCH) {
    await prisma.documentChunk.deleteMany({ where: { id: { in: stale.slice(i, i + INSERT_BATCH) } } });
  }

  const finished = new Set(
    existing.filter((row) => row.embedded || !VOYAGE_KEY).map((row) => row.id),
  );
  const pending = chunks.filter((chunk) => !finished.has(chunk.id));
  console.log(`[index] ${pending.length} chunks pending, ${stale.length} removed`);
  return pending;
}

async function storeTextOnly(pending) {
  console.log("[index] VOYAGE_API_KEY is not set; only text search is available.");
  for (let i = 0; i < pending.length; i += INSERT_BATCH) {
    await prisma.documentChunk.createMany({
      data: pending.slice(i, i + INSERT_BATCH),
      skipDuplicates: true,
    });
  }
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

/** Each row is written once, with its vector, to avoid dead rows on the small volume. */
async function storeEmbedded(pending) {
  let done = 0;
  let batchSize = EMBED_BATCH;
  let paceMs = 0;
  while (done < pending.length) {
    const rows = pending.slice(done, done + batchSize);

    let vectors;
    try {
      vectors = await embed(rows.map((row) => `${row.title}

${row.content}`));
    } catch (error) {
      if (!(error instanceof RateLimited)) throw error;
      batchSize = Math.max(MIN_EMBED_BATCH, Math.floor(batchSize / 2));
      paceMs = RATE_LIMITED_PACE_MS;
      console.log(`[index] rate limited, waiting a minute; batch is now ${batchSize}`);
      await sleep(RATE_LIMIT_WAIT_MS);
      continue;
    }
    const payload = rows.map((row, index) => ({
      ...row,
      embedding: JSON.stringify(vectors[index]),
    }));
    await prisma.$executeRaw`
      INSERT INTO "DocumentChunk"
        ("id", "docId", "manufacturer", "title", "url", "page", "language", "content", "embedding")
      SELECT x."id", x."docId", x."manufacturer", x."title", x."url", x."page", x."language",
        x."content", x."embedding"::vector
      FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS x(
        "id" text, "docId" text, "manufacturer" text, "title" text, "url" text, "page" int,
        "language" text, "content" text, "embedding" text)
      ON CONFLICT ("id") DO UPDATE SET "embedding" = EXCLUDED."embedding"`;
    const before = done;
    done += rows.length;
    if (Math.floor(done / LOG_EVERY) > Math.floor(before / LOG_EVERY)) {
      console.log(`[index] stored ${done} of ${pending.length} chunks`);
    }
    await sleep(paceMs);
  }
  console.log(`[index] finished, ${done} chunks stored`);
}

try {
  await limitDiskUse();
  const pending = await pendingChunks(readChunks());
  await (VOYAGE_KEY ? storeEmbedded(pending) : storeTextOnly(pending));
  await limitDiskUse();
} catch (error) {
  console.error("[index] stopped:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
