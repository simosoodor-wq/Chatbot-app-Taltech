import { NextResponse } from "next/server";
import { errorResponse, handle, isNotFound, isUniqueViolation } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type PromptInput = { name: string; content: string };

function parsePrompt(body: unknown): PromptInput | null {
  const { name, content } = (body ?? {}) as Partial<PromptInput>;
  if (typeof name !== "string" || typeof content !== "string") return null;
  const trimmed = { name: name.trim(), content: content.trim() };
  if (!trimmed.name || !trimmed.content || trimmed.name.length > 60) return null;
  return trimmed;
}

const INVALID = "Sisesta prompti nimi (kuni 60 märki) ja sisu.";
const DUPLICATE = "Sellise nimega prompt on juba olemas.";

export function GET() {
  return handle(async () => {
    const prompts = await prisma.systemPrompt.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json(prompts);
  });
}

export function POST(request: Request) {
  return handle(async () => {
    const data = parsePrompt(await request.json().catch(() => null));
    if (!data) return errorResponse(INVALID, 400);
    try {
      return NextResponse.json(await prisma.systemPrompt.create({ data }), { status: 201 });
    } catch (error) {
      if (isUniqueViolation(error)) return errorResponse(DUPLICATE, 409);
      throw error;
    }
  });
}

export function PUT(request: Request) {
  return handle(async () => {
    const body = await request.json().catch(() => null);
    const data = parsePrompt(body);
    if (!data || typeof body?.id !== "string") return errorResponse(INVALID, 400);
    try {
      return NextResponse.json(await prisma.systemPrompt.update({ where: { id: body.id }, data }));
    } catch (error) {
      if (isUniqueViolation(error)) return errorResponse(DUPLICATE, 409);
      if (isNotFound(error)) return errorResponse("Prompti ei leitud.", 404);
      throw error;
    }
  });
}

export function DELETE(request: Request) {
  return handle(async () => {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return errorResponse("Prompti id puudub.", 400);
    await prisma.systemPrompt.deleteMany({ where: { id } });
    return new NextResponse(null, { status: 204 });
  });
}
