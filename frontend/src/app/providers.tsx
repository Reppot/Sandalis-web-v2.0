"use client";

import { ContentProvider } from "@/entities/content";
import { SessionProvider } from "@/features/cabinet";
import { I18nProvider, NotificationProvider, ThemeProvider } from "@/shared";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <NotificationProvider>
          <ContentProvider>
            <SessionProvider>{children}</SessionProvider>
          </ContentProvider>
        </NotificationProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
