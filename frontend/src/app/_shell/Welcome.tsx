"use client";

import * as React from "react";
import { Icon, STORAGE_KEYS, readStorage, useT, writeStorage, type MessageKey } from "@/shared";

export interface WelcomeStep {
  title: MessageKey;
  hint: MessageKey;
  onClick: () => void;
}

/**
 * «С чего начать» на главной: три шага с кнопками. Скрывается навсегда (в этом браузере)
 * кнопкой «Скрыть»; до гидратации не рисуется, чтобы не мигать у тех, кто уже скрыл.
 */
export const Welcome: React.FC<{ steps: WelcomeStep[] }> = ({ steps }) => {
  const t = useT();
  const [hidden, setHidden] = React.useState(true);
  React.useEffect(() => setHidden(readStorage<boolean>(STORAGE_KEYS.welcomeDone, false)), []);
  if (hidden || !steps.length) return null;
  const dismiss = () => {
    writeStorage(STORAGE_KEYS.welcomeDone, true);
    setHidden(true);
  };
  return (
    <section className="panel welcome" aria-labelledby="welcome-title">
      <div className="welcome-head">
        <div className="min-w-0">
          <h2 id="welcome-title" className="panel-title">{t("welcome.title")}</h2>
          <p className="mt-0.5 text-sm text-fg-2">{t("welcome.hint")}</p>
        </div>
        <button type="button" className="btn btn-ghost h-9 min-h-0 shrink-0 px-3 text-sm" onClick={dismiss}>
          {t("welcome.dismiss")}
        </button>
      </div>
      <ol className="welcome-steps">
        {steps.map((s, i) => (
          <li key={s.title}>
            <button type="button" className="welcome-step" onClick={s.onClick}>
              <span className="welcome-num" aria-hidden>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="welcome-step-title">{t(s.title)}</span>
                <span className="welcome-step-hint">{t(s.hint)}</span>
              </span>
              <Icon name="chevronRight" size={16} className="welcome-arrow" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};
