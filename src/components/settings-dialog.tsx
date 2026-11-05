"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { passageCount } from "@/lib/prompts";

type SliderValue = number | readonly number[];

const first = (value: SliderValue) => (typeof value === "number" ? value : value[0]);
const round = (value: number) => Math.round(value * 10) / 10;

function Setting(props: {
  label: string;
  hint: string;
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{props.label}</Label>
        <output className="text-sm font-medium tabular-nums">{props.value.toFixed(1)}</output>
      </div>
      <Slider
        aria-label={props.label}
        min={0}
        max={1}
        step={0.1}
        value={[props.value]}
        onValueChange={(value: SliderValue) => props.onChange(round(first(value)))}
        onValueCommitted={(value: SliderValue) => props.onCommit(round(first(value)))}
      />
      <p className="text-xs text-muted-foreground">{props.hint}</p>
    </div>
  );
}

export function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  temperature: number;
  topP: number;
  onSave: (values: { temperature?: number; topP?: number }) => void;
}) {
  const [temperature, setTemperature] = useState(props.temperature);
  const [topP, setTopP] = useState(props.topP);

  useEffect(() => {
    setTemperature(props.temperature);
    setTopP(props.topP);
  }, [props.temperature, props.topP, props.open]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Täpsemad seaded</DialogTitle>
          <DialogDescription>
            Seaded salvestuvad selle vestluse juurde. Mudelile neid otse ei saadeta, sest Claude API
            neid enam ei toeta, nii et need juhivad rakenduse enda loogikat.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-2">
          <Setting
            label="Temperature"
            hint="Vastuse vabadus: 0 on täpne ja lühike, 1 selgitab vabamalt."
            value={temperature}
            onChange={setTemperature}
            onCommit={(value) => props.onSave({ temperature: value })}
          />
          <Setting
            label="Top-P"
            hint={`Otsingu laius: ${passageCount(topP)} dokumendilõiku vastuse kohta. Hakkab mõjuma, kui dokumendibaas on ühendatud.`}
            value={topP}
            onChange={setTopP}
            onCommit={(value) => props.onSave({ topP: value })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
