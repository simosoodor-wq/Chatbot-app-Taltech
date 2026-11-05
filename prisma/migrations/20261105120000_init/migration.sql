-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Uus vestlus',
    "model" TEXT NOT NULL DEFAULT 'claude-opus-5-5',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "topP" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "systemPromptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachmentName" TEXT,
    "sources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemPrompt" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_sessionId_createdAt_idx" ON "Message"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_role_createdAt_idx" ON "Message"("role", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemPrompt_name_key" ON "SystemPrompt"("name");

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_systemPromptId_fkey" FOREIGN KEY ("systemPromptId") REFERENCES "SystemPrompt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

