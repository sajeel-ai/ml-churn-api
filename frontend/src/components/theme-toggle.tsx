"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const opts = [["light", Sun, "Light"], ["system", Monitor, "System"], ["dark", Moon, "Dark"]] as const;
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex rounded-xl border border-border bg-muted/60 p-0.5", className)}>
      {opts.map(([k, Icon, label]) => (
        <button key={k} type="button" role="radio" aria-checked={theme === k} aria-label={`${label} theme`} onClick={() => setTheme(k)}
          className={cn("rounded-lg p-1.5 transition-colors", theme === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
