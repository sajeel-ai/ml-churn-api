import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import type { Explanation } from "@/lib/types";
import { cn } from "@/lib/utils";

export const FEATURE_LABELS: Record<string, string> = {
  gender: "Gender", SeniorCitizen: "Senior citizen", Partner: "Has partner", Dependents: "Has dependents",
  tenure: "Tenure (months)", PhoneService: "Phone service", MultipleLines: "Multiple lines",
  InternetService: "Internet service", OnlineSecurity: "Online security", OnlineBackup: "Online backup",
  DeviceProtection: "Device protection", TechSupport: "Tech support", StreamingTV: "Streaming TV",
  StreamingMovies: "Streaming movies", Contract: "Contract", PaperlessBilling: "Paperless billing",
  PaymentMethod: "Payment method", MonthlyCharges: "Monthly charges", TotalCharges: "Total charges",
};

const show = (f: string, v: string | number | null) =>
  v === null ? "not provided" : f === "SeniorCitizen" ? (v === 1 ? "Yes" : "No") : String(v);

/** Real TreeSHAP factors for this prediction (not causal, not business rules). */
export function ExplanationPanel({ explanation }: { explanation: Explanation | null | undefined }) {
  if (!explanation) {
    return <p className="text-xs text-muted-foreground">An explanation is not available for this prediction.</p>;
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-2" aria-label="Top factors in this prediction">
        {explanation.factors.map((f) => {
          const up = f.effect === "increases";
          return (
            <li key={f.feature} className="rounded-xl border border-border bg-muted/40 p-2.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold">{FEATURE_LABELS[f.feature] ?? f.feature}: <span className="font-normal text-muted-foreground">{show(f.feature, f.value)}</span></span>
                <span className={cn("flex items-center gap-1 font-bold", up ? "text-risk-high" : "text-risk-low")}>
                  {up ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
                  {up ? "Raises risk" : "Lowers risk"}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
                <div className={cn("h-full rounded-full", up ? "bg-risk-high" : "bg-risk-low")} style={{ width: `${Math.max(6, f.relative_strength * 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{explanation.note} Average-customer baseline: {(explanation.base_probability * 100).toFixed(0)}% churn probability. Bar length shows relative influence within this prediction.</span>
      </p>
    </div>
  );
}
