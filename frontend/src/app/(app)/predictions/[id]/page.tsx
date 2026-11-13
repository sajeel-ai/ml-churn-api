"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ResultPanel } from "@/components/result-panel";
import { FEATURE_LABELS } from "@/components/explanation-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Skeleton, Td } from "@/components/ui/misc";
import { useToast } from "@/components/providers";
import { api, ApiError, download } from "@/lib/api";
import { canWrite, useMe } from "@/lib/hooks";
import type { ModelInfo, PredictionDetail } from "@/lib/types";
import { fmtDateTime } from "@/lib/utils";

export default function PredictionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useMe();
  const [confirm, setConfirm] = React.useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ["prediction", id], queryFn: () => api<PredictionDetail>(`/api/v1/predictions/${id}`), retry: false });
  const model = useQuery({ queryKey: ["model"], queryFn: () => api<ModelInfo>("/api/v1/model"), staleTime: 300_000 });
  const del = useMutation({
    mutationFn: () => api(`/api/v1/predictions/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["predictions"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast({ title: "Prediction deleted", tone: "success" }); router.replace("/predictions"); },
    onError: (e) => toast({ title: "Could not delete", description: (e as Error).message, tone: "error" }),
  });

  if (isLoading) return <Skeleton className="h-96" />;
  if (error || !data) {
    const nf = error instanceof ApiError && error.status === 404;
    return <Alert tone="error" title={nf ? "Prediction not found" : "Could not load this prediction"}>{nf ? "It may have been deleted, or you may not have access to it." : (error as Error)?.message} <Link className="font-semibold text-primary" href="/predictions">Back to history</Link></Alert>;
  }
  const rows = Object.entries(data.input);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2"><Link href="/predictions"><ArrowLeft className="h-4 w-4" />History</Link></Button>
      <PageHeader title={data.reference ?? "Prediction"} description={`Saved ${fmtDateTime(data.created_at)} · ${data.source} prediction`}
        actions={<>
          {data.customer_id && <Button asChild variant="secondary" size="sm"><Link href={`/customers/${data.customer_id}`}>View customer</Link></Button>}
          <Button variant="secondary" size="sm" onClick={() => download(`/api/v1/predictions/${id}/report`, "churn-report.html").catch((e) => toast({ title: "Download failed", description: (e as Error).message, tone: "error" }))}><Download className="h-4 w-4" />Download report</Button>
          {canWrite(me) && <Button variant="outline" size="sm" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Delete</Button>}
        </>} />
      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5"><CardContent className="pt-5">
          <ResultPanel data={{ probability: data.probability, risk_level: data.risk_level, predicted_label: data.predicted_label, threshold: data.threshold,
            risk_high_threshold: model.data?.risk_high_threshold, model_version: data.model_version, timestamp: data.created_at, explanation: data.explanation, customer: data.input }} />
        </CardContent></Card>
        <Card className="lg:col-span-7"><CardHeader><CardTitle>Customer input summary</CardTitle></CardHeader>
          <CardContent><table className="w-full"><tbody className="divide-y divide-border">
            {rows.map(([k, v]) => (<tr key={k}><Td className="w-1/2 text-muted-foreground">{FEATURE_LABELS[k] ?? k}</Td>
              <Td className="font-semibold">{v === null ? "Not provided" : k === "SeniorCitizen" ? (v === 1 ? "Yes" : "No") : String(v)}</Td></tr>))}
          </tbody></table></CardContent></Card>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Delete this prediction?" loading={del.isPending}
        description="This permanently removes it from your history. This cannot be undone." onConfirm={() => del.mutate()} />
    </>
  );
}
