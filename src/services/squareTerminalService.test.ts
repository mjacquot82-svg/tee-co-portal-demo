import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  createSquareTerminalPairingCode,
  getSquareTerminalPairingStatus,
} from "./squareTerminalService.js";

describe("Square Terminal Phase 1 pairing", () => {
  test("creates a pairing code through the authenticated server endpoint", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      async json() {
        return { registration: { status: "UNPAIRED", pairingCode: "ABCDEF" } };
      },
    }));
    const result = await createSquareTerminalPairingCode("Front Counter", {
      endpoint: "/terminal-test",
      accessToken: "owner-session-token",
      fetcher,
    });
    expect(result).toMatchObject({ status: "UNPAIRED", pairingCode: "ABCDEF" });
    expect(fetcher).toHaveBeenCalledWith("/terminal-test", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer owner-session-token" }),
      body: JSON.stringify({ deviceName: "Front Counter" }),
    }));
  });

  test("refreshes status without sending Square credentials", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      async json() {
        return { registration: { status: "PAIRED", squareDeviceId: "DEVICE-1" } };
      },
    }));
    const result = await getSquareTerminalPairingStatus({
      endpoint: "/terminal-test",
      accessToken: "owner-session-token",
      fetcher,
    });
    expect(result).toEqual({ status: "PAIRED", squareDeviceId: "DEVICE-1" });
    const request = fetcher.mock.calls[0][1];
    expect(request.method).toBe("GET");
    expect(JSON.stringify(request)).not.toContain("SQUARE_ACCESS_TOKEN");
  });

  test("server is owner-authenticated and limited to Devices API pairing", async () => {
    const source = await readFile(
      resolve(process.cwd(), "netlify/functions/square-terminal-device.js"),
      "utf8"
    );
    expect(source).toContain("supabase.auth.getUser(token)");
    expect(source).toContain('normalizeRole(data.user) !== "owner"');
    expect(source).toContain('squareRequest("/v2/devices/codes"');
    expect(source).toContain("/v2/devices/codes/${encodeURIComponent");
    expect(source).toContain('product_type: "TERMINAL_API"');
    expect(source).toContain('pairing_code: status === "PAIRED" ? "" : normalizeText(deviceCode.code)');
    expect(source).not.toContain("/v2/terminals/checkouts");
    expect(source).not.toMatch(/SQUARE_ACCESS_TOKEN\s*=\s*["'][^"']+/);
  });

  test("schema stores pairing state server-side", async () => {
    const schema = await readFile(
      resolve(process.cwd(), "supabase/square-terminal-device-registrations.sql"),
      "utf8"
    );
    for (const column of [
      "square_device_code_id", "pairing_code", "square_device_id",
      "square_location_id", "status", "pair_by", "paired_at", "created_at", "updated_at",
    ]) expect(schema).toContain(column);
    expect(schema).toContain("enable row level security");
    expect(schema).toContain("revoke all");
  });
});
