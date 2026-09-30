import * as React from "react";
import { cn } from "@/shared/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hoverable = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border border-sindaris-border bg-sindaris-panel p-5 text-sindaris-text shadow-sm transition-shadow",
          hoverable && "hover:border-sindaris-accent/50 hover:shadow-md hover:shadow-sindaris-accent/5",
          className
        )}
        {...props}
      />
    );
  }
);

Card.displayName = "Card";