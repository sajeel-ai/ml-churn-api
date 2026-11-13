import type { CustomerInput } from "./schemas";
import type { RiskLevel } from "./utils";

export type Role = "admin" | "analyst" | "viewer";

export interface User {
  id: string; name: string; email: string; role: Role; is_active: boolean;
  email_verified: boolean; viewer_of_id: string | null; created_at: string; last_login_at: string | null;
}

export interface Page<T> { items: T[]; total: number; page: number; page_size: number; pages: number }

export interface Factor {
  feature: string; value: string | number | null; effect: "increases" | "decreases";
  contribution: number; relative_strength: number;
}
export interface Explanation {
  method: string; scale: string; base_probability: number; factors: Factor[]; note: string;
}

export interface Preview {
  prediction: 0 | 1; predicted_label: "churn" | "no_churn"; probability: number; risk_level: RiskLevel;
  threshold: number; risk_high_threshold: number; model_version: string; predicted_at: string;
  warnings: string[]; disclaimer: string; explanation: Explanation | null;
}

export interface PredictionRow {
  id: string; customer_id: string | null; reference: string | null; source: "single" | "customer" | "bulk";
  prediction: 0 | 1; predicted_label: "churn" | "no_churn"; probability: number; threshold: number;
  risk_level: RiskLevel; model_version: string; created_at: string;
}
export interface PredictionDetail extends PredictionRow {
  input: Partial<CustomerInput>; disclaimer: string; explanation: Explanation | null;
}

export interface LatestPrediction { id: string; probability: number; risk_level: RiskLevel; predicted_label: string; created_at: string }
export type Customer = CustomerInput & {
  id: string; customer_identifier: string; created_at: string; updated_at: string; latest_prediction: LatestPrediction | null;
};

export interface Dashboard {
  total_predictions: number; high_risk: number; medium_risk: number; low_risk: number;
  average_probability: number | null; recent: PredictionRow[]; activity: { date: string; count: number }[];
  scope: "own" | "assigned_analyst";
}

export interface Job {
  id: string; status: "pending" | "running" | "completed" | "failed"; filename: string | null;
  total_rows: number; processed_rows: number; invalid_rows: number; error: string | null;
  created_at: string; finished_at: string | null;
}
export interface ValidationReport {
  filename: string | null; total_rows: number; valid_rows: number; invalid_rows: number;
  required_columns: string[]; missing_columns: string[]; ignored_columns: string[];
  errors: { row: number; errors: string[] }[]; errors_truncated: boolean;
  preview: Record<string, string>[]; can_process: boolean;
}

export interface SessionInfo {
  id: string; created_at: string; last_seen_at: string; expires_at: string;
  user_agent: string | null; ip: string | null; current: boolean;
}

export interface ModelInfo {
  model_version: string; model_type: string; algorithm: string; preprocessing: string;
  threshold: number; risk_high_threshold: number; features: string[];
  categorical_values: Record<string, string[]>;
  training_ranges: Record<string, { min: number; max: number }>;
  training_dataset: { name: string; file: string; rows: number; churn_rate: number };
  evaluation: {
    split: string; n_test: number; threshold_selection: string; validation_type: string;
    confusion_matrix: { tn: number; fp: number; fn: number; tp: number };
  };
  metrics: { accuracy: number; precision: number; recall: number; f1: number; roc_auc: number; brier_score: number };
  calibration_evaluated: boolean;
  calibration: { method: string; expected_calibration_error: number; note: string;
    bins: { n: number; mean_predicted: number; observed_rate: number }[] };
  intended_use: string; limitations: string[]; last_updated: string;
  risk_policy: { low: string; medium: string; high: string; note: string };
  artifact_sha256: string;
}
export interface ModelVersionRow {
  version: string; status: "active" | "archived"; created_at: string; activated_at: string | null;
  metrics: ModelInfo["metrics"] | null; threshold: number | null; note: string | null;
}
