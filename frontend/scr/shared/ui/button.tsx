import * as React from "react";
import { cn } from "@/shared/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-mono text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-sindaris-accent disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          {
            "bg-sindaris-accent text-white hover:bg-blue-600 active:bg-blue-700": variant === "primary",
            "bg-sindaris-border text-sindaris-text hover:bg-gray-700 hover:text-white": variant === "secondary",
            "bg-red-600 text-white hover:bg-red-700 active:bg-red-800": variant === "danger",
            "text-sindaris-muted hover:text-sindaris-text hover:bg-sindaris-border/50": variant === "ghost",
          },
          {
            "h-8 px-3 text-xs": size === "sm",
            "h-10 px-4": size === "md",
            "h-12 px-6 text-base": size === "lg",
          },
          className
        )}
        {...props}
      >
        {isLoading && (
          <svg
            className="mr-2 h-4 w-4 animate-spin text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";