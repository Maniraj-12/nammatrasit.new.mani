import { useState } from "react";
import { Check, Copy, ExternalLink, Smartphone, Ticket } from "lucide-react";
import type { CanonicalItinerary } from "@/lib/transit/engine";
import { CHENNAI_ONE_OFFICIAL, chennaiOneJourneySummary } from "@/lib/transit/chennai-one";

/**
 * Independent handoff to a public, verified Chennai One landing/listing URL.
 * The selected itinerary is never silently sent to the official app.
 */
export function ChennaiOneHandoff({ itinerary }: { itinerary: CanonicalItinerary }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);

  const copyJourney = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCopyError(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(chennaiOneJourneySummary(itinerary));
      setCopiedId(itinerary.id);
      setCopyError(false);
    } catch {
      setCopiedId(null);
      setCopyError(true);
    }
  };

  return (
    <section aria-label="Chennai One official booking handoff"
      className="mt-4 rounded-xl border border-emerald-300 bg-emerald-50/70 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
      <div className="flex items-center gap-2 font-semibold text-emerald-900 dark:text-emerald-200">
        <Ticket className="h-4 w-4 shrink-0" aria-hidden="true" />
        Continue in Chennai One
      </div>
      <p className="mt-1.5 text-xs text-foreground">
        Selected journey: <strong>{itinerary.origin} → {itinerary.destination}</strong>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Use the official Chennai One app to check availability, confirm fares and purchase tickets.
        Journey selection is <strong>not automatically transferred</strong> or booked.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={CHENNAI_ONE_OFFICIAL.website} target="_blank" rel="noopener noreferrer"
          aria-label="Open official Chennai One website for ticket booking"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">
          <Smartphone className="h-4 w-4" aria-hidden="true" />
          Open Chennai One
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <button type="button" onClick={() => void copyJourney()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 dark:bg-card dark:text-foreground"
          aria-label="Copy selected journey details for manual entry in Chennai One">
          {copiedId === itinerary.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copiedId === itinerary.id ? "Journey copied" : "Copy journey details"}
        </button>
        <a href={CHENNAI_ONE_OFFICIAL.android} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">
          Android <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
        </a>
        <a href={CHENNAI_ONE_OFFICIAL.ios} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">
          iPhone <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
        </a>
      </div>
      {copyError && (
        <p role="status" className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          Clipboard unavailable. Open Chennai One and search the origin and destination shown above.
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Independent CUMTA hackathon prototype; not affiliated with or embedded in Chennai One.
        No live ticket inventory, payment or QR pass is generated here.
      </p>
    </section>
  );
}
