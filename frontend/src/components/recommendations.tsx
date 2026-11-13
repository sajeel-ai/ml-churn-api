"use client";
import * as React from "react";
import { Check, Copy, Lightbulb } from "lucide-react";
import type { CustomerInput } from "@/lib/schemas";

export function suggestionsFor(c: Partial<CustomerInput>): string[] {
  const out: string[] = [];
  if (c.Contract === "Month-to-month") out.push("Consider offering a longer-term contract option.");
  if ((c.tenure ?? 99) <= 6) out.push("Consider an early-life check-in or onboarding follow-up.");
  if (c.InternetService && c.InternetService !== "No" && c.TechSupport === "No") out.push("Consider offering a trial of tech support or security add-ons.");
  if (c.PaymentMethod === "Electronic check") out.push("Consider encouraging automatic payment.");
  if (out.length === 0) out.push("Maintain regular engagement and review again after any plan change.");
  return out.slice(0, 4);
}

/** General business ideas based only on the inputs. NOT model output. */
export function Recommendations({ customer }: { customer: Partial<CustomerInput> }) {
  const [copied, setCopied] = React.useState<number | null>(null);
  const items = suggestionsFor(customer);
  return (
    <section aria-labelledby="sugg-h" className="space-y-2">
      <h3 id="sugg-h" className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <Lightbulb className="h-3.5 w-3.5 text-accent" aria-hidden /> General suggestions
      </h3>
      <p className="text-[11px] text-muted-foreground">Generic ideas based on the inputs. They are not produced by the model and have not been tested for effectiveness.</p>
      <ul className="space-y-1.5">
        {items.map((s, i) => (
          <li key={s} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 p-2.5 text-xs">
            <span>{s}</span>
            <button type="button" aria-label="Copy suggestion" className="rounded-lg p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
              onClick={async () => { try { await navigator.clipboard.writeText(s); setCopied(i); setTimeout(() => setCopied(null), 1800); } catch { /* clipboard blocked */ } }}>
              {copied === i ? <Check className="h-3.5 w-3.5 text-risk-low" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
