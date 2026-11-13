"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ModelInfo } from "@/lib/types";
import { pct } from "@/lib/utils";
import { Skeleton } from "@/components/ui/misc";

export function ModelSnapshot() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["model"], queryFn: () => api<ModelInfo>("/api/v1/model"), staleTime: 300_000 });
  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (isError || !data) return <p className="text-sm text-muted-foreground">Model details are temporarily unavailable.</p>;
  const m = data.metrics;
  const stats: [string, string][] = [
    ["ROC-AUC", m.roc_auc.toFixed(3)], ["Recall", pct(m.recall)], ["Precision", pct(m.precision)], ["F1-score", m.f1.toFixed(3)], ["Accuracy", pct(m.accuracy)],
  ];
  return (
    <div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-border bg-card p-4 text-center">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{k}</dt>
            <dd className="mt-1 font-mono text-2xl font-extrabold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Offline results on a held-out {data.evaluation.n_test.toLocaleString()}-customer test set from the {data.training_dataset.name} dataset
        ({data.training_dataset.rows.toLocaleString()} customers), model v{data.model_version}. This is not production validation, and results on other businesses may differ.
      </p>
    </div>
  );
}
