import * as React from "react";
import { apiClient } from "@/shared";
import type { Shape } from "@/features/planning/model/plan";

/* Общий план клана: объекты на карте, которые офицеры рисуют вместе (GET/POST /clan/plan).
 * Правки уходят операциями (изменить/добавить, удалить, очистить) пачкой раз в ~0,3 с, чужие
 * правки подтягиваются опросом раз в несколько секунд; несохранённые свои правки поверх них. */

export interface ClanPlanState {
  version: number;
  shapes: Shape[] | null;
  updated_by_name: string;
  updated_at: string | null;
  can_edit: boolean;
}

interface Ops {
  upsert: Shape[];
  delete: string[];
  clear: boolean;
}

export const clanPlanApi = {
  get: (since?: number) => apiClient.get<ClanPlanState>(`/api/v1/clan/plan${since === undefined ? "" : `?since=${since}`}`),
  ops: (body: Ops) => apiClient.post<ClanPlanState>("/api/v1/clan/plan/ops", body),
};

const POLL_MS = 4000;
const FLUSH_MS = 300;

interface Pending {
  upsert: Map<string, Shape>;
  del: Set<string>;
  clear: boolean;
}
const emptyPending = (): Pending => ({ upsert: new Map(), del: new Set(), clear: false });
const isEmpty = (p: Pending) => !p.clear && !p.upsert.size && !p.del.size;

/** План сервера + свои ещё не сохранённые правки. */
function overlay(base: Shape[], p: Pending): Shape[] {
  const rest = new Map(p.upsert);
  const out = (p.clear ? [] : base).filter((s) => !p.del.has(s.id)).map((s) => {
    const mine = rest.get(s.id);
    rest.delete(s.id);
    return mine ?? s;
  });
  return [...out, ...rest.values()];
}

export interface ClanPlan {
  ready: boolean;
  shapes: Shape[];
  canEdit: boolean;
  updatedBy: string;
  updatedAt: string | null;
  /** Сохраняется ли сейчас что-то. */
  saving: boolean;
  commit: (fn: (prev: Shape[]) => Shape[]) => void;
}

export function useClanPlan(active: boolean, onError: (err: unknown) => void): ClanPlan {
  const [shapes, setShapesState] = React.useState<Shape[]>([]);
  const [meta, setMeta] = React.useState({ ready: false, canEdit: false, updatedBy: "", updatedAt: null as string | null, saving: false });
  const server = React.useRef<Shape[]>([]);
  const version = React.useRef<number | undefined>(undefined);
  const pending = React.useRef<Pending>(emptyPending());
  const inflight = React.useRef(false);
  const current = React.useRef<Shape[]>([]);
  const flushTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRef = React.useRef(onError);
  errorRef.current = onError;

  const show = React.useCallback(() => {
    current.current = overlay(server.current, pending.current);
    setShapesState(current.current);
  }, []);
  const accept = React.useCallback((st: ClanPlanState) => {
    version.current = st.version;
    if (st.shapes) server.current = st.shapes;
    setMeta((m) => ({ ...m, ready: true, canEdit: st.can_edit, updatedBy: st.updated_by_name, updatedAt: st.updated_at }));
    show();
  }, [show]);

  const flush = React.useCallback(async () => {
    if (inflight.current || isEmpty(pending.current)) return;
    const sent = pending.current;
    pending.current = emptyPending();
    inflight.current = true;
    setMeta((m) => ({ ...m, saving: true }));
    try {
      accept(await clanPlanApi.ops({ upsert: [...sent.upsert.values()], delete: [...sent.del], clear: sent.clear }));
    } catch (err) {
      // не ушло — вернуть в очередь под более свежие правки
      const p = pending.current;
      for (const [id, s] of sent.upsert) if (!p.upsert.has(id) && !p.del.has(id)) p.upsert.set(id, s);
      for (const id of sent.del) if (!p.upsert.has(id)) p.del.add(id);
      p.clear = p.clear || sent.clear;
      errorRef.current(err);
    } finally {
      inflight.current = false;
      setMeta((m) => ({ ...m, saving: false }));
      if (!isEmpty(pending.current)) flushTimer.current = setTimeout(() => void flush(), FLUSH_MS * 4);
    }
  }, [accept]);

  const commit = React.useCallback((fn: (prev: Shape[]) => Shape[]) => {
    const prev = current.current;
    const next = fn(prev);
    const p = pending.current;
    if (!next.length && prev.length) {
      p.clear = true;
      p.upsert.clear();
      p.del.clear();
    } else {
      const before = new Map(prev.map((s) => [s.id, s]));
      for (const s of next) {
        if (before.get(s.id) !== s) {
          p.upsert.set(s.id, s);
          p.del.delete(s.id);
        }
        before.delete(s.id);
      }
      for (const id of before.keys()) {
        p.upsert.delete(id);
        p.del.add(id);
      }
    }
    current.current = next;
    setShapesState(next);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => void flush(), FLUSH_MS);
  }, [flush]);

  React.useEffect(() => {
    if (!active) return;
    let alive = true;
    const pull = async () => {
      if (inflight.current || !isEmpty(pending.current) || document.visibilityState === "hidden") return;
      try {
        const st = await clanPlanApi.get(version.current);
        if (alive && !inflight.current && isEmpty(pending.current)) accept(st);
      } catch {
        /* сеть — попробуем в следующий раз */
      }
    };
    void pull();
    const id = setInterval(() => void pull(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [active, accept]);

  // уходя со страницы — дослать правки
  React.useEffect(() => () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    void flush();
  }, [flush]);

  return { ...meta, shapes, commit };
}
