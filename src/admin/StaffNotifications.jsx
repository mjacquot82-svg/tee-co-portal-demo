import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useStaffNotifications,
  markStaffNotificationRead,
  markAllStaffNotificationsRead,
  STAFF_NOTIFICATION_TYPE_LABELS,
  STAFF_NOTIFICATION_PRIORITY,
  STAFF_NOTIFICATION_TYPES,
} from "../lib/staffNotificationsStore";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import { formatDateTime } from "../lib/dateFormatting";

const FILTER_ALL = "all";
const FILTER_UNREAD = "unread";
const FILTER_ASSIGNED_TO_ME = "assigned_to_me";
const FILTER_BLOCKED = "blocked";
const FILTER_PICKUP_READY = "pickup_ready";

const FILTERS = [
  { key: FILTER_ALL, label: "All" },
  { key: FILTER_UNREAD, label: "Unread" },
  { key: FILTER_ASSIGNED_TO_ME, label: "Assigned To Me" },
  { key: FILTER_BLOCKED, label: "Blocked" },
  { key: FILTER_PICKUP_READY, label: "Pickup Ready" },
];

const PRIORITY_COLORS = {
  high: { background: "#fef2f2", border: "#fecaca", badge: "#fee2e2", badgeText: "#b91c1c", dot: "#ef4444" },
  medium: { background: "#fff7ed", border: "#fed7aa", badge: "#ffedd5", badgeText: "#c2410c", dot: "#f97316" },
  normal: { background: "#f8fafc", border: "#e2e8f0", badge: "#f1f5f9", badgeText: "#475569", dot: "#94a3b8" },
};

const UNREAD_ACCENT = {
  background: "#eff6ff",
  border: "#bfdbfe",
  badge: "#dbeafe",
  badgeText: "#1d4ed8",
};

function buildTimestampLabel(value) {
  const timestamp = new Date(value || "").getTime();
  if (!timestamp) return "";

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.round(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return formatDateTime(value);
}

function getTypeIcon(type) {
  switch (type) {
    case STAFF_NOTIFICATION_TYPES.newWorkAssigned:
      return "→";
    case STAFF_NOTIFICATION_TYPES.assignmentChanged:
      return "⇄";
    case STAFF_NOTIFICATION_TYPES.orderBlocked:
      return "✕";
    case STAFF_NOTIFICATION_TYPES.artworkRequired:
      return "✎";
    case STAFF_NOTIFICATION_TYPES.paymentHold:
      return "$";
    case STAFF_NOTIFICATION_TYPES.readyForProduction:
      return "▶";
    case STAFF_NOTIFICATION_TYPES.readyForPickup:
      return "✓";
    case STAFF_NOTIFICATION_TYPES.productionStatusChanged:
      return "↻";
    case STAFF_NOTIFICATION_TYPES.orderCompleted:
      return "★";
    default:
      return "•";
  }
}

function applyFilter(notifications, filter, currentStaffId) {
  switch (filter) {
    case FILTER_UNREAD:
      return notifications.filter((n) => !n.read);
    case FILTER_ASSIGNED_TO_ME:
      return notifications.filter(
        (n) => currentStaffId && n.assignedToStaffId === currentStaffId
      );
    case FILTER_BLOCKED:
      return notifications.filter((n) => n.type === STAFF_NOTIFICATION_TYPES.orderBlocked);
    case FILTER_PICKUP_READY:
      return notifications.filter((n) => n.type === STAFF_NOTIFICATION_TYPES.readyForPickup);
    default:
      return notifications;
  }
}

function NotificationCard({ notification, onMarkRead }) {
  const priority = STAFF_NOTIFICATION_PRIORITY[notification.type] || "normal";
  const colors = notification.read
    ? PRIORITY_COLORS[priority]
    : { ...PRIORITY_COLORS[priority], ...UNREAD_ACCENT };

  const typeLabel = STAFF_NOTIFICATION_TYPE_LABELS[notification.type] || notification.type;

  return (
    <article
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: "16px",
        background: colors.background,
        padding: "14px 16px",
        display: "grid",
        gap: "10px",
        position: "relative",
      }}
    >
      {!notification.read && (
        <span
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: colors.dot || PRIORITY_COLORS[priority].dot,
            flexShrink: 0,
          }}
          title="Unread"
        />
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              borderRadius: "999px",
              padding: "4px 8px",
              background: colors.badge,
              color: colors.badgeText,
              fontSize: "11px",
              fontWeight: 900,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            <span aria-hidden="true" style={{ fontStyle: "normal" }}>
              {getTypeIcon(notification.type)}
            </span>
            {typeLabel}
          </span>

          <span
            style={{
              fontWeight: 700,
              fontSize: "13px",
              color: "#0f172a",
              background: "#f1f5f9",
              borderRadius: "8px",
              padding: "3px 8px",
              border: "1px solid #e2e8f0",
            }}
          >
            {notification.orderNumber}
          </span>

          {notification.assignedToStaffName && (
            <span
              style={{
                fontSize: "12px",
                color: "#64748b",
                fontWeight: 600,
              }}
            >
              → {notification.assignedToStaffName}
            </span>
          )}
        </div>

        <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
          {buildTimestampLabel(notification.createdAt)}
        </span>
      </div>

      <p style={{ margin: 0, fontSize: "14px", color: "#334155", lineHeight: 1.5 }}>
        {notification.description}
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <Link
          to={notification.linkTo}
          onClick={() => !notification.read && onMarkRead(notification.id)}
          style={{
            fontSize: "13px",
            fontWeight: 700,
            color: "#1d4ed8",
            textDecoration: "none",
            padding: "6px 12px",
            border: "1px solid #bfdbfe",
            borderRadius: "10px",
            background: "#eff6ff",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          View Order →
        </Link>

        {!notification.read && (
          <button
            onClick={() => onMarkRead(notification.id)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#64748b",
              fontSize: "12px",
              fontWeight: 700,
              padding: "6px 8px",
              borderRadius: "8px",
            }}
          >
            Mark as read
          </button>
        )}
      </div>
    </article>
  );
}

export default function StaffNotifications() {
  const notifications = useStaffNotifications();
  const [activeFilter, setActiveFilter] = useState(FILTER_ALL);
  const staffUser = getActiveStaffUser();
  const currentStaffId = staffUser?.id || "";

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filteredNotifications = applyFilter(notifications, activeFilter, currentStaffId);

  const filterCounts = {
    [FILTER_ALL]: notifications.length,
    [FILTER_UNREAD]: notifications.filter((n) => !n.read).length,
    [FILTER_ASSIGNED_TO_ME]: notifications.filter(
      (n) => currentStaffId && n.assignedToStaffId === currentStaffId
    ).length,
    [FILTER_BLOCKED]: notifications.filter(
      (n) => n.type === STAFF_NOTIFICATION_TYPES.orderBlocked
    ).length,
    [FILTER_PICKUP_READY]: notifications.filter(
      (n) => n.type === STAFF_NOTIFICATION_TYPES.readyForPickup
    ).length,
  };

  function handleMarkRead(id) {
    markStaffNotificationRead(id);
  }

  function handleMarkAllRead() {
    markAllStaffNotificationsRead();
  }

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "24px",
        display: "grid",
        gap: "20px",
      }}
    >
      {/* Header */}
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
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: "12px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Staff Operations
          </p>
          <h1 style={{ margin: "8px 0 6px" }}>
            Notifications
            {unreadCount > 0 && (
              <span
                style={{
                  marginLeft: "10px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "24px",
                  height: "24px",
                  padding: "0 7px",
                  borderRadius: "999px",
                  background: "#ef4444",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 900,
                  verticalAlign: "middle",
                }}
              >
                {unreadCount}
              </span>
            )}
          </h1>
          <p style={{ margin: 0, color: "#64748b" }}>
            Stay on top of assignments, status changes, and work that needs your attention.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            style={{
              border: "1px solid #d6dbe4",
              background: "#ffffff",
              color: "#334155",
              borderRadius: "12px",
              padding: "10px 14px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "14px",
            }}
          >
            Mark All Read
          </button>
        )}
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter.key;
          const count = filterCounts[filter.key] || 0;
          return (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              style={{
                border: `1px solid ${isActive ? "#1d4ed8" : "#d6dbe4"}`,
                background: isActive ? "#1d4ed8" : "#ffffff",
                color: isActive ? "#ffffff" : "#334155",
                borderRadius: "999px",
                padding: "7px 14px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "13px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {filter.label}
              {count > 0 && (
                <span
                  style={{
                    minWidth: "18px",
                    height: "18px",
                    padding: "0 5px",
                    borderRadius: "999px",
                    background: isActive ? "rgba(255,255,255,0.25)" : "#f1f5f9",
                    color: isActive ? "#ffffff" : "#475569",
                    fontSize: "11px",
                    fontWeight: 900,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Blocked work callout */}
      {filterCounts[FILTER_BLOCKED] > 0 && activeFilter !== FILTER_BLOCKED && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "14px",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: "#b91c1c", fontWeight: 700, fontSize: "14px" }}>
            ✕ {filterCounts[FILTER_BLOCKED]} blocked order{filterCounts[FILTER_BLOCKED] !== 1 ? "s" : ""} need attention
          </span>
          <button
            onClick={() => setActiveFilter(FILTER_BLOCKED)}
            style={{
              background: "#b91c1c",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "6px 12px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "13px",
            }}
          >
            View Blocked
          </button>
        </div>
      )}

      {/* Pickup ready callout */}
      {filterCounts[FILTER_PICKUP_READY] > 0 && activeFilter !== FILTER_PICKUP_READY && (
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "14px",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <span style={{ color: "#166534", fontWeight: 700, fontSize: "14px" }}>
            ✓ {filterCounts[FILTER_PICKUP_READY]} order{filterCounts[FILTER_PICKUP_READY] !== 1 ? "s" : ""} ready for pickup
          </span>
          <button
            onClick={() => setActiveFilter(FILTER_PICKUP_READY)}
            style={{
              background: "#166534",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              padding: "6px 12px",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: "13px",
            }}
          >
            View Ready
          </button>
        </div>
      )}

      {/* Notification list */}
      {filteredNotifications.length === 0 ? (
        <section
          style={{
            background: "#ffffff",
            border: "1px dashed #d6dbe4",
            borderRadius: "20px",
            padding: "32px 24px",
            textAlign: "center",
          }}
        >
          <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#0f172a", fontSize: "16px" }}>
            {activeFilter === FILTER_ALL ? "No notifications yet." : "No notifications match this filter."}
          </p>
          <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
            {activeFilter === FILTER_ALL
              ? "Notifications will appear here as orders are assigned, updated, or require action."
              : "Try another filter or check back when new activity comes in."}
          </p>
        </section>
      ) : (
        <section style={{ display: "grid", gap: "10px" }}>
          {filteredNotifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onMarkRead={handleMarkRead}
            />
          ))}
        </section>
      )}
    </div>
  );
}
