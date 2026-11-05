import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Accessibility,
  ArrowRightLeft,
  BellRing,
  Bus,
  Loader2,
  Map,
  Menu,
  MessageSquareWarning,
  Plus,
  SendHorizontal,
  Ticket,
  TrainFront,
  TramFront,
  X,
  Zap,
} from "lucide-react";
import { Brand, Disclaimer } from "@/components/transit/Brand";
import { ResultCard } from "@/components/transit/Cards";
import { sendChat } from "@/lib/transit/chat.functions";
import type { Card, Context } from "@/lib/transit/engine";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat — NammaTransit AI" },
      {
        name: "description",
        content:
          "Chat with NammaTransit AI about Chennai Metro, MTC Bus and Suburban Rail journeys, fares, accessibility and complaints.",
      },
      { property: "og:title", content: "Chat — NammaTransit AI" },
      {
        property: "og:description",
        content: "Multimodal transit assistant for Chennai public transport.",
      },
    ],
  }),
  component: ChatPage,
});

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards?: Card[];
  error?: boolean;
};

type Saved = { messages: Msg[]; context: Context; suggestions: string[] };

const KEY = "nammatransit-conversation";
const WELCOME: Msg = {
  id: "w",
  role: "assistant",
  text: "Vanakkam! I'm NammaTransit AI — your mobility companion for Chennai. Ask me about multimodal journeys across Chennai Metro, MTC Buses, and Southern Railway Suburban trains, official fare breakdowns, station accessibility, and service alerts, or let me help draft a complaint. I remember your journey across follow-up questions.",
};

const START_CHIPS = [
  "How do I travel from Guindy to Chennai Airport?",
  "Koyambedu to Guindy",
  "Tambaram to Chennai Beach",
  "Anna Nagar Tower to Chennai Airport",
  "Any service alerts?",
  "Report a problem",
];

const NAV = [
  { icon: Map, label: "Plan Journey", prompt: "How do I travel from Guindy to Chennai Airport?" },
  { icon: Zap, label: "Compare Fastest", prompt: "Which is faster?" },
  { icon: Bus, label: "MTC Bus Routes", prompt: "Is there a bus route?" },
  { icon: Ticket, label: "Fares & Tickets", prompt: "What is the fare?" },
  { icon: Accessibility, label: "Accessibility", prompt: "Is the starting station accessible?" },
  { icon: BellRing, label: "Service Updates", prompt: "Show service updates" },
  { icon: MessageSquareWarning, label: "Report a Problem", prompt: "I want to report a problem" },
];

function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [context, setContext] = useState<Context>({});
  const [suggestions, setSuggestions] = useState(START_CHIPS);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "null") as Saved | null;
      if (s?.messages?.length) {
        setMessages(s.messages);
        setContext(s.context);
        setSuggestions(s.suggestions);
      }
    } catch {
      /* ignore */
    }
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify({ messages, context, suggestions } satisfies Saved));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, context, suggestions]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;
    setOpen(false);
    setInput("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: msg }]);
    setLoading(true);
    try {
      const r = await sendChat({ data: { message: msg, context } });
      setContext(r.context);
      setSuggestions(r.suggestions);
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", text: r.reply, cards: r.cards },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "I couldn't reach the transit assistant service. Please verify your connection and try again.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function reset() {
    setMessages([WELCOME]);
    setContext({});
    setSuggestions(START_CHIPS);
    setOpen(false);
    inputRef.current?.focus();
  }

  const journey =
    context.origin && context.destination
      ? `${context.origin} → ${context.destination}`
      : context.origin
        ? `From ${context.origin}`
        : context.destination
          ? `To ${context.destination}`
          : null;

  return (
    <div className="flex h-screen bg-background">
      {open && (
        <button
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-foreground/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-76 flex-col bg-sidebar p-5 text-sidebar-foreground transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <Link to="/">
            <Brand light />
          </Link>
          <button className="lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <button
          onClick={reset}
          className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-sidebar-primary px-4 py-2.5 font-semibold text-sidebar-primary-foreground shadow-glow transition hover:opacity-95"
        >
          <Plus className="h-4 w-4" /> New Conversation
        </button>

        <nav className="mt-6 space-y-1">
          {NAV.map((n) => (
            <button
              key={n.label}
              onClick={() => send(n.prompt)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-sidebar-accent transition"
            >
              <n.icon className="h-4 w-4 text-sidebar-primary" /> {n.label}
            </button>
          ))}
        </nav>

        {journey && (
          <div className="mt-5 rounded-xl border border-sidebar-border bg-sidebar-accent/50 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-bold uppercase tracking-wider text-[10px] text-sidebar-primary">
                Active Journey Memory
              </p>
              {context.modePreference && (
                <span className="rounded bg-sidebar-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-primary">
                  {context.modePreference}
                </span>
              )}
            </div>
            <p className="font-medium text-sm text-sidebar-foreground">{journey}</p>

            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                onClick={() => send("Which is faster?")}
                className="rounded-md bg-sidebar-border/80 px-2 py-1 text-[11px] font-medium hover:bg-sidebar-primary hover:text-sidebar-primary-foreground transition"
              >
                Compare
              </button>
              <button
                onClick={() => send("What is the fare?")}
                className="rounded-md bg-sidebar-border/80 px-2 py-1 text-[11px] font-medium hover:bg-sidebar-primary hover:text-sidebar-primary-foreground transition"
              >
                Fare
              </button>
              <button
                onClick={() => send("Is there a bus route?")}
                className="rounded-md bg-sidebar-border/80 px-2 py-1 text-[11px] font-medium hover:bg-sidebar-primary hover:text-sidebar-primary-foreground transition"
              >
                Bus
              </button>
              <button
                onClick={() => send("What about Metro?")}
                className="rounded-md bg-sidebar-border/80 px-2 py-1 text-[11px] font-medium hover:bg-sidebar-primary hover:text-sidebar-primary-foreground transition"
              >
                Metro
              </button>
            </div>
          </div>
        )}

        <div className="mt-auto space-y-2 pt-4">
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-2.5 text-[11px] text-sidebar-foreground/80 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-sidebar-primary">
              <TramFront className="h-3.5 w-3.5" />
              <span>ChennaiGTFS v0.2.0</span>
            </div>
            <p className="text-[10px] text-sidebar-foreground/60 leading-tight">
              5,402 Routes · 6,542 Stops · CMRL Metro, MTC Bus & Southern Railway Suburban.
            </p>
          </div>
          <p className="text-[10px] text-sidebar-foreground/60">
            CUMTA Mobility Hackathon 2026 prototype. Fares, facilities and alerts are demo data.
          </p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-card px-4 py-3 shadow-xs">
          <button className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <TramFront className="h-5 w-5 text-accent" />
            <div>
              <h1 className="font-display text-sm font-semibold sm:text-base">
                Mobility Assistant
              </h1>
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                Multimodal Chennai Transit AI · CMRL, MTC & Suburban
              </p>
            </div>
          </div>
          {journey && (
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent md:inline-flex items-center gap-1">
                <ArrowRightLeft className="h-3 w-3" /> {journey}
              </span>
              <button
                onClick={reset}
                className="rounded-lg border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                title="Clear current journey and start over"
              >
                Clear
              </button>
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto" aria-live="polite">
          <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <div
                  key={m.id}
                  className="animate-rise ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground shadow-xs"
                >
                  {m.text}
                </div>
              ) : (
                <div key={m.id} className="animate-rise flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent shadow-xs">
                    <TramFront className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-3.5">
                    <p
                      className={`text-sm leading-relaxed ${m.error ? "text-destructive" : "text-foreground"}`}
                    >
                      {m.text}
                    </p>
                    {m.cards?.map((c, i) => (
                      <ResultCard
                        key={i}
                        card={c}
                        onSelectOption={(opt) => send(`Select Option ${opt}`)}
                      />
                    ))}
                  </div>
                </div>
              ),
            )}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-accent" /> Calculating optimal
                multimodal route…
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t bg-card px-4 py-3">
          <div className="mx-auto max-w-3xl">
            {/* Suggestion Chips */}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  disabled={loading}
                  onClick={() => send(s)}
                  className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent hover:text-accent disabled:opacity-50 transition"
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-end gap-2 rounded-2xl border bg-background p-2 focus-within:ring-2 focus-within:ring-ring"
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder="Ask about a journey (e.g. Guindy to Airport), compare modes, check fares…"
                aria-label="Message"
                className="max-h-32 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-sm focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send"
                className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                <SendHorizontal className="h-4 w-4" />
              </button>
            </form>

            <div className="mt-2">
              <Disclaimer />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
