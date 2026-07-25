import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import { listNotificationTemplates } from "../lib/notificationTemplatesStore";
import {
  listCurrentNotificationPolicies,
  listPublishedTemplateAssignments,
  saveNotificationPolicyVersion,
  validateNotificationPolicyDraft,
} from "../lib/notificationPolicyAdministration";

const channels = [
  ["email_enabled", "Email", "email"],
  ["sms_enabled", "SMS", "sms"],
  ["staff_notification_enabled", "Staff notification", "staff"],
];
const audiences = [
  ["customer_audience_enabled", "Customer audience"],
  ["staff_audience_enabled", "Staff audience"],
  ["owner_audience_enabled", "Owner audience"],
];

function Check({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "14px" }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export default function NotificationPolicies() {
  const [policies, setPolicies] = useState([]);
  const [expanded, setExpanded] = useState("");
  const [status, setStatus] = useState({ kind: "loading", message: "Loading policies…" });
  const [templateAssignments, setTemplateAssignments] = useState([]);
  const templates = listNotificationTemplates();

  useEffect(() => {
    let active = true;
    Promise.all([listCurrentNotificationPolicies(), listPublishedTemplateAssignments()])
      .then(([rows, assignments]) => {
        if (!active) return;
        setPolicies(rows);
        setTemplateAssignments(assignments);
        setStatus({ kind: "", message: "" });
      })
      .catch((error) => active && setStatus({ kind: "error", message: error.message }));
    return () => { active = false; };
  }, []);

  function update(eventType, field, value) {
    setPolicies((current) => current.map((policy) => (
      policy.event_type === eventType ? { ...policy, [field]: value } : policy
    )));
  }

  function assign(eventType, channel, value) {
    setPolicies((current) => current.map((policy) => (
      policy.event_type === eventType
        ? {
            ...policy,
            channel_template_assignments: {
              ...policy.channel_template_assignments,
              [channel]: value,
            },
          }
        : policy
    )));
  }

  async function save(policy) {
    const errors = validateNotificationPolicyDraft(policy, templates);
    if (errors.length) {
      setStatus({ kind: "error", message: errors.join(" ") });
      return;
    }
    setStatus({ kind: "saving", message: `Saving ${policy.event_label}…` });
    try {
      const actor = getActiveStaffUser();
      const saved = await saveNotificationPolicyVersion(policy, {
        updatedBy: actor?.id || actor?.name || "owner",
      });
      setPolicies((current) => current.map((item) => (
        item.event_type === policy.event_type
          ? { ...item, ...saved, persisted: true }
          : item
      )));
      setStatus({ kind: "success", message: `${policy.event_label} policy saved as version ${saved.version}.` });
    } catch (error) {
      setStatus({ kind: "error", message: error.message });
    }
  }

  return (
    <div style={{ padding: "32px", maxWidth: "980px", display: "grid", gap: "20px" }}>
      <header>
        <p style={{ margin: "0 0 4px", color: "#78716c", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>Settings</p>
        <h1 style={{ margin: "0 0 8px" }}>Notification Policy</h1>
        <p style={{ color: "#57534e", margin: 0 }}>
          Configure once how each business event should notify its audiences. Message content remains in Templates.
        </p>
        <nav style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
          <Link to="/admin/settings/notifications">Templates</Link>
          <Link to="/admin/settings/notifications/activity">Activity</Link>
        </nav>
      </header>

      {status.message ? (
        <div role="status" style={{ padding: "10px 12px", borderRadius: "10px", background: status.kind === "error" ? "#fef2f2" : "#f0fdf4", color: status.kind === "error" ? "#991b1b" : "#166534" }}>
          {status.message}
        </div>
      ) : null}

      <section style={{ display: "grid", gap: "10px" }}>
        {policies.map((policy) => {
          const open = expanded === policy.event_type;
          return (
            <article key={policy.event_type} style={{ border: "1px solid #e2e8f0", borderRadius: "14px", background: "#fff", overflow: "hidden" }}>
              <button type="button" aria-expanded={open} onClick={() => setExpanded(open ? "" : policy.event_type)} style={{ width: "100%", border: 0, background: "transparent", padding: "15px 16px", display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
                <strong>{policy.event_label}</strong>
                <span>{policy.enabled ? "Enabled" : "Disabled"} · v{policy.version || 1} {open ? "▲" : "▼"}</span>
              </button>
              {open ? (
                <div style={{ borderTop: "1px solid #e2e8f0", padding: "18px", display: "grid", gap: "18px" }}>
                  <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                    <Check label="Enabled" checked={policy.enabled} onChange={(value) => update(policy.event_type, "enabled", value)} />
                    <Check label="Automatic delivery" checked={policy.delivery_mode === "automatic"} onChange={(value) => update(policy.event_type, "delivery_mode", value ? "automatic" : "approval_required")} />
                  </div>
                  <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
                    <legend>Audiences</legend>
                    <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                      {audiences.map(([field, label]) => <Check key={field} label={label} checked={policy[field]} onChange={(value) => update(policy.event_type, field, value)} />)}
                    </div>
                  </fieldset>
                  <fieldset style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px", display: "grid", gap: "12px" }}>
                    <legend>Channels and templates</legend>
                    {channels.map(([field, label, channel]) => (
                      <div key={field} style={{ display: "grid", gridTemplateColumns: "minmax(170px, 1fr) minmax(240px, 2fr)", gap: "12px", alignItems: "center" }}>
                        <Check label={label} checked={policy[field]} onChange={(value) => update(policy.event_type, field, value)} />
                        <select aria-label={`${label} template`} value={policy.channel_template_assignments[channel] || ""} onChange={(event) => assign(policy.event_type, channel, event.target.value)} style={{ padding: "9px", borderRadius: "8px", border: "1px solid #d6d3d1" }}>
                          <option value="">No template assigned</option>
                          {templateAssignments.map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.name} · v{template.version}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </fieldset>
                  <div>
                    <button type="button" onClick={() => save(policy)} disabled={status.kind === "saving"} style={{ padding: "10px 16px", border: 0, borderRadius: "9px", background: "#0f766e", color: "#fff", fontWeight: 800 }}>
                      Save Policy
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}
