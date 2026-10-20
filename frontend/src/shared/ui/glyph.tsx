import * as React from "react";
import { uiIcon, type UiIcon } from "@/shared/config/assets";
import { cn } from "@/shared/lib/utils";

/**
 * Иконка интерфейса: SVG с бэкенда как CSS-маска, цвет — currentColor
 * (по умолчанию акцент темы), поэтому она перекрашивается вместе с темой.
 */
export const UiGlyph: React.FC<{ icon: UiIcon; size?: number; className?: string; title?: string }> = ({ icon, size = 24, className, title }) => {
  const url = `url("${uiIcon(icon)}")`;
  return (
    <span
      className={cn("ui-glyph ui-icon", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ width: size, height: size, WebkitMaskImage: url, maskImage: url }}
    />
  );
};
