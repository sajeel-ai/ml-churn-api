"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, Brain, History, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Sparkles, Upload, Users, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { canWrite, useMe, useResetOnChange } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/predict", label: "New prediction", icon: Sparkles, write: true },
  { href: "/predictions", label: "History", icon: History },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/bulk", label: "Bulk prediction", icon: Upload, write: true },
  { href: "/model", label: "Model information", icon: Brain },
  { href: "/settings", label: "Profile & settings", icon: Settings },
  { href: "/admin", label: "Administration", icon: ShieldCheck, admin: true },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: me, error, isLoading } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);

  useResetOnChange(pathname, () => setOpen(false));
  React.useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [error, router, pathname]);

  if (isLoading || !me) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-8" role="status" aria-label="Loading">
        <Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const logout = async () => {
    try { await api("/api/v1/auth/logout", { method: "POST" }); } catch { /* session already gone */ }
    qc.clear();
    router.replace("/login");
  };
  const resend = async () => {
    try { await api("/api/v1/auth/resend-verification", { method: "POST" }); toast({ title: "Verification email sent", tone: "success" }); }
    catch (e) { toast({ title: "Could not send email", description: (e as Error).message, tone: "error" }); }
  };

  const items = NAV.filter((n) => (!("write" in n) || canWrite(me)) && (!("admin" in n) || me.role === "admin"));
  const nav = (
    <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-3">
      {items.map((n) => {
        const active = pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href + "/")) || (n.href === "/predictions" && pathname === "/predictions");
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
            className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
              active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <n.icon className="h-4 w-4" aria-hidden />{n.label}
          </Link>
        );
      })}
    </nav>
  );
  const userBox = (
    <div className="space-y-3 border-t border-border p-3">
      <div className="flex items-center justify-between"><ThemeToggle />
        <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" />Sign out</Button></div>
      <div className="rounded-xl bg-muted/60 px-3 py-2">
        <p className="truncate text-xs font-bold">{me.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{me.email}</p>
        <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary"><BarChart3 className="h-3 w-3" />{me.role}</p>
      </div>
    </div>
  );

  return (
    <div className="ambient relative min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card/90 backdrop-blur lg:flex">
        <div className="p-4"><Logo href="/dashboard" /></div>{nav}{userBox}
      </aside>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/90 px-4 py-2.5 backdrop-blur lg:hidden">
        <Logo href="/dashboard" compact />
        <Button variant="ghost" size="icon" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>
      {open && (
        <div className="fixed inset-0 z-20 flex flex-col bg-card pt-14 lg:hidden">{nav}{userBox}</div>
      )}
      <main id="main" className="relative z-10 px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl space-y-4">
          {!me.email_verified && (
            <Alert tone="info" title="Verify your email address">
              We sent you a verification link. <button className="font-semibold text-primary hover:underline" onClick={resend}>Send it again</button>
            </Alert>
          )}
          {me.role === "viewer" && (
            <Alert tone="info" title="Read-only access">
              {me.viewer_of_id ? "You can view the records of the analyst you are assigned to, but not change them." : "No analyst is assigned to you yet, so there are no records to show. Ask an administrator."}
            </Alert>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
