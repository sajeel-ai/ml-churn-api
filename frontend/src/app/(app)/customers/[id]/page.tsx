"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Sparkles, Trash2 } from "lucide-react";
import { CustomerEditor } from "@/components/customer-editor";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { FEATURE_LABELS } from "@/components/explanation-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskBadge } from "@/components/ui/badge";
import { Alert, Skeleton, Td } from "@/components/ui/misc";
import { useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { canWrite, useMe } from "@/lib/hooks";
import type { Customer, Page, PredictionDetail, PredictionRow } from "@/lib/types";
import { fmtDateTime, pct } from "@/lib/utils";

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useMe();
  const [confirm, setConfirm] = React.useState(false);
  const { data: c, isLoading, error } = useQuery({ queryKey: ["customer", id], queryFn: () => api<Customer>(`/api/v1/customers/${id}`), retry: false });
  const hist = useQuery({ queryKey: ["predictions", { customer_id: id }], queryFn: () => api<Page<PredictionRow>>(`/api/v1/predictions?customer_id=${id}&page_size=50`), enabled: !!c });

  const del = useMutation({
    mutationFn: () => api(`/api/v1/customers/${id}`, { method: "DELETE" }),
    onSuccess: () => { ["customers", "predictions", "dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); toast({ title: "Customer deleted", tone: "success" }); router.replace("/customers"); },
    onError: (e) => toast({ title: "Could not delete", description: (e as Error).message, tone: "error" }),
  });
  const predict = useMutation({
    mutationFn: () => api<PredictionDetail>("/api/v1/predictions", { json: { customer_id: id } }),
    onSuccess: (p) => { ["customer", "customers", "dashboard", "predictions"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); router.push(`/predictions/${p.id}`); },
    onError: (e) => toast({ title: "Prediction failed", description: (e as Error).message, tone: "error" }),
  });

  if (isLoading) return <Skeleton className="h-96" />;
  if (error || !c) {
    const nf = error instanceof ApiError && error.status === 404;
    return <Alert tone="error" title={nf ? "Customer not found" : "Could not load this customer"}>{nf ? "It may have been deleted, or you may not have access to it." : (error as Error)?.message} <Link className="font-semibold text-primary" href="/customers">Back to customers</Link></Alert>;
  }
  const writer = canWrite(me);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2"><Link href="/customers"><ArrowLeft className="h-4 w-4" />Customers</Link></Button>
      <PageHeader title={c.customer_identifier} description={`Added ${fmtDateTime(c.created_at)} · updated ${fmtDateTime(c.updated_at)}`}
        actions={writer ? <>
          <Button onClick={() => predict.mutate()} loading={predict.isPending}><Sparkles className="h-4 w-4" />Predict churn</Button>
          <Button variant="outline" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Delete</Button></> : undefined} />
      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-8"><CardHeader><CardTitle>{writer ? "Customer details" : "Details (read-only)"}</CardTitle></CardHeader>
          <CardContent>
            {writer ? <CustomerEditor initial={c} /> : (
              <table className="w-full"><tbody className="divide-y divide-border">
                {Object.entries(FEATURE_LABELS).map(([k, label]) => { const v = (c as unknown as Record<string, unknown>)[k];
                  return <tr key={k}><Td className="w-1/2 text-muted-foreground">{label}</Td><Td className="font-semibold">{v === null ? "Not provided" : k === "SeniorCitizen" ? (v === 1 ? "Yes" : "No") : String(v)}</Td></tr>; })}
              </tbody></table>)}
          </CardContent></Card>
        <Card className="lg:col-span-4"><CardHeader><CardTitle>Prediction history</CardTitle><CardDescription>Newest first.</CardDescription></CardHeader>
          <CardContent>
            {hist.isLoading ? <Skeleton className="h-24" /> : !hist.data?.items.length ? <p className="text-sm text-muted-foreground">No predictions yet. Use “Predict churn” to score this customer.</p> : (
              <ul className="space-y-2">{hist.data.items.map((p) => (
                <li key={p.id}><Link href={`/predictions/${p.id}`} className="flex items-center justify-between rounded-xl border border-border p-2.5 hover:bg-muted/50">
                  <span className="text-xs text-muted-foreground">{fmtDateTime(p.created_at)}</span>
                  <span className="flex items-center gap-2"><RiskBadge level={p.risk_level} /><span className="font-mono text-xs">{pct(p.probability, 0)}</span></span></Link></li>))}</ul>)}
          </CardContent></Card>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`Delete “${c.customer_identifier}”?`} loading={del.isPending}
        description="This permanently deletes the customer and all of their saved predictions. This cannot be undone." onConfirm={() => del.mutate()} />
    </>
  );
}
