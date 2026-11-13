"use client";
import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ email: string }>();
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try { await api("/api/v1/auth/forgot-password", { json: v }); setSent(true); }
    catch (e) { setError((e as Error).message); }
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-xl">Reset your password</CardTitle><CardDescription>We will email you a link if an account exists for that address.</CardDescription></CardHeader>
      <CardContent>
        {sent ? (
          <Alert tone="success" title="Check your inbox">If an account exists for that email, a reset link is on its way. It expires in 30 minutes.</Alert>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <div><Label htmlFor="email">Email</Label><Input id="email" type="email" required autoComplete="email" className="mt-1.5" {...register("email", { required: true })} /></div>
            <Button type="submit" className="w-full" loading={isSubmitting}>Send reset link</Button>
          </form>
        )}
        <p className="mt-5 text-center text-sm"><Link href="/login" className="font-semibold text-primary hover:underline">Back to sign in</Link></p>
      </CardContent>
    </Card>
  );
}
