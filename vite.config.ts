import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// בפיתוח מקומי (npm run dev): Vite על 5173 מעביר את /api לשרת על 5000
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: { "/api": "http://localhost:5000" },
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    sourcemap: false,
  },
});
