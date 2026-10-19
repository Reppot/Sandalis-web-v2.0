"use client";

import { ContentProvider } from "@/entities/content";
import { SessionProvider } from "@/features/cabinet";
import { NotificationProvider, ThemeProvider } from "@/shared";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <ContentProvider>
          <SessionProvider>{children}</SessionProvider>
        </ContentProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}
