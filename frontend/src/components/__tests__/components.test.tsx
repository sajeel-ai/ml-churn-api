import * as React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CustomerFields, useCustomerForm } from "../customer-form";
import { ExplanationPanel } from "../explanation-panel";
import { PasswordInput } from "../password-field";
import { Recommendations, suggestionsFor } from "../recommendations";
import { RiskGauge } from "../risk-gauge";
import { DEFAULT_CUSTOMER, customerSchema, type CustomerInput } from "@/lib/schemas";

let latest: CustomerInput;
function Harness() {
  const form = useCustomerForm(DEFAULT_CUSTOMER);
  const values = form.watch();
  React.useEffect(() => { latest = values; });
  return <CustomerFields form={form} />;
}

describe("RiskGauge", () => {
  it("shows the real probability and the policy marks", () => {
    render(<RiskGauge probability={0.4231} level="medium" threshold={0.32} highThreshold={0.5} />);
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText(/model threshold 32%/)).toBeInTheDocument();
  });
  it("shows a dash instead of inventing a number", () => {
    render(<RiskGauge />);
    expect(screen.getByText("–")).toBeInTheDocument();
  });
});

describe("ExplanationPanel", () => {
  it("renders factors with direction and the not-causal note", () => {
    render(<ExplanationPanel explanation={{ method: "TreeSHAP", scale: "log-odds", base_probability: 0.26, note: "Model explanation (TreeSHAP), not causal reasoning.",
      factors: [{ feature: "Contract", value: "Month-to-month", effect: "increases", contribution: 0.45, relative_strength: 1 },
        { feature: "tenure", value: 60, effect: "decreases", contribution: -0.3, relative_strength: 0.66 }] }} />);
    expect(screen.getByText("Raises risk")).toBeInTheDocument();
    expect(screen.getByText("Lowers risk")).toBeInTheDocument();
    expect(screen.getByText(/not causal/i)).toBeInTheDocument();
    expect(screen.getByText(/26% churn probability/)).toBeInTheDocument();
  });
  it("degrades gracefully", () => {
    render(<ExplanationPanel explanation={null} />);
    expect(screen.getByText(/not available/i)).toBeInTheDocument();
  });
});

describe("Recommendations", () => {
  it("is clearly labelled as general and not model output", () => {
    render(<Recommendations customer={{ ...DEFAULT_CUSTOMER }} />);
    expect(screen.getByText(/not produced by the model/i)).toBeInTheDocument();
  });
  it("contains no invented prices or discounts", () => {
    const all = suggestionsFor({ ...DEFAULT_CUSTOMER, tenure: 2, TechSupport: "No" }).join(" ");
    expect(all).not.toMatch(/\$|\d+%|free/i);
  });
  it("adapts to the inputs", () => {
    expect(suggestionsFor({ Contract: "Two year", tenure: 50, PaymentMethod: "Mailed check", InternetService: "DSL", TechSupport: "Yes" })[0]).toMatch(/Maintain/);
  });
});

describe("PasswordInput", () => {
  it("toggles visibility and shows a strength meter", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="pw" meter="Correct-horse-42-battery" defaultValue="x" />);
    const input = screen.getByLabelText("pw");
    expect(input).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: /show password/i }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByText(/Strength:/)).toBeInTheDocument();
  });
});

describe("CustomerFields (the model's dependency rules are enforced in the UI)", () => {
  it("choosing 'No internet' disables add-ons and sets the value the model expects", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: /services/i }));
    await user.click(screen.getByRole("radio", { name: "No internet" }));
    for (const name of ["Online security", "Tech support", "Streaming TV"]) {
      expect(screen.getByRole("switch", { name })).toBeDisabled();
    }
    expect(latest.OnlineSecurity).toBe("No internet service");
    expect(latest.StreamingMovies).toBe("No internet service");
    expect(customerSchema.safeParse(latest).success).toBe(true);
    await user.click(screen.getByRole("radio", { name: "DSL" }));
    expect(latest.OnlineSecurity).toBe("No");
    expect(screen.getByRole("switch", { name: "Tech support" })).toBeEnabled();
  });

  it("turning phone service off forces 'No phone service' and disables multiple lines", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: /services/i }));
    await user.click(screen.getByRole("switch", { name: "Phone service" }));
    expect(latest.MultipleLines).toBe("No phone service");
    expect(screen.getByRole("switch", { name: "Multiple lines" })).toBeDisabled();
  });

  it("toggles write Yes/No strings, never booleans", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("switch", { name: "Has partner" }));
    expect(latest.Partner).toBe("Yes");
    await user.click(screen.getByRole("switch", { name: "Senior citizen" }));
    expect(latest.SeniorCitizen).toBe(1);
  });

  it("estimates total charges from tenure x monthly until the user edits it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("tab", { name: /billing/i }));
    const monthly = screen.getByLabelText(/monthly charges/i);
    await user.clear(monthly);
    await user.type(monthly, "50");
    expect(latest.TotalCharges).toBe(600); // 12 months x 50
    const total = screen.getByLabelText(/total charges/i);
    await user.clear(total);
    await user.type(total, "999");
    await user.clear(monthly);
    await user.type(monthly, "80");
    expect(latest.TotalCharges).toBe(999); // manual value respected
    await user.click(screen.getByRole("button", { name: /use estimate/i }));
    expect(latest.TotalCharges).toBe(960);
  });

  it("shows validation for negative values and marks the step with an error", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const tenure = screen.getByLabelText("Tenure (months)");
    await user.clear(tenure);
    await user.type(tenure, "-3");
    const alert = await screen.findByRole("alert");
    expect(within(alert.parentElement as HTMLElement).getByText(/cannot be negative/i)).toBeInTheDocument();
    // the profile tab is flagged (a negative tenure also makes the auto-estimated total invalid, so billing is flagged too)
    const profileTab = screen.getByRole("tab", { name: /customer profile/i });
    expect(within(profileTab).getByLabelText(/this step has errors/i)).toBeInTheDocument();
  });

  it("stepper navigation works and exposes tab semantics", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByRole("tab", { name: /customer profile/i })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getByRole("tab", { name: /services/i })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: /previous/i }));
    expect(screen.getByRole("tab", { name: /customer profile/i })).toHaveAttribute("aria-selected", "true");
  });
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/" }));
