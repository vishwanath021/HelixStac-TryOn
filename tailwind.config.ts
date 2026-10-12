import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#f3f0f8",
        sand: "#e9e0f0",
        card: "#ffffff",
        ink: "#292330",
        muted: "#686171",
        line: "#dfd8e7",
        accent: "#b6a0c9",
        aubergine: "#3e304b",
      },
      fontFamily: {
        serif: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        lift: "0 8px 20px rgba(62, 48, 75, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
