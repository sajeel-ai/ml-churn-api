"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertTriangle, ArrowRight, BarChart3, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RiskBadge } from "@/components/ui/badge";
import { Alert, EmptyState, Skeleton, Td, Th } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { canWrite, useMe } from "@/lib/hooks";
import type { Dashboard } from "@/lib/types";
import { fmtDateTime, pct } from "@/lib/utils";

function Stat({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof Activity; tone?: string }) {
  return (
    <Card><CardContent className="flex items-center justify-between pt-5">
      <div><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 font-mono text-3xl font-extrabold">{value}</p></div>
      <span className={`rounded-xl bg-muted p-2.5 ${tone ?? "text-primary"}`}><Icon className="h-5 w-5" aria-hidden /></span>
    </CardContent></Card>
  );
}

export default function DashboardPage() {
  const { data: me } = useMe();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/api/v1/dashboard") });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-10 w-56" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-72" /></div>;
  if (isError || !data) return <Alert tone="error" title="Could not load the dashboard">{(error as Error)?.message} <button className="font-semibold text-primary" onClick={() => refetch()}>Try again</button></Alert>;

  const dist = [
    { name: "High", value: data.high_risk, color: "var(--risk-high)" },
    { name: "Medium", value: data.medium_risk, color: "var(--risk-medium)" },
    { name: "Low", value: data.low_risk, color: "var(--risk-low)" },
  ];
  const first = me ? `Welcome, ${me.name.split(" ")[0]}` : "Dashboard";

  return (
    <>
      <PageHeader eyebrow="Overview" title={first}
        description={data.scope === "assigned_analyst" ? "Summary of the records you have been given read-only access to." : "A summary of your saved predictions."}
        actions={canWrite(me) ? <Button asChild><Link href="/predict"><Sparkles className="h-4 w-4" />New prediction</Link></Button> : undefined} />

      {data.total_predictions === 0 ? (
        <EmptyState icon={BarChart3} title="No predictions yet"
          action={canWrite(me) ? <Button asChild><Link href="/predict">Create your first prediction <ArrowRight className="h-4 w-4" /></Link></Button> : undefined}>
          {canWrite(me)
            ? "Describe a customer on the New prediction page and save the result, or upload a CSV on the Bulk prediction page. Your charts and statistics will appear here."
            : "Nothing to show yet. Statistics appear once the analyst you are assigned to saves predictions."}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Total predictions" value={data.total_predictions.toLocaleString()} icon={Activity} />
            <Stat label="High risk" value={data.high_risk.toLocaleString()} icon={AlertTriangle} tone="text-risk-high" />
            <Stat label="Medium risk" value={data.medium_risk.toLocaleString()} icon={ShieldCheck} tone="text-risk-medium" />
            <Stat label="Low risk" value={data.low_risk.toLocaleString()} icon={ShieldCheck} tone="text-risk-low" />
            <Stat label="Avg. probability" value={pct(data.average_probability)} icon={TrendingUp} />
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Risk distribution</CardTitle><CardDescription>Share of saved predictions by risk level.</CardDescription></CardHeader>
              <CardContent>
                <div className="h-56" role="img" aria-label={`Risk distribution: ${data.high_risk} high, ${data.medium_risk} medium, ${data.low_risk} low`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart><Pie data={dist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
                      {dist.map((d) => <Cell key={d.name} fill={d.color} />)}</Pie>
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} /></PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 flex justify-center gap-4 text-xs">{dist.map((d) => <li key={d.name} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.name} ({d.value})</li>)}</ul>
              </CardContent>
            </Card>
            <Card className="lg:col-span-3">
              <CardHeader><CardTitle>Prediction activity</CardTitle><CardDescription>Predictions saved per day, last {data.activity.length} days.</CardDescription></CardHeader>
              <CardContent>
                <div className="h-64" role="img" aria-label="Predictions saved per day">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.activity} margin={{ left: -20, right: 8, top: 8 }}>
                      <defs><linearGradient id="act" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                      <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                      <Area type="monotone" dataKey="count" name="Predictions" stroke="var(--primary)" strokeWidth={2} fill="url(#act)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Recent predictions</CardTitle></div><Button asChild variant="ghost" size="sm"><Link href="/predictions">View all <ArrowRight className="h-3.5 w-3.5" /></Link></Button></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full"><thead><tr><Th>Reference</Th><Th>When</Th><Th>Risk</Th><Th className="text-right">Probability</Th><Th /></tr></thead>
                <tbody className="divide-y divide-border">
                  {data.recent.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/40"><Td className="font-semibold">{p.reference ?? "–"}</Td><Td className="text-muted-foreground">{fmtDateTime(p.created_at)}</Td>
                      <Td><RiskBadge level={p.risk_level} /></Td><Td className="text-right font-mono">{pct(p.probability)}</Td>
                      <Td className="text-right"><Link className="text-xs font-semibold text-primary hover:underline" href={`/predictions/${p.id}`}>Details</Link></Td></tr>))}
                </tbody></table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
