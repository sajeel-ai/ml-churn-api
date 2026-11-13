import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export const Skeleton = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("animate-pulse rounded-lg bg-muted", className)} aria-hidden {...p} />
);

type Tone = "info" | "warning" | "error" | "success";
const TONES: Record<Tone, { cls: string; Icon: typeof Info }> = {
  info: { cls: "border-primary/30 bg-primary/10 text-foreground", Icon: Info },
  warning: { cls: "border-risk-medium/40 bg-risk-medium-bg text-foreground", Icon: AlertTriangle },
  error: { cls: "border-risk-high/40 bg-risk-high-bg text-foreground", Icon: AlertTriangle },
  success: { cls: "border-risk-low/40 bg-risk-low-bg text-foreground", Icon: CheckCircle2 },
};
export function Alert({ tone = "info", title, children, className }: { tone?: Tone; title?: string; children?: React.ReactNode; className?: string }) {
  const { cls, Icon } = TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{title && <p className="font-semibold">{title}</p>}{children && <div className="text-muted-foreground">{children}</div>}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, children, action }: { icon?: typeof Inbox; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <div className="rounded-full bg-muted p-3"><Icon className="h-6 w-6 text-muted-foreground" aria-hidden /></div>
      <h3 className="text-sm font-bold">{title}</h3>
      {children && <p className="max-w-md text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function FieldError({ message }: { message?: string }) {
  return message ? <p role="alert" className="mt-1 text-xs text-risk-high">{message}</p> : null;
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  return (
    <nav className="flex items-center justify-between gap-3 pt-3 text-xs text-muted-foreground" aria-label="Pagination">
      <span>{total.toLocaleString()} result{total === 1 ? "" : "s"}</span>
      <div className="flex items-center gap-2">
        <button className="rounded-lg border border-input bg-card px-3 py-1.5 font-semibold text-foreground hover:bg-muted disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}</span>
        <button className="rounded-lg border border-input bg-card px-3 py-1.5 font-semibold text-foreground hover:bg-muted disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </nav>
  );
}

export const Th = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground", className)} {...p} />
);
export const Td = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("px-3 py-2.5 text-sm", className)} {...p} />
);
