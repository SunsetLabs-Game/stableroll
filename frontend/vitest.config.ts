import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Node environment only: everything under test here is pure logic. The
    // React pages are not unit-tested — CI builds them, which is what catches
    // the errors that matter for a shell with no business logic of its own.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
