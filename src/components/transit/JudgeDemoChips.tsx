import { JUDGE_DEMO_TURNS } from "@/lib/transit/judge-context";

type Props = { completedTurns:number; busy:boolean; onPick:(turn:number,prompt:string)=>void };

/**
 * Judge-led sequence, never auto-fabricates results.
 * Later steps remain disabled until the previous conversational turn succeeds.
 */
export function JudgeDemoChips({completedTurns,busy,onPick}:Props){
  return (
    <section aria-label="Five-turn judge demo" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-emerald-900">Judge 1-Click Demo · 5-Turn Context Story</p>
        <span className="text-[11px] text-emerald-800">
          {completedTurns === 5 ? "Complete" : `${completedTurns}/5 completed`}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {JUDGE_DEMO_TURNS.map((demo,i)=>{
          const step=i+1;
          const done=step<=completedTurns;
          const allowed=step===completedTurns+1 || (step===1 && completedTurns===5);
          return (
            <button key={step} type="button" disabled={busy||!allowed}
              aria-label={`Judge turn ${step}: ${demo.prompt}`}
              title={demo.prompt}
              onClick={()=>onPick(step,demo.prompt)}
              className={"shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition "+
                (done?"border-emerald-300 bg-emerald-100 text-emerald-900 ":
                 allowed?"border-emerald-500 bg-white text-emerald-900 hover:bg-emerald-100 ":
                 "border-slate-200 bg-slate-50 text-slate-400 ") +
                "disabled:cursor-not-allowed"}>
              {done?"✓ ":""}{demo.title}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[10px] text-slate-600">
        Run in order. Step 3 is a fare enquiry, not a real ticket purchase; lift, crowd and rain details are not live.
      </p>
    </section>
  );
}
