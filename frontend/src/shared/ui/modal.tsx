"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type { UiIcon } from "@/shared/config/assets";
import { useT } from "@/shared/i18n";
import { UiGlyph } from "@/shared/ui/glyph";
import { Icon } from "@/shared/ui/icons";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Иконка интерфейса из набора (backend/static/ui). */
  icon?: UiIcon | null;
  children: React.ReactNode;
  widthClass?: string;
  /** Обложка раздела полосой над заголовком. */
  backdropImage?: string | null;
  footer?: React.ReactNode;
}

/** Диалог: по центру на ПК, лист снизу на телефоне. Esc и клик по фону закрывают. */
export const Modal: React.FC<ModalProps> = ({ open, onClose, title, icon, children, widthClass = "max-w-xl", backdropImage, footer }) => {
  const t = useT();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  React.useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
    const initial = panelRef.current?.querySelector<HTMLElement>("[autofocus]") ?? focusable()[0] ?? panelRef.current;
    requestAnimationFrame(() => initial?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (!items.length) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !panelRef.current?.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      if (previousFocus?.isConnected) requestAnimationFrame(() => previousFocus.focus({ preventScroll: true }));
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} tabIndex={-1} className={`modal-panel panel relative flex max-h-[90dvh] w-full flex-col overflow-hidden ${widthClass}`} role="dialog" aria-modal="true" aria-label={title}>
        {backdropImage ? <div className="modal-cover" style={{ backgroundImage: `url(${backdropImage})` }} aria-hidden /> : null}
        <header className="modal-head">
          {icon ? (
            <span className="icon-tile h-9 w-9 rounded-[11px]">
              <UiGlyph icon={icon} size={20} />
            </span>
          ) : null}
          <h2 className="min-w-0 flex-1 truncate text-[1.05rem] font-semibold tracking-[-0.01em]">{title}</h2>
          <button onClick={onClose} className="modal-close" aria-label={t("common.close")}>
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="scroll-area relative flex-1 px-5 pt-1 pb-5">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
};
