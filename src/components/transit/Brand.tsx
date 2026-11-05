import { TramFront } from "lucide-react";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-foreground shadow-glow">
        <TramFront className="h-5 w-5" />
      </span>
      <span
        className={`font-display text-lg font-semibold tracking-tight ${light ? "text-primary-foreground" : "text-foreground"}`}
      >
        NammaTransit <span className="text-accent">AI</span>
      </span>
    </div>
  );
}

export function Disclaimer() {
  return (
    <p className="text-xs text-muted-foreground">
      Independent hackathon prototype — not an official CUMTA, CMRL or Chennai One app. Fares,
      facilities and alerts are demo data.
    </p>
  );
}
