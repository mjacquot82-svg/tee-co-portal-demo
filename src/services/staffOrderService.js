import { supabase } from "../lib/supabaseClient";

export async function createStaffOrder(input) {
  const sessionResult = await supabase?.auth.getSession();
  const accessToken = sessionResult?.data?.session?.access_token;
  if (!accessToken) throw new Error("Your staff session expired. Sign in again before creating the order.");

  const response = await fetch("/.netlify/functions/staff-create-order", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "The order could not be created."), { code: data.code || "" });
  return data;
}
