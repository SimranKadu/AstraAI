import { useChat } from "@ai-sdk/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  Bot,
  LayoutDashboard,
  Database,
  Menu,
  MessageSquare,
  Plus,
  Radio,
  Satellite,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { authHeaders } from "@/lib/auth-client";
import {
  createThread,
  ensureThreads,
  saveThreadMessages,
  type AstraThread,
  writeThreads,
} from "@/lib/astra-storage";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "Chat | ASTRAAI" },
      {
        name: "description",
        content: "Source-grounded space intelligence conversations with ASTRAAI.",
      },
      { property: "og:title", content: "Chat | ASTRAAI" },
      {
        property: "og:description",
        content: "Source-grounded space intelligence conversations with ASTRAAI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatRoute,
});

const suggestions = [
  "What products are available through MOSDAC?",
  "Compare INSAT-3D and INSAT-3DR",
  "How can I download satellite data?",
];

function ChatRoute() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const [threads, setThreads] = useState<AstraThread[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const initialMessages = useMemo(
    () => threads.find((thread) => thread.id === threadId)?.messages ?? [],
    [threadId, threads],
  );

  useEffect(() => {
    const stored = ensureThreads();
    const exists = stored.some((thread) => thread.id === threadId);
    if (!exists) {
      const replacement = createThread();
      const next = [replacement, ...stored];
      writeThreads(next);
      setThreads(next);
      void navigate({ to: "/chat/$threadId", params: { threadId: replacement.id }, replace: true });
      return;
    }
    setThreads(stored);
    setLoaded(true);
  }, [navigate, threadId]);

  const refreshThreads = useCallback(() => setThreads(ensureThreads()), []);
  const addThread = () => {
    const thread = createThread();
    const next = [thread, ...ensureThreads()];
    writeThreads(next);
    setThreads(next);
    setSidebarOpen(false);
    void navigate({ to: "/chat/$threadId", params: { threadId: thread.id } });
  };
  const deleteThread = (id: string) => {
    let next = ensureThreads().filter((thread) => thread.id !== id);
    if (next.length === 0) next = [createThread()];
    writeThreads(next);
    setThreads(next);
    const fallback = next[0];
    if (id === threadId && fallback)
      void navigate({ to: "/chat/$threadId", params: { threadId: fallback.id } });
  };

  if (!loaded)
    return (
      <main className="launch-screen">
        <div className="astra-mark" aria-hidden="true">
          <span />
          <i />
        </div>
        <p>Loading mission channel</p>
      </main>
    );
  return (
    <ChatShell
      key={threadId}
      threadId={threadId}
      initialMessages={initialMessages}
      threads={threads}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      addThread={addThread}
      deleteThread={deleteThread}
      refreshThreads={refreshThreads}
    />
  );
}

type ChatShellProps = {
  threadId: string;
  initialMessages: UIMessage[];
  threads: AstraThread[];
  sidebarOpen: boolean;
  setSidebarOpen: (value: boolean) => void;
  addThread: () => void;
  deleteThread: (id: string) => void;
  refreshThreads: () => void;
};

function ChatShell({
  threadId,
  initialMessages,
  threads,
  sidebarOpen,
  setSidebarOpen,
  addThread,
  deleteThread,
  refreshThreads,
}: ChatShellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [notice, setNotice] = useState("");
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { id: threadId },
        headers: () => authHeaders(),
      }),
    [threadId],
  );
  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onFinish: ({ messages: finished }) => {
      saveThreadMessages(threadId, finished);
      refreshThreads();
      window.setTimeout(() => textareaRef.current?.focus(), 0);
    },
    onError: (chatError) =>
      setNotice(chatError.message || "ASTRAAI could not complete that request."),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  useEffect(() => {
    if (messages.length > 0) saveThreadMessages(threadId, messages);
  }, [messages, status, threadId]);

  const submit = (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    setNotice("");
    void sendMessage({ text: clean });
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  return (
    <main className="astra-app">
      <aside className={`mission-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-glyph">
            <Satellite />
          </div>
          <strong>ASTRAAI</strong>
          <Button
            variant="ghost"
            size="icon"
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close conversations"
          >
            <X />
          </Button>
        </div>
        <Link to="/dashboard" className="back-dashboard">
          <LayoutDashboard />
          Dashboard
        </Link>
        <Button variant="outline" className="new-chat" onClick={addThread}>
          <Plus />
          New conversation
        </Button>
        <div className="sidebar-label">CONVERSATIONS</div>
        <nav className="thread-list" aria-label="Conversations">
          {threads
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((thread) => (
              <div
                className={`thread-row ${thread.id === threadId ? "active" : ""}`}
                key={thread.id}
              >
                <Link
                  to="/chat/$threadId"
                  params={{ threadId: thread.id }}
                  onClick={() => setSidebarOpen(false)}
                >
                  <MessageSquare />
                  <span>{thread.title}</span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => deleteThread(thread.id)}
                  aria-label={`Delete ${thread.title}`}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
        </nav>
        <footer className="sidebar-footer">
          <div className="archive-status">
            <Database />
            <div>
              <strong>Local archive</strong>
              <span>Stored in this browser</span>
            </div>
          </div>
          <div className="legal-links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </footer>
      </aside>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close conversations"
        />
      )}
      <section className="chat-workspace">
        <header className="mission-header">
          <Button
            variant="ghost"
            size="icon"
            className="menu-button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversations"
          >
            <Menu />
          </Button>
          <div className="core-identity">
            <div className="core-icon">
              <Bot />
            </div>
            <div>
              <h1>
                ASTRAAI Core <span />
              </h1>
              <p>SPACE KNOWLEDGE QUERY ENGINE</p>
            </div>
          </div>
          <div className="system-state">
            <Radio />
            Archive connected
          </div>
        </header>
        <Conversation className="chat-scroll">
          <ConversationContent
            className={`chat-content ${messages.length === 0 ? "is-empty" : ""}`}
          >
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="signal-mark" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <h2>How can I assist your mission?</h2>
                <p>
                  Query satellite missions, MOSDAC products, weather payloads, and geospatial
                  archives.
                </p>
                <div className="suggestion-grid">
                  {suggestions.map((suggestion) => (
                    <Button key={suggestion} variant="secondary" onClick={() => submit(suggestion)}>
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <Message from={message.role} key={message.id} className="astra-message">
                  <div className="message-role">
                    {message.role === "assistant" ? <Bot /> : null}
                    <span>{message.role === "assistant" ? "ASTRAAI" : "YOU"}</span>
                  </div>
                  <MessageContent>
                    {message.parts.map((part, index) =>
                      part.type === "text" ? (
                        <MessageResponse key={`${message.id}-${index}`} {...(message.role === "assistant" ? { className: "ai-justified" } : {})}>
                          {part.text}
                        </MessageResponse>
                      ) : null,
                    )}
                  </MessageContent>
                </Message>
              ))
            )}
            {status === "submitted" && (
              <div className="thinking-row">
                <Bot />
                <Shimmer>Searching the mission archive...</Shimmer>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <div className="composer-area">
          {notice || error ? (
            <div className="chat-notice" role="alert">
              {notice || error?.message}
            </div>
          ) : null}
          <PromptInput className="astra-composer" onSubmit={({ text }) => submit(text)}>
            <PromptInputTextarea
              ref={textareaRef}
              placeholder="Ask ASTRAAI about missions, MOSDAC, or satellite data..."
              disabled={busy}
            />
            <PromptInputFooter className="composer-footer">
              <span>Answers use the supplied archive</span>
              <PromptInputSubmit status={status} onStop={stop} disabled={!busy && false} />
            </PromptInputFooter>
          </PromptInput>
          <p className="accuracy-note">ASTRAAI CAN MAKE MISTAKES. VERIFY CRITICAL MISSION DATA.</p>
        </div>
      </section>
    </main>
  );
}
