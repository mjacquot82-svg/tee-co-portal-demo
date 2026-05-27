import { formatDateTime } from "../lib/dateFormatting";

export default function ActivityTimeline({ events = [], compact = false }) {
  const sectionPadding = compact ? "20px" : "24px";
  const headerSpacing = compact ? "14px" : "18px";
  const timelineGap = compact ? "8px" : "10px";
  const itemPadding = compact ? "10px 12px" : "12px";
  const metaMarginTop = compact ? "3px" : "4px";

  return (
    <section
      data-testid="activity-timeline"
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "20px",
        padding: sectionPadding,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ marginBottom: headerSpacing }}>
        <h2 style={{ margin: "0 0 4px" }}>Activity Timeline</h2>
        <p style={{ margin: 0, color: "#64748b" }}>
          Operational event history for payments, production, and pickup workflow.
        </p>
      </div>

      {!events.length ? (
        <p style={{ color: "#94a3b8" }}>
          No activity recorded yet.
        </p>
      ) : (
        <div style={{ display: "grid", gap: timelineGap }}>
          {events.map((event, index) => (
            <article
              key={event.id || index}
              data-testid="activity-timeline-item"
              data-event-type={event.type || event.event_type || ""}
              style={{
                borderLeft: event.type === "canceled" ? "4px solid #b91c1c" : "4px solid #171717",
                background: event.type === "canceled" ? "#fff5f5" : "#f8fafc",
                borderRadius: "12px",
                padding: itemPadding,
              }}
            >
              <strong data-testid="activity-timeline-item-note">
                {event.type === "canceled" ? "Canceled: " : ""}
                {event.note || "Order activity recorded."}
              </strong>

              <div
                data-testid="activity-timeline-item-meta"
                style={{
                  marginTop: metaMarginTop,
                  color: "#64748b",
                  fontSize: "13px",
                  fontWeight: 700,
                }}
              >
                {event.staff_name || "Unknown Staff"}
                {event.staff_role
                  ? ` (${event.staff_role})`
                  : ""}

                {event.created_at
                  ? ` • ${formatDateTime(event.created_at)}`
                  : ""}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
