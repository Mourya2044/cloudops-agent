import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  },
  resolve: {
    alias: {
      "cloudflare:workflows": path.resolve(
        __dirname,
        "tests/mocks/cloudflare-workflows.ts"
      ),
      "cloudflare:workers": path.resolve(
        __dirname,
        "tests/mocks/cloudflare-workers.ts"
      )
    }
  }
});
