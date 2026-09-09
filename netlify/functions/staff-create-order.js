import { createSupabaseAdminClient } from "./lib/operationalRequestAuth.js";
import { createStaffOrder } from "./lib/staffOrderCreation.js";

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return json(503, { error: "Staff order creation is not configured." });

  try {
    const result = await createStaffOrder(event, supabase);
    if (!result.ok) return json(result.statusCode, { error: result.message });
    return json(result.statusCode, { order: result.order, duplicate: result.duplicate });
  } catch (error) {
    console.error("[staff-create-order] request failed", {
      message: error instanceof Error ? error.message : "Unknown error",
      code: error?.code || "",
    });
    const statusCode = Number(error?.statusCode) || 500;
    return json(statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
      error: statusCode < 500 && error instanceof Error ? error.message : "The order could not be created.",
      code: error?.code || "",
    });
  }
}
