export type ChatSummary = { id: string; title: string; updatedAt: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachmentName: string | null;
  createdAt: string;
};

export type ChatDetail = ChatSummary & {
  model: string;
  temperature: number;
  topP: number;
  systemPromptId: string | null;
  messages: ChatMessage[];
};

export type SystemPrompt = { id: string; name: string; content: string };

export type StreamEvent =
  | { type: "user"; message: ChatMessage }
  | { type: "delta"; text: string }
  | { type: "done"; message: ChatMessage }
  | { type: "error"; error: string };

const CONNECTION_ERROR = "Serveriga ei saanud ühendust. Kontrolli võrku ja proovi uuesti.";

/** Fetches and raises the server's own readable message on failure. */
export async function request(url: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error(CONNECTION_ERROR);
  }
  if (response.status === 401) {
    window.location.assign("/sisene");
    throw new Error("Sisesta ligipääsukood.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Midagi läks valesti. Proovi uuesti.");
  }
  return response;
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  return (await request(url, init)).json();
}

export function jsonBody(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function readEvents(response: Response, onEvent: (event: StreamEvent) => void) {
  const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
  if (!reader) throw new Error(CONNECTION_ERROR);

  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as StreamEvent);
    }
  }
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("et-EE", { timeStyle: "short" }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("et-EE", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}
