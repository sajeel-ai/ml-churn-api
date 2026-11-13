import * as React from "react";
import { cn } from "@/lib/utils";

const field = "w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-risk-high";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input ref={ref} type={type} className={cn(field, "h-10", className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(field, "h-10 pr-8", className)} {...props}>{children}</select>
  ),
);
Select.displayName = "Select";
