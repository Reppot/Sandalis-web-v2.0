"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Icon, cn, useI18n, type MessageKey } from "@/shared";

type Method = "sbp" | "boosty" | "crypto";

interface MethodInfo {
  key: Method;
  icon: string;
  tab: MessageKey;
  title: MessageKey;
  text: MessageKey;
  action: MessageKey;
  href: string;
  /** QR для ПК: со смартфона удобнее нажать ссылку, чем сканировать свой же экран. */
  qr?: { src: string; alt: string };
}

const METHODS: MethodInfo[] = [
  {
    key: "sbp",
    icon: "СБП",
    tab: "donate.sbp.tab",
    title: "donate.sbp.title",
    text: "donate.sbp.text",
    action: "donate.sbp.action",
    // на телефоне ссылка СБП сама предлагает выбрать банковское приложение
    href: "https://c2c.cbrpay.ru/BS1I001ARG1Q2ULH8TKABE5JPOALVQC9",
    qr: { src: "/api/v1/assets/brand/donate/sbp-qr.png", alt: "СБП QR" },
  },
  {
    key: "boosty",
    icon: "Visa",
    tab: "donate.boosty.tab",
    title: "donate.boosty.title",
    text: "donate.boosty.text",
    action: "donate.boosty.action",
    href: "https://boosty.to/reppot/donate",
    qr: { src: "/api/v1/assets/brand/donate/boosty-qr.png", alt: "Boosty QR" },
  },
  {
    key: "crypto",
    icon: "₿",
    tab: "donate.crypto.tab",
    title: "donate.crypto.title",
    text: "donate.crypto.text",
    action: "donate.crypto.action",
    href: "https://i.bybit.com/ablx7Cw",
    qr: { src: "/api/v1/assets/brand/donate/bybit-qr.png", alt: "Bybit Pay QR" },
  },
];

/**
 * «Поддержать разработчика»: три способа во вкладках (СБП, Boosty, Bybit Pay).
 * Ссылки открываются в новой вкладке (на телефоне СБП — сразу в банке); QR-коды
 * показываются только на ПК (мышь), на сенсорных экранах их скрывает CSS.
 */
export const DonateBlock: React.FC = () => {
  const { t } = useI18n();
  const [active, setActive] = React.useState<Method>("sbp");
  const [zoomed, setZoomed] = React.useState<MethodInfo["qr"] | null>(null);
  const tabs = React.useRef<Record<Method, HTMLButtonElement | null>>({ sbp: null, boosty: null, crypto: null });
  const current = METHODS.find((m) => m.key === active) ?? METHODS[0];

  // стрелки ←/→ переключают вкладки (как у нативных табов)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = METHODS.findIndex((m) => m.key === active);
    const next = METHODS[(i + (e.key === "ArrowRight" ? 1 : METHODS.length - 1)) % METHODS.length];
    setActive(next.key);
    tabs.current[next.key]?.focus();
  };

  return (
    <section data-guide="donate" className="panel donate p-5 md:p-6" aria-labelledby="donate-title">
      <div className="donate-head">
        <span className="donate-cup" aria-hidden><Icon name="heart" size={22} /></span>
        <div className="min-w-0">
          <h2 id="donate-title" className="section-title">{t("donate.title")}</h2>
          <p className="mt-1 max-w-2xl text-[0.92rem] text-fg-2">{t("donate.hint")}</p>
        </div>
      </div>

      <div className="donate-tabs" role="tablist" aria-label={t("donate.title")} onKeyDown={onKey}>
        {METHODS.map((m) => (
          <button
            key={m.key}
            ref={(el) => {
              tabs.current[m.key] = el;
            }}
            type="button"
            role="tab"
            id={`donate-tab-${m.key}`}
            aria-selected={active === m.key}
            aria-controls={`donate-panel-${m.key}`}
            tabIndex={active === m.key ? 0 : -1}
            className={cn("donate-tab", active === m.key && "is-active")}
            onClick={() => setActive(m.key)}
          >
            <span className="donate-tab-mark" aria-hidden>{m.icon}</span>
            <span>{t(m.tab)}</span>
          </button>
        ))}
      </div>

      {/* key — каждая вкладка заново проигрывает плавное появление */}
      <div key={current.key} id={`donate-panel-${current.key}`} role="tabpanel" aria-labelledby={`donate-tab-${current.key}`} className={cn("donate-panel", current.qr && "has-qr")}>
        <div className="donate-info">
          <h3 className="donate-panel-title">{t(current.title)}</h3>
          <p className="donate-text">{t(current.text)}</p>
          <a className="donate-action" href={current.href} target="_blank" rel="noopener noreferrer">
            {t(current.action)}
            <Icon name="external" size={16} />
          </a>
        </div>
        {current.qr ? (
          <figure className="donate-qr">
            <button type="button" className="donate-qr-open" title={t("donate.zoom")} aria-label={`${current.qr.alt}: ${t("donate.zoom")}`} onClick={() => setZoomed(current.qr)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- статичная картинка из /api/v1/assets */}
              <img src={current.qr.src} alt={current.qr.alt} width={200} height={200} loading="lazy" />
            </button>
            <figcaption>{t("donate.scan")} · {t("donate.zoom")}</figcaption>
          </figure>
        ) : null}
      </div>
      {zoomed ? <QrLightbox qr={zoomed} onClose={() => setZoomed(null)} /> : null}
    </section>
  );
};

/** QR на весь экран: клик по фону, крестик или Esc закрывают. */
const QrLightbox: React.FC<{ qr: NonNullable<MethodInfo["qr"]>; onClose: () => void }> = ({ qr, onClose }) => {
  const { t } = useI18n();
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="qr-lightbox" role="dialog" aria-modal="true" aria-label={qr.alt} onClick={onClose}>
      <button type="button" className="qr-lightbox-close" aria-label={t("common.close")} onClick={onClose} autoFocus>
        <Icon name="close" size={18} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- статичная картинка из /api/v1/assets */}
      <img src={qr.src} alt={qr.alt} onClick={(e) => e.stopPropagation()} />
      <p>{t("donate.scan")}</p>
    </div>,
    document.body,
  );
};
