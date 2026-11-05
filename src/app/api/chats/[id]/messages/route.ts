import { NextResponse } from "next/server";
import { DB_ERROR, errorResponse, handle, isDatabaseError } from "@/lib/api";
import { friendlyClaudeError, streamAnswer, type Attachment } from "@/lib/claude";
import {
  dailyMessageLimit,
  HISTORY_MESSAGES,
  IMAGE_TYPES,
  MAX_FILE_BYTES,
  MAX_MESSAGE_LENGTH,
  startOfUtcDay,
} from "@/lib/limits";
import { DEFAULT_MODEL, isModelId } from "@/lib/models";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt, withPassages } from "@/lib/prompts";
import { citedSources, retrievePassages, type Passage } from "@/lib/retrieval";

type Context = { params: Promise<{ id: string }> };

const TEXT_EXTENSIONS = /\.(txt|md|csv|json)$/i;
const SHORT_FOLLOW_UP = 60;

/** Short follow-ups such as "aga talvel?" only make sense with the question before them. */
function searchQuery(turns: { role: string; content: string }[]): string {
  const questions = turns.filter((turn) => turn.role === "user");
  const current = questions[questions.length - 1].content;
  const previous = questions[questions.length - 2]?.content;
  return previous && current.length < SHORT_FOLLOW_UP ? `${previous}\n${current}` : current;
}

async function findPassages(query: string, topP: number): Promise<Passage[]> {
  try {
    return await retrievePassages(query, topP);
  } catch (error) {
    console.error("Document search failed:", error);
    return [];
  }
}

async function readAttachment(
  entry: FormDataEntryValue | null,
): Promise<Attachment | string | null> {
  if (!(entry instanceof File) || entry.size === 0) return null;
  if (entry.size > MAX_FILE_BYTES) return "Fail on liiga suur. Lubatud on kuni 10 MB.";

  const isImage = IMAGE_TYPES.some((type) => type === entry.type);
  const isPdf = entry.type === "application/pdf";
  if (!isImage && !isPdf && !TEXT_EXTENSIONS.test(entry.name)) {
    return "Seda failitüüpi ei saa lugeda. Lubatud on PDF, pilt ja tekstifail.";
  }
  return {
    name: entry.name,
    mediaType: entry.type,
    data: Buffer.from(await entry.arrayBuffer()),
  };
}

export function POST(request: Request, { params }: Context) {
  return handle(async () => {
    const { id } = await params;
    const form = await request.formData().catch(() => null);
    if (!form) return errorResponse("Vigane päring.", 400);

    const text = String(form.get("text") ?? "").trim();
    const attachment = await readAttachment(form.get("file"));
    if (typeof attachment === "string") return errorResponse(attachment, 400);
    if (!text) return errorResponse("Sõnum on tühi.", 400);
    if (text.length > MAX_MESSAGE_LENGTH) {
      return errorResponse("Sõnum on liiga pikk. Lubatud on kuni 20 000 tähemärki.", 400);
    }

    const sentToday = await prisma.message.count({
      where: { role: "user", createdAt: { gte: startOfUtcDay() } },
    });
    if (sentToday >= dailyMessageLimit()) {
      return errorResponse("Tänane sõnumite limiit on täis. Proovi homme uuesti.", 429);
    }

    const chat = await prisma.chatSession.findUnique({
      where: { id },
      include: { systemPrompt: true },
    });
    if (!chat) return errorResponse("Vestlust ei leitud.", 404);

    const userMessage = await prisma.message.create({
      data: { sessionId: id, role: "user", content: text, attachmentName: attachment?.name },
    });

    const isFirstMessage = chat.title === "Uus vestlus";
    await prisma.chatSession.update({
      where: { id },
      data: isFirstMessage ? { title: text.slice(0, 60) } : { updatedAt: new Date() },
    });

    const recent = await prisma.message.findMany({
      where: { sessionId: id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_MESSAGES,
    });
    const ordered = recent.reverse();
    const firstUser = ordered.findIndex((message) => message.role === "user");
    const turns = ordered.slice(firstUser).map((message) => ({
      role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: message.content,
    }));

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const send = (event: object) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            open = false;
          }
        };

        send({ type: "user", message: userMessage });
        try {
          const passages = await findPassages(searchQuery(turns), chat.topP);
          const question = turns[turns.length - 1];
          let answer = "";
          for await (const delta of streamAnswer({
            model: isModelId(chat.model) ? chat.model : DEFAULT_MODEL,
            system: buildSystemPrompt(chat.systemPrompt?.content, chat.temperature),
            turns: [
              ...turns.slice(0, -1),
              { ...question, content: withPassages(question.content, passages) },
            ],
            attachment: attachment ?? undefined,
          })) {
            answer += delta;
            send({ type: "delta", text: delta });
          }
          const saved = await prisma.message.create({
            data: {
              sessionId: id,
              role: "assistant",
              content: answer,
              sources: citedSources(passages, answer),
            },
          });
          send({ type: "done", message: saved });
        } catch (error) {
          console.error(error);
          send({
            type: "error",
            error: isDatabaseError(error) ? DB_ERROR : friendlyClaudeError(error),
          });
        } finally {
          if (open) controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  });
}

export function DELETE(_request: Request, { params }: Context) {
  return handle(async () => {
    const { id } = await params;
    await prisma.message.deleteMany({ where: { sessionId: id } });
    await prisma.chatSession.updateMany({ where: { id }, data: { title: "Uus vestlus" } });
    return new NextResponse(null, { status: 204 });
  });
}
