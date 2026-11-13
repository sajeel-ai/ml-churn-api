"use client";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, Skeleton, Td, Th } from "@/components/ui/misc";
import { api } from "@/lib/api";
import type { ModelInfo, ModelVersionRow } from "@/lib/types";
import { fmtDate, pct } from "@/lib/utils";

export default function ModelPage() {
  const { data: m, isLoading, isError } = useQuery({ queryKey: ["model"], queryFn: () => api<ModelInfo>("/api/v1/model"), staleTime: 300_000 });
  const versions = useQuery({ queryKey: ["model-versions"], queryFn: () => api<ModelVersionRow[]>("/api/v1/model/versions") });
  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-64" /></div>;
  if (isError || !m) return <Alert tone="error" title="Model information is unavailable">Please try again shortly.</Alert>;

  const facts: [string, string][] = [
    ["Algorithm", m.model_type], ["Model version", `v${m.model_version}`], ["Training dataset", m.training_dataset.name],
    ["Training rows", m.training_dataset.rows.toLocaleString()], ["Input features", String(m.features.length)],
    ["Classification threshold", pct(m.threshold, 0)], ["High-risk line (policy)", pct(m.risk_high_threshold, 0)], ["Last updated", fmtDate(m.last_updated)],
  ];
  const metrics: [string, string][] = [["Accuracy", pct(m.metrics.accuracy)], ["Precision", pct(m.metrics.precision)], ["Recall", pct(m.metrics.recall)], ["F1-score", m.metrics.f1.toFixed(3)], ["ROC-AUC", m.metrics.roc_auc.toFixed(3)], ["Brier score", m.metrics.brier_score.toFixed(3)]];
  const cm = m.evaluation.confusion_matrix;
  const calib = m.calibration.bins.map((b) => ({ predicted: +(b.mean_predicted * 100).toFixed(1), observed: +(b.observed_rate * 100).toFixed(1) }));

  return (
    <>
      <PageHeader eyebrow="Transparency" title="Model information" description="What the model is, how it was evaluated, and what it should not be used for. All values are read from the deployed model's metadata." />
      <div className="space-y-6">
        <Card><CardContent className="pt-5"><dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {facts.map(([k, v]) => <div key={k}><dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{k}</dt><dd className="mt-0.5 text-sm font-bold">{v}</dd></div>)}</dl>
          <p className="mt-4 text-xs text-muted-foreground">{m.algorithm}</p></CardContent></Card>

        <Card><CardHeader><CardTitle>Evaluation results</CardTitle><CardDescription>{m.evaluation.split} · {m.evaluation.n_test.toLocaleString()} test customers · {m.evaluation.validation_type}</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{metrics.map(([k, v]) => <div key={k} className="rounded-xl border border-border bg-muted/40 p-3 text-center"><dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{k}</dt><dd className="mt-1 font-mono text-xl font-extrabold">{v}</dd></div>)}</dl>
            <Alert tone="info" title="How the threshold was chosen">{m.evaluation.threshold_selection}</Alert>
            <div className="grid max-w-sm grid-cols-2 gap-2 text-center text-xs" role="table" aria-label="Confusion matrix">
              <div className="rounded-lg bg-muted p-2"><b className="block font-mono text-base">{cm.tn}</b>True no-churn</div><div className="rounded-lg bg-muted p-2"><b className="block font-mono text-base">{cm.fp}</b>False alarms</div>
              <div className="rounded-lg bg-muted p-2"><b className="block font-mono text-base">{cm.fn}</b>Missed churners</div><div className="rounded-lg bg-muted p-2"><b className="block font-mono text-base">{cm.tp}</b>True churners caught</div></div>
          </CardContent></Card>

        <Card><CardHeader><CardTitle>Calibration check</CardTitle><CardDescription>Expected calibration error {m.calibration.expected_calibration_error.toFixed(3)} · {m.calibration.method}</CardDescription></CardHeader>
          <CardContent><div className="h-64" role="img" aria-label="Predicted versus observed churn rate by bin">
            <ResponsiveContainer width="100%" height="100%"><LineChart data={calib} margin={{ left: -10, right: 12, top: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" /><XAxis dataKey="predicted" unit="%" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} label={{ value: "Mean predicted probability", position: "insideBottom", offset: -2, fontSize: 10, fill: "var(--muted-foreground)" }} height={40} />
              <YAxis unit="%" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} /><Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="observed" name="Observed churn rate" stroke="var(--primary)" strokeWidth={2} dot /><Line dataKey="predicted" name="Perfect calibration" stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
            </LineChart></ResponsiveContainer></div><p className="mt-2 text-xs text-muted-foreground">{m.calibration.note}</p></CardContent></Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Risk levels</CardTitle><CardDescription>A business policy applied to the probability. It is not part of the model.</CardDescription></CardHeader>
            <CardContent><ul className="space-y-2 text-sm"><li><b className="text-risk-low">Low:</b> {m.risk_policy.low}</li><li><b className="text-risk-medium">Medium:</b> {m.risk_policy.medium}</li><li><b className="text-risk-high">High:</b> {m.risk_policy.high}</li></ul></CardContent></Card>
          <Card><CardHeader><CardTitle>Intended use and limitations</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm"><p>{m.intended_use}</p><ul className="list-disc space-y-1 pl-5 text-muted-foreground">{m.limitations.map((l) => <li key={l}>{l}</li>)}</ul></CardContent></Card>
        </div>

        <Card><CardHeader><CardTitle>Input features</CardTitle><CardDescription>{m.preprocessing}</CardDescription></CardHeader>
          <CardContent className="overflow-x-auto"><table className="w-full"><thead><tr><Th>Feature</Th><Th>Accepted values</Th></tr></thead><tbody className="divide-y divide-border">
            {m.features.map((f) => (<tr key={f}><Td className="font-semibold">{f}</Td><Td className="text-muted-foreground">{m.categorical_values[f] ? m.categorical_values[f].join(" · ") : m.training_ranges[f] ? `number (training range ${m.training_ranges[f].min}–${m.training_ranges[f].max})` : f === "SeniorCitizen" ? "0 or 1" : "number"}</Td></tr>))}</tbody></table></CardContent></Card>

        <Card><CardHeader><CardTitle>Version history</CardTitle></CardHeader><CardContent className="overflow-x-auto">
          {versions.isLoading ? <Skeleton className="h-16" /> : (<table className="w-full"><thead><tr><Th>Version</Th><Th>Status</Th><Th className="text-right">ROC-AUC</Th><Th className="text-right">F1</Th><Th>Note</Th></tr></thead><tbody className="divide-y divide-border">
            {versions.data?.map((v) => (<tr key={v.version}><Td className="font-semibold">v{v.version}</Td><Td><Badge className={v.status === "active" ? "text-risk-low" : ""}>{v.status}</Badge></Td>
              <Td className="text-right font-mono">{v.metrics?.roc_auc.toFixed(3) ?? "–"}</Td><Td className="text-right font-mono">{v.metrics?.f1.toFixed(3) ?? "–"}</Td><Td className="text-xs text-muted-foreground">{v.note ?? ""}</Td></tr>))}</tbody></table>)}</CardContent></Card>
      </div>
    </>
  );
}
