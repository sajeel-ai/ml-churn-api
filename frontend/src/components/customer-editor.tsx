"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { CustomerFields, useCustomerForm } from "@/components/customer-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, FieldError } from "@/components/ui/misc";
import { useToast } from "@/components/providers";
import { api, ApiError } from "@/lib/api";
import { DEFAULT_CUSTOMER, customerSchema, type CustomerInput } from "@/lib/schemas";
import type { Customer } from "@/lib/types";

const pick = (c: Customer): CustomerInput => customerSchema.parse(Object.fromEntries(Object.keys(DEFAULT_CUSTOMER).map((k) => [k, (c as Record<string, unknown>)[k]])));

export function CustomerEditor({ initial }: { initial?: Customer }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useToast();
  const form = useCustomerForm(initial ? pick(initial) : DEFAULT_CUSTOMER);
  const [identifier, setIdentifier] = React.useState(initial?.customer_identifier ?? "");
  const [idError, setIdError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const save = useMutation({
    mutationFn: (v: CustomerInput) => initial
      ? api<Customer>(`/api/v1/customers/${initial.id}`, { method: "PATCH", json: { ...v, customer_identifier: identifier.trim() } })
      : api<Customer>("/api/v1/customers", { json: { ...v, customer_identifier: identifier.trim() } }),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["customers"] }); qc.invalidateQueries({ queryKey: ["customer", c.id] });
      toast({ title: initial ? "Customer updated" : "Customer added", tone: "success" });
      if (!initial) router.push(`/customers/${c.id}`); else form.reset(pick(c));
    },
    onError: (e) => { const err = e as ApiError; if (err.status === 409) setIdError(err.message); else setError(err.message); },
  });

  const submit = form.handleSubmit((v) => {
    setError(null); setIdError(null);
    if (!identifier.trim()) { setIdError("Enter an identifier for this customer"); return; }
    save.mutate(v);
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}
      <div><Label htmlFor="cid">Customer identifier</Label>
        <Input id="cid" className="mt-1.5" maxLength={100} value={identifier} aria-invalid={!!idError} placeholder="e.g. an account number or internal ID"
          onChange={(e) => { setIdentifier(e.target.value); setIdError(null); }} />
        <p className="mt-1 text-[11px] text-muted-foreground">Avoid personal details such as names or contact information. An internal ID is enough.</p>
        <FieldError message={idError ?? undefined} /></div>
      <CustomerFields form={form} autoTotalInitial={!initial} />
      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" loading={save.isPending} disabled={save.isPending}><Save className="h-4 w-4" />{initial ? "Save changes" : "Add customer"}</Button>
      </div>
    </form>
  );
}
