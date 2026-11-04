import { DecisionCard, ButtonLink } from "@/components/ui";
import { scripShort, ticksLabel } from "@/lib/format";
import type { GameConfig } from "@/config/game";
import type { Decision, World } from "@/lib/sim/types";
import { companyRunway } from "@/lib/sim/company";
import { ActionButton } from "./action-button";

export function decisionCardProps(w: World, cfg: GameConfig, d: Decision) {
  const left = d.expiresTick - w.season.tick;
  const urgent = left <= cfg.decision.urgentWithinTicks;
  return { left, urgent };
}

export function DecisionView({ w, cfg, d, canAct, back, compact }: { w: World; cfg: GameConfig; d: Decision; canAct: boolean; back: string; compact?: boolean }) {
  const { left, urgent } = decisionCardProps(w, cfg, d);
  const btn = { style: { minHeight: 44 } as React.CSSProperties, className: compact ? "phone-block" : undefined };
  if (d.kind === "term_sheet") {
    const o = w.offers.get(d.refId);
    const f = o ? w.funds.get(o.fundId) : undefined;
    const c = o ? w.companies.get(o.companyId) : undefined;
    return (
      <DecisionCard compact={compact} type="Term sheet" meta={`expires in ${ticksLabel(left)}`} urgent={urgent} primary={{ label: "Review offer", node: <ButtonLink href={`/offers/${d.refId}`} {...btn}>Review offer</ButtonLink> }}>
        <p>
          {f?.name ?? String(d.inputs.fund)} offers <b className="num">{scripShort(o?.check ?? Number(d.inputs.check))}</b> at <b className="num">{scripShort(o?.preMoney ?? Number(d.inputs.preMoney))}</b> pre for {c?.name ?? String(d.inputs.company)}.
        </p>
      </DecisionCard>
    );
  }
  if (d.kind === "pivot") {
    const c = w.companies.get(String(d.inputs.companyId));
    const runway = c ? companyRunway(w, cfg, c) : Infinity;
    const idea = String(d.inputs.idea).replace(/\.$/, "");
    return (
      <DecisionCard
        compact={compact}
        type="Pivot"
        meta={Number.isFinite(runway) ? `burn at ${Math.round(runway)} days` : "ramen profitable"}
        urgent={urgent}
        primary={{ label: "Approve", node: <ActionButton action={`/api/decisions/pivot/${d.refId}`} fields={{ choice: "approve" }} label="Approve" canAct={canAct} back={back} {...btn} /> }}
        secondary={{ label: "Veto", node: <ActionButton action={`/api/decisions/pivot/${d.refId}`} fields={{ choice: "veto" }} label="Veto" variant="ghost" canAct={canAct} back={back} {...btn} /> }}
      >
        <p>
          {String(d.inputs.company)} proposes a pivot to &ldquo;{idea.charAt(0).toLowerCase() + idea.slice(1)}&rdquo; after {Number(d.inputs.rejections) || "a run of"} passes.
        </p>
      </DecisionCard>
    );
  }
  if (d.kind === "exit") {
    const bid = Number(d.inputs.bid);
    const mark = Number(d.inputs.mark);
    return (
      <DecisionCard
        compact={compact}
        type="Exit offer"
        meta={`expires in ${ticksLabel(left)}`}
        urgent
        primary={{ label: "Sell", node: <ActionButton action={`/api/decisions/exit/${d.refId}`} fields={{ choice: "accept" }} label="Sell" canAct={canAct} back={back} {...btn} /> }}
        secondary={{ label: "Decline", node: <ActionButton action={`/api/decisions/exit/${d.refId}`} fields={{ choice: "decline" }} label="Decline" variant="ghost" canAct={canAct} back={back} {...btn} /> }}
      >
        <p>
          {String(d.inputs.acquirer)} bids <b className="num">{scripShort(bid)}</b> for {String(d.inputs.company)}, {mark > 0 ? `${(bid / mark).toFixed(1)}x` : "well above"} the mark.
        </p>
      </DecisionCard>
    );
  }
  const companies = (d.inputs.companies as Array<{ id: string; name: string }>) ?? [];
  return (
    <DecisionCard compact={compact} type="Meetings" meta={`pick 1 of ${companies.length} · ${ticksLabel(left)}`} urgent={urgent} secondary={{ label: "Pick a meeting", node: <ButtonLink variant="ghost" href={`/fund/${d.agentId}#deal-flow`} {...btn}>Pick a meeting</ButtonLink> }}>
      <p>
        {companies.length} founders want an hour with {String(d.inputs.fund)}: {companies.map((c) => c.name).join(", ")}.
      </p>
    </DecisionCard>
  );
}
