import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { useStore } from "@/lib/store"
import { ThemeProvider } from "@/components/theme-provider.tsx"

// Dev-only handle so the app can be driven from the console or a test harness.
if (import.meta.env.DEV) Object.assign(window, { wink: useStore })

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light">
      <App />
    </ThemeProvider>
  </StrictMode>
)
