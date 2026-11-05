-- About 12,000 rows do not need an approximate index, and building it filled the trial volume.
DROP INDEX IF EXISTS "DocumentChunk_embedding_idx";
