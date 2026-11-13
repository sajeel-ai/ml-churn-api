"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { User } from "./types";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => api<User>("/api/v1/auth/me"), retry: false, staleTime: 60_000 });
}

export function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Run `reset` whenever `key` changes (during render, the React-recommended way
 *  to adjust state on a prop/state change; avoids an effect + extra render). */
export function useResetOnChange(key: string, reset: () => void) {
  const [prev, setPrev] = React.useState(key);
  if (prev !== key) {
    setPrev(key);
    reset();
  }
}

export const canWrite = (u?: User) => u?.role === "admin" || u?.role === "analyst";
