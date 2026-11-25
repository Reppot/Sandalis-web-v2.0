import type { Metadata } from 'next';
import '../../frontend/src/app/globals.css';
import './sources.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter-tight';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/russo-one/cyrillic-400.css';
import '@fontsource/russo-one/latin-400.css';

export const metadata: Metadata = { title: 'Sindaris Desktop', description: 'Локальный Foxhole-компаньон' };

export default function DesktopRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" data-theme="dark"><body className="antialiased">{children}</body></html>;
}
