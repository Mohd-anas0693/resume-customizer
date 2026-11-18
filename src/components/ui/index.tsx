"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* Small shadcn/ui-style primitives, hand-rolled so the project has no
 * generator step. Same API shape, same Tailwind token classes. */

const buttonVariants = {
  default: "bg-primary text-primary-foreground hover:opacity-90",
  outline: "border bg-transparent hover:bg-muted",
  ghost: "bg-transparent hover:bg-muted",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  success: "bg-green-700 text-white hover:bg-green-800",
} as const;

const buttonSizes = {
  sm: "h-8 px-2.5 text-xs",
  default: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-sm",
} as const;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-4 pb-2", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold tracking-tight", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-2", className)} {...props} />;
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border bg-background px-2.5 text-sm placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-md border bg-background p-2.5 text-sm placeholder:text-muted-foreground",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-xs font-medium text-muted-foreground", className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  tone = "muted",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "muted" | "green" | "red" | "amber" | "blue";
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    green: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
    red: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    blue: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </span>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 p-2.5 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200"
    >
      {children}
    </p>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {children ? <div className="mt-2 text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}
