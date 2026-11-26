"use client";

import dynamic from 'next/dynamic';
import { DesktopLocaleProvider } from '../../renderer/desktop-i18n';

const DesktopShell = dynamic(() => import('../../renderer/DesktopShell'), { ssr: false });

export default function DesktopHomePage() {
  return <DesktopLocaleProvider><DesktopShell /></DesktopLocaleProvider>;
}
