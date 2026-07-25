import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDateTime } from "../lib/dateFormatting";
import { listDeliveryAwareNotificationActivity } from "../lib/notificationActivityRepository";

function label(value = "") {
  return String(value || "").split("_").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "").join(" ");
}

function Value({ title, children }) {
  return <span><strong>{title}:</strong> {children || "—"}</span>;
}

function Attempt({ attempt }) {
  return (
    <li style={{ padding: "8px 0", borderTop: "1px solid #eef2f7", display: "grid", gap: "4px" }}>
      <strong>Attempt {attempt.attempt_number} · {label(attempt.outcome)}</strong>
      <span>Provider: {attempt.provider_key || "Internal"}</span>
      <span>Provider message ID: {attempt.provider_message_id || "—"}</span>
      <span>Retry classification: {label(attempt.retryability || "unknown")}</span>
      {attempt.failure_reason ? <span style={{ color: "#991b1b" }}>Failure: {attempt.failure_reason}</span> : null}
      <span>{formatDateTime(attempt.started_at)}{attempt.completed_at ? ` – ${formatDateTime(attempt.completed_at)}` : ""}</span>
    </li>
  );
}

function Delivery({ delivery }) {
  const attempts = Array.isArray(delivery.attempts) ? delivery.attempts : [];
  return (
    <section style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px", display: "grid", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <strong>{label(delivery.channel)} delivery</strong>
        <span style={{ fontWeight: 800 }}>{label(delivery.status)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "6px", fontSize: "13px" }}>
        <Value title="Recipient">{delivery.recipient_snapshot?.name || delivery.recipient_key}</Value>
        <Value title="Destination">{delivery.destination_snapshot?.address || delivery.destination_snapshot?.email || delivery.destination_snapshot?.phone || delivery.destination_key}</Value>
        <Value title="Provider">{delivery.provider_key || "Internal"}</Value>
        <Value title="Provider message ID">{delivery.provider_message_id}</Value>
        <Value title="Attempts">{delivery.attempt_count}</Value>
        <Value title="Queued">{formatDateTime(delivery.queued_at || delivery.created_at)}</Value>
        {delivery.sent_at ? <Value title="Sent">{formatDateTime(delivery.sent_at)}</Value> : null}
        {delivery.delivered_at ? <Value title="Delivered">{formatDateTime(delivery.delivered_at)}</Value> : null}
        {delivery.next_retry_at ? <Value title="Retry scheduled">{formatDateTime(delivery.next_retry_at)}</Value> : null}
      </div>
      {delivery.last_failure_reason ? (
        <div style={{ color: "#991b1b", fontSize: "13px" }}><strong>Failure:</strong> {delivery.last_failure_reason}</div>
      ) : null}
      {attempts.length ? <ol style={{ margin: 0, paddingLeft: "22px", fontSize: "13px" }}>{attempts.map((attempt) => <Attempt key={attempt.id} attempt={attempt} />)}</ol> : null}
    </section>
  );
}

export default function NotificationActivity() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listDeliveryAwareNotificationActivity().then((rows) => {
      if (active) {
        setRecords(rows);
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  return (
    <div style={{ maxWidth: "1240px", margin: "0 auto", padding: "24px", display: "grid", gap: "20px" }}>
      <header>
        <p style={{ margin: 0, color: "#64748b", fontSize: "12px", fontWeight: 800, textTransform: "uppercase" }}>Settings</p>
        <h1 style={{ margin: "8px 0 6px" }}>Notification Activity</h1>
        <p style={{ margin: 0, color: "#64748b" }}>Operational history across notifications, channel deliveries, attempts, retries, and provider outcomes.</p>
        <nav style={{ display: "flex", gap: "12px", marginTop: "14px" }}>
          <Link to="/admin/settings/notifications/policy">Policy</Link>
          <Link to="/admin/settings/notifications">Templates</Link>
        </nav>
      </header>

      {loading ? <p>Loading notification activity…</p> : null}
      {!loading && !records.length ? <section style={{ border: "1px dashed #d6dbe4", borderRadius: "20px", padding: "28px 22px" }}><strong>No notification activity yet.</strong></section> : null}
      <section style={{ display: "grid", gap: "12px" }}>
        {records.map((record) => (
          <article key={`${record.recordKind}:${record.id}`} style={{ border: "1px solid #e2e8f0", borderRadius: "16px", background: "#fff", padding: "16px", display: "grid", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
              <strong>{label(record.eventType)}</strong>
              <span>{formatDateTime(record.createdAt)}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px", fontSize: "14px" }}>
              <Value title="Notification state">{label(record.notificationStatus)}</Value>
              <Value title="Aggregate state">{label(record.aggregateState)}</Value>
              <Value title="Subject">{record.subjectId}</Value>
              <Value title="Policy version">{record.policySnapshot?.version}</Value>
            </div>
            {record.recordKind === "legacy" ? (
              <section style={{ background: "#f8fafc", borderRadius: "10px", padding: "12px", display: "grid", gap: "6px", fontSize: "13px" }}>
                <strong>Legacy activity record</strong>
                <Value title="Recipient">{record.recipient?.name || record.recipient?.email || record.recipient?.phone}</Value>
                <Value title="Template">{record.templateName}</Value>
                <Value title="Email subject">{record.generatedContent?.emailSubject}</Value>
                <Value title="Email body">{record.generatedContent?.emailBody}</Value>
                <Value title="SMS">{record.generatedContent?.smsMessage}</Value>
              </section>
            ) : record.deliveries.length ? record.deliveries.map((delivery) => <Delivery key={delivery.id} delivery={delivery} />) : <p style={{ margin: 0, color: "#64748b" }}>No channel Deliveries were created for this notification.</p>}
          </article>
        ))}
      </section>
    </div>
  );
}
