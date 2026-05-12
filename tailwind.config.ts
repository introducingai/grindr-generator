import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./generation/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        grindr: {
          black: "#050006",
          panel: "#120713",
          pink: "#ff2ebd",
          hot: "#ff007f",
          green: "#9dff00",
          chrome: "#e8e8f0"
        }
      },
      boxShadow: {
        neon: "0 0 24px rgba(255, 46, 189, 0.35)",
        insetNeon: "inset 0 0 22px rgba(255, 46, 189, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;
