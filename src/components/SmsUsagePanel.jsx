import { useEffect, useState } from "react";
import {
  describeSmsUsage,
  getSmsUsageSummary,
  updateSmsUsageSettings,
} from "../lib/smsUsageStore";

const alertStyle = (level) => ({
  padding: "10px 12px",
  borderRadius: "10px",
  background: level === "cap" ? "#fef2f2" : "#fffbeb",
  color: level === "cap" ? "#991b1b" : "#92400e",
  fontSize: "14px",
});

function useSmsUsage() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getSmsUsageSummary()
      .then((data) => active && setSummary(data))
      .catch((err) => active && setError(err?.message || String(err)));
    return () => { active = false; };
  }, []);
  return { summary, setSummary, error };
}

// Small banner for the owner dashboard. Renders nothing unless at warning/cap,
// and nothing at all if SMS usage tracking is not installed.
export function SmsUsageAlert() {
  const { summary } = useSmsUsage();
  const model = describeSmsUsage(summary);
  if (!model || model.level === "ok") return null;
  return <div role="alert" style={alertStyle(model.level)}>{model.alert}</div>;
}

export default function SmsUsagePanel() {
  const { summary, setSummary, error } = useSmsUsage();
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState("");
  const model = describeSmsUsage(summary);

  useEffect(() => {
    if (summary && !draft) {
      setDraft({
        monthlyCap: summary.monthly_cap,
        warningPercent: summary.warning_percent,
        allowOverage: summary.allow_overage,
      });
    }
  }, [summary, draft]);

  if (error) {
    return (
      <section style={{ padding: "14px", border: "1px solid #e7e5e4", borderRadius: "12px" }}>
        <h2 style={{ margin: "0 0 6px", fontSize: "18px" }}>Text message usage</h2>
        <p style={{ margin: 0, color: "#78716c", fontSize: "14px" }}>Text usage isn't available here (owner only, or not set up yet).</p>
      </section>
    );
  }
  if (!model || !draft) return null;

  async function save() {
    setStatus("Saving…");
    try {
      await updateSmsUsageSettings({
        monthlyCap: Number(draft.monthlyCap),
        warningPercent: Number(draft.warningPercent),
        allowOverage: draft.allowOverage,
      });
      setSummary(await getSmsUsageSummary());
      setStatus("Saved.");
    } catch (err) {
      setStatus(err?.message || String(err));
    }
  }

  return (
    <section aria-label="Text message usage" style={{ padding: "14px", border: "1px solid #e7e5e4", borderRadius: "12px", display: "grid", gap: "10px" }}>
      <h2 style={{ margin: 0, fontSize: "18px" }}>Text message usage</h2>
      <p style={{ margin: 0, fontWeight: 700 }}>{model.usageLine}</p>
      {summary.allow_overage || model.overage ? (
        <p style={{ margin: 0, fontSize: "14px" }}>Overage texts this month: {model.overage}</p>
      ) : null}
      {model.skipped ? (
        <p style={{ margin: 0, fontSize: "14px" }}>Texts skipped because of the limit: {model.skipped}</p>
      ) : null}
      {model.alert ? <div role="alert" style={alertStyle(model.level)}>{model.alert}</div> : null}
      <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", alignItems: "center", fontSize: "14px" }}>
        <label>Monthly limit{" "}
          <input type="number" min="0" value={draft.monthlyCap} style={{ width: "90px" }}
            onChange={(e) => setDraft({ ...draft, monthlyCap: e.target.value })} />
        </label>
        <label>Warn at (%){" "}
          <input type="number" min="1" max="100" value={draft.warningPercent} style={{ width: "70px" }}
            onChange={(e) => setDraft({ ...draft, warningPercent: e.target.value })} />
        </label>
        <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input type="checkbox" checked={draft.allowOverage}
            onChange={(e) => setDraft({ ...draft, allowOverage: e.target.checked })} />
          Keep sending past the limit (overage)
        </label>
        <button type="button" onClick={save}>Save</button>
        {status ? <span role="status">{status}</span> : null}
      </div>
    </section>
  );
}
