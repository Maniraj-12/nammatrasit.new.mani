import type { Context } from "@/lib/transit/engine";

function Pill({label,value,alert=false}:{label:string;value:string;alert?:boolean}) {
  return (
    <span className={"inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] " +
      (alert ? "border-amber-300 bg-amber-50 text-amber-900" :
        "border-slate-200 bg-white text-slate-800")}>
      <span className="font-semibold">{label}:</span>
      <span className="max-w-40 truncate" title={value}>{value}</span>
    </span>
  );
}

/** Highly visible, persistent context indicator; not a source of verified live data. */
export function ActiveMemoryBar({context}: {context:Context}) {
  const concession = context.concessionType && context.concessionType !== "none"
    ? context.concessionType === "women_ordinary_bus" ? "Women · ordinary bus (eligibility unverified)"
      : context.concessionType === "senior" ? `Senior (${context.concessionPassengers ?? 1}) · eligibility unverified`
      : "Student · eligibility unverified"
    : "None";
  return (
    <section aria-label="Active AI Memory Bar"
      className="border-b border-emerald-200 bg-emerald-50/80 px-4 py-3">
      <div className="mx-auto max-w-6xl">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            Active AI Memory · Persistent across turns
          </p>
          <span className="text-[10px] text-emerald-900">
            Context · not live service status
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill label="From" value={context.origin || "Not set"}/>
          <Pill label="To" value={context.destination || "Not set"}/>
          <Pill label="Passengers" value={String(context.passengers ?? 1)}/>
          <Pill label="Concession" value={concession}/>
          <Pill label="Wheelchair" value={context.wheelchairRequired ? "Required" : "Not requested"}
            alert={context.wheelchairRequired}/>
          <Pill label="Disruption" value={context.activeDisruption || "None confirmed"}
            alert={!!context.activeDisruption}/>
          {context.grievance && (
            <Pill label="Complaint draft" value={
              context.grievance.data.location
                ? `${context.grievance.data.location} · awaiting ${context.grievance.step}`
                : `Awaiting ${context.grievance.step}`
            } alert/>
          )}
          {context.arrivalBy && <Pill label="Arrive by" value={`${context.arrivalBy} · requested`}/>}
          {context.preferredLanguage && <Pill label="Language" value={context.preferredLanguage === "ta" ? "Tamil (basic)" : context.preferredLanguage === "tanglish" ? "Tanglish (basic)" : "English"}/>}
        </div>
      </div>
    </section>
  );
}
