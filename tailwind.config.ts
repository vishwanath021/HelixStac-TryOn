import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#f4fbf9",
        sand: "#e7f4f1",
        card: "#ffffff",
        ink: "#12312e",
        muted: "#3e615c",
        line: "#d3e5e1",
        accent: "#e9897a",
      },
      fontFamily: {
        serif: ["var(--font-sans)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        lift: "0 12px 28px rgba(18, 49, 46, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
