import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        reddit: resolve(__dirname, "src/domains/reddit.ts"),
        background: resolve(__dirname, "src/background.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "reddit") return "reddit.js";
          if (chunkInfo.name === "background") return "background.js";
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
});
