"use client";
import { RiskBadge, Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/misc";
import { RiskGauge } from "@/components/risk-gauge";
import { ExplanationPanel } from "@/components/explanation-panel";
import { Recommendations } from "@/components/recommendations";
import type { Explanation } from "@/lib/types";
import type { CustomerInput } from "@/lib/schemas";
import { DISCLAIMER, RISK, fmtDateTime, type RiskLevel } from "@/lib/utils";

export interface ResultData {
  probability: number; risk_level: RiskLevel; predicted_label: "churn" | "no_churn"; threshold: number;
  risk_high_threshold?: number; model_version: string; timestamp: string; warnings?: string[];
  explanation: Explanation | null; customer: Partial<CustomerInput>;
}

export function ResultPanel({ data, loading }: { data?: ResultData; loading?: boolean }) {
  return (
    <div className="space-y-5" aria-busy={loading || undefined}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Model output</h2>
        {data && <RiskBadge level={data.risk_level} />}
      </div>
      <RiskGauge probability={data?.probability} level={data?.risk_level} threshold={data?.threshold}
        highThreshold={data?.risk_high_threshold} loading={loading} />
      {data && (
        <>
          <div className="rounded-xl border border-border bg-muted/40 p-3 text-center text-sm">
            <p className="font-bold">Predicted class: {data.predicted_label === "churn" ? "Likely to churn" : "Not likely to churn"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{RISK[data.risk_level].blurb}</p>
          </div>
          {data.warnings?.map((w) => <Alert key={w} tone="warning">{w}</Alert>)}
          <section aria-labelledby="why-h" className="space-y-2">
            <h3 id="why-h" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">What influenced this score</h3>
            <ExplanationPanel explanation={data.explanation} />
          </section>
          <Recommendations customer={data.customer} />
          <p className="text-[11px] italic text-muted-foreground">{DISCLAIMER}</p>
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <Badge>Model v{data.model_version}</Badge><Badge>{fmtDateTime(data.timestamp)}</Badge>
          </div>
        </>
      )}
    </div>
  );
}
