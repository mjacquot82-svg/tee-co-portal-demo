import { useMemo, useState } from "react";
import { formatDateTimeParts, formatShortDate } from "../lib/dateFormatting";
import { useCustomerTimeline } from "../lib/customerTimelineStore";
import "./CustomerTimelineSection.css";

function formatMetadataLabel(key) {
  return String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatMetadataValue(value) {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return String(entry || "").trim();
        }

        return Object.entries(entry)
          .map(([key, nestedValue]) => `${formatMetadataLabel(key)}: ${formatMetadataValue(nestedValue)}`)
          .filter(Boolean)
          .join(" | ");
      })
      .filter(Boolean)
      .join(", ");
  }

  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, nestedValue]) => `${formatMetadataLabel(key)}: ${formatMetadataValue(nestedValue)}`)
      .filter(Boolean)
      .join(" | ");
  }

  return "";
}

function getVisibleMetadataEntries(metadata = {}) {
  return Object.entries(metadata)
    .map(([key, value]) => ({
      key,
      label: formatMetadataLabel(key),
      value: formatMetadataValue(value),
    }))
    .filter((entry) => Boolean(entry.value));
}

function groupTimelineEvents(events = []) {
  return events.reduce((groups, event) => {
    const groupLabel = formatShortDate(event.timestamp);
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.label === groupLabel) {
      lastGroup.events.push(event);
      return groups;
    }

    return [...groups, { label: groupLabel, events: [event] }];
  }, []);
}

function buildTimelineSearchText(event) {
  const metadataEntries = getVisibleMetadataEntries(event.metadata);

  return [
    event.summary,
    event.eventType,
    event.actor?.label,
    event.actor?.name,
    ...metadataEntries.map((entry) => `${entry.label} ${entry.value}`),
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function TimelineRow({ event }) {
  const metadataEntries = getVisibleMetadataEntries(event.metadata);
  const timestampParts = formatDateTimeParts(event.timestamp);
  const actorLabel = event.actor?.label || event.actor?.name || "";

  return (
    <article className="customer-timeline-row">
      <div className="customer-timeline-time">
        <strong>{timestampParts.time}</strong>
        <span>{timestampParts.date}</span>
      </div>

      <div className="customer-timeline-body">
        <div className="customer-timeline-row-header">
          <span className="customer-timeline-event-type">{event.eventType}</span>
          {actorLabel ? <span className="customer-timeline-actor">{actorLabel}</span> : null}
        </div>

        <p className="customer-timeline-summary">{event.summary}</p>

        {metadataEntries.length ? (
          <div className="customer-timeline-metadata">
            {metadataEntries.map((entry) => (
              <span key={`${event.id}-${entry.key}`} className="customer-timeline-metadata-pill">
                <strong>{entry.label}:</strong> {entry.value}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function CustomerTimelineSection({ customerId }) {
  const timelineEvents = useCustomerTimeline(customerId);
  const [searchTerm, setSearchTerm] = useState("");
  const filteredTimelineEvents = useMemo(() => {
    const normalizedSearchTerm = String(searchTerm || "").trim().toLowerCase();
    if (!normalizedSearchTerm) return timelineEvents;

    return timelineEvents.filter((event) =>
      buildTimelineSearchText(event).includes(normalizedSearchTerm)
    );
  }, [searchTerm, timelineEvents]);
  const groupedTimelineEvents = useMemo(
    () => groupTimelineEvents(filteredTimelineEvents),
    [filteredTimelineEvents]
  );

  return (
    <section id="customer-timeline" className="customer-timeline-section">
      <div className="customer-timeline-section-header">
        <div>
          <h2>Operational Timeline</h2>
          <p>Structured customer history for artwork, record changes, and workflow-linked activity.</p>
        </div>
        <strong className="customer-timeline-count">
          {filteredTimelineEvents.length}
          {filteredTimelineEvents.length !== timelineEvents.length
            ? ` of ${timelineEvents.length}`
            : ""}
          {" "}event{filteredTimelineEvents.length === 1 ? "" : "s"}
        </strong>
      </div>

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <input
          type="search"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search event, actor, order number, note"
          style={{
            flex: "1 1 320px",
            minWidth: "240px",
            border: "1px solid #cbd5e1",
            borderRadius: "12px",
            padding: "11px 12px",
            background: "#ffffff",
          }}
        />
        {searchTerm ? (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              borderRadius: "12px",
              padding: "11px 14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        ) : null}
      </div>

      {!groupedTimelineEvents.length ? (
        <div className="customer-timeline-empty-state">
          {searchTerm
            ? "No timeline events match the current search."
            : "No operational history recorded for this customer yet."}
        </div>
      ) : (
        <div className="customer-timeline-groups">
          {groupedTimelineEvents.map((group) => (
            <div key={group.label} className="customer-timeline-group">
              <div className="customer-timeline-group-label">{group.label}</div>
              <div className="customer-timeline-group-events">
                {group.events.map((event) => (
                  <TimelineRow key={event.id} event={event} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
