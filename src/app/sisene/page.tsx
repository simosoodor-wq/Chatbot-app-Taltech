"use client";

import { useState, type FormEvent } from "react";
import { HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AccessPage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (response.ok) {
        window.location.assign("/");
        return;
      }
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "Sisenemine ebaõnnestus.");
    } catch {
      setError("Serveriga ei saanud ühendust.");
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-full items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HardHat className="size-5" aria-hidden />
          </div>
          <div>
            <h1 className="font-semibold">Meister</h1>
            <p className="text-sm text-muted-foreground">Soome Maja ehitusassistent</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="code">Ligipääsukood</Label>
          <Input
            id="code"
            type="password"
            autoComplete="off"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoFocus
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy || !code}>
          Sisene
        </Button>
      </form>
    </main>
  );
}
