"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
      <D.Content className={cn("fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[90vh] overflow-y-auto", className)} {...props}>
        {children}
        <D.Close className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
export const DialogTitle = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof D.Title>) => (
  <D.Title className={cn("text-lg font-bold", className)} {...p} />
);
export const DialogDescription = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof D.Description>) => (
  <D.Description className={cn("mt-1 text-sm text-muted-foreground", className)} {...p} />
);
