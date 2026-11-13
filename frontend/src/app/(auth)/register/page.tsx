"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { registerSchema } from "@/lib/schemas";
import type { User } from "@/lib/types";

type Values = { name: string; email: string; password: string; confirm_password: string };

export default function RegisterPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(registerSchema), mode: "onTouched",
    defaultValues: { name: "", email: "", password: "", confirm_password: "" },
  });
  const pw = watch("password");

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const user = await api<User>("/api/v1/auth/register", { json: v });
      qc.setQueryData(["me"], user);
      router.replace("/dashboard");
    } catch (e) {
      const err = e as ApiError;
      setError(err.status === 429 ? "Too many sign-up attempts from this network. Please try again later." : err.message);
    }
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-xl">Create your account</CardTitle><CardDescription>Start predicting customer churn in minutes.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div><Label htmlFor="name">Full name</Label>
            <Input id="name" autoComplete="name" className="mt-1.5" aria-invalid={!!errors.name} {...register("name")} />
            <FieldError message={errors.name?.message} /></div>
          <div><Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" className="mt-1.5" aria-invalid={!!errors.email} {...register("email")} />
            <FieldError message={errors.email?.message} /></div>
          <div><Label htmlFor="password">Password</Label>
            <div className="mt-1.5"><PasswordInput id="password" autoComplete="new-password" meter={pw} aria-invalid={!!errors.password} aria-describedby="pw-help" {...register("password")} /></div>
            <p id="pw-help" className="mt-1 text-[11px] text-muted-foreground">At least 10 characters, with a letter and a number.</p>
            <FieldError message={errors.password?.message} /></div>
          <div><Label htmlFor="confirm">Confirm password</Label>
            <div className="mt-1.5"><PasswordInput id="confirm" autoComplete="new-password" aria-invalid={!!errors.confirm_password} {...register("confirm_password")} /></div>
            <FieldError message={errors.confirm_password?.message} /></div>
          <Button type="submit" className="w-full" loading={isSubmitting}>Create account</Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted-foreground">Already registered? <Link href="/login" className="font-semibold text-primary hover:underline">Sign in</Link></p>
      </CardContent>
    </Card>
  );
}
