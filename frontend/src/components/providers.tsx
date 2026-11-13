"use client";
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// ---- theme ----------------------------------------------------------------------
type Theme = "light" | "dark" | "system";
const ThemeCtx = React.createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: "system", setTheme: () => {} });
export const useTheme = () => React.useContext(ThemeCtx);

function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const themeListeners = new Set<() => void>();
function readTheme(): Theme {
  try { return (localStorage.getItem("theme") as Theme) || "system"; } catch { return "system"; }
}
function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { themeListeners.delete(cb); window.removeEventListener("storage", cb); };
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  // localStorage is an external store: read it with useSyncExternalStore (server snapshot = "system").
  const theme = React.useSyncExternalStore(subscribeTheme, readTheme, () => "system" as Theme);
  React.useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (readTheme() === "system") applyTheme("system"); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);
  const setTheme = React.useCallback((t: Theme) => {
    try { localStorage.setItem("theme", t); } catch { /* storage blocked: still apply for this session */ }
    applyTheme(t);
    themeListeners.forEach((l) => l());
  }, []);
  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

// ---- toasts ---------------------------------------------------------------------
interface ToastItem { id: number; title: string; description?: string; tone: "success" | "error" | "info" }
const ToastCtx = React.createContext<{ toast: (t: Omit<ToastItem, "id" | "tone"> & { tone?: ToastItem["tone"] }) => void }>({ toast: () => {} });
export const useToast = () => React.useContext(ToastCtx);

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const toast = React.useCallback((t: Omit<ToastItem, "id" | "tone"> & { tone?: ToastItem["tone"] }) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { tone: "info", ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 5000);
  }, []);
  const icons = { success: CheckCircle2, error: AlertTriangle, info: Info };
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {items.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div key={t.id} role={t.tone === "error" ? "alert" : "status"}
              className={cn("pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-3 text-sm shadow-lg",
                t.tone === "success" && "border-risk-low/50", t.tone === "error" && "border-risk-high/50")}>
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.tone === "success" && "text-risk-low", t.tone === "error" && "text-risk-high", t.tone === "info" && "text-primary")} aria-hidden />
              <div className="flex-1"><p className="font-semibold">{t.title}</p>{t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}</div>
              <button aria-label="Dismiss" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000, refetchOnWindowFocus: false,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  }));
  return (
    <ThemeProvider><ToastProvider><QueryClientProvider client={client}>{children}</QueryClientProvider></ToastProvider></ThemeProvider>
  );
}
