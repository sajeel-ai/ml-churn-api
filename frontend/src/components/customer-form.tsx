"use client";
import * as React from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft, ChevronRight, CreditCard, Layers, User as UserIcon, AlertCircle } from "lucide-react";
import { ADDON_FIELDS, CONTRACT, INTERNET, PAYMENT, customerSchema, type CustomerInput } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FieldError } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function useCustomerForm(defaults: CustomerInput) {
  return useForm<CustomerInput>({ resolver: zodResolver(customerSchema), defaultValues: defaults, mode: "onChange" });
}

type Form = UseFormReturn<CustomerInput>;

function Segmented<T extends string>({ label, value, options, onChange, labels }: {
  label: string; value: T; options: readonly T[]; onChange: (v: T) => void; labels?: Partial<Record<T, string>>;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)}
          className={cn("rounded-xl border px-2 py-2.5 text-xs font-bold transition-colors",
            value === o ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:border-input")}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

function Toggle({ id, title, desc, checked, onChange, disabled }: {
  id: string; title: string; desc?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors",
      checked ? "border-accent/50 bg-accent/10" : "border-border bg-card", disabled && "opacity-60")}>
      <label htmlFor={id} className="flex-1 cursor-pointer">
        <span className="block text-xs font-bold">{title}</span>
        {desc && <span className="text-[11px] text-muted-foreground">{desc}</span>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={title} />
    </div>
  );
}

const STEPS = [
  { label: "Customer profile", icon: UserIcon, fields: ["gender", "SeniorCitizen", "Partner", "Dependents", "tenure"] },
  { label: "Services", icon: Layers, fields: ["PhoneService", "MultipleLines", "InternetService", ...ADDON_FIELDS] },
  { label: "Billing & contract", icon: CreditCard, fields: ["Contract", "PaperlessBilling", "PaymentMethod", "MonthlyCharges", "TotalCharges"] },
] as const;

const ADDON_TEXT: Record<(typeof ADDON_FIELDS)[number], [string, string]> = {
  OnlineSecurity: ["Online security", "Security add-on"], OnlineBackup: ["Online backup", "Cloud backup add-on"],
  DeviceProtection: ["Device protection", "Hardware protection plan"], TechSupport: ["Tech support", "Support add-on"],
  StreamingTV: ["Streaming TV", "TV package"], StreamingMovies: ["Streaming movies", "Movie package"],
};

export function CustomerFields({ form, autoTotalInitial = true }: { form: Form; autoTotalInitial?: boolean }) {
  const { register, setValue, watch, formState: { errors } } = form;
  const [step, setStep] = React.useState(0);
  const [autoTotal, setAutoTotal] = React.useState(autoTotalInitial);
  const v = watch();

  // Keep dependent fields consistent with the rules the model was trained on.
  React.useEffect(() => {
    const no = v.InternetService === "No";
    for (const f of ADDON_FIELDS) {
      if (no && v[f] !== "No internet service") setValue(f, "No internet service", { shouldValidate: true });
      if (!no && v[f] === "No internet service") setValue(f, "No", { shouldValidate: true });
    }
  }, [v.InternetService]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (v.PhoneService === "No" && v.MultipleLines !== "No phone service") setValue("MultipleLines", "No phone service", { shouldValidate: true });
    if (v.PhoneService === "Yes" && v.MultipleLines === "No phone service") setValue("MultipleLines", "No", { shouldValidate: true });
  }, [v.PhoneService]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (!autoTotal || !Number.isFinite(v.tenure) || !Number.isFinite(v.MonthlyCharges)) return;
    setValue("TotalCharges", v.tenure === 0 ? null : Math.round(v.tenure * v.MonthlyCharges * 100) / 100, { shouldValidate: true });
  }, [autoTotal, v.tenure, v.MonthlyCharges]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepHasError = (i: number) => STEPS[i].fields.some((f) => (errors as Record<string, unknown>)[f]);
  const err = (n: keyof CustomerInput) => errors[n]?.message as string | undefined;
  const noInternet = v.InternetService === "No";
  const noPhone = v.PhoneService === "No";
  const yn = (name: "Partner" | "Dependents" | "PhoneService" | "PaperlessBilling") => (c: boolean) =>
    setValue(name, c ? "Yes" : "No", { shouldValidate: true, shouldDirty: true });

  return (
    <div>
      <div role="tablist" aria-label="Form steps" className="mb-4 grid grid-cols-3 gap-1.5 rounded-2xl border border-border bg-muted/50 p-1.5">
        {STEPS.map((s, i) => (
          <button key={s.label} type="button" role="tab" aria-selected={step === i} id={`tab-${i}`} aria-controls={`panel-${i}`} onClick={() => setStep(i)}
            className={cn("relative flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[11px] font-bold transition-colors sm:flex-row sm:gap-2 sm:text-xs",
              step === i ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-card")}>
            <s.icon className="h-4 w-4" aria-hidden /><span>{s.label}</span>
            {stepHasError(i) && <AlertCircle className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-risk-high" aria-label="This step has errors" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id="panel-0" aria-labelledby="tab-0" hidden={step !== 0} className="space-y-5">
        <div><Label>Gender</Label><div className="mt-1.5"><Segmented label="Gender" value={v.gender} options={["Female", "Male"] as const} onChange={(x) => setValue("gender", x, { shouldValidate: true })} /></div></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Toggle id="senior" title="Senior citizen" desc="Age 65 or older" checked={v.SeniorCitizen === 1} onChange={(c) => setValue("SeniorCitizen", c ? 1 : 0, { shouldValidate: true })} />
          <Toggle id="partner" title="Has partner" checked={v.Partner === "Yes"} onChange={yn("Partner")} />
          <Toggle id="dependents" title="Has dependents" checked={v.Dependents === "Yes"} onChange={yn("Dependents")} />
        </div>
        <div>
          <div className="flex items-center justify-between"><Label htmlFor="tenure">Tenure (months)</Label>
            <Input id="tenure" type="number" inputMode="numeric" min={0} step={1} className="h-8 w-24 text-right font-mono" aria-invalid={!!errors.tenure}
              {...register("tenure", { valueAsNumber: true })} /></div>
          <input type="range" min={0} max={72} step={1} aria-label="Tenure slider" value={Number.isFinite(v.tenure) ? Math.min(v.tenure, 72) : 0}
            onChange={(e) => setValue("tenure", Number(e.target.value), { shouldValidate: true, shouldDirty: true })} className="mt-3 w-full accent-[var(--primary)]" />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground"><span>0</span><span>24</span><span>48</span><span>72</span></div>
          <FieldError message={err("tenure")} />
        </div>
      </div>

      <div role="tabpanel" id="panel-1" aria-labelledby="tab-1" hidden={step !== 1} className="space-y-5">
        <div><Label>Internet service</Label><div className="mt-1.5"><Segmented label="Internet service" value={v.InternetService} options={INTERNET} labels={{ No: "No internet" }} onChange={(x) => setValue("InternetService", x, { shouldValidate: true })} /></div></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle id="phone" title="Phone service" checked={v.PhoneService === "Yes"} onChange={yn("PhoneService")} />
          <Toggle id="lines" title="Multiple lines" desc={noPhone ? "Not available without phone service" : undefined} checked={v.MultipleLines === "Yes"} disabled={noPhone}
            onChange={(c) => setValue("MultipleLines", c ? "Yes" : "No", { shouldValidate: true })} />
          {ADDON_FIELDS.map((f) => (
            <Toggle key={f} id={f} title={ADDON_TEXT[f][0]} desc={noInternet ? "Requires internet service" : ADDON_TEXT[f][1]} checked={v[f] === "Yes"} disabled={noInternet}
              onChange={(c) => setValue(f, c ? "Yes" : "No", { shouldValidate: true })} />
          ))}
        </div>
        <FieldError message={err("MultipleLines")} />
      </div>

      <div role="tabpanel" id="panel-2" aria-labelledby="tab-2" hidden={step !== 2} className="space-y-5">
        <div><Label>Contract</Label><div className="mt-1.5"><Segmented label="Contract" value={v.Contract} options={CONTRACT} onChange={(x) => setValue("Contract", x, { shouldValidate: true })} /></div></div>
        <div><Label htmlFor="pay">Payment method</Label>
          <Select id="pay" className="mt-1.5" {...register("PaymentMethod")}>{PAYMENT.map((p) => <option key={p}>{p}</option>)}</Select></div>
        <Toggle id="paperless" title="Paperless billing" checked={v.PaperlessBilling === "Yes"} onChange={yn("PaperlessBilling")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="monthly">Monthly charges ($)</Label>
            <Input id="monthly" type="number" inputMode="decimal" min={0} step="0.01" className="mt-1.5 font-mono" aria-invalid={!!errors.MonthlyCharges} {...register("MonthlyCharges", { valueAsNumber: true })} />
            <FieldError message={err("MonthlyCharges")} /></div>
          <div><Label htmlFor="total">Total charges ($)</Label>
            <Input id="total" type="number" inputMode="decimal" min={0} step="0.01" className="mt-1.5 font-mono" aria-invalid={!!errors.TotalCharges} placeholder={v.tenure === 0 ? "Blank for a brand-new customer" : ""}
              {...(() => { const r = register("TotalCharges", { setValueAs: (x) => (x === "" || x === null || x === undefined ? null : Number(x)) }); return { ...r, onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setAutoTotal(false); return r.onChange(e); } }; })()} />
            <FieldError message={err("TotalCharges")} />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {autoTotal ? "Estimated as tenure × monthly charges. Edit it if you know the actual total." : (
                <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setAutoTotal(true)}>Use estimate (tenure × monthly)</button>)}
            </p></div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
        <Button type="button" variant="secondary" size="sm" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft className="h-4 w-4" />Previous</Button>
        <span className="text-xs text-muted-foreground" aria-live="polite">Step {step + 1} of 3</span>
        <Button type="button" variant="secondary" size="sm" disabled={step === 2} onClick={() => setStep(step + 1)}>Next<ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
