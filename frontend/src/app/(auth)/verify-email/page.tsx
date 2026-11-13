"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Alert, Skeleton } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

function Verify() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = React.useState<"working" | "ok" | "error">(token ? "working" : "error");
  const [msg, setMsg] = React.useState("This verification link is incomplete.");
  const ran = React.useRef(false);
  React.useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    api("/api/v1/auth/verify-email", { json: { token } }).then(() => setState("ok")).catch((e) => { setMsg((e as Error).message); setState("error"); });
  }, [token]);
  return (
    <Card><CardHeader><CardTitle className="text-xl">Email verification</CardTitle></CardHeader>
      <CardContent>
        {state === "working" && <Skeleton className="h-12 w-full" />}
        {state === "ok" && <Alert tone="success" title="Email verified">Thanks. <Link href="/dashboard" className="font-semibold text-primary hover:underline">Continue to your dashboard</Link>.</Alert>}
        {state === "error" && <Alert tone="error" title="Could not verify">{msg}</Alert>}
      </CardContent></Card>
  );
}
export default function VerifyEmailPage() { return <React.Suspense><Verify /></React.Suspense>; }
