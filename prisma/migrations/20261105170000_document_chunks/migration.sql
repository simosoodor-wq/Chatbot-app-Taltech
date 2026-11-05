CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "page" INTEGER,
    "language" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1024),
    "searchText" tsvector GENERATED ALWAYS AS (
        to_tsvector('simple', "manufacturer" || ' ' || "title" || ' ' || "content")
    ) STORED,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DocumentChunk_embedding_idx" ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "DocumentChunk_searchText_idx" ON "DocumentChunk" USING gin ("searchText");
