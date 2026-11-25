"use client";

import * as React from "react";

/** Low contrast code current behind the web workspace; desktop draws it in its native shell. */
export function AsciiBackdrop() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let frame = 0;
    let lastDraw = 0;
    let accent = "244 63 82";
    const stepX = 15;
    const stepY = 19;
    const glyphs = " .,:;=+<>/\\|{}[]()01#@*";
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;

    const resize = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    };
    const syncPalette = () => {
      accent = getComputedStyle(root).getPropertyValue("--accent-rgb").trim() || accent;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(document.documentElement);
    const paletteObserver = new MutationObserver(syncPalette);
    paletteObserver.observe(root, { attributes: true, attributeFilter: ["data-skin", "data-theme"] });
    resize();
    syncPalette();

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - lastDraw < 48) return;
      lastDraw = now;
      context.clearRect(0, 0, width, height);
      context.font = '11px "JetBrains Mono", "Cascadia Mono", Consolas, monospace';
      context.textBaseline = "middle";
      const phase = reducedMotion ? 0 : now * 0.000075;
      const columns = Math.ceil(width / stepX);
      const rows = Math.ceil(height / stepY);

      for (let row = 0; row < rows; row += 1) {
        const y = row * stepY;
        for (let column = 0; column < columns; column += 1) {
          const x = column * stepX;
          const nx = x / Math.max(width, 1);
          const ny = y / Math.max(height, 1);
          const current = ny - (0.48 + 0.21 * Math.sin(nx * 6.1 + phase) + 0.09 * Math.sin(nx * 12.7 - phase * 1.4));
          const river = Math.exp(-Math.pow(current / 0.24, 2));
          const curlX = (nx - (0.68 + Math.sin(phase * 0.55) * 0.08)) / 0.42;
          const curlY = (ny - 0.58) / 0.6;
          const radius = Math.hypot(curlX, curlY);
          const angle = Math.atan2(curlY, curlX);
          const eddy = (0.5 + 0.5 * Math.sin(radius * 27 - angle * 2.2 + phase * 3.4)) * Math.exp(-radius * 1.25);
          const motion = 0.5 + 0.5 * Math.sin(x * 0.009 + y * 0.006 + phase * 7 + Math.sin(y * 0.008 - phase));
          const density = river * (0.62 + motion * 0.22) + eddy * 0.36;
          if (density < 0.25) continue;
          const index = Math.min(glyphs.length - 1, Math.floor((density * 10 + motion * 5 + (column * 7 + row * 11) % 13) % glyphs.length));
          context.fillStyle = `rgb(${accent} / ${Math.min(0.17, 0.025 + density * 0.105)})`;
          context.fillText(glyphs[index], x, y);
        }
      }
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      paletteObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="ascii-backdrop" aria-hidden="true" />;
}
