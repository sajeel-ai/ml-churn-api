"use client";
import * as React from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Database, Brain, Server, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, Pagination, Skeleton, Td, Th } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/providers";
import { api, qs } from "@/lib/api";
import { useDebounced, useMe, useResetOnChange } from "@/lib/hooks";
import type { Page, Role, User } from "@/lib/types";
import { cn, fmtDateTime } from "@/lib/utils";

type Overview = { registered_users: number; active_users: number; users_by_role: Record<string, number>; total_predictions: number; predictions_last_7d: number; failed_logins_24h: number; model_versions: { version: string; status: string }[]; app_version: string; environment: string };
type System = { api: string; database: string; model: { loaded: boolean; version: string | null }; app_version: string; environment: string; email_backend: string };
type AuditRow = { id: number; created_at: string; actor_name: string | null; action: string; resource_type: string | null; resource_id: string | null; ip: string | null; details: Record<string, unknown> | null };

const TABS = ["Overview", "Users", "Audit log", "System"] as const;
const ACTIONS = ["login_success", "login_failed", "logout", "user_registered", "user_created", "role_changed", "user_deactivated", "user_activated", "viewer_assignment_changed", "prediction_created", "prediction_deleted", "customer_created", "customer_deleted", "bulk_upload", "data_export", "password_changed", "password_reset_completed", "account_deleted", "session_revoked"];

function Overview() {
  const o = useQuery({ queryKey: ["admin", "overview"], queryFn: () => api<Overview>("/api/v1/admin/overview") });
  if (o.isLoading || !o.data) return <Skeleton className="h-48" />;
  const d = o.data;
  const stats: [string, string][] = [["Registered users", d.registered_users.toLocaleString()], ["Active users", d.active_users.toLocaleString()], ["Total predictions", d.total_predictions.toLocaleString()], ["Predictions (7 days)", d.predictions_last_7d.toLocaleString()], ["Failed logins (24h)", d.failed_logins_24h.toLocaleString()]];
  return (<div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{stats.map(([k, v]) => <Card key={k}><CardContent className="pt-5"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{k}</p><p className="mt-1 font-mono text-2xl font-extrabold">{v}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Users by role</CardTitle><CardDescription>Aggregate statistics only. Administrators do not see other users&apos; customer records.</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap gap-2">{Object.entries(d.users_by_role).map(([r, n]) => <Badge key={r} className="capitalize">{r}: {n}</Badge>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>Model versions</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{d.model_versions.map((v) => <Badge key={v.version} className={v.status === "active" ? "text-risk-low" : ""}>v{v.version} · {v.status}</Badge>)}
      <p className="w-full pt-2 text-xs text-muted-foreground">Activating a different model version is not supported in this release. Models are deployed with the application after their feature contract and evaluation are verified.</p></CardContent></Card>
  </div>);
}

function Users() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [q, setQ] = React.useState(""); const [role, setRole] = React.useState(""); const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", email: "", role: "analyst" as Role });
  const dq = useDebounced(q, 350);
  useResetOnChange(JSON.stringify([dq, role]), () => setPage(1));
  const list = useQuery({ queryKey: ["admin", "users", dq, role, page], queryFn: () => api<Page<User>>(`/api/v1/admin/users${qs({ q: dq, role, page, page_size: 15 })}`), placeholderData: keepPreviousData });
  const analysts = useQuery({ queryKey: ["admin", "analysts"], queryFn: () => api<Page<User>>("/api/v1/admin/users?role=analyst&page_size=100") });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin"] }); };
  const fail = (e: unknown) => toast({ title: "Action failed", description: (e as Error).message, tone: "error" });
  const setRoleM = useMutation({ mutationFn: (v: { id: string; role: Role }) => api(`/api/v1/admin/users/${v.id}/role`, { method: "PATCH", json: { role: v.role } }), onSuccess: () => { refresh(); toast({ title: "Role updated", tone: "success" }); }, onError: fail });
  const setStatus = useMutation({ mutationFn: (v: { id: string; is_active: boolean }) => api(`/api/v1/admin/users/${v.id}/status`, { method: "PATCH", json: { is_active: v.is_active } }), onSuccess: () => { refresh(); toast({ title: "Status updated", tone: "success" }); }, onError: fail });
  const setViewer = useMutation({ mutationFn: (v: { id: string; viewer_of_id: string | null }) => api(`/api/v1/admin/users/${v.id}/viewer`, { method: "PATCH", json: { viewer_of_id: v.viewer_of_id } }), onSuccess: () => { refresh(); toast({ title: "Assignment updated", tone: "success" }); }, onError: fail });
  const create = useMutation({ mutationFn: () => api<User>("/api/v1/admin/users", { json: form }), onSuccess: () => { refresh(); setOpen(false); setForm({ name: "", email: "", role: "analyst" }); toast({ title: "User created", description: "They were emailed a link to set their password.", tone: "success" }); }, onError: fail });

  return (<>
    <Card><CardContent className="pt-5">
      <div className="mb-4 flex flex-wrap gap-3"><Input aria-label="Search users" placeholder="Search name or email…" className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Role" className="w-40" value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option><option value="admin">Admin</option><option value="analyst">Analyst</option><option value="viewer">Viewer</option></Select>
        <Button className="ml-auto" onClick={() => setOpen(true)}><UserPlus className="h-4 w-4" />Add user</Button></div>
      {list.isLoading ? <Skeleton className="h-48" /> : (<div className="overflow-x-auto"><table className="w-full"><thead><tr><Th>User</Th><Th>Role</Th><Th>Read access (viewers)</Th><Th>Last sign-in</Th><Th>Active</Th></tr></thead><tbody className="divide-y divide-border">
        {list.data?.items.map((u) => { const self = u.id === me?.id; return (<tr key={u.id}>
          <Td><p className="font-semibold">{u.name}{self && <Badge className="ml-2">You</Badge>}</p><p className="text-xs text-muted-foreground">{u.email}</p></Td>
          <Td><Select aria-label={`Role for ${u.email}`} className="h-8 w-32 text-xs" value={u.role} onChange={(e) => setRoleM.mutate({ id: u.id, role: e.target.value as Role })}><option value="admin">Admin</option><option value="analyst">Analyst</option><option value="viewer">Viewer</option></Select></Td>
          <Td>{u.role === "viewer" ? <Select aria-label={`Assigned analyst for ${u.email}`} className="h-8 w-48 text-xs" value={u.viewer_of_id ?? ""} onChange={(e) => setViewer.mutate({ id: u.id, viewer_of_id: e.target.value || null })}><option value="">Unassigned</option>{analysts.data?.items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select> : <span className="text-xs text-muted-foreground">–</span>}</Td>
          <Td className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(u.last_login_at)}</Td>
          <Td><Switch checked={u.is_active} disabled={self} aria-label={`${u.is_active ? "Deactivate" : "Activate"} ${u.email}`} onCheckedChange={(c) => setStatus.mutate({ id: u.id, is_active: c })} /></Td></tr>); })}</tbody></table></div>)}
      {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
    </CardContent></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent>
      <DialogTitle>Add a user</DialogTitle><DialogDescription>They receive an email with a link to choose their own password.</DialogDescription>
      <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <div><Label htmlFor="un">Full name</Label><Input id="un" required className="mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label htmlFor="ue">Email</Label><Input id="ue" type="email" required className="mt-1.5" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><Label htmlFor="ur">Role</Label><Select id="ur" className="mt-1.5" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}><option value="analyst">Analyst</option><option value="viewer">Viewer</option><option value="admin">Admin</option></Select></div>
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={create.isPending}>Create user</Button></div>
      </form></DialogContent></Dialog>
  </>);
}

function Audit() {
  const [action, setAction] = React.useState(""); const [page, setPage] = React.useState(1);
  useResetOnChange(action, () => setPage(1));
  const q = useQuery({ queryKey: ["admin", "audit", action, page], queryFn: () => api<Page<AuditRow>>(`/api/v1/admin/audit-logs${qs({ action, page, page_size: 25 })}`), placeholderData: keepPreviousData });
  return (<Card><CardContent className="pt-5">
    <div className="mb-4"><Select aria-label="Filter by action" className="w-64" value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</Select></div>
    {q.isLoading ? <Skeleton className="h-48" /> : (<div className="overflow-x-auto"><table className="w-full"><thead><tr><Th>Time</Th><Th>Actor</Th><Th>Action</Th><Th>Resource</Th><Th>IP</Th><Th>Details</Th></tr></thead><tbody className="divide-y divide-border">
      {q.data?.items.map((r) => (<tr key={r.id}><Td className="whitespace-nowrap text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</Td><Td>{r.actor_name ?? <span className="text-muted-foreground">System / deleted user</span>}</Td>
        <Td><Badge className={cn(r.action.includes("failed") && "text-risk-high")}>{r.action}</Badge></Td><Td className="text-xs text-muted-foreground">{r.resource_type ?? "–"}</Td><Td className="font-mono text-xs">{r.ip ?? "–"}</Td>
        <Td className="max-w-[16rem] truncate font-mono text-[11px] text-muted-foreground">{r.details ? JSON.stringify(r.details) : ""}</Td></tr>))}</tbody></table></div>)}
    {q.data && <Pagination page={q.data.page} pages={q.data.pages} total={q.data.total} onPage={setPage} />}
  </CardContent></Card>);
}

function SystemTab() {
  const s = useQuery({ queryKey: ["admin", "system"], queryFn: () => api<System>("/api/v1/admin/system"), refetchInterval: 30_000 });
  if (s.isLoading || !s.data) return <Skeleton className="h-40" />;
  const d = s.data;
  const rows: [string, string, boolean, typeof Server][] = [["API", d.api, d.api === "ok", Server], ["Database", d.database, d.database === "ok", Database], ["Model", d.model.loaded ? `loaded (v${d.model.version})` : "not loaded", d.model.loaded, Brain]];
  return (<div className="space-y-4"><div className="grid gap-4 sm:grid-cols-3">{rows.map(([k, v, ok, Icon]) => (<Card key={k}><CardContent className="flex items-center gap-3 pt-5"><span className={cn("rounded-xl p-2.5", ok ? "bg-risk-low-bg text-risk-low" : "bg-risk-high-bg text-risk-high")}><Icon className="h-5 w-5" aria-hidden /></span><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{k}</p><p className="text-sm font-bold">{v}</p></div></CardContent></Card>))}</div>
    <Card><CardContent className="grid gap-3 pt-5 text-sm sm:grid-cols-3"><p><span className="text-muted-foreground">Application version: </span><b>{d.app_version}</b></p><p><span className="text-muted-foreground">Environment: </span><b>{d.environment}</b></p><p><span className="text-muted-foreground">Email backend: </span><b>{d.email_backend}</b></p></CardContent></Card>
    {d.email_backend === "console" && d.environment === "production" && <Alert tone="warning" title="Email is not configured">Password reset and invitation emails cannot be delivered. Configure SMTP settings.</Alert>}
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Activity className="h-3.5 w-3.5" />Status refreshes every 30 seconds. These values are read live from the server.</p></div>);
}

export default function AdminPage() {
  const { data: me } = useMe();
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("Overview");
  if (me && me.role !== "admin") return <Alert tone="error" title="Administrators only">You do not have access to this area.</Alert>;
  return (<>
    <PageHeader eyebrow="Administration" title="Platform administration" description="Manage users and roles, review the audit trail and check system health." />
    <div role="tablist" aria-label="Admin sections" className="mb-5 inline-flex rounded-xl border border-border bg-muted/50 p-1">{TABS.map((t) => (
      <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors", tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{t}</button>))}</div>
    {tab === "Overview" && <Overview />}{tab === "Users" && <Users />}{tab === "Audit log" && <Audit />}{tab === "System" && <SystemTab />}
  </>);
}
