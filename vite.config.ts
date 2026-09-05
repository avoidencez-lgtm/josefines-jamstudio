import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    watch: { ignored: ["**/target/**", "**/src-tauri/**"] },
    port: 1420,
    strictPort: true,
  },
});
