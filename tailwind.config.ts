import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        card: "rgb(var(--card) / <alpha-value>)",
        elevated: "rgb(var(--elevated) / <alpha-value>)",
        line: "rgb(var(--line) / 0.10)",
        "line-strong": "rgb(var(--line) / 0.18)",
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          2: "rgb(var(--ink-2) / <alpha-value>)",
          3: "rgb(var(--ink-3) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "rgb(var(--gold) / <alpha-value>)",
          bright: "rgb(var(--gold-bright) / <alpha-value>)",
          deep: "rgb(var(--gold-deep) / <alpha-value>)",
          text: "rgb(var(--gold-text) / <alpha-value>)",
        },
        up: "rgb(var(--up) / <alpha-value>)",
        down: "rgb(var(--down) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
        steel: "rgb(var(--steel) / <alpha-value>)",
        // legacy aliases kept until the sweep removes the last usages
        background: "#0A0B10",
        foreground: "#F6F7FA",
      },
      fontFamily: {
        sans: ["Figtree", "var(--font-figtree)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Figtree", "var(--font-figtree)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Figtree", "var(--font-figtree)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        micro: ["10px", { lineHeight: "14px" }],
        meta: ["12.5px", { lineHeight: "18px" }],
        dense: ["13.5px", { lineHeight: "20px" }],
      },
      borderRadius: {
        control: "0.625rem",
        card: "0.875rem",
        modal: "1.25rem",
      },
      animation: {
        rise: "rise 0.22s cubic-bezier(0.23, 1, 0.32, 1) both",
        marquee: "marquee 40s linear infinite",
        "pulse-dot": "pulse-dot 2.4s ease-in-out infinite",
        // legacy alias — old components reference animate-rank-climb
        "rank-climb": "rise 0.3s cubic-bezier(0.23, 1, 0.32, 1) both",
        shimmer: "shimmer 1.4s linear infinite",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.35", transform: "scale(0.8)" },
        },
        shimmer: {
          from: { backgroundPosition: "100% 0" },
          to: { backgroundPosition: "-100% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
