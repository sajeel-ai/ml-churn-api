"use client";
import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { passwordStrength } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export const PasswordInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { meter?: string }>(
  ({ meter, className, ...props }, ref) => {
    const [show, setShow] = React.useState(false);
    const s = meter !== undefined ? passwordStrength(meter) : null;
    const colors = ["bg-border", "bg-risk-high", "bg-risk-medium", "bg-accent", "bg-risk-low"];
    return (
      <div>
        <div className="relative">
          <Input ref={ref} type={show ? "text" : "password"} className={cn("pr-10", className)} {...props} />
          <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {s && meter && (
          <div className="mt-1.5" aria-live="polite">
            <div className="flex gap-1">{[1, 2, 3, 4].map((i) => <div key={i} className={cn("h-1 flex-1 rounded-full", i <= s.score ? colors[s.score] : "bg-border")} />)}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Strength: {s.label}</p>
          </div>
        )}
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";
