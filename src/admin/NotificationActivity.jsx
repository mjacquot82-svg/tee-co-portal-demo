import { Link } from "react-router-dom";
import { formatDateTime } from "../lib/dateFormatting";
import { useNotificationActivity } from "../lib/notificationDeliveryService";

function buildRecipientLabel(record = {}) {
  const recipient = record.recipient || {};
  const recipientName = recipient.name || "Unknown recipient";
  const recipientAddress = recipient.email || recipient.phone || "";
  return recipientAddress ? `${recipientName} (${recipientAddress})` : recipientName;
}

function formatEventLabel(eventType = "") {
  return String(eventType || "")
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export default function NotificationActivity() {
  const records = useNotificationActivity();

  return (
    <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "24px", display: "grid", gap: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Settings
          </p>
          <h1 style={{ margin: "8px 0 6px" }}>Notification Activity</h1>
          <p style={{ margin: 0, color: "#64748b" }}>
            Auditable history of generated notification content and recipients.
          </p>
        </div>

        <Link
          to="/admin/settings/notifications"
          style={{
            border: "1px solid #d6dbe4",
            background: "#ffffff",
            color: "#334155",
            borderRadius: "12px",
            padding: "11px 14px",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Back to Templates
        </Link>
      </div>

      {!records.length ? (
        <section
          style={{
            background: "#ffffff",
            border: "1px dashed #d6dbe4",
            borderRadius: "20px",
            padding: "28px 22px",
          }}
        >
          <strong style={{ color: "#0f172a" }}>No notification activity yet.</strong>
          <p style={{ color: "#64748b", marginBottom: 0 }}>
            Notification records will appear here as workflow events are triggered.
          </p>
        </section>
      ) : (
        <section style={{ display: "grid", gap: "10px" }}>
          {records.map((record) => (
            <article
              key={record.id}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                background: "#ffffff",
                padding: "14px 16px",
                display: "grid",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <strong style={{ color: "#0f172a" }}>{formatEventLabel(record.eventType)}</strong>
                <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                  {formatDateTime(record.created_at)}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px", color: "#334155", fontSize: "14px" }}>
                <span><strong>Recipient:</strong> {buildRecipientLabel(record)}</span>
                <span><strong>Template:</strong> {record.templateName || record.templateType}</span>
              </div>

              <div style={{ display: "grid", gap: "6px", color: "#334155", fontSize: "13px" }}>
                <span><strong>Email Subject:</strong> {record.generatedContent?.emailSubject || "—"}</span>
                <span><strong>Email Body:</strong> {record.generatedContent?.emailBody || "—"}</span>
                <span><strong>SMS:</strong> {record.generatedContent?.smsMessage || "—"}</span>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
