import { supabase } from "./supabaseClient";

export async function getSmsUsageSummary(client = supabase) {
  const { data, error } = await client.rpc("get_sms_usage_summary", {});
  if (error) throw error;
  return data;
}

export async function updateSmsUsageSettings(
  { monthlyCap, warningPercent, allowOverage },
  client = supabase
) {
  const { data, error } = await client.rpc("update_sms_usage_settings", {
    p_monthly_cap: monthlyCap,
    p_warning_percent: warningPercent,
    p_allow_overage: Boolean(allowOverage),
  });
  if (error) throw error;
  return data;
}

// Pure presentation model so the alert logic is testable.
export function describeSmsUsage(summary) {
  if (!summary) return null;
  const cap = Number(summary.monthly_cap) || 0;
  const sent = Number(summary.sent_count) || 0;
  const overage = Number(summary.overage_count) || 0;
  const skipped = Number(summary.skipped_count) || 0;
  const threshold = Number(summary.warning_threshold) || cap;
  const atCap = sent >= cap;
  const level = atCap ? "cap" : sent >= threshold ? "warning" : "ok";
  const usageLine = `${Math.min(sent, cap)} of ${cap} texts used this month`;
  let alert = "";
  if (level === "cap") {
    alert = summary.allow_overage
      ? `Monthly text limit reached. Overage is on: ${overage} extra text${overage === 1 ? "" : "s"} sent so far.`
      : `Monthly text limit reached. New texts are paused until next month${skipped ? ` (${skipped} skipped; customers still get email where available)` : ""}.`;
  } else if (level === "warning") {
    alert = `Heads up: ${sent} of ${cap} texts used this month.`;
  }
  return { cap, sent, overage, skipped, threshold, level, usageLine, alert };
}
