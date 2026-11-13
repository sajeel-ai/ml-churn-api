"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PasswordInput } from "@/components/password-field";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, FieldError, Skeleton } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { passwordProblems } from "@/lib/schemas";
import type { SessionInfo, User } from "@/lib/types";
import { fmtDateTime } from "@/lib/utils";

const pwSchema = z.object({ current_password: z.string().min(1, "Enter your current password"), new_password: z.string().max(128), confirm: z.string() })
  .superRefine((v, ctx) => {
    for (const p of passwordProblems(v.new_password)) ctx.addIssue({ code: "custom", path: ["new_password"], message: p });
    if (v.new_password && v.new_password === v.current_password) ctx.addIssue({ code: "custom", path: ["new_password"], message: "Must differ from the current password" });
    if (v.new_password !== v.confirm) ctx.addIssue({ code: "custom", path: ["confirm"], message: "Passwords do not match" });
  });

const device = (ua: string | null) => (ua ? ua.replace(/\(.*?\)/g, "").slice(0, 60) || "Unknown device" : "Unknown device");

export default function SettingsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = React.useState<string | null>(null);
  const [delOpen, setDelOpen] = React.useState(false);
  const [delPw, setDelPw] = React.useState("");
  const [delErr, setDelErr] = React.useState<string | null>(null);

  const profile = useMutation({
    mutationFn: (n: string) => api<User>("/api/v1/auth/me", { method: "PATCH", json: { name: n } }),
    onSuccess: (u) => { qc.setQueryData(["me"], u); setName(null); toast({ title: "Profile updated", tone: "success" }); },
    onError: (e) => toast({ title: "Could not update", description: (e as Error).message, tone: "error" }),
  });
  const pw = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema), mode: "onTouched", defaultValues: { current_password: "", new_password: "", confirm: "" } });
  const [pwError, setPwError] = React.useState<string | null>(null);
  const changePw = pw.handleSubmit(async (v) => {
    setPwError(null);
    try { await api("/api/v1/auth/change-password", { json: { current_password: v.current_password, new_password: v.new_password } }); pw.reset(); toast({ title: "Password updated", description: "Other devices were signed out.", tone: "success" }); qc.invalidateQueries({ queryKey: ["sessions"] }); }
    catch (e) { setPwError((e as Error).message); }
  });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<SessionInfo[]>("/api/v1/auth/sessions") });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/v1/auth/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sessions"] }); toast({ title: "Session signed out", tone: "success" }); },
  });
  const revokeOthers = useMutation({
    mutationFn: () => api("/api/v1/auth/sessions", { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sessions"] }); toast({ title: "Other sessions signed out", tone: "success" }); },
  });
  const delAccount = useMutation({
    mutationFn: () => api("/api/v1/auth/me", { method: "DELETE", json: { password: delPw } }),
    onSuccess: () => { qc.clear(); router.replace("/"); },
    onError: (e) => setDelErr((e as ApiError).message),
  });

  if (!me) return <Skeleton className="h-64" />;
  const value = name ?? me.name;

  return (
    <>
      <PageHeader title="Profile & settings" description="Manage your account, security and appearance." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Profile</CardTitle><CardDescription>{me.email} · <span className="capitalize">{me.role}</span></CardDescription></CardHeader><CardContent>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (value.trim()) profile.mutate(value.trim()); }}>
            <div><Label htmlFor="pname">Full name</Label><Input id="pname" className="mt-1.5" maxLength={120} value={value} onChange={(e) => setName(e.target.value)} /></div>
            <Button type="submit" loading={profile.isPending} disabled={name === null || !value.trim() || value.trim() === me.name}>Save name</Button>
          </form></CardContent></Card>

        <Card><CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Choose a light or dark theme, or follow your device.</CardDescription></CardHeader><CardContent><ThemeToggle /></CardContent></Card>

        <Card className="lg:col-span-2"><CardHeader><CardTitle>Change password</CardTitle><CardDescription>You will stay signed in here. Other devices are signed out.</CardDescription></CardHeader><CardContent>
          <form onSubmit={changePw} noValidate className="grid gap-4 md:grid-cols-3">
            {pwError && <div className="md:col-span-3"><Alert tone="error">{pwError}</Alert></div>}
            <div><Label htmlFor="cur">Current password</Label><div className="mt-1.5"><PasswordInput id="cur" autoComplete="current-password" {...pw.register("current_password")} /></div><FieldError message={pw.formState.errors.current_password?.message} /></div>
            <div><Label htmlFor="new">New password</Label><div className="mt-1.5"><PasswordInput id="new" autoComplete="new-password" meter={pw.watch("new_password")} {...pw.register("new_password")} /></div><FieldError message={pw.formState.errors.new_password?.message} /></div>
            <div><Label htmlFor="conf">Confirm new password</Label><div className="mt-1.5"><PasswordInput id="conf" autoComplete="new-password" {...pw.register("confirm")} /></div><FieldError message={pw.formState.errors.confirm?.message} /></div>
            <div className="md:col-span-3"><Button type="submit" loading={pw.formState.isSubmitting}>Update password</Button></div>
          </form></CardContent></Card>

        <Card className="lg:col-span-2"><CardHeader className="flex-row items-start justify-between gap-3"><div><CardTitle>Active sessions</CardTitle><CardDescription>Devices currently signed in to your account.</CardDescription></div>
          <Button variant="secondary" size="sm" onClick={() => revokeOthers.mutate()} loading={revokeOthers.isPending} disabled={(sessions.data?.length ?? 0) < 2}>Sign out other devices</Button></CardHeader>
          <CardContent>{sessions.isLoading ? <Skeleton className="h-16" /> : (
            <ul className="divide-y divide-border">{sessions.data?.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3"><div className="flex items-start gap-3"><Monitor className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden />
                <div><p className="text-sm font-semibold">{device(s.user_agent)} {s.current && <Badge className="ml-1 text-risk-low">This device</Badge>}</p>
                  <p className="text-xs text-muted-foreground">Signed in {fmtDateTime(s.created_at)} · last active {fmtDateTime(s.last_seen_at)}{s.ip ? ` · ${s.ip}` : ""}</p></div></div>
                {!s.current && <Button variant="ghost" size="sm" onClick={() => revoke.mutate(s.id)} disabled={revoke.isPending}>Sign out</Button>}</li>))}</ul>)}</CardContent></Card>

        <Card className="border-risk-high/40 lg:col-span-2"><CardHeader><CardTitle className="text-risk-high">Delete account</CardTitle><CardDescription>Permanently deletes your account, customers, predictions and bulk jobs. Audit records are kept without your identity. This cannot be undone.</CardDescription></CardHeader>
          <CardContent><Button variant="destructive" onClick={() => { setDelOpen(true); setDelPw(""); setDelErr(null); }}>Delete my account</Button></CardContent></Card>
      </div>
      <ConfirmDialog open={delOpen} onOpenChange={setDelOpen} title="Delete your account?" confirmLabel="Delete everything" loading={delAccount.isPending}
        description="All of your data will be permanently removed. Enter your password to confirm." onConfirm={() => { setDelErr(null); delAccount.mutate(); }}>
        <div className="mt-4"><Label htmlFor="delpw">Password</Label><div className="mt-1.5"><PasswordInput id="delpw" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} /></div>{delErr && <FieldError message={delErr} />}</div>
      </ConfirmDialog>
    </>
  );
}
