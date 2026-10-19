"use client";

import * as React from "react";
import { Field } from "@/shared";
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
export const ItemCodeInput: React.FC<ItemCodeInputProps> = ({ value, onChange, label, placeholder = "Код или название: SS, Rmats, бинты…", required }) => {
  const listId = React.useId();
  const [options, setOptions] = React.useState<FoxholeItem[]>([]);

  React.useEffect(() => {
    const q = value.trim();
    if (!q) return setOptions([]);
    let cancelled = false;
    const handle = window.setTimeout(() => {
      catalogApi
        .search({ query: q, limit: 15 })
        .then((page) => !cancelled && setOptions(page.items))
        .catch(() => !cancelled && setOptions([]));
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [value]);

  return (
    <div className="space-y-1">
      <Field label={label} list={listId} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} required={required} autoComplete="off" />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name} · {o.englishName}
          </option>
        ))}
      </datalist>
    </div>
  );
};
