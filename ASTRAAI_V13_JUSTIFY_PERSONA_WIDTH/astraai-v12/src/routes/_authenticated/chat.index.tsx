import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ensureThreads } from "@/lib/astra-storage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => pageHead("AI Assistant", "Ask ASTRAAI about missions, satellites and MOSDAC data."),
  component: ChatIndex,
});

function ChatIndex() {
  const navigate = useNavigate();
  useEffect(() => {
    const [thread] = ensureThreads();
    if (thread)
      void navigate({ to: "/chat/$threadId", params: { threadId: thread.id }, replace: true });
  }, [navigate]);
  return <main className="launch-screen"><p>Opening mission channel</p></main>;
}
