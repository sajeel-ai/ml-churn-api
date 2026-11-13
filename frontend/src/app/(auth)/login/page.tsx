"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, FieldError } from "@/components/ui/misc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput } from "@/components/password-field";
import { api, ApiError } from "@/lib/api";
import { loginSchema } from "@/lib/schemas";
import type { User } from "@/lib/types";
import { safeNext } from "@/lib/utils";

type Values = { email: string; password: string; remember_me: boolean };

function LoginForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "", remember_me: false },
  });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const user = await api<User>("/api/v1/auth/login", { json: v });
      qc.setQueryData(["me"], user);
      router.replace(next);
    } catch (e) {
      const err = e as ApiError;
      setError(err.status === 429 ? "Too many attempts. Please wait a few minutes and try again." : err.message);
    }
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-xl">Sign in</CardTitle><CardDescription>Welcome back. Enter your account details.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div><Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" className="mt-1.5" aria-invalid={!!errors.email} {...register("email")} />
            <FieldError message={errors.email?.message} /></div>
          <div><div className="flex items-center justify-between"><Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs font-semibold text-primary hover:underline">Forgot password?</Link></div>
            <div className="mt-1.5"><PasswordInput id="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} /></div>
            <FieldError message={errors.password?.message} /></div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" {...register("remember_me")} />
            Keep me signed in on this device for 30 days
          </label>
          <Button type="submit" className="w-full" loading={isSubmitting}>Sign in</Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">New here? <Link href="/register" className="font-semibold text-primary hover:underline">Create an account</Link></p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return <React.Suspense><LoginForm /></React.Suspense>;
}
