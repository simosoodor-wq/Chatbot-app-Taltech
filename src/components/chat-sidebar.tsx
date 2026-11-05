"use client";

import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime, type ChatSummary } from "@/lib/client";
import { cn } from "@/lib/utils";

export function ChatSidebar(props: {
  chats: ChatSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (chat: ChatSummary) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-slate-50">
      <h2 className="border-b px-4 py-3 text-sm font-semibold text-slate-700">Vestluste ajalugu</h2>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {props.chats.length === 0 && (
          <li className="px-2 py-3 text-sm text-muted-foreground">Vestlusi veel pole.</li>
        )}
        {props.chats.map((chat) => (
          <li key={chat.id} className="group relative">
            <button
              type="button"
              onClick={() => props.onSelect(chat.id)}
              aria-current={chat.id === props.activeId ? "true" : undefined}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg py-2 pr-10 pl-2 text-left hover:bg-slate-200/70",
                chat.id === props.activeId && "bg-slate-200",
              )}
            >
              <MessageSquare className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-sm text-slate-900">{chat.title}</span>
                <span className="block text-xs text-slate-500">
                  {formatDateTime(chat.updatedAt)}
                </span>
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Kustuta vestlus ${chat.title}`}
              onClick={() => props.onDelete(chat)}
              className="absolute top-1/2 right-1 -translate-y-1/2 text-slate-500 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>

      <div className="border-t p-3">
        <Button className="w-full" onClick={props.onNew}>
          <Plus /> Uus vestlus
        </Button>
      </div>
    </div>
  );
}
