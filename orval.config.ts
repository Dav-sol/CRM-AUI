import { defineConfig } from "orval";

export default defineConfig({
  api: {
    input: {
      target: "./specs/api/openapi.yaml",
      parserOptions: { externalRefs: { allow: ["*"] } },
    },
    output: {
      target: "./packages/sdk/index.ts",
      schemas: "./packages/sdk/model",
      client: "fetch",
      mode: "split",
      baseUrl: "/api/v1",
    },
  },
});