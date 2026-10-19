"use client";

import * as React from "react";

/** Фон раздела с плавной сменой + HUD-эффекты (сетка, сканлайны, зерно, виньетка). */
export const BackgroundLayer: React.FC<{ src: string | null }> = ({ src }) => {
  const [layers, setLayers] = React.useState<string[]>(src ? [src] : []);

  React.useEffect(() => {
    if (!src) return;
    setLayers((prev) => (prev[prev.length - 1] === src ? prev : [...prev.slice(-1), src]));
  }, [src]);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-neutral-950" aria-hidden>
      {layers.map((layer, idx) => (
        <div
          key={layer}
          className={`bg-layer bg-pos-default ${idx === layers.length - 1 && layers.length > 1 ? "bg-fade-in" : ""}`}
          style={{ backgroundImage: `url(${layer})` }}
          onAnimationEnd={() => setLayers((prev) => prev.slice(-1))}
        />
      ))}
      <div className="fx-overlay absolute inset-0" />
      <div className="fx-glow absolute inset-0" />
      <div className="fx-grid absolute inset-0" />
      <div className="fx-scanlines absolute inset-0" />
      <div className="fx-grain absolute inset-0" />
      <div className="fx-sweep absolute inset-x-0 top-0" />
      <div className="fx-vignette absolute inset-0" />
    </div>
  );
};
