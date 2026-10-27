"use client";

import * as React from "react";
import { apiClient } from "@/shared";

/* Почта на сайте и роли для упоминаний «@». */

export interface MentionRole {
  id: string;
  name: string;
  /** Цвет роли Discord (число RGB), 0 — без цвета. */
  color: number;
}

export interface Mail {
  id: string;
  kind: "operation_mention" | string;
  sender_name: string;
  payload: { operation_id?: string; title?: string; date?: string; note?: string; roles?: string[]; feedback_id?: string; message?: string; reply?: string; report_id?: string; due_date?: string | null; priority?: string; text?: string; operation?: string };
  read: boolean;
  created_at: string;
}

export interface MailList {
  unread: number;
  items: Mail[];
}

export const mailApi = {
  roles: () => apiClient.get<MentionRole[]>("/api/v1/clan/mentions"),
  list: () => apiClient.get<MailList>("/api/v1/mail"),
  read: (id: string) => apiClient.post<void>(`/api/v1/mail/${id}/read`, {}),
  readAll: () => apiClient.post<void>("/api/v1/mail/read", {}),
  remove: (id: string) => apiClient.delete<void>(`/api/v1/mail/${id}`),
};

export const roleColor = (c: number) => (c ? `#${c.toString(16).padStart(6, "0")}` : "#a3e635");

/** Роли для подсказки «@» — один запрос на вкладку браузера. */
let rolesCache: Promise<MentionRole[]> | null = null;
export function useMentionRoles(enabled = true) {
  const [roles, setRoles] = React.useState<MentionRole[]>([]);
  React.useEffect(() => {
    if (!enabled) return;
    rolesCache ??= mailApi.roles().catch(() => {
      rolesCache = null;
      return [];
    });
    rolesCache.then(setRoles);
  }, [enabled]);
  return roles;
}

/** Событие «почта изменилась» — счётчик в шапке обновляется сразу. */
export const MAIL_EVENT = "sindaris-mail";
export const mailChanged = () => window.dispatchEvent(new Event(MAIL_EVENT));

/** Непрочитанные письма: раз в минуту и по событию. */
export function useUnreadMail(enabled: boolean) {
  const [unread, setUnread] = React.useState(0);
  React.useEffect(() => {
    if (!enabled) return setUnread(0);
    let alive = true;
    const load = () => mailApi.list().then((r) => alive && setUnread(r.unread)).catch(() => undefined);
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener(MAIL_EVENT, load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(MAIL_EVENT, load);
    };
  }, [enabled]);
  return unread;
}

/** Текст с подсвеченными упоминаниями: [{text, role?}]. */
export function splitMentions(text: string, roles: MentionRole[]): { text: string; role?: MentionRole }[] {
  if (!text || !roles.length) return [{ text }];
  const sorted = [...roles].sort((a, b) => b.name.length - a.name.length);
  const out: { text: string; role?: MentionRole }[] = [];
  let i = 0, plain = "";
  const low = text.toLowerCase();
  while (i < text.length) {
    const role = text[i] === "@" ? sorted.find((r) => low.startsWith(`@${r.name.toLowerCase()}`, i)) : undefined;
    if (role) {
      if (plain) out.push({ text: plain });
      plain = "";
      out.push({ text: text.slice(i, i + role.name.length + 1), role });
      i += role.name.length + 1;
    } else {
      plain += text[i++];
    }
  }
  if (plain) out.push({ text: plain });
  return out;
}
