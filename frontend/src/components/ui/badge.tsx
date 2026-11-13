import { cn, RISK, type RiskLevel } from "@/lib/utils";

export function Badge({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground", className)} {...p} />;
}

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const r = RISK[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold", r.bg, r.border, r.text, className)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.hex }} aria-hidden />
      {r.label}
    </span>
  );
}
