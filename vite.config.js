import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // GitHub Pages serves this demo from /web-consoles/, so built asset URLs need
  // that base. Dev keeps "/", so `npm run dev` still opens at localhost:3000.
  base: command === "build" ? "/web-consoles/" : "/",
  // The demo builds to dist-demo/ so it never overwrites the library in dist/.
  build: {
    outDir: "dist-demo",
  },
  server: {
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
}));
