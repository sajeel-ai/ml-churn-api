"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, ExternalLink, RotateCcw, Save } from "lucide-react";
import { CustomerFields, useCustomerForm } from "@/components/customer-form";
import { PageHeader } from "@/components/page-header";
import { ResultPanel } from "@/components/result-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/providers";
import { api, download } from "@/lib/api";
import { canWrite, useDebounced, useMe } from "@/lib/hooks";
import { DEFAULT_CUSTOMER, PRESETS, customerSchema, type CustomerInput } from "@/lib/schemas";
import type { ModelInfo, PredictionDetail, Preview } from "@/lib/types";

export default function PredictPage() {
  const { data: me } = useMe();
  const { toast } = useToast();
  const qc = useQueryClient();
  const form = useCustomerForm(DEFAULT_CUSTOMER);
  const [reference, setReference] = React.useState("");
  const [savedState, setSaved] = React.useState<{ key: string; detail: PredictionDetail } | null>(null);

  const values = form.watch();
  const key = JSON.stringify(values);
  const debounced = useDebounced(key, 450);
  const parsed = React.useMemo(() => customerSchema.safeParse(JSON.parse(debounced)), [debounced]);
  const liveValid = customerSchema.safeParse(values).success;

  // Any edit invalidates a previously saved result, so the same input is never shown as saved after a change.
  const saved = savedState && savedState.key === key ? savedState.detail : null;

  const preview = useQuery({
    queryKey: ["preview", debounced],
    queryFn: () => api<Preview>("/api/v1/predict", { json: parsed.success ? parsed.data : undefined }),
    enabled: parsed.success && liveValid, placeholderData: keepPreviousData, staleTime: Infinity, retry: false,
  });
  const model = useQuery({ queryKey: ["model"], queryFn: () => api<ModelInfo>("/api/v1/model"), staleTime: 300_000 });

  const save = useMutation({
    mutationFn: () => api<PredictionDetail>("/api/v1/predictions", { json: { input: customerSchema.parse(values), reference: reference.trim() || null } }),
    onSuccess: (p) => {
      setSaved({ key, detail: p });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["predictions"] });
      toast({ title: "Prediction saved", description: "It now appears in your history.", tone: "success" });
    },
    onError: (e) => toast({ title: "Could not save", description: (e as Error).message, tone: "error" }),
  });

  if (me && !canWrite(me)) {
    return <Alert tone="warning" title="Not available">Your role is read-only, so you cannot create predictions.</Alert>;
  }

  const result = preview.data && liveValid ? {
    probability: preview.data.probability, risk_level: preview.data.risk_level, predicted_label: preview.data.predicted_label,
    threshold: preview.data.threshold, risk_high_threshold: preview.data.risk_high_threshold, model_version: preview.data.model_version,
    timestamp: preview.data.predicted_at, warnings: preview.data.warnings, explanation: preview.data.explanation, customer: values,
  } : undefined;
  const firstErrors = Object.values(form.formState.errors).map((e) => e?.message).filter(Boolean).slice(0, 3) as string[];

  return (
    <>
      <PageHeader eyebrow="Single customer" title="New prediction"
        description="Describe the customer. The trained model scores the profile as you type; nothing is saved until you choose to."
        actions={<>
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
            <Button key={k} variant="secondary" size="sm" title={PRESETS[k].description} onClick={() => form.reset(PRESETS[k].values)}>{PRESETS[k].label}</Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => { form.reset(DEFAULT_CUSTOMER); setReference(""); }}><RotateCcw className="h-3.5 w-3.5" />Reset</Button>
        </>} />
      <p className="-mt-3 mb-5 text-[11px] text-muted-foreground">The two example profiles only fill in the form. The score always comes from the model.</p>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader><CardTitle>Customer details</CardTitle><CardDescription>All 19 model inputs. Fields that depend on each other are kept consistent automatically.</CardDescription></CardHeader>
          <CardContent>
            <div className="mb-5"><Label htmlFor="ref">Reference (optional)</Label>
              <Input id="ref" className="mt-1.5" maxLength={100} placeholder="e.g. a customer ID or label to find this later" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
            <CustomerFields form={form} />
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-6 lg:col-span-5">
          <CardContent className="space-y-4 pt-5">
            {!liveValid ? (
              <Alert tone="info" title="Complete the form to see a prediction">
                {firstErrors.length ? firstErrors.join(" · ") : "Checking inputs…"}
              </Alert>
            ) : preview.isError ? (
              <Alert tone="error" title="Prediction unavailable">{(preview.error as Error).message}</Alert>
            ) : null}
            {(liveValid || result) && <ResultPanel data={result} loading={preview.isFetching || (liveValid && key !== debounced)} />}

            {result && liveValid && (
              <div className="space-y-2 border-t border-border pt-4">
                {saved ? (
                  <>
                    <Alert tone="success" title="Saved to your history" />
                    <div className="grid grid-cols-2 gap-2">
                      <Button asChild variant="secondary" size="sm"><Link href={`/predictions/${saved.id}`}><ExternalLink className="h-3.5 w-3.5" />View details</Link></Button>
                      <Button variant="secondary" size="sm" onClick={() => download(`/api/v1/predictions/${saved.id}/report`, "churn-report.html").catch((e) => toast({ title: "Download failed", description: (e as Error).message, tone: "error" }))}><Download className="h-3.5 w-3.5" />Download report</Button>
                    </div>
                  </>
                ) : (
                  <Button className="w-full" onClick={() => save.mutate()} loading={save.isPending} disabled={save.isPending || key !== debounced}><Save className="h-4 w-4" />Save prediction</Button>
                )}
                <Button variant="ghost" size="sm" className="w-full" onClick={() => { form.reset(DEFAULT_CUSTOMER); setReference(""); }}>Run another prediction</Button>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><CheckCircle2 className="h-3 w-3" />Model v{model.data?.model_version ?? "…"} · classification threshold {model.data ? (model.data.threshold * 100).toFixed(0) : "…"}%</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
