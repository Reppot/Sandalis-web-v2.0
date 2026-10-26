"use client";

import * as React from "react";
import { PageHeader } from "@/shared";

/** Шапка калькулятора — общая шапка раздела с действиями справа. */
export const ToolHeader: React.FC<{ icon: React.ReactNode; eyebrow: string; title: string; hint: string; actions?: React.ReactNode }> = ({ icon, eyebrow, title, hint, actions }) => (
  <PageHeader icon={icon} eyebrow={eyebrow} title={title} lead={hint} actions={actions} />
);
