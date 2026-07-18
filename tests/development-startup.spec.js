// @ts-check
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

test("development HTML loads the established application entry point", () => {
  const html = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf8");

  expect(html).toContain('src="/src/main.jsx"');
  expect(html).not.toContain('src="/src/main.tsx"');
});
