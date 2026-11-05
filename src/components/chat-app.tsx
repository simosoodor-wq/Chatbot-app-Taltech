"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, Settings2, X } from "lucide-react";
import { ChatSidebar } from "@/components/chat-sidebar";
import { Composer } from "@/components/composer";
import { MessageList } from "@/components/message-list";
import { PromptsDialog } from "@/components/prompts-dialog";
import { SettingsDialog } from "@/components/settings-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  jsonBody,
  readEvents,
  request,
  requestJson,
  type ChatDetail,
  type ChatMessage,
  type ChatSummary,
  type SystemPrompt,
} from "@/lib/client";
import { DEFAULT_MODEL, MODELS } from "@/lib/models";

type Confirmation = { title: string; description: string; action: () => void };

const NO_PROMPT = "none";
const MODEL_ITEMS = MODELS.map((model) => ({ value: model.id, label: model.label }));

export function ChatApp() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [active, setActive] = useState<ChatDetail | null>(null);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  // Stream events must not land in a chat the user has since left.
  const activeId = useRef<string | null>(null);
  activeId.current = active?.id ?? null;

  const attempt = useCallback(async (action: () => Promise<void>) => {
    setError("");
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Midagi läks valesti.");
    }
  }, []);

  const loadChats = useCallback(async () => {
    const list = await requestJson<ChatSummary[]>("/api/chats");
    setChats(list);
    return list;
  }, []);

  const loadPrompts = useCallback(async () => {
    setPrompts(await requestJson<SystemPrompt[]>("/api/prompts"));
  }, []);

  const openChat = useCallback(async (id: string) => {
    setActive(await requestJson<ChatDetail>(`/api/chats/${id}`));
  }, []);

  useEffect(() => {
    void attempt(async () => {
      const [list] = await Promise.all([loadChats(), loadPrompts()]);
      if (list[0]) await openChat(list[0].id);
    });
  }, [attempt, loadChats, loadPrompts, openChat]);

  async function createChat() {
    const chat = await requestJson<ChatDetail>("/api/chats", { method: "POST" });
    setActive(chat);
    await loadChats();
    return chat;
  }

  async function updateActive(values: Partial<ChatDetail>) {
    if (!active) return;
    const id = active.id;
    setActive((current) => (current?.id === id ? { ...current, ...values } : current));
    await attempt(async () => {
      await requestJson(`/api/chats/${id}`, jsonBody("PATCH", values));
    });
  }

  async function send(text: string, file: File | null): Promise<boolean> {
    setError("");
    setBusy(true);
    setStreaming("");
    let accepted = false;
    try {
      const chat = active ?? (await createChat());
      const form = new FormData();
      form.set("text", text);
      if (file) form.set("file", file);
      const response = await request(`/api/chats/${chat.id}/messages`, {
        method: "POST",
        body: form,
      });
      accepted = true;

      const append = (message: ChatMessage) =>
        setActive((current) =>
          current?.id === chat.id
            ? { ...current, messages: [...current.messages, message] }
            : current,
        );

      await readEvents(response, (event) => {
        if (event.type === "error") {
          setError(event.error);
        } else if (event.type === "user") {
          append(event.message);
        } else if (event.type === "done") {
          setStreaming("");
          append(event.message);
        } else if (activeId.current === chat.id) {
          setStreaming((current) => current + event.text);
        }
      });
      await loadChats();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Saatmine ebaõnnestus.");
    }
    setStreaming("");
    setBusy(false);
    return accepted;
  }

  function askDelete(chat: ChatSummary) {
    setConfirmation({
      title: "Kustutada vestlus?",
      description: `"${chat.title}" kustutatakse kõigi jaoks jäädavalt.`,
      action: () =>
        void attempt(async () => {
          await request(`/api/chats/${chat.id}`, { method: "DELETE" });
          const list = await loadChats();
          if (active?.id !== chat.id) return;
          if (list[0]) await openChat(list[0].id);
          else setActive(null);
        }),
    });
  }

  function askClear() {
    if (!active) return;
    const id = active.id;
    setConfirmation({
      title: "Tühjendada vestlus?",
      description: "Kõik selle vestluse sõnumid kustutatakse jäädavalt.",
      action: () =>
        void attempt(async () => {
          await request(`/api/chats/${id}/messages`, { method: "DELETE" });
          await openChat(id);
          await loadChats();
        }),
    });
  }

  const promptItems = [
    { value: NO_PROMPT, label: "Ilma promptita" },
    ...prompts.map((prompt) => ({ value: prompt.id, label: prompt.name })),
  ];

  const sidebar = (
    <ChatSidebar
      chats={chats}
      activeId={active?.id ?? null}
      onSelect={(id) => {
        setSidebarOpen(false);
        void attempt(() => openChat(id));
      }}
      onDelete={askDelete}
      onNew={() => {
        setSidebarOpen(false);
        void attempt(async () => {
          await createChat();
        });
      }}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-white">
      <aside className="hidden w-[260px] shrink-0 border-r md:block">{sidebar}</aside>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-[280px] p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Vestluste ajalugu</SheetTitle>
          <SheetDescription className="sr-only">Vali või kustuta vestlus</SheetDescription>
          {sidebar}
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Ava vestluste ajalugu"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu />
          </Button>
          <div className="mr-auto leading-tight">
            <p className="font-semibold text-slate-900">Meister</p>
            <p className="text-xs text-slate-500">Soome Maja ehitusassistent</p>
          </div>

          <Select
            items={MODEL_ITEMS}
            value={active?.model ?? DEFAULT_MODEL}
            disabled={!active}
            onValueChange={(model) => {
              if (model) void updateActive({ model });
            }}
          >
            <SelectTrigger aria-label="Keelemudel" className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            items={promptItems}
            value={active?.systemPromptId ?? NO_PROMPT}
            disabled={!active}
            onValueChange={(value) => {
              void updateActive({ systemPromptId: value === NO_PROMPT ? null : value });
            }}
          >
            <SelectTrigger aria-label="Süsteemiprompt" className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {promptItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => setPromptsOpen(true)}>
            Halda prompte
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Täpsemad seaded"
            title="Täpsemad seaded"
            disabled={!active}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 />
          </Button>
        </header>

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800"
          >
            <span className="flex-1">{error}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Sulge teade"
              onClick={() => setError("")}
            >
              <X />
            </Button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <MessageList messages={active?.messages ?? []} streaming={streaming} waiting={busy} />
        </div>

        <Composer
          busy={busy}
          canClear={(active?.messages.length ?? 0) > 0}
          onSend={send}
          onClear={askClear}
          onError={setError}
        />
      </main>

      <PromptsDialog
        open={promptsOpen}
        onOpenChange={setPromptsOpen}
        prompts={prompts}
        onChanged={async () => {
          await loadPrompts();
          if (active) await openChat(active.id);
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        temperature={active?.temperature ?? 0.3}
        topP={active?.topP ?? 0.5}
        onSave={(values) => void updateActive(values)}
      />

      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tühista</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                confirmation?.action();
                setConfirmation(null);
              }}
            >
              Kustuta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
