"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { jsonBody, request, requestJson, type SystemPrompt } from "@/lib/client";

export function PromptsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompts: SystemPrompt[];
  onChanged: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  function reset() {
    setEditingId(null);
    setName("");
    setContent("");
    setError("");
  }

  function edit(prompt: SystemPrompt) {
    setEditingId(prompt.id);
    setName(prompt.name);
    setContent(prompt.content);
    setError("");
  }

  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
      await props.onChanged();
      reset();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Salvestamine ebaõnnestus.");
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const body = { id: editingId ?? undefined, name, content };
    void run(() => requestJson("/api/prompts", jsonBody(editingId ? "PUT" : "POST", body)));
  }

  function remove(prompt: SystemPrompt) {
    void run(() =>
      request(`/api/prompts?id=${encodeURIComponent(prompt.id)}`, { method: "DELETE" }),
    );
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) reset();
        props.onOpenChange(open);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Halda prompte</DialogTitle>
          <DialogDescription>
            Prompt määrab vastuse stiili. Allikareeglid jäävad alati kehtima.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-1">
          {props.prompts.map((prompt) => (
            <li key={prompt.id} className="flex items-center gap-1 rounded-lg border p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{prompt.name}</p>
                <p className="truncate text-xs text-muted-foreground">{prompt.content}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Muuda prompti ${prompt.name}`}
                onClick={() => edit(prompt)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Kustuta prompt ${prompt.name}`}
                onClick={() => remove(prompt)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>

        <form onSubmit={submit} className="space-y-3 border-t pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="prompt-name">Nimi</Label>
            <Input
              id="prompt-name"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prompt-content">Sisu</Label>
            <Textarea
              id="prompt-content"
              rows={3}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button type="button" variant="secondary" onClick={reset}>
                Tühista
              </Button>
            )}
            <Button type="submit">{editingId ? "Salvesta" : "Lisa prompt"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
