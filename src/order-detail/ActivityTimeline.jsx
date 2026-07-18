import { formatDateTime } from "../lib/dateFormatting";
import { formatWorkflowTimelineEvent } from "../orders/workflowPresentation";

export default function ActivityTimeline({ events = [], compact = false, collapsedByDefault = false }) {
  const sectionPadding = compact ? "20px" : "24px";
  const headerSpacing = compact ? "14px" : "18px";
  const timelineGap = compact ? "8px" : "10px";
  const itemPadding = compact ? "10px 12px" : "12px";
  const metaMarginTop = compact ? "3px" : "4px";

  const timelineContent = !events.length ? (
    <p style={{ color: "#94a3b8" }}>No activity recorded yet.</p>
  ) : (
    <div style={{ display: "grid", gap: timelineGap }}>
      {events.map((event, index) => {
        const formatted = formatWorkflowTimelineEvent(event);
        const borderColor =
          formatted.tone === "danger" ? "#b91c1c" :
          formatted.tone === "warning" ? "#ea580c" :
          formatted.tone === "success" ? "#16a34a" :
          formatted.tone === "info" ? "#2563eb" : "#171717";
        const background =
          formatted.tone === "danger" ? "#fff5f5" :
          formatted.tone === "warning" ? "#fff7ed" :
          formatted.tone === "success" ? "#f0fdf4" :
          formatted.tone === "info" ? "#eff6ff" : "#f8fafc";

        return (
          <article
            key={event.id || index}
            data-testid="activity-timeline-item"
            data-event-type={event.type || event.event_type || ""}
            style={{ borderLeft: `4px solid ${borderColor}`, background, borderRadius: "12px", padding: itemPadding }}
          >
            <strong data-testid="activity-timeline-item-note">{formatted.title}</strong>
            <div data-testid="activity-timeline-item-meta" style={{ marginTop: metaMarginTop, color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
              {event.staff_name || "Unknown Staff"}{event.staff_role ? ` (${event.staff_role})` : ""}
              {event.created_at ? ` • ${formatDateTime(event.created_at)}` : ""}
            </div>
          </article>
        );
      })}
    </div>
  );

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
      {collapsedByDefault ? (
        <details data-testid="activity-timeline-disclosure">
          <summary style={{ cursor: "pointer", fontWeight: 800, color: "#0f172a" }}>
            Activity Timeline ({events.length})
          </summary>
          <p style={{ margin: "8px 0 14px", color: "#64748b" }}>
            Open for payment, production, and pickup history.
          </p>
          {timelineContent}
        </details>
      ) : (
        <>
          <div style={{ marginBottom: headerSpacing }}>
            <h2 style={{ margin: "0 0 4px" }}>Activity Timeline</h2>
            <p style={{ margin: 0, color: "#64748b" }}>Operational event history for payments, production, and pickup workflow.</p>
          </div>
          {timelineContent}
        </>
      )}
    </section>
  );
}
