"use client";

import { useEffect, useRef } from "react";
import { Paperclip } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatTime, type ChatMessage } from "@/lib/client";

function Markdown({ text }: { text: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <li className={isUser ? "flex flex-col items-end" : "flex flex-col items-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-lg bg-primary px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words text-primary-foreground"
            : "max-w-[85%] rounded-lg bg-slate-100 px-3.5 py-2.5 text-sm break-words text-slate-900"
        }
      >
        {isUser ? message.content : <Markdown text={message.content} />}
        {message.attachmentName && (
          <p className="mt-1.5 flex items-center gap-1 text-xs opacity-80">
            <Paperclip className="size-3" aria-hidden /> {message.attachmentName}
          </p>
        )}
      </div>
      <time dateTime={message.createdAt} className="mt-1 px-1 text-xs text-slate-500">
        {formatTime(message.createdAt)}
      </time>
    </li>
  );
}

export function MessageList(props: {
  messages: ChatMessage[];
  streaming: string;
  waiting: boolean;
}) {
  const end = useRef<HTMLLIElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [props.messages, props.streaming, props.waiting]);

  if (props.messages.length === 0 && !props.waiting) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="font-medium text-slate-900">Tere! Mina olen Meister.</p>
          <p className="mt-1 text-sm text-muted-foreground">Küsi midagi ehitamise kohta.</p>
        </div>
      </div>
    );
  }

  return (
    <ul className="mx-auto w-full max-w-3xl space-y-4 p-4">
      {props.messages.map((message) => (
        <Bubble key={message.id} message={message} />
      ))}
      {props.streaming && (
        <li className="flex flex-col items-start">
          <div className="max-w-[85%] rounded-lg bg-slate-100 px-3.5 py-2.5 text-sm break-words text-slate-900">
            <Markdown text={props.streaming} />
          </div>
        </li>
      )}
      {props.waiting && !props.streaming && (
        <li className="text-sm text-slate-500" role="status">
          Trükib...
        </li>
      )}
      <li ref={end} aria-hidden />
    </ul>
  );
}
