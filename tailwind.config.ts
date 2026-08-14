import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        ink: "var(--ink)",
        dim: "var(--ink-dim)",
        mute: "var(--ink-mute)",
        mint: "var(--mint)",
        amber: "var(--amber)",
        danger: "var(--danger)",
        hairline: "var(--hairline)",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        money: ["var(--font-money)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
