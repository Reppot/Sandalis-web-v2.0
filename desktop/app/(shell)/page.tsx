"use client";

import dynamic from 'next/dynamic';

const DesktopShell = dynamic(() => import('../../renderer/DesktopShell'), { ssr: false });

export default function DesktopHomePage() {
  return <DesktopShell />;
}
