import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        hover: "rgb(var(--color-hover) / <alpha-value>)",
        "brand-hover": "rgb(var(--color-brand-hover) / <alpha-value>)",
        brand: {
          DEFAULT: "rgb(var(--color-brand) / <alpha-value>)",
          dark: "rgb(var(--color-brand-dark) / <alpha-value>)",
          light: "rgb(var(--color-brand-light) / <alpha-value>)",
        },
        sage: {
          DEFAULT: "rgb(var(--color-sage) / <alpha-value>)",
          dark: "rgb(var(--color-sage-dark) / <alpha-value>)",
          light: "rgb(var(--color-sage-light) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "rgb(var(--color-gold) / <alpha-value>)",
          dark: "rgb(var(--color-gold-dark) / <alpha-value>)",
          light: "rgb(var(--color-gold-light) / <alpha-value>)",
        },
      },
      boxShadow: { card: "0 12px 32px rgba(20, 43, 74, 0.08)" },
    },
  },
  plugins: [],
};
export default config;
