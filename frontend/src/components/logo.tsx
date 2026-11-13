import Link from "next/link";
import { Activity } from "lucide-react";

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="Customer Churn Intelligence Platform home">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-accent text-white shadow">
        <Activity className="h-5 w-5" aria-hidden />
      </span>
      {!compact && <span className="text-sm font-extrabold leading-tight tracking-tight">Churn Intelligence<span className="block text-[10px] font-semibold text-muted-foreground">Prediction platform</span></span>}
    </Link>
  );
}
