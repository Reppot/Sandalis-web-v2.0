import * as React from "react";
import { cn } from "@/shared/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", error, label, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-mono font-medium text-sindaris-muted">
            {label}
          </label>
        )}
        <input
          id={inputId}
          type={type}
          ref={ref}
          className={cn(
            "flex h-10 w-full rounded-md border border-sindaris-border bg-sindaris-bg px-3 py-2 text-sm text-sindaris-text font-mono ring-offset-sindaris-bg file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-sindaris-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sindaris-accent focus-visible:border-sindaris-accent disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-red-500 focus-visible:ring-red-500 focus-visible:border-red-500",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs font-mono text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";