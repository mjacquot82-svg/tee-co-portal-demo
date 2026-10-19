import { afterEach, describe, expect, test, vi } from "vitest";
import {
  configureOrderApprovalServiceForTests,
  decideOrderApproval,
  isApprovalServerBacked,
  isWellFormedApprovalToken,
  loadOrderApproval,
  loadOrderApprovalPreviews,
} from "./orderApprovalService";

const TOKEN = "0123456789abcdef".repeat(4);

afterEach(() => configureOrderApprovalServiceForTests());

describe("order approval service", () => {
  test("token format check", () => {
    expect(isWellFormedApprovalToken(TOKEN)).toBe(true);
    expect(isWellFormedApprovalToken("")).toBe(false);
    expect(isWellFormedApprovalToken("123")).toBe(false);
    expect(isWellFormedApprovalToken(`${TOKEN}0`)).toBe(false);
    expect(isWellFormedApprovalToken("g".repeat(64))).toBe(false);
  });

  test("server mode follows Supabase configuration", () => {
    configureOrderApprovalServiceForTests({ client: { rpc: vi.fn() }, configured: false });
    expect(isApprovalServerBacked()).toBe(false);
    configureOrderApprovalServiceForTests({ client: { rpc: vi.fn() }, configured: true });
    expect(isApprovalServerBacked()).toBe(true);
  });

  test("loads only through get_order_approval with the token", async () => {
    const rpc = vi.fn(async () => ({ data: { order_number: "TC-1", decided: false }, error: null }));
    configureOrderApprovalServiceForTests({ client: { rpc }, configured: true });
    await expect(loadOrderApproval("TC-1", TOKEN)).resolves.toEqual({ order_number: "TC-1", decided: false });
    expect(rpc).toHaveBeenCalledWith("get_order_approval", { p_order_number: "TC-1", p_token: TOKEN });
  });

  test("malformed token never calls the database", async () => {
    const rpc = vi.fn();
    configureOrderApprovalServiceForTests({ client: { rpc }, configured: true });
    await expect(loadOrderApproval("TC-1", "abc")).rejects.toThrow(/not valid or has expired/);
    await expect(decideOrderApproval("TC-1", "abc", "approve")).rejects.toThrow(/not valid or has expired/);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("database errors become friendly messages", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: "28000", message: "x" } })
      .mockResolvedValueOnce({ data: null, error: { code: "P0001", message: "This approval link has already been used." } })
      .mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "internal detail" } });
    configureOrderApprovalServiceForTests({ client: { rpc }, configured: true });
    await expect(loadOrderApproval("TC-1", TOKEN)).rejects.toThrow("This approval link is not valid or has expired.");
    await expect(decideOrderApproval("TC-1", TOKEN, "approve")).rejects.toThrow("already been used");
    await expect(decideOrderApproval("TC-1", TOKEN, "request_changes")).rejects.toThrow("Unable to record your decision right now.");
  });

  test("decision is sent to submit_order_approval; unknown decisions are refused", async () => {
    const rpc = vi.fn(async () => ({ data: { decided: true, decision: "approve" }, error: null }));
    configureOrderApprovalServiceForTests({ client: { rpc }, configured: true });
    await decideOrderApproval("TC-1", TOKEN, "approve", "Looks good");
    expect(rpc).toHaveBeenCalledWith("submit_order_approval", {
      p_order_number: "TC-1",
      p_token: TOKEN,
      p_decision: "approve",
      p_note: "Looks good",
    });
    await expect(decideOrderApproval("TC-1", TOKEN, "delete")).rejects.toThrow("Unknown decision.");
  });

  test("previews come from the Netlify function and failures are harmless", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ files: [{ id: "f1", url: "https://signed.example/a" }, { id: "f2", url: "javascript:alert(1)" }] }),
    }));
    configureOrderApprovalServiceForTests({ client: { rpc: vi.fn() }, configured: true, fetchImpl });
    await expect(loadOrderApprovalPreviews("TC-1", TOKEN)).resolves.toEqual({ f1: "https://signed.example/a" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("/.netlify/functions/order-approval-previews");
    expect(JSON.parse(init.body)).toEqual({ orderNumber: "TC-1", token: TOKEN });

    configureOrderApprovalServiceForTests({ client: { rpc: vi.fn() }, configured: true, fetchImpl: vi.fn(async () => { throw new Error("offline"); }) });
    await expect(loadOrderApprovalPreviews("TC-1", TOKEN)).resolves.toEqual({});
  });
});
