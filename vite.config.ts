import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

function git(args: string) {
  try {
    return execSync(`git ${args}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };

export default defineConfig({
  define: {
    __ARCANA_VERSION__: JSON.stringify(pkg.version),
    __ARCANA_COMMIT__: JSON.stringify(git("rev-parse HEAD")),
    __ARCANA_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react(), tailwindcss(), cloudflare()],
});
