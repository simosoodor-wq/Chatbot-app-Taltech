"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ACCEPTED_FILES, MAX_FILE_BYTES, MAX_MESSAGE_LENGTH } from "@/lib/limits";

export function Composer(props: {
  busy: boolean;
  canClear: boolean;
  onSend: (text: string, file: File | null, onAccepted: () => void) => Promise<void>;
  onClear: () => void;
  onError: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    const borders = element.offsetHeight - element.clientHeight;
    element.style.height = `${Math.min(element.scrollHeight + borders, 200)}px`;
  }, [text]);

  function clearFile() {
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function chooseFile(chosen: File | undefined) {
    if (!chosen) return;
    if (chosen.size > MAX_FILE_BYTES) {
      props.onError("Fail on liiga suur. Lubatud on kuni 10 MB.");
      clearFile();
      return;
    }
    setFile(chosen);
  }

  async function submit() {
    if (props.busy) return;
    const trimmed = text.trim();
    if (!trimmed) {
      props.onError("Kirjuta enne saatmist sõnum.");
      return;
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      props.onError("Sõnum on liiga pikk. Lubatud on kuni 20 000 tähemärki.");
      return;
    }
    await props.onSend(trimmed, file, () => {
      setText("");
      clearFile();
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div className="border-t bg-white p-3">
      <div className="mx-auto max-w-3xl space-y-2">
        {file && (
          <p className="flex w-fit max-w-full items-center gap-1.5 rounded-lg bg-slate-100 py-1 pr-1 pl-2.5 text-sm">
            <Paperclip className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{file.name}</span>
            <Button variant="ghost" size="icon-xs" aria-label="Eemalda fail" onClick={clearFile}>
              <X />
            </Button>
          </p>
        )}
        <Textarea
          ref={textarea}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Kirjuta oma sõnum..."
          aria-label="Sõnum"
          className="max-h-[200px] min-h-10 resize-none text-base md:text-sm"
        />
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED_FILES}
            className="hidden"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Lisa fail"
            title="Lisa fail"
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip />
          </Button>
          <div className="ml-auto flex gap-2">
            <Button
              variant="secondary"
              onClick={props.onClear}
              disabled={props.busy || !props.canClear}
            >
              Tühjenda
            </Button>
            <Button onClick={() => void submit()} disabled={props.busy}>
              <Send /> Saada
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
