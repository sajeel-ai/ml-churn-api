import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const pct = (p: number | null | undefined, digits = 1) =>
  p === null || p === undefined ? "–" : `${(p * 100).toFixed(digits)}%`;

export const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "–";

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "–";

export type RiskLevel = "low" | "medium" | "high";

export const RISK: Record<RiskLevel, { label: string; text: string; bg: string; border: string; hex: string; blurb: string }> = {
  low: {
    label: "Low risk", text: "text-risk-low", bg: "bg-risk-low-bg", border: "border-risk-low/40", hex: "var(--risk-low)",
    blurb: "Below the model's churn threshold.",
  },
  medium: {
    label: "Medium risk", text: "text-risk-medium", bg: "bg-risk-medium-bg", border: "border-risk-medium/40", hex: "var(--risk-medium)",
    blurb: "At or above the model threshold, below the high-risk line.",
  },
  high: {
    label: "High risk", text: "text-risk-high", bg: "bg-risk-high-bg", border: "border-risk-high/40", hex: "var(--risk-high)",
    blurb: "At or above the high-risk line set by the risk policy.",
  },
};

export const DISCLAIMER =
  "Predicted probability is a model estimate, not a guarantee that the customer will churn.";

/** Only allow same-site relative redirects after login. */
export const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard");
