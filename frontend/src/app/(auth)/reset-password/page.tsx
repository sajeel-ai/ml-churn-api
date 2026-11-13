"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, FieldError } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput } from "@/components/password-field";
import { api } from "@/lib/api";
import { newPasswordSchema } from "@/lib/schemas";

function Form() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<{ new_password: string; confirm: string }>({
    resolver: zodResolver(newPasswordSchema), mode: "onTouched",
  });
  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try { await api("/api/v1/auth/reset-password", { json: { token, new_password: v.new_password } }); setDone(true); }
    catch (e) { setError((e as Error).message); }
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-xl">Choose a new password</CardTitle><CardDescription>Signing in elsewhere will be required again after a reset.</CardDescription></CardHeader>
      <CardContent>
        {!token ? <Alert tone="error">This reset link is incomplete. Request a new one.</Alert>
          : done ? <Alert tone="success" title="Password updated">You can now <Link href="/login" className="font-semibold text-primary hover:underline">sign in</Link>.</Alert>
          : (
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              {error && <Alert tone="error">{error}</Alert>}
              <div><Label htmlFor="np">New password</Label><div className="mt-1.5"><PasswordInput id="np" autoComplete="new-password" meter={watch("new_password") ?? ""} {...register("new_password")} /></div>
                <FieldError message={errors.new_password?.message} /></div>
              <div><Label htmlFor="cp">Confirm password</Label><div className="mt-1.5"><PasswordInput id="cp" autoComplete="new-password" {...register("confirm")} /></div>
                <FieldError message={errors.confirm?.message} /></div>
              <Button type="submit" className="w-full" loading={isSubmitting}>Update password</Button>
            </form>
          )}
      </CardContent>
    </Card>
  );
}
export default function ResetPasswordPage() { return <React.Suspense><Form /></React.Suspense>; }
