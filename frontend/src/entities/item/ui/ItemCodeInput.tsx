"use client";

import * as React from "react";
import { Input } from "@/shared";
import { catalogApi } from "@/entities/item/api/catalogApi";
import type { FoxholeItem } from "@/entities/item/model/types";

interface ItemCodeInputProps {
  value: string;
  onChange: (code: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

/** Поле кода предмета с подсказками из каталога (код, рус./англ. название). */
export const ItemCodeInput: React.FC<ItemCodeInputProps> = ({
  value,
  onChange,
  label,
  placeholder = "Код или название: SS, Rmats, бинты…",
  required,
}) => {
  const listId = React.useId();
  const [options, setOptions] = React.useState<FoxholeItem[]>([]);

  React.useEffect(() => {
    const q = value.trim();
    if (q.length < 1) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      catalogApi
        .search({ query: q, limit: 15 })
        .then((page) => {
          if (!cancelled) setOptions(page.items);
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [value]);

  const matched = options.find((o) => o.code === value);

  return (
    <div className="space-y-1">
      <Input
        label={label}
        list={listId}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name} · {o.englishName}
          </option>
        ))}
      </datalist>
      {matched && (
        <p className="text-[11px] text-sindaris-muted font-mono">
          {matched.name} · ящик {matched.crateSize} шт
        </p>
      )}
    </div>
  );
};
