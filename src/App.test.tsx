import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import App from "./App";

describe("App", () => {
  it("renders the platform shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /platform application shell/i })).toBeInTheDocument();
  });
});
