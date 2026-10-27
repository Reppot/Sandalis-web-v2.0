"use client";

import * as React from "react";
import { roleColor, splitMentions, useMentionRoles, type MentionRole } from "@/features/mail/model";
import { Icon, cn, useT } from "@/shared";

/**
 * Поле текста с упоминаниями: набираешь «@» — снизу подсказка ролей Discord-сервера клана.
 * ↑/↓ — выбор, Enter/Tab — вставить, Esc — закрыть. Упомянутым ролям придёт письмо в почту сайта.
 */
export const MentionTextarea: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  /** Дополнительно к ролям — участники клана (@Ник). */
  people?: { user_id: string; name: string }[];
  /** Ctrl+Enter — отправить (комментарий). */
  onSubmit?: () => void;
}> = ({ value, onChange, placeholder, maxLength, className, people, onSubmit }) => {
  const t = useT();
  const clanRoles = useMentionRoles();
  const roles = React.useMemo<MentionRole[]>(
    () => [...clanRoles, ...(people ?? []).map((p) => ({ id: `user:${p.user_id}`, name: p.name, color: -1 }))],
    [clanRoles, people],
  );
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = React.useState<{ text: string; start: number } | null>(null);
  const [active, setActive] = React.useState(0);

  // «@слово» прямо перед курсором — то, что ищем
  const detect = (el: HTMLTextAreaElement | null = ref.current) => {
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart ?? 0);
    const m = before.match(/(^|\s)@([^\s@]{0,32})$/);
    setQuery(m ? { text: m[2], start: before.length - m[2].length - 1 } : null);
    setActive(0);
  };
  const options = query ? roles.filter((r) => r.name.toLowerCase().includes(query.text.toLowerCase())).slice(0, 8) : [];

  const pick = (role: MentionRole) => {
    const el = ref.current;
    if (!el || !query) return;
    const caret = el.selectionStart ?? value.length;
    const next = `${value.slice(0, query.start)}@${role.name} ${value.slice(caret)}`;
    onChange(maxLength ? next.slice(0, maxLength) : next);
    setQuery(null);
    const pos = query.start + role.name.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (onSubmit && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit();
      return;
    }
    if (!options.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setQuery(null);
    }
  };

  return (
    <div className="mention-box">
      <textarea
        ref={ref}
        className={cn("field", className)}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target);
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => (["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(e.key) && options.length ? undefined : detect())}
        onClick={() => detect()}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        aria-autocomplete="list"
        aria-expanded={options.length > 0}
      />
      {options.length ? (
        <ul className="mention-menu" role="listbox">
          {options.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === active}>
              <button type="button" className={cn("mention-option", i === active && "is-active")} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)} onMouseEnter={() => setActive(i)}>
                {r.color < 0 ? <Icon name="user" size={13} className="text-fg-3" /> : <span className="mention-dot" style={{ background: roleColor(r.color) }} />}
                <span className="truncate">@{r.name}</span>
                {r.id === "everyone" ? <span className="ml-auto text-xs text-fg-3">{t("mail.everyone")}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1 text-xs text-fg-3">{t("mail.mentionHint")}</p>
    </div>
  );
};

/** Текст с подсвеченными упоминаниями ролей. */
export const MentionText: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const roles = useMentionRoles(Boolean(text?.includes("@")));
  return (
    <p className={cn("whitespace-pre-line", className)}>
      {splitMentions(text, roles).map((part, i) =>
        part.role ? (
          <span key={i} className="mention-chip" style={{ color: roleColor(part.role.color), borderColor: roleColor(part.role.color) }}>{part.text}</span>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        ),
      )}
    </p>
  );
};
