import { defineConfig } from "orval";

export default defineConfig({
  api: {
    input: "./specs/api/openapi.yaml",
    output: {
      target: "./packages/sdk/index.ts",
      schemas: "./packages/sdk/model",
      client: "fetch",
      mode: "split",
    },
  },
});