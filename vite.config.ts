import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api/stationinfo": {
        target: "https://aviationweather.gov",
        changeOrigin: true,
        secure: true,
        rewrite: () => "/api/data/stationinfo",
      },
    },
  },
  preview: {
    proxy: {
      "/api/stationinfo": {
        target: "https://aviationweather.gov",
        changeOrigin: true,
        secure: true,
        rewrite: () => "/api/data/stationinfo",
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
