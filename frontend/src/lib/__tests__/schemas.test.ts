import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADDON_FIELDS, CONTRACT, DEFAULT_CUSTOMER, GENDER, INTERNET, MULTI_LINES, PAYMENT, PRESETS, YES_NO, YES_NO_NOINT,
  customerSchema, newPasswordSchema, passwordProblems, passwordStrength, registerSchema,
} from "../schemas";

// The trained model's real contract, written by backend/scripts/evaluate_model.py
const meta = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../backend/models/metadata.json"), "utf8"));
const cats: Record<string, string[]> = meta.categorical_values;
const sorted = (a: readonly string[]) => [...a].sort();

describe("form options match the trained model's encoder (contract parity)", () => {
  const cases: [string, readonly string[]][] = [
    ["gender", GENDER], ["Partner", YES_NO], ["Dependents", YES_NO], ["PhoneService", YES_NO], ["PaperlessBilling", YES_NO],
    ["MultipleLines", MULTI_LINES], ["InternetService", INTERNET], ["Contract", CONTRACT], ["PaymentMethod", PAYMENT],
    ...ADDON_FIELDS.map((f): [string, readonly string[]] => [f, YES_NO_NOINT]),
  ];
  it.each(cases)("%s", (field, options) => {
    expect(sorted(options)).toEqual(sorted(cats[field]));
  });

  it("covers exactly the model's 19 features", () => {
    const shape = Object.keys(customerSchema.def.shape ?? (customerSchema as unknown as { _def: { shape: object } })._def.shape);
    expect(shape.sort()).toEqual([...meta.features].sort());
    expect(Object.keys(DEFAULT_CUSTOMER).sort()).toEqual([...meta.features].sort());
  });
});

describe("customerSchema", () => {
  const ok = DEFAULT_CUSTOMER;
  it("accepts the default and both presets", () => {
    expect(customerSchema.safeParse(ok).success).toBe(true);
    for (const p of Object.values(PRESETS)) expect(customerSchema.safeParse(p.values).success).toBe(true);
  });
  it.each([
    ["negative tenure", { tenure: -1 }], ["fractional tenure", { tenure: 1.5 }], ["NaN tenure", { tenure: NaN }],
    ["negative monthly", { MonthlyCharges: -1 }], ["negative total", { TotalCharges: -1 }],
    ["bad contract", { Contract: "Banana" }], ["bad gender", { gender: "Robot" }], ["bad senior", { SeniorCitizen: 2 }],
  ])("rejects %s", (_n, change) => {
    expect(customerSchema.safeParse({ ...ok, ...change } as never).success).toBe(false);
  });
  it("requires TotalCharges unless tenure is 0", () => {
    expect(customerSchema.safeParse({ ...ok, TotalCharges: null }).success).toBe(false);
    expect(customerSchema.safeParse({ ...ok, tenure: 0, TotalCharges: null }).success).toBe(true);
  });
  it("enforces phone and internet dependency rules like the backend", () => {
    expect(customerSchema.safeParse({ ...ok, PhoneService: "No", MultipleLines: "No" }).success).toBe(false);
    expect(customerSchema.safeParse({ ...ok, PhoneService: "No", MultipleLines: "No phone service" }).success).toBe(true);
    expect(customerSchema.safeParse({ ...ok, MultipleLines: "No phone service" }).success).toBe(false);
    expect(customerSchema.safeParse({ ...ok, InternetService: "No" }).success).toBe(false);
    const none = Object.fromEntries(ADDON_FIELDS.map((f) => [f, "No internet service"]));
    expect(customerSchema.safeParse({ ...ok, InternetService: "No", ...none }).success).toBe(true);
    expect(customerSchema.safeParse({ ...ok, TechSupport: "No internet service" }).success).toBe(false);
  });
});

describe("password rules (mirror the backend policy)", () => {
  it("flags the same problems", () => {
    expect(passwordProblems("short1")).toContain("At least 10 characters");
    expect(passwordProblems("onlyletterslong")).toContain("At least one letter and one number");
    expect(passwordProblems("ada-lovelace-1", "x@example.com", "Ada Lovelace")).toContain("Must not contain your name");
    expect(passwordProblems("my-jordan.smith-9", "jordan.smith@example.com")).toContain("Must not contain your email address");
    expect(passwordProblems("Correct-horse-42")).toEqual([]);
  });
  it("scores strength monotonically", () => {
    expect(passwordStrength("abc").score).toBe(0);
    expect(passwordStrength("Correct-horse-42-battery").score).toBeGreaterThan(passwordStrength("abcdefghij1").score);
  });
  it("registerSchema surfaces field-level messages", () => {
    const r = registerSchema.safeParse({ name: "Ada Lovelace", email: "ada@example.com", password: "weak", confirm_password: "other" });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("password");
    expect(paths).toContain("confirm_password");
    expect(registerSchema.safeParse({ name: "Ada Lovelace", email: "ada@example.com", password: "Correct-horse-42", confirm_password: "Correct-horse-42" }).success).toBe(true);
  });
  it("newPasswordSchema requires matching confirmation", () => {
    expect(newPasswordSchema.safeParse({ new_password: "Correct-horse-42", confirm: "nope" }).success).toBe(false);
  });
});
