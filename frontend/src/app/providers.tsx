"use client";

import { SessionProvider } from "@/features/cabinet";
import { ToastProvider } from "@/shared";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <SessionProvider>{children}</SessionProvider>
    </ToastProvider>
  );
}
