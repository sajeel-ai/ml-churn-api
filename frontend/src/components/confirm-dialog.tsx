"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Delete", loading, onConfirm, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirmLabel?: string;
  loading?: boolean; onConfirm: () => void; children?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
