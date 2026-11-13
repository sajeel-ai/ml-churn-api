import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
        secondary: "bg-muted text-foreground hover:bg-muted/70 border border-border",
        outline: "border border-input bg-card hover:bg-muted",
        ghost: "hover:bg-muted text-foreground",
        destructive: "bg-risk-high text-white hover:bg-risk-high/90",
        link: "text-primary underline-offset-4 hover:underline px-0",
      },
      size: { default: "h-10 px-4", sm: "h-8 px-3 text-xs", lg: "h-12 px-6 text-base", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref}
        disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
        {asChild ? children : (<>{loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}</>)}
      </Comp>
    );
  },
);
Button.displayName = "Button";
export { buttonVariants };
