"use client";
import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, UploadCloud, XCircle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Skeleton, Td, Th } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/providers";
import { api, download } from "@/lib/api";
import { canWrite, useMe } from "@/lib/hooks";
import { DEFAULT_CUSTOMER } from "@/lib/schemas";
import type { Job, ValidationReport } from "@/lib/types";
import { fmtDateTime } from "@/lib/utils";

const MAX_BYTES = 5 * 1024 * 1024;

function downloadTemplate() {
  const cols = ["customerID", ...Object.keys(DEFAULT_CUSTOMER)];
  const row = ["EXAMPLE-001", ...Object.values(DEFAULT_CUSTOMER).map((v) => (v === null ? "" : String(v)))];
  const blob = new Blob([cols.join(",") + "\n" + row.join(",") + "\n"], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "churn-template.csv"; a.click(); URL.revokeObjectURL(a.href);
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="rounded-xl border border-border bg-muted/40 p-3 text-center"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className={`font-mono text-2xl font-extrabold ${tone ?? ""}`}>{value.toLocaleString()}</p></div>;
}

export default function BulkPage() {
  const { data: me } = useMe();
  const { toast } = useToast();
  const qc = useQueryClient();
  const input = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [report, setReport] = React.useState<ValidationReport | null>(null);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const validate = useMutation({
    mutationFn: (f: File) => { const fd = new FormData(); fd.append("file", f); return api<ValidationReport>("/api/v1/predictions/bulk/validate", { form: fd }); },
    onSuccess: setReport, onError: () => setReport(null),
  });
  const start = useMutation({
    mutationFn: (f: File) => { const fd = new FormData(); fd.append("file", f); return api<Job>("/api/v1/predictions/bulk", { form: fd }); },
    onSuccess: (j) => { setJobId(j.id); qc.invalidateQueries({ queryKey: ["jobs"] }); },
    onError: (e) => toast({ title: "Could not start processing", description: (e as Error).message, tone: "error" }),
  });
  const job = useQuery({
    queryKey: ["job", jobId], queryFn: () => api<Job>(`/api/v1/jobs/${jobId}`), enabled: !!jobId,
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "completed" || q.state.data.status === "failed") ? false : 1500),
  });
  const jobs = useQuery({ queryKey: ["jobs"], queryFn: () => api<Job[]>("/api/v1/jobs") });

  React.useEffect(() => {
    if (job.data?.status === "completed") { ["dashboard", "predictions", "jobs"].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); }
  }, [job.data?.status, qc]);

  if (me && !canWrite(me)) return <Alert tone="warning" title="Not available">Your role is read-only, so you cannot run bulk predictions.</Alert>;

  const pick = (f: File | undefined) => {
    setLocalError(null); setReport(null); setJobId(null); setFile(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") { setLocalError("Please choose a .csv file."); return; }
    if (f.size > MAX_BYTES) { setLocalError("That file is larger than 5 MB. Split it into smaller files."); return; }
    setFile(f); validate.mutate(f);
  };
  const reset = () => { setFile(null); setReport(null); setJobId(null); setLocalError(null); validate.reset(); start.reset(); if (input.current) input.current.value = ""; };
  const j = job.data;
  const pctDone = j && j.total_rows ? Math.round((j.processed_rows / j.total_rows) * 100) : 0;

  return (
    <>
      <PageHeader eyebrow="Batch scoring" title="Bulk prediction" description="Upload a CSV, review the validation report, then score every valid row."
        actions={<Button variant="secondary" onClick={downloadTemplate}><FileSpreadsheet className="h-4 w-4" />Download template</Button>} />
      <div className="space-y-6">
        {!jobId && (
          <Card><CardHeader><CardTitle>1. Upload a CSV file</CardTitle><CardDescription>Up to 5,000 rows and 5 MB. Required columns: all 19 model inputs. A customerID column is used as the reference if present; other columns are ignored.</CardDescription></CardHeader>
            <CardContent>
              <div onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]); }}
                className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border"}`}>
                <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden />
                <p className="text-sm font-semibold">{file ? file.name : "Drag a CSV here, or choose a file"}</p>
                <input ref={input} id="csv" type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
                <Button asChild variant="secondary" size="sm"><label htmlFor="csv" className="cursor-pointer">Choose file</label></Button>
              </div>
              {localError && <Alert tone="error" className="mt-3">{localError}</Alert>}
              {validate.isPending && <Skeleton className="mt-4 h-24" />}
              {validate.isError && <Alert tone="error" title="Could not validate this file" className="mt-3">{(validate.error as Error).message}</Alert>}
            </CardContent></Card>
        )}

        {report && !jobId && (
          <Card><CardHeader><CardTitle>2. Review the validation report</CardTitle><CardDescription>{report.filename}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3"><Stat label="Rows" value={report.total_rows} /><Stat label="Valid" value={report.valid_rows} tone="text-risk-low" /><Stat label="Invalid" value={report.invalid_rows} tone={report.invalid_rows ? "text-risk-high" : ""} /></div>
              {report.missing_columns.length > 0 && <Alert tone="error" title="Missing required columns">{report.missing_columns.join(", ")}. Add these columns (names are not case-sensitive) and upload again.</Alert>}
              {report.ignored_columns.length > 0 && <Alert tone="info" title="Columns that will be ignored">{report.ignored_columns.join(", ")}</Alert>}
              {report.invalid_rows > 0 && !report.missing_columns.length && (
                <div><Alert tone="warning" title={`${report.invalid_rows} row${report.invalid_rows === 1 ? "" : "s"} have problems`}>These rows will not be scored. They are kept in the results file, marked “invalid” with the reason, so nothing is silently dropped.</Alert>
                  <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-border"><table className="w-full"><thead className="sticky top-0 bg-card"><tr><Th>CSV line</Th><Th>Problem</Th></tr></thead>
                    <tbody className="divide-y divide-border">{report.errors.map((e) => <tr key={e.row}><Td className="font-mono">{e.row}</Td><Td>{e.errors.join("; ")}</Td></tr>)}</tbody></table></div>
                  {report.errors_truncated && <p className="mt-1 text-xs text-muted-foreground">Showing the first 100 problem rows. Every invalid row will still be marked in the results file.</p>}</div>)}
              <div><p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Preview (first {report.preview.length} rows)</p>
                <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-xs"><thead><tr>{report.preview[0] && Object.keys(report.preview[0]).map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
                  <tbody className="divide-y divide-border">{report.preview.map((r, i) => <tr key={i}>{Object.values(r).map((v, k) => <Td key={k} className="whitespace-nowrap py-1.5 text-xs">{v}</Td>)}</tr>)}</tbody></table></div></div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button variant="ghost" onClick={reset}>Choose a different file</Button>
                <Button onClick={() => file && start.mutate(file)} loading={start.isPending} disabled={!report.can_process || report.valid_rows === 0 || start.isPending}>3. Score {report.valid_rows.toLocaleString()} valid row{report.valid_rows === 1 ? "" : "s"}</Button>
              </div>
            </CardContent></Card>
        )}

        {jobId && (
          <Card><CardHeader><CardTitle>{j?.status === "completed" ? "Results ready" : j?.status === "failed" ? "Processing failed" : "Processing…"}</CardTitle><CardDescription>{j?.filename}</CardDescription></CardHeader>
            <CardContent className="space-y-4" aria-live="polite">
              {(!j || j.status === "pending" || j.status === "running") && <div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.max(pctDone, 5)}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">{j ? `${j.status === "pending" ? "Queued" : "Running"} · ${j.total_rows.toLocaleString()} rows` : "Starting…"}</p></div>}
              {j?.status === "failed" && <Alert tone="error" title="This job failed">{j.error} No predictions were saved. You can upload the file again.</Alert>}
              {j?.status === "completed" && (<>
                <div className="grid grid-cols-3 gap-3"><Stat label="Rows" value={j.total_rows} /><Stat label="Scored" value={j.total_rows - j.invalid_rows} tone="text-risk-low" /><Stat label="Invalid" value={j.invalid_rows} tone={j.invalid_rows ? "text-risk-high" : ""} /></div>
                <Alert tone="success" title="Done"><CheckCircle2 className="hidden" />Scored rows were saved to your history. The results file contains every input row plus prediction columns.</Alert>
                <div className="flex flex-wrap gap-2"><Button onClick={() => download(`/api/v1/jobs/${j.id}/result.csv`, "predictions.csv").catch((e) => toast({ title: "Download failed", description: (e as Error).message, tone: "error" }))}><Download className="h-4 w-4" />Download results CSV</Button>
                  <Button asChild variant="secondary"><Link href="/predictions?source=bulk">View in history</Link></Button><Button variant="ghost" onClick={reset}>Score another file</Button></div></>)}
              {j?.status === "failed" && <Button variant="secondary" onClick={reset}>Start over</Button>}
            </CardContent></Card>
        )}

        <Card><CardHeader><CardTitle>Recent bulk jobs</CardTitle></CardHeader><CardContent>
          {jobs.isLoading ? <Skeleton className="h-16" /> : !jobs.data?.length ? <p className="text-sm text-muted-foreground">No bulk jobs yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full"><thead><tr><Th>File</Th><Th>When</Th><Th>Status</Th><Th className="text-right">Rows</Th><Th className="text-right">Invalid</Th><Th /></tr></thead>
              <tbody className="divide-y divide-border">{jobs.data.map((x) => (<tr key={x.id}><Td className="max-w-[12rem] truncate font-semibold">{x.filename}</Td><Td className="text-muted-foreground">{fmtDateTime(x.created_at)}</Td>
                <Td><Badge className={x.status === "completed" ? "text-risk-low" : x.status === "failed" ? "text-risk-high" : ""}>{x.status === "failed" ? <XCircle className="mr-1 h-3 w-3" /> : null}{x.status}</Badge></Td>
                <Td className="text-right font-mono">{x.total_rows}</Td><Td className="text-right font-mono">{x.invalid_rows}</Td>
                <Td className="text-right">{x.status === "completed" && <button className="text-xs font-semibold text-primary hover:underline" onClick={() => download(`/api/v1/jobs/${x.id}/result.csv`, "predictions.csv").catch((e) => toast({ title: "Download failed", description: (e as Error).message, tone: "error" }))}>Download</button>}</Td></tr>))}</tbody></table></div>)}
        </CardContent></Card>
      </div>
    </>
  );
}
