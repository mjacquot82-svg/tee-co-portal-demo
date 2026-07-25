import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function tryRequire(packageName) {
  try {
    return require(packageName);
  } catch {
    return null;
  }
}

const tailwindPostcss = tryRequire("@tailwindcss/postcss");
const tailwindPackage = tryRequire("tailwindcss/package.json");
const tailwindMajorVersion = Number.parseInt(
  String(tailwindPackage?.version || "0").split(".")[0] || "0",
  10,
);

const tailwindPlugin =
  tailwindPostcss || (tailwindMajorVersion < 4 ? tryRequire("tailwindcss") : null);

export default {
  plugins: {
    ...(tailwindPlugin ? { [tailwindPostcss ? "@tailwindcss/postcss" : "tailwindcss"]: {} } : {}),
    autoprefixer: {},
  },
};
