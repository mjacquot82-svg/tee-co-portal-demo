# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Test commands

- `npm test` or `npm run test:vitest` runs the Vitest unit and component
  tests configured under `src/`.
- `npm run test:playwright` runs the Playwright suite under `tests/`, including
  the Notification Engine Twilio SMS adapter tests.
- `npm run verify` runs both suites in sequence and is the complete test
  verification command.

Playwright browser binaries must be installed before running its suite. If
needed, install them with `npx playwright install`.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
