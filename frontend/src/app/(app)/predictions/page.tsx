"use client";
import * as React from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Search, Trash2, History as HistoryIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { RiskBadge } from "@/components/ui/badge";
import { Alert, EmptyState, Pagination, Skeleton, Td, Th } from "@/components/ui/misc";
import { useToast } from "@/components/providers";
import { api, download, qs } from "@/lib/api";
import { canWrite, useDebounced, useMe, useResetOnChange } from "@/lib/hooks";
import type { Page, PredictionRow } from "@/lib/types";
import { cn, fmtDateTime, pct, RISK, type RiskLevel } from "@/lib/utils";

const SORTS = [["created_at", "Date"], ["probability", "Probability"], ["risk_level", "Risk level"], ["reference", "Reference"]] as const;

export default function HistoryPage() {
  const { data: me } = useMe();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const [risk, setRisk] = React.useState<RiskLevel[]>([]);
  const [source, setSource] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [sort, setSort] = React.useState("created_at");
  const [order, setOrder] = React.useState<"asc" | "desc">("desc");
  const [page, setPage] = React.useState(1);
  const [target, setTarget] = React.useState<PredictionRow | null>(null);
  const dq = useDebounced(q, 350);

  useResetOnChange(JSON.stringify([dq, risk, source, from, to, sort, order]), () => setPage(1));
  const params = { q: dq, risk_level: risk, source, date_from: from, date_to: to, sort, order, page, page_size: 15 };
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["predictions", params], queryFn: () => api<Page<PredictionRow>>(`/api/v1/predictions${qs(params)}`), placeholderData: keepPreviousData,
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/api/v1/predictions/${id}`, { method: "DELETE" }),
    onSuccess: () => { setTarget(null); qc.invalidateQueries({ queryKey: ["predictions"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast({ title: "Prediction deleted", tone: "success" }); },
    onError: (e) => toast({ title: "Could not delete", description: (e as Error).message, tone: "error" }),
  });
  const filtered = !!(dq || risk.length || source || from || to);
  const toggle = (r: RiskLevel) => setRisk((x) => (x.includes(r) ? x.filter((y) => y !== r) : [...x, r]));
  const exportCsv = () => download(`/api/v1/predictions/export.csv${qs({ q: dq, risk_level: risk, source, date_from: from, date_to: to })}`, "predictions.csv")
    .catch((e) => toast({ title: "Export failed", description: (e as Error).message, tone: "error" }));

  return (
    <>
      <PageHeader title="Prediction history" description="Search, filter and export your saved predictions."
        actions={<Button variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" />Export CSV</Button>} />
      <Card className="mb-4"><CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search by reference" placeholder="Search reference…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)}><option value="">All sources</option><option value="single">Single</option><option value="customer">Customer</option><option value="bulk">Bulk</option></Select>
        <Input aria-label="From date" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        <Input aria-label="To date" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        <div className="flex gap-2"><Select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Button variant="outline" size="icon" aria-label={`Sort ${order === "desc" ? "descending" : "ascending"}`} onClick={() => setOrder(order === "desc" ? "asc" : "desc")}>{order === "desc" ? "↓" : "↑"}</Button></div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-6" role="group" aria-label="Risk level filter">
          <span className="text-xs font-semibold text-muted-foreground">Risk:</span>
          {(["high", "medium", "low"] as RiskLevel[]).map((r) => (
            <button key={r} type="button" aria-pressed={risk.includes(r)} onClick={() => toggle(r)}
              className={cn("rounded-full border px-3 py-1 text-xs font-bold", risk.includes(r) ? cn(RISK[r].bg, RISK[r].border, RISK[r].text) : "border-border text-muted-foreground hover:bg-muted")}>{RISK[r].label}</button>))}
          {filtered && <button className="ml-auto text-xs font-semibold text-primary hover:underline" onClick={() => { setQ(""); setRisk([]); setSource(""); setFrom(""); setTo(""); }}>Clear filters</button>}
        </div>
      </CardContent></Card>

      {isError ? <Alert tone="error" title="Could not load history">{(error as Error).message}</Alert>
        : isLoading ? <Skeleton className="h-64" />
        : !data || data.total === 0 ? (
          <EmptyState icon={HistoryIcon} title={filtered ? "No predictions match these filters" : "No predictions yet"}
            action={!filtered && canWrite(me) ? <Button asChild><Link href="/predict">Create a prediction</Link></Button> : undefined}>
            {filtered ? "Try removing a filter or widening the date range." : "Saved predictions will appear here."}</EmptyState>
        ) : (
          <Card><CardContent className={cn("overflow-x-auto pt-3", isFetching && "opacity-70")}>
            <table className="w-full"><thead><tr><Th>Reference</Th><Th>Date</Th><Th>Risk</Th><Th className="text-right">Probability</Th><Th>Outcome</Th><Th>Source</Th><Th /></tr></thead>
              <tbody className="divide-y divide-border">
                {data.items.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <Td className="max-w-[14rem] truncate font-semibold">{p.reference ?? "–"}</Td><Td className="whitespace-nowrap text-muted-foreground">{fmtDateTime(p.created_at)}</Td>
                    <Td><RiskBadge level={p.risk_level} /></Td><Td className="text-right font-mono">{pct(p.probability)}</Td>
                    <Td>{p.predicted_label === "churn" ? "Likely churn" : "Unlikely"}</Td><Td className="capitalize text-muted-foreground">{p.source}</Td>
                    <Td className="whitespace-nowrap text-right"><Link className="mr-3 text-xs font-semibold text-primary hover:underline" href={`/predictions/${p.id}`}>Details</Link>
                      {canWrite(me) && <button aria-label={`Delete prediction ${p.reference ?? p.id}`} className="rounded p-1 text-muted-foreground hover:text-risk-high" onClick={() => setTarget(p)}><Trash2 className="h-4 w-4" /></button>}</Td>
                  </tr>))}
              </tbody></table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </CardContent></Card>
        )}
      <ConfirmDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)} title="Delete this prediction?" loading={del.isPending}
        description={`This permanently removes the prediction${target?.reference ? ` for “${target.reference}”` : ""} from your history. This cannot be undone.`}
        onConfirm={() => target && del.mutate(target.id)} />
    </>
  );
}
