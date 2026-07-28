import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import ProductionActionPanel from "./ProductionActionPanel";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const action = {
  key: "start_printing",
  label: "Start Printing",
  targetStatus: "In Production",
};

describe("ProductionActionPanel business action feedback", () => {
  it("disables immediately, shows progress, and ignores duplicate clicks", async () => {
    const operation = deferred();
    const onRunAction = vi.fn(() => operation.promise);
    render(
      <ProductionActionPanel
        order={{ order_number: "TC-100", status: "Awaiting Production" }}
        actions={[action]}
        onRunAction={onRunAction}
      />
    );

    const button = screen.getByTestId("workflow-action-button");
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onRunAction).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveTextContent("Starting Production...");

    operation.resolve();
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).toHaveTextContent("Start Production");
  });

  it("restores the action and displays a retryable error after failure", async () => {
    const operation = deferred();
    render(
      <ProductionActionPanel
        order={{ order_number: "TC-101", status: "Awaiting Production" }}
        actions={[action]}
        onRunAction={() => operation.promise}
      />
    );

    const button = screen.getByTestId("workflow-action-button");
    fireEvent.click(button);
    operation.reject(new Error("Production update failed."));

    expect(await screen.findByRole("alert")).toHaveTextContent("Production update failed.");
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent("Start Production");
  });
});
