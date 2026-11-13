import { z } from "zod";

// Allowed values: identical to the backend contract (verified against the
// trained encoder). Do not edit without re-verifying the model.
export const GENDER = ["Female", "Male"] as const;
export const YES_NO = ["Yes", "No"] as const;
export const YES_NO_NOINT = ["Yes", "No", "No internet service"] as const;
export const MULTI_LINES = ["Yes", "No", "No phone service"] as const;
export const INTERNET = ["DSL", "Fiber optic", "No"] as const;
export const CONTRACT = ["Month-to-month", "One year", "Two year"] as const;
export const PAYMENT = [
  "Bank transfer (automatic)", "Credit card (automatic)", "Electronic check", "Mailed check",
] as const;

export const ADDON_FIELDS = [
  "OnlineSecurity", "OnlineBackup", "DeviceProtection", "TechSupport", "StreamingTV", "StreamingMovies",
] as const;

export const customerSchema = z
  .object({
    gender: z.enum(GENDER),
    SeniorCitizen: z.union([z.literal(0), z.literal(1)]),
    Partner: z.enum(YES_NO),
    Dependents: z.enum(YES_NO),
    tenure: z.number({ error: "Enter the tenure in months" }).int("Whole months only").min(0, "Cannot be negative"),
    PhoneService: z.enum(YES_NO),
    MultipleLines: z.enum(MULTI_LINES),
    InternetService: z.enum(INTERNET),
    OnlineSecurity: z.enum(YES_NO_NOINT),
    OnlineBackup: z.enum(YES_NO_NOINT),
    DeviceProtection: z.enum(YES_NO_NOINT),
    TechSupport: z.enum(YES_NO_NOINT),
    StreamingTV: z.enum(YES_NO_NOINT),
    StreamingMovies: z.enum(YES_NO_NOINT),
    Contract: z.enum(CONTRACT),
    PaperlessBilling: z.enum(YES_NO),
    PaymentMethod: z.enum(PAYMENT),
    MonthlyCharges: z.number({ error: "Enter the monthly charge" }).min(0, "Cannot be negative").max(100000, "Too large"),
    TotalCharges: z.number({ error: "Enter a valid amount" }).min(0, "Cannot be negative").max(10000000, "Too large").nullable(),
  })
  .superRefine((v, ctx) => {
    // Dependency rules present in the training data (also enforced server-side).
    if (v.TotalCharges === null && v.tenure !== 0)
      ctx.addIssue({ code: "custom", path: ["TotalCharges"], message: "Required unless tenure is 0" });
    if (v.PhoneService === "No" && v.MultipleLines !== "No phone service")
      ctx.addIssue({ code: "custom", path: ["MultipleLines"], message: "Must be 'No phone service' without phone service" });
    if (v.PhoneService === "Yes" && v.MultipleLines === "No phone service")
      ctx.addIssue({ code: "custom", path: ["MultipleLines"], message: "Choose Yes or No" });
    for (const f of ADDON_FIELDS) {
      if (v.InternetService === "No" && v[f] !== "No internet service")
        ctx.addIssue({ code: "custom", path: [f], message: "Must be 'No internet service'" });
      if (v.InternetService !== "No" && v[f] === "No internet service")
        ctx.addIssue({ code: "custom", path: [f], message: "Choose Yes or No" });
    }
  });

export type CustomerInput = z.infer<typeof customerSchema>;

export const DEFAULT_CUSTOMER: CustomerInput = {
  gender: "Female", SeniorCitizen: 0, Partner: "No", Dependents: "No", tenure: 12,
  PhoneService: "Yes", MultipleLines: "No", InternetService: "Fiber optic",
  OnlineSecurity: "No", OnlineBackup: "No", DeviceProtection: "No", TechSupport: "No",
  StreamingTV: "No", StreamingMovies: "No", Contract: "Month-to-month", PaperlessBilling: "Yes",
  PaymentMethod: "Electronic check", MonthlyCharges: 70, TotalCharges: 840,
};

// Example profiles: inputs only. The result always comes from the real model.
export const PRESETS: Record<"newFiber" | "loyal", { label: string; description: string; values: CustomerInput }> = {
  newFiber: {
    label: "New fiber customer", description: "Short tenure, month-to-month, no add-ons",
    values: {
      ...DEFAULT_CUSTOMER, SeniorCitizen: 1, tenure: 2, MultipleLines: "Yes", StreamingTV: "Yes",
      StreamingMovies: "Yes", MonthlyCharges: 98.5, TotalCharges: 197,
    },
  },
  loyal: {
    label: "Long-term customer", description: "Long tenure, two-year contract, add-ons",
    values: {
      gender: "Male", SeniorCitizen: 0, Partner: "Yes", Dependents: "Yes", tenure: 54,
      PhoneService: "Yes", MultipleLines: "Yes", InternetService: "DSL", OnlineSecurity: "Yes",
      OnlineBackup: "Yes", DeviceProtection: "Yes", TechSupport: "Yes", StreamingTV: "No",
      StreamingMovies: "No", Contract: "Two year", PaperlessBilling: "No",
      PaymentMethod: "Bank transfer (automatic)", MonthlyCharges: 62.4, TotalCharges: 3369.6,
    },
  },
};

// ---- auth forms ---------------------------------------------------------------

export function passwordProblems(pw: string, email = "", name = ""): string[] {
  const out: string[] = [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (pw.length < 10) out.push("At least 10 characters");
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) out.push("At least one letter and one number");
  const local = norm(email.split("@")[0] ?? "");
  if (local.length >= 4 && norm(pw).includes(local)) out.push("Must not contain your email address");
  const n = norm(name);
  if (n.length >= 4 && norm(pw).includes(n)) out.push("Must not contain your name");
  return out;
}

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  const score = Math.min(4, s) as 0 | 1 | 2 | 3 | 4;
  return { score, label: ["Too short", "Weak", "Fair", "Good", "Strong"][score] };
}

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(120),
    email: z.string().trim().email("Enter a valid email address").max(254),
    password: z.string().max(128),
    confirm_password: z.string(),
  })
  .superRefine((v, ctx) => {
    for (const p of passwordProblems(v.password, v.email, v.name))
      ctx.addIssue({ code: "custom", path: ["password"], message: p });
    if (v.password !== v.confirm_password)
      ctx.addIssue({ code: "custom", path: ["confirm_password"], message: "Passwords do not match" });
  });

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  remember_me: z.boolean(),
});

export const newPasswordSchema = z
  .object({ new_password: z.string().max(128), confirm: z.string() })
  .superRefine((v, ctx) => {
    for (const p of passwordProblems(v.new_password))
      ctx.addIssue({ code: "custom", path: ["new_password"], message: p });
    if (v.new_password !== v.confirm)
      ctx.addIssue({ code: "custom", path: ["confirm"], message: "Passwords do not match" });
  });
