import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";

/** `justify` gives the answer justified text at a slightly larger size (used by Mission Explorer and Satellite Finder). */
export function AiOutput({ text, loading, error, empty, justify = false }: { text: string; loading: boolean; error: string; empty: string; justify?: boolean }) {
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!text && loading) return <Shimmer>Analysing mission data...</Shimmer>;
  if (!text) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className={justify ? "astra-prose ai-justified" : "astra-prose text-sm"}>
      <MessageResponse>{text}</MessageResponse>
    </div>
  );
}
