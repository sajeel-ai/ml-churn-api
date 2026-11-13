"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Sparkles, Trash2, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { RiskBadge } from "@/components/ui/badge";
import { Alert, EmptyState, Pagination, Skeleton, Td, Th } from "@/components/ui/misc";
import { useToast } from "@/components/providers";
import { api, qs } from "@/lib/api";
import { canWrite, useDebounced, useMe, useResetOnChange } from "@/lib/hooks";
import { CONTRACT, INTERNET } from "@/lib/schemas";
import type { Customer, Page, PredictionDetail } from "@/lib/types";
import { cn, money, pct } from "@/lib/utils";

export default function CustomersPage() {
  const { data: me } = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [contract, setContract] = React.useState("");
  const [internet, setInternet] = React.useState("");
  const [sort, setSort] = React.useState("created_at");
  const [order, setOrder] = React.useState("desc");
  const [page, setPage] = React.useState(1);
  const [target, setTarget] = React.useState<Customer | null>(null);
  const dq = useDebounced(q, 350);
  useResetOnChange(JSON.stringify([dq, contract, internet, sort, order]), () => setPage(1));

  const params = { q: dq, contract, internet_service: internet, sort, order, page, page_size: 15 };
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["customers", params], queryFn: () => api<Page<Customer>>(`/api/v1/customers${qs(params)}`), placeholderData: keepPreviousData,
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/api/v1/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => { setTarget(null); qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["predictions"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast({ title: "Customer deleted", tone: "success" }); },
    onError: (e) => toast({ title: "Could not delete", description: (e as Error).message, tone: "error" }),
  });
  const predict = useMutation({
    mutationFn: (id: string) => api<PredictionDetail>("/api/v1/predictions", { json: { customer_id: id } }),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["customers"] }); router.push(`/predictions/${p.id}`); },
    onError: (e) => toast({ title: "Prediction failed", description: (e as Error).message, tone: "error" }),
  });
  const filtered = !!(dq || contract || internet);

  return (
    <>
      <PageHeader title="Customers" description="Manage customer records and re-score them whenever their plan changes."
        actions={canWrite(me) ? <Button asChild><Link href="/customers/new"><Plus className="h-4 w-4" />Add customer</Link></Button> : undefined} />
      <Card className="mb-4"><CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input aria-label="Search customers" placeholder="Search identifier…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select aria-label="Contract" value={contract} onChange={(e) => setContract(e.target.value)}><option value="">All contracts</option>{CONTRACT.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select aria-label="Internet service" value={internet} onChange={(e) => setInternet(e.target.value)}><option value="">All internet types</option>{INTERNET.map((c) => <option key={c} value={c}>{c === "No" ? "No internet" : c}</option>)}</Select>
        <div className="flex gap-2"><Select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}><option value="created_at">Newest</option><option value="customer_identifier">Identifier</option><option value="tenure">Tenure</option><option value="monthly_charges">Monthly charges</option></Select>
          <Button variant="outline" size="icon" aria-label="Toggle sort direction" onClick={() => setOrder(order === "desc" ? "asc" : "desc")}>{order === "desc" ? "↓" : "↑"}</Button></div>
      </CardContent></Card>

      {isError ? <Alert tone="error" title="Could not load customers">{(error as Error).message}</Alert>
        : isLoading ? <Skeleton className="h-64" />
        : !data || data.total === 0 ? (
          <EmptyState icon={Users} title={filtered ? "No customers match these filters" : "No customers yet"}
            action={!filtered && canWrite(me) ? <Button asChild><Link href="/customers/new">Add your first customer</Link></Button> : undefined}>
            {filtered ? "Try a different search or clear the filters." : "Add customers to keep their details and prediction history together."}</EmptyState>
        ) : (
          <Card><CardContent className={cn("overflow-x-auto pt-3", isFetching && "opacity-70")}>
            <table className="w-full"><thead><tr><Th>Identifier</Th><Th>Contract</Th><Th className="text-right">Tenure</Th><Th className="text-right">Monthly</Th><Th>Latest risk</Th><Th /></tr></thead>
              <tbody className="divide-y divide-border">
                {data.items.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <Td className="font-semibold"><Link className="hover:text-primary hover:underline" href={`/customers/${c.id}`}>{c.customer_identifier}</Link></Td>
                    <Td className="text-muted-foreground">{c.Contract}</Td><Td className="text-right font-mono">{c.tenure} mo</Td><Td className="text-right font-mono">{money(c.MonthlyCharges)}</Td>
                    <Td>{c.latest_prediction ? <span className="inline-flex items-center gap-2"><RiskBadge level={c.latest_prediction.risk_level} /><span className="font-mono text-xs text-muted-foreground">{pct(c.latest_prediction.probability, 0)}</span></span> : <span className="text-xs text-muted-foreground">Not scored</span>}</Td>
                    <Td className="whitespace-nowrap text-right">
                      {canWrite(me) && <>
                        <Button size="sm" variant="secondary" className="mr-2" loading={predict.isPending && predict.variables === c.id} disabled={predict.isPending} onClick={() => predict.mutate(c.id)}><Sparkles className="h-3.5 w-3.5" />Predict</Button>
                        <button aria-label={`Delete ${c.customer_identifier}`} className="rounded p-1 text-muted-foreground hover:text-risk-high" onClick={() => setTarget(c)}><Trash2 className="h-4 w-4" /></button></>}
                    </Td>
                  </tr>))}
              </tbody></table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </CardContent></Card>
        )}
      <ConfirmDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)} title={`Delete “${target?.customer_identifier}”?`} loading={del.isPending}
        description="This permanently deletes the customer and all of their saved predictions. This cannot be undone." onConfirm={() => target && del.mutate(target.id)} />
    </>
  );
}
