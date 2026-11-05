import { NextResponse } from "next/server";
import { errorResponse, handle, isNotFound } from "@/lib/api";
import { isModelId } from "@/lib/models";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };

export function GET(_request: Request, { params }: Context) {
  return handle(async () => {
    const { id } = await params;
    const chat = await prisma.chatSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!chat) return errorResponse("Vestlust ei leitud.", 404);
    return NextResponse.json(chat);
  });
}

function validUnitValue(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

export function PATCH(request: Request, { params }: Context) {
  return handle(async () => {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return errorResponse("Vigane päring.", 400);

    const data: {
      model?: string;
      temperature?: number;
      topP?: number;
      systemPromptId?: string | null;
    } = {};
    if ("model" in body) {
      if (!isModelId(body.model)) return errorResponse("Tundmatu mudel.", 400);
      data.model = body.model;
    }
    if ("temperature" in body) {
      if (!validUnitValue(body.temperature)) return errorResponse("Vigane Temperature.", 400);
      data.temperature = body.temperature;
    }
    if ("topP" in body) {
      if (!validUnitValue(body.topP)) return errorResponse("Vigane Top-P.", 400);
      data.topP = body.topP;
    }
    if ("systemPromptId" in body) {
      if (body.systemPromptId !== null && typeof body.systemPromptId !== "string") {
        return errorResponse("Vigane süsteemiprompt.", 400);
      }
      data.systemPromptId = body.systemPromptId;
    }

    try {
      return NextResponse.json(await prisma.chatSession.update({ where: { id }, data }));
    } catch (error) {
      if (isNotFound(error)) return errorResponse("Vestlust ei leitud.", 404);
      throw error;
    }
  });
}

export function DELETE(_request: Request, { params }: Context) {
  return handle(async () => {
    const { id } = await params;
    await prisma.chatSession.deleteMany({ where: { id } });
    return new NextResponse(null, { status: 204 });
  });
}
