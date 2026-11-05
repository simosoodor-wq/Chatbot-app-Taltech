import Anthropic from "@anthropic-ai/sdk";
import { IMAGE_TYPES } from "@/lib/limits";
import type { ModelId } from "@/lib/models";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type Attachment = { name: string; mediaType: string; data: Buffer };

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ContentBlock = Anthropic.Beta.Messages.BetaContentBlockParam;

const MAX_TOKENS = 16_000;

function attachmentBlock(file: Attachment): ContentBlock {
  if (file.mediaType === "application/pdf") {
    return {
      type: "document",
      title: file.name,
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: file.data.toString("base64"),
      },
    };
  }
  const imageType = IMAGE_TYPES.find((type) => type === file.mediaType);
  if (imageType) {
    return {
      type: "image",
      source: { type: "base64", media_type: imageType, data: file.data.toString("base64") },
    };
  }
  return { type: "text", text: `Lisatud fail "${file.name}":\n\n${file.data.toString("utf8")}` };
}

function toMessages(turns: ChatTurn[], attachment?: Attachment): MessageParam[] {
  return turns.map((turn, index) => {
    const isLast = index === turns.length - 1;
    if (!attachment || !isLast) return { role: turn.role, content: turn.content };
    return {
      role: turn.role,
      content: [attachmentBlock(attachment), { type: "text", text: turn.content }],
    };
  });
}

/** Streams answer text. Yields only visible text; thinking stays on the API side. */
export async function* streamAnswer(options: {
  model: ModelId;
  system: string;
  turns: ChatTurn[];
  attachment?: Attachment;
}): AsyncGenerator<string> {
  const client = new Anthropic();
  // Haiku has no server-side fallback; a refusal there is shown to the user instead.
  const fallback =
    options.model === "claude-haiku-5-5"
      ? {}
      : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

  const stream = client.beta.messages.stream({
    model: options.model,
    max_tokens: MAX_TOKENS,
    system: options.system,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages: toMessages(options.turns, options.attachment),
    ...fallback,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }

  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    yield "\n\nSellele küsimusele ei saa ma vastata.";
  } else if (final.stop_reason === "max_tokens") {
    yield "\n\n(Vastus jäi pikkuse piirangu tõttu pooleli.)";
  }
}

export function friendlyClaudeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "Claude API võti puudub või on vale. Kontrolli Railway seadistust.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Claude API on hetkel ülekoormatud. Proovi mõne aja pärast uuesti.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    return "Claude ei saanud seda päringut töödelda. Kontrolli lisatud faili ja proovi uuesti.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Claude API-ga ei saanud ühendust. Proovi uuesti.";
  }
  if (error instanceof Anthropic.APIError) {
    return "Claude API andis vea. Proovi uuesti.";
  }
  return "Vastuse koostamine ebaõnnestus. Proovi uuesti.";
}
