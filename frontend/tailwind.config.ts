import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sindaris: {
          bg: "#0a0e17",
          panel: "#111827",
          border: "#1f2937",
          accent: "#3b82f6",
          text: "#e5e7eb",
          muted: "#6b7280",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;