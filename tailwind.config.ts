import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#fef8f3",
        "surface-dim": "#ded9d4",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f8f3ee",
        "surface-container": "#f3ede8",
        "surface-container-high": "#ede7e2",
        "surface-container-highest": "#e7e1dd",
        "surface-variant": "#e7e1dd",
        "on-surface": "#1d1b19",
        "on-surface-variant": "#53433f",
        outline: "#85736e",
        "outline-variant": "#d8c2bc",
        primary: "#8b4e3c",
        "on-primary": "#ffffff",
        "primary-container": "#e89b86",
        "on-primary-container": "#693223",
        "inverse-primary": "#ffb5a0",
        secondary: "#755843",
        "secondary-container": "#fdd5ba",
        tertiary: "#714f96",
        "tertiary-container": "#c49eec",
        error: "#ba1a1a",
        "error-container": "#ffdad6",
      },
      fontFamily: {
        playfair: ["var(--font-playfair)", "serif"],
        montserrat: ["var(--font-montserrat)", "sans-serif"],
      },
      borderRadius: {
        sm: "0.5rem",
        DEFAULT: "1rem",
        md: "1.5rem",
        lg: "2rem",
        xl: "3rem",
      },
      boxShadow: {
        glow: "0 8px 40px rgba(139, 78, 60, 0.12)",
        "glow-lg": "0 12px 48px rgba(139, 78, 60, 0.18)",
        "glow-md": "0 4px 24px rgba(255, 181, 160, 0.45)",
        "glow-ai": "0 12px 48px rgba(113, 79, 150, 0.18)",
        "glow-focus": "0 0 0 3px rgba(139, 78, 60, 0.15)",
      },
      animation: {
        "soft-rise": "soft-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        aurora: "aurora 32s ease-in-out infinite",
        "sheet-ascend": "sheet-ascend 0.32s cubic-bezier(0.22, 1, 0.36, 1)",
        "lavender-shimmer": "lavender-shimmer 3s linear infinite",
        "aurora-drift": "aurora-drift 20s ease infinite",
        "breathing-glow": "breathing-glow 4s ease-in-out infinite",
      },
      keyframes: {
        "soft-rise": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        aurora: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "sheet-ascend": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        "lavender-shimmer": {
          "0%": { backgroundPosition: "-200% center" },
          "100%": { backgroundPosition: "200% center" },
        },
        "aurora-drift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "breathing-glow": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.05)" },
        },
      },
      maxWidth: {
        content: "600px",
      },
    },
  },
  plugins: [],
};

export default config;
