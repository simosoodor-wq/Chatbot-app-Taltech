import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export function GET() {
  return handle(async () => {
    const chats = await prisma.chatSession.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, updatedAt: true },
    });
    return NextResponse.json(chats);
  });
}

export function POST() {
  return handle(async () => {
    const firstPrompt = await prisma.systemPrompt.findFirst({ orderBy: { createdAt: "asc" } });
    const chat = await prisma.chatSession.create({
      data: { systemPromptId: firstPrompt?.id },
      include: { messages: true },
    });
    return NextResponse.json(chat, { status: 201 });
  });
}
