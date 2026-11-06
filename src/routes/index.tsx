import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Accessibility,
  ArrowRight,
  BellRing,
  Bus,
  Map,
  MessageSquareWarning,
  Sparkles,
  Ticket,
  TrainFront,
  Zap,
} from "lucide-react";
import { Brand, Disclaimer } from "@/components/transit/Brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NammaTransit AI — Your Chennai Journey, Simplified" },
      {
        name: "description",
        content:
          "Conversational Chennai transit prototype. Explore Metro, MTC Bus and Suburban Rail routes, estimated fares, static maps and accessibility references.",
      },
      { property: "og:title", content: "NammaTransit AI — Your Chennai Journey, Simplified" },
      {
        property: "og:description",
        content:
          "CUMTA Mobility Hackathon 2026 AI Mobility Assistant with ChennaiGTFS data integration.",
      },
    ],
  }),
  component: Index,
});

const features = [
  {
    icon: Map,
    title: "Multimodal Journey Planning",
    text: "CMRL Metro, MTC bus corridors and Southern Railway suburban services.",
  },
  {
    icon: Zap,
    title: "Fastest-Route Comparison",
    text: "Side-by-side travel duration breakdown with waiting and transfer time.",
  },
  {
    icon: Ticket,
    title: "Fare Estimates & Ticket Links",
    text: "Transparent fare references and estimates, with official ticketing links. No tickets are issued by this prototype.",
  },
  {
    icon: Accessibility,
    title: "Station Accessibility",
    text: "Lifts, ramps, tactile indicators and accessibility helpline numbers.",
  },
  {
    icon: MessageSquareWarning,
    title: "Structured Grievance Drafting",
    text: "Guided complaints for CMRL, MTC and Southern Railway ready to submit.",
  },
];

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <section className="bg-hero text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-6">
          <nav className="flex items-center justify-between">
            <Brand light />
            <Link
              to="/chat"
              className="rounded-full border border-primary-foreground/20 px-4 py-2 text-sm font-medium hover:bg-primary-foreground/10 transition"
            >
              Open Assistant
            </Link>
          </nav>
          <div className="mt-16 grid items-center gap-12 lg:grid-cols-2">
            <div className="animate-rise">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/20 px-3.5 py-1 text-xs font-semibold text-accent">
                <Sparkles className="h-3 w-3" /> ChennaiGTFS v0.2.0 · CUMTA Hackathon 2026
              </span>
              <h1 className="mt-5 font-display text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
                Your Chennai Journey, Simplified.
              </h1>
              <p className="mt-5 max-w-lg text-lg text-primary-foreground/80 leading-relaxed">
                Your conversational AI mobility assistant for Chennai Metro, MTC Buses, and Southern
                Railway Suburban trains.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to="/chat"
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold text-accent-foreground shadow-glow transition hover:translate-y-[-1px]"
                >
                  Start Chatting <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="/chat?compact=1"
                  className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/30 px-5 py-3 text-sm font-semibold hover:bg-primary-foreground/10">
                  Mobile Demo View <ArrowRight className="h-4 w-4" />
                </a>
                <div className="flex items-center gap-3 text-xs text-primary-foreground/75">
                  <span className="flex items-center gap-1">
                    <TrainFront className="h-3.5 w-3.5 text-accent" /> CMRL Metro
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <Bus className="h-3.5 w-3.5 text-accent" /> MTC Bus
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <TrainFront className="h-3.5 w-3.5 text-accent" /> Suburban Rail
                  </span>
                </div>
              </div>
            </div>
            <div
              className="animate-rise rounded-3xl border border-primary-foreground/15 bg-primary-foreground/5 p-5 backdrop-blur-md shadow-2xl"
              style={{ animationDelay: "120ms" }}
            >
              <div className="space-y-3 text-sm">
                <div className="ml-auto w-fit rounded-2xl rounded-br-sm bg-accent px-4 py-2 text-accent-foreground font-medium">
                  Guindy to Chennai Airport?
                </div>
                <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-sm bg-primary-foreground/10 px-4 py-2.5 text-primary-foreground leading-relaxed">
                  Blue Line Metro (direct, 4 stops ~14 mins, ₹20) or MTC Bus 70 (direct, ~24 mins,
                  ₹14).
                </div>
                <div className="ml-auto w-fit rounded-2xl rounded-br-sm bg-accent px-4 py-2 text-accent-foreground font-medium">
                  Which is faster?
                </div>
                <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-sm bg-primary-foreground/10 px-4 py-2.5 text-primary-foreground leading-relaxed">
                  Metro is fastest: ~14 mins total (including ~5m headway) vs ~24 mins by MTC Bus.
                </div>
                <div className="ml-auto w-fit rounded-2xl rounded-br-sm bg-accent px-4 py-2 text-accent-foreground font-medium">
                  What is the fare?
                </div>
                <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-sm bg-primary-foreground/10 px-4 py-2.5 text-primary-foreground leading-relaxed">
                  CMRL Metro fare is ₹20 (Token), or ₹16 via WhatsApp QR ticketing (20% discount).
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto -mt-12 grid max-w-6xl gap-4 px-6 sm:grid-cols-2 lg:grid-cols-5">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border bg-card p-5 shadow-soft transition hover:border-accent/40"
          >
            <f.icon className="h-6 w-6 text-accent" />
            <h3 className="mt-3 font-display font-semibold text-foreground text-sm">{f.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.text}</p>
          </div>
        ))}
      </section>

      {/* Dataset & Hackathon Metrics Section */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-8">
        <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-8 shadow-soft">
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-accent">
                Dataset Integration
              </p>
              <h3 className="mt-1 font-display text-xl font-bold">ChennaiGTFS v0.2.0</h3>
              <p className="mt-2 text-xs text-muted-foreground">
                Grounded rule-based transit calculations using open transit data maintained by
                UngalSoththu and CUMTA.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 md:col-span-2">
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="font-display text-2xl font-bold text-foreground">5,402</p>
                <p className="text-xs text-muted-foreground font-medium">Routes Mapped</p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="font-display text-2xl font-bold text-foreground">6,542</p>
                <p className="text-xs text-muted-foreground font-medium">
                  Transit Stops & Stations
                </p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="font-display text-2xl font-bold text-foreground">3 Agencies</p>
                <p className="text-xs text-muted-foreground font-medium">
                  CMRL, MTC & Southern Railway
                </p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="font-display text-2xl font-bold text-foreground">100% Rule-Based</p>
                <p className="text-xs text-muted-foreground font-medium">
                  Zero Hallucinated Fares or Routes
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10">
        <Disclaimer />
      </footer>
    </div>
  );
}
