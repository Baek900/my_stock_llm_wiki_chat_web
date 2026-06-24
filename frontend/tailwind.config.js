/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "on-primary": "var(--color-on-primary)",
        "primary-container": "var(--color-primary-container)",
        "on-primary-container": "var(--color-on-primary-container)",
        
        secondary: "var(--color-secondary)",
        "on-secondary": "var(--color-on-secondary)",
        "secondary-container": "var(--color-secondary-container)",
        "on-secondary-container": "var(--color-on-secondary-container)",
        
        tertiary: "var(--color-tertiary)",
        "on-tertiary": "var(--color-on-tertiary)",
        "tertiary-container": "var(--color-tertiary-container)",
        "on-tertiary-container": "var(--color-on-tertiary-container)",
        
        background: "var(--color-background)",
        "on-background": "var(--color-on-background)",
        
        surface: "var(--color-surface)",
        "on-surface": "var(--color-on-surface)",
        "on-surface-variant": "var(--color-on-surface-variant)",
        
        "surface-container-lowest": "var(--color-surface-container-lowest)",
        "surface-container-low": "var(--color-surface-container-low)",
        "surface-container": "var(--color-surface-container)",
        "surface-container-high": "var(--color-surface-container-high)",
        "surface-container-highest": "var(--color-surface-container-highest)",
        
        outline: "var(--color-outline)",
        "outline-variant": "var(--color-outline-variant)",
        
        "primary-fixed": "#dde1ff",
        "primary-fixed-dim": "#b8c3ff",
        "on-primary-fixed": "#001355",
        "on-primary-fixed-variant": "#0035bd",
        
        "secondary-fixed": "#ebdcff",
        "secondary-fixed-dim": "#d4bbff",
        "on-secondary-fixed": "#270058",
        "on-secondary-fixed-variant": "#5d00c2",
        
        "tertiary-fixed": "#ffdbc8",
        "tertiary-fixed-dim": "#ffb68b",
        "on-tertiary-fixed": "#321200",
        "on-tertiary-fixed-variant": "#753400",
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px"
      },
      spacing: {
        "unit-lg": "24px",
        "unit-xs": "4px",
        "unit-md": "16px",
        "grid-margin": "24px",
        "unit-sm": "8px",
        "sidebar-width": "280px",
        "source-pane-width": "35%",
        "content-pane-width": "65%",
        "gutter": "16px"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      }
    },
  },
  plugins: [],
}
