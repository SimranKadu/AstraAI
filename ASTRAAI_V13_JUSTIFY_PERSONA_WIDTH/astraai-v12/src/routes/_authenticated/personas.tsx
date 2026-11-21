import { useChat } from "@ai-sdk/react";
import { createFileRoute } from "@tanstack/react-router";
import { DefaultChatTransport } from "ai";
import { Pause, Play, RotateCcw, Send, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { AppShell, Panel } from "@/components/app-shell";
import { PersonaAvatar } from "@/components/persona-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PERSONAS, type Persona } from "@/data/personas";
import { authHeaders } from "@/lib/auth-client";
import { toSpokenText } from "@/lib/spoken-text";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/personas")({
  head: () => pageHead("AI Personas", "Talk with animated AI mentors inspired by leaders of India's space programme and Indian-American astronauts."),
  component: Personas,
});

function Personas() {
  const [active, setActive] = useState<Persona | null>(null);
  return (
    <AppShell title="AI Personas" subtitle="Interactive space experts">
      <div className="mx-auto max-w-6xl space-y-6">
        {!active ? <div className="grid gap-4 md:grid-cols-3">{PERSONAS.map((persona) => <Panel key={persona.id}><div className="mb-4 h-48"><PersonaAvatar persona={persona} state="idle" /></div><h2 className="font-semibold">{persona.name}</h2><p className="text-sm text-primary">{persona.role}</p><p className="mt-3 text-sm text-muted-foreground">{persona.bio}</p><div className="mt-3 flex flex-wrap gap-2">{persona.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}</div><Button className="mt-4 w-full" onClick={() => setActive(persona)}>Meet this expert</Button></Panel>)}</div> : <PersonaChat key={active.id} persona={active} changePersona={() => setActive(null)} />}
        <p className="text-xs text-muted-foreground">These AI mentors are educational characters inspired by public careers. They do not represent or speak for real people.</p>
      </div>
    </AppShell>
  );
}

/** Removes any "this is a simulation, not the real person" paragraph the AI may still add, from the text and the voice. */
const DISCLAIMER = /(educational simulation|simulation inspired|not the real person|rather than the real person)/i;
function withoutDisclaimer(text: string) {
  return text.split(/\n\s*\n/).filter((paragraph) => !(DISCLAIMER.test(paragraph) && paragraph.length < 500)).join("\n\n").trim();
}

/** Long answers are voiced in two parts so the first sentences can start playing while the rest is still being prepared. */
const SPLIT_ABOVE = 320;
function firstSentence(spoken: string) { return /^(.{100,}?[.!?])\s/.exec(spoken)?.[1] ?? null; }
function splitForSpeech(text: string): string[] {
  const spoken = toSpokenText(text);
  if (spoken.length <= SPLIT_ABOVE) return [spoken];
  const first = firstSentence(spoken);
  return first ? [first, spoken.slice(first.length).trim()] : [spoken];
}

function PersonaChat({ persona, changePersona }: { persona: Persona; changePersona: () => void }) {
  const [input, setInput] = useState(persona.starter);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [lastSpoken, setLastSpoken] = useState("");
  const [voiceNote, setVoiceNote] = useState("");
  const serverVoiceDown = useRef(false); // set when the AI voice is not configured, so we stop asking
  const usingBrowser = useRef(false);
  const browserUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const spokenMessage = useRef("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const requestId = useRef(0); // bumped whenever speech is stopped or restarted, so older async work quietly gives up
  const loadingRef = useRef(false); // true until the voice starts, so repeated clicks are ignored
  const [loading, setLoading] = useState(false);
  const audioCache = useRef(new Map<string, Promise<string | null>>()); // one request per piece of text, shared by every click
  const setLoadingState = (value: boolean) => { loadingRef.current = value; setLoading(value); };
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat", body: { id: `persona-${persona.id}`, persona: persona.id }, headers: () => authHeaders() }), [persona.id]);
  const { messages, sendMessage, status, error } = useChat({ id: `persona-${persona.id}`, transport });
  const busy = status === "submitted" || status === "streaming";
  const rawLatestAnswer = [...messages].reverse().find((message) => message.role === "assistant")?.parts.filter((part) => part.type === "text").map((part) => part.text).join(" ") ?? "";
  const latestAnswer = withoutDisclaimer(rawLatestAnswer);

  const stopAudio = () => {
    requestId.current += 1;
    setLoadingState(false);
    const player = audio.current;
    audio.current = null;
    player?.pause();
    browserUtterance.current = null;
    usingBrowser.current = false;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  };

  /** Free fallback: the voice built into the browser. Used whenever the AI voice is missing or fails. */
  const speakWithBrowser = (text: string, note: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceNote("Voice playback is not available in this browser. The full answer stays on screen.");
      return;
    }
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(toSpokenText(text));
    const voices = synth.getVoices();
    const voice = voices.find((v) => /^en[-_]IN/i.test(v.lang)) ?? voices.find((v) => /^en/i.test(v.lang));
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? "en-IN";
    utterance.rate = 0.95;
    const finished = () => {
      if (browserUtterance.current !== utterance) return; // an older, cancelled utterance
      browserUtterance.current = null;
      usingBrowser.current = false;
      setSpeaking(false);
      setPaused(false);
    };
    utterance.onstart = () => { if (browserUtterance.current === utterance) { setSpeaking(true); setPaused(false); } };
    utterance.onend = finished;
    utterance.onerror = finished;
    browserUtterance.current = utterance;
    usingBrowser.current = true;
    setVoiceNote(note);
    synth.speak(utterance);
  };

  /** Asks the server for the voice of one piece of text. Asking again for the same text reuses the first request. */
  const fetchAudio = (chunk: string) => {
    const cached = audioCache.current.get(chunk);
    if (cached) return cached;
    const request = (async () => {
      try {
        const headers = await authHeaders();
        const response = await fetch("/api/persona-speech", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ text: chunk, persona: persona.id }),
        });
        if (!response.ok) {
          if (response.status === 503 || response.status === 500) serverVoiceDown.current = true;
          return null;
        }
        return URL.createObjectURL(await response.blob());
      } catch {
        return null;
      }
    })();
    audioCache.current.set(chunk, request);
    void request.then((url) => { if (!url) audioCache.current.delete(chunk); });
    return request;
  };

  const playUrl = (url: string) => new Promise<"ended" | "failed">((resolve) => {
    const player = new Audio(url);
    audio.current = player;
    player.onplay = () => { if (audio.current === player) { setLoadingState(false); setSpeaking(true); setPaused(false); } };
    player.onpause = () => { if (audio.current === player && !player.ended) setPaused(true); };
    player.onended = () => resolve("ended");
    player.onerror = () => resolve("failed");
    Promise.resolve(player.play()).catch(() => resolve("failed"));
  });

  const speak = async (text: string) => {
    if (muted || !text) return;
    stopAudio();
    const id = requestId.current;
    setVoiceNote("");
    setLastSpoken(text);
    // When the AI voice is missing or fails, the device voice takes over quietly, with no message.
    if (serverVoiceDown.current) return speakWithBrowser(text, "");
    setLoadingState(true);
    const chunks = splitForSpeech(text);
    const requests = chunks.map(fetchAudio); // all parts are requested at once, so part two is ready when part one ends
    for (let i = 0; i < chunks.length; i++) {
      const url = await requests[i]!;
      if (id !== requestId.current) return;
      const result = url ? await playUrl(url) : "failed";
      if (id !== requestId.current) return;
      if (result === "failed") {
        audio.current = null;
        setLoadingState(false);
        setSpeaking(false);
        return speakWithBrowser(chunks.slice(i).join(" "), "");
      }
    }
    audio.current = null;
    setLoadingState(false);
    setSpeaking(false);
    setPaused(false);
  };

  // While the answer is still being written, prepare the voice of its opening sentences so playback starts the moment it is done.
  useEffect(() => {
    if (muted || serverVoiceDown.current || status !== "streaming") return;
    const spoken = toSpokenText(latestAnswer);
    const first = spoken.length > SPLIT_ABOVE ? firstSentence(spoken) : null;
    if (first) void fetchAudio(first);
  }, [latestAnswer, status, muted]);

  useEffect(() => {
    if (status === "ready" && latestAnswer && latestAnswer !== spokenMessage.current) {
      spokenMessage.current = latestAnswer;
      void speak(latestAnswer);
    }
  }, [latestAnswer, status]);

  useEffect(() => () => {
    requestId.current += 1;
    const player = audio.current;
    audio.current = null;
    player?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    audioCache.current.forEach((request) => void request.then((url) => { if (url) URL.revokeObjectURL(url); }));
    audioCache.current.clear();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim() || busy) return;
    stopAudio();
    void sendMessage({ text: input.trim() });
    setInput("");
  };
  /** Play, pause and resume. Resuming carries on from where it stopped; clicking again while the voice is starting does nothing. */
  const toggleSpeech = () => {
    if (loadingRef.current) return;
    if (speaking && !paused) {
      if (usingBrowser.current) window.speechSynthesis.pause();
      else audio.current?.pause();
      setPaused(true);
    } else if (paused) {
      if (usingBrowser.current) { window.speechSynthesis.resume(); setPaused(false); }
      else if (audio.current) void audio.current.play();
    } else void speak(lastSpoken || latestAnswer);
  };
  const replay = () => {
    if (loadingRef.current) return;
    void speak(lastSpoken || latestAnswer);
  };
  const toggleMute = () => {
    if (!muted) stopAudio();
    setMuted((value) => !value); setSpeaking(false); setPaused(false);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <PersonaAvatar persona={persona} state={speaking && !paused ? "speaking" : busy ? "thinking" : "idle"} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={toggleMute}>{muted ? <VolumeX /> : <Volume2 />}{muted ? "Unmute" : "Mute"}</Button>
          <Button variant="outline" onClick={toggleSpeech} disabled={muted || loading || (!latestAnswer && !lastSpoken)}>{paused || !speaking ? <Play /> : <Pause />}{paused ? "Resume" : speaking ? "Pause" : loading ? "Starting" : "Play"}</Button>
          <Button variant="outline" onClick={replay} disabled={muted || loading || (!latestAnswer && !lastSpoken)}><RotateCcw /> Replay</Button>
          <Button variant="outline" onClick={changePersona}>Change expert</Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">Portraits are licensed archive images. Voices are AI-generated interpretations, not replicas of the real people. The complete response remains visible as text.</p>
        {voiceNote && <p className="text-xs text-muted-foreground" role="status">{voiceNote}</p>}
      </div>
      <Panel title={`Conversation with ${persona.name}`}>
        <div className="persona-transcript">
          {messages.length === 0 && <div className="persona-welcome"><strong>Mission channel open.</strong><p>{persona.starter}</p></div>}
          {messages.map((message) => <div key={message.id} className={message.role === "user" ? "persona-message is-user" : "persona-message is-assistant"}>{message.parts.map((part, index) => part.type === "text" ? (message.role === "user" ? <span key={index}>{part.text}</span> : <MessageResponse key={index} className="ai-justified">{withoutDisclaimer(part.text)}</MessageResponse>) : null)}</div>)}
          {status === "submitted" && <p className="text-sm text-primary">Analysing mission archive...</p>}
          {error && <p className="text-sm text-destructive">{error.message}</p>}
        </div>
        <form onSubmit={submit} className="mt-4 flex gap-2 border-t border-border pt-4"><Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask your space expert" /><Button type="submit" disabled={busy} aria-label="Send question"><Send /></Button></form>
      </Panel>
    </div>
  );
}