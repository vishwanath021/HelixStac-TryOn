import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#f3ece3",
        sand: "#e7d9c8",
        card: "#fffdfb",
        ink: "#241c16",
        muted: "#7a6a5c",
        line: "#e4d5c6",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        lift: "0 16px 40px rgba(60, 36, 16, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
