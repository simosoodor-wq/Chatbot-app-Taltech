import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Meister",
  description: "Soome Maja ehitusassistent",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="et" className={cn("font-sans", geist.variable)}>
      <body className="flex h-dvh flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        <footer className="border-t bg-white px-3 py-1 text-center text-xs text-slate-500">
          © 2026 Soome Maja. Built with Claude Code
        </footer>
      </body>
    </html>
  );
}
