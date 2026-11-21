import { createFileRoute } from "@tanstack/react-router";
import { FileText, ListTree, Sparkles, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { AiOutput } from "@/components/ai-output";
import { AppShell, Panel } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStreamText } from "@/hooks/use-stream-text";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => pageHead("PDF Summary", "Upload a mission PDF and get a structured technical summary."),
  component: Documents,
});

const MAX = 10 * 1024 * 1024;

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function Documents() {
  const [file, setFile] = useState<File | null>(null);
  const [focus, setFocus] = useState("");
  const [warn, setWarn] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const summary = useStreamText();

  const pick = (f: File | undefined) => {
    setWarn("");
    if (!f) return;
    if (f.type !== "application/pdf") return setWarn("Please choose a PDF file.");
    if (f.size > MAX) return setWarn("PDFs up to 10 MB are supported.");
    setFile(f);
    summary.setText("");
  };

  const run = async (detail: "short" | "detailed" = "short") => {
    if (!file) return;
    summary.run({ task: "summary", fileName: file.name, fileBase64: await toBase64(file), focus: focus || undefined, detail });
  };

  return (
    <AppShell title="PDF Summary" subtitle="Document intelligence">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[22rem_1fr]">
        <Panel title="Document">
          <button
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center hover:border-primary"
          >
            <Upload className="size-6 text-primary" />
            <span className="text-sm">Drag a PDF here or browse</span>
            <span className="text-xs text-muted-foreground">Up to 10 MB</span>
          </button>
          <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          {warn && <p className="mt-3 text-sm text-destructive">{warn}</p>}
          {file && (
            <div className="mt-4 flex items-center gap-3 rounded-md border border-border p-3">
              <FileText className="size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm">{file.name}</p>
                <p className="font-mono text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
          )}
          <div className="mt-4 space-y-2">
            <label htmlFor="focus" className="text-sm">Focus (optional)</label>
            <Input id="focus" placeholder="e.g. payload specifications" value={focus} onChange={(e) => setFocus(e.target.value)} />
          </div>
          <Button className="mt-4 w-full" disabled={!file || summary.loading} onClick={() => void run("short")}>
            <Sparkles /> {summary.loading ? "Summarising" : "Short summary"}
          </Button>
          <Button className="mt-2 w-full" variant="outline" disabled={!file || summary.loading} onClick={() => void run("detailed")}>
            <ListTree /> Detailed summary
          </Button>
        </Panel>
        <Panel title="Document summary">
          <AiOutput {...summary} justify empty="Upload a PDF for a short summary, key points, and main conclusion." />
        </Panel>
      </div>
    </AppShell>
  );
}
