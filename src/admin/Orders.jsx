import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { formatShortDate } from "../lib/dateFormatting";
import { updateStoredOrder, useStoredOrders } from "../lib/ordersStore";
import { buildWorkflowActionUpdates } from "../orders/buildWorkflowActionUpdates";
import { sortOrdersByOperationalStatus } from "../orders/orderWorkflow";
import {
  buildProductionWorkspaceSummary,
  buildResultsLabel,
  getProductionMethodCounts,
  getProductionStatusCounts,
  matchesDateFilter,
  matchesProductionMethod,
  matchesProductionStatus,
  matchesSearch,
  normalizeProductionOrder,
  PRODUCTION_DATE_FILTERS,
  PRODUCTION_METHOD_FILTERS,
  PRODUCTION_STATUS_FILTERS,
} from "../production/productionWorkspace";
import { sortQueueByPriority } from "../queue/buildQueuePriority";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import { getOperationalOrdersForStaff, isStaffWorkspaceView } from "./adminRoleView";

function FilterPill({ active, children, count, tone = "default", onClick }) {
  const activeBackground =
    tone === "warning"
      ? "#9a3412"
      : tone === "success"
      ? "#166534"
      : tone === "danger"
      ? "#b91c1c"
      : "#111827";
  const inactiveBackground =
    tone === "warning" ? "#fff7ed" : tone === "danger" ? "#fef2f2" : "#ffffff";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? `1px solid ${activeBackground}` : "1px solid #d6dbe4",
        background: active ? activeBackground : inactiveBackground,
        color: active ? "#ffffff" : "#111827",
        borderRadius: "999px",
        padding: "8px 11px",
        fontWeight: 700,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        whiteSpace: "nowrap",
      }}
    >
      <span>{children}</span>
      <span
        style={{
          minWidth: "20px",
          height: "20px",
          padding: "0 6px",
          borderRadius: "999px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "12px",
          background: active ? "rgba(255,255,255,0.16)" : "#f1f5f9",
          color: active ? "#ffffff" : "#475569",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function SummaryCard({ label, value, tone = "default" }) {
  const palette =
    tone === "warning"
      ? { background: "#fff7ed", border: "#fed7aa", value: "#9a3412", label: "#9a3412" }
      : tone === "danger"
      ? { background: "#fef2f2", border: "#fecaca", value: "#b91c1c", label: "#b91c1c" }
      : tone === "success"
      ? { background: "#ecfdf5", border: "#bbf7d0", value: "#166534", label: "#166534" }
      : { background: "#f8fafc", border: "#e2e8f0", value: "#0f172a", label: "#475569" };

  return (
    <article
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: "16px",
        padding: "14px 16px",
        display: "grid",
        gap: "4px",
      }}
    >
      <span
        style={{
          color: palette.label,
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <strong style={{ color: palette.value, fontSize: "28px" }}>{value}</strong>
    </article>
  );
}

function QueueFlag({ label, tone = "default" }) {
  const palette =
    tone === "danger"
      ? { background: "#fef2f2", color: "#b91c1c", border: "#fecaca" }
      : tone === "warning"
      ? { background: "#fff7ed", color: "#9a3412", border: "#fed7aa" }
      : tone === "info"
      ? { background: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" }
      : { background: "#f8fafc", color: "#334155", border: "#e2e8f0" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        border: `1px solid ${palette.border}`,
        background: palette.background,
        color: palette.color,
        padding: "4px 8px",
        fontSize: "11px",
        fontWeight: 800,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

function QueueRow({ order, onRunAction }) {
  const primaryAction = order.available_actions?.[0] || null;
  const priority = order.queue_priority || {};
  const dueTone = priority.overdue ? "danger" : priority.dueSoon ? "warning" : "default";
  const dueLabel = order.due_date ? formatShortDate(order.due_date) : "No due date";

  return (
    <article
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto",
        gap: "12px",
        alignItems: "center",
        border: "1px solid #e2e8f0",
        borderRadius: "14px",
        background: "#ffffff",
        padding: "12px 14px",
      }}
    >
      <div style={{ minWidth: 0, display: "grid", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <Link
            to={`/admin/orders/${order.order_number}`}
            style={{ color: "#0f172a", fontWeight: 800, textDecoration: "none" }}
          >
            {order.order_number}
          </Link>
          <StatusBadge status={order.status} />
          {priority.overdue ? <QueueFlag label="Overdue" tone="danger" /> : null}
          {!priority.overdue && priority.dueSoon ? <QueueFlag label="Due Soon" tone="warning" /> : null}
          {order.rush_active ? <QueueFlag label="Rush" tone="warning" /> : null}
          {order.linked_artwork ? <QueueFlag label={`Artwork ${order.artwork_count || 1}`} tone="info" /> : null}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", minWidth: 0 }}>
          <strong style={{ minWidth: 0 }}>{order.customer_name}</strong>
          <span style={{ color: "#64748b" }}>{order.garment}</span>
          <span style={{ color: "#64748b" }}>{order.decoration_type}</span>
        </div>
      </div>

      <div style={{ display: "grid", gap: "3px" }}>
        <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>
          Due
        </span>
        <strong style={{ color: dueTone === "danger" ? "#b91c1c" : dueTone === "warning" ? "#9a3412" : "#0f172a" }}>
          {dueLabel}
        </strong>
      </div>

      <div style={{ display: "grid", gap: "3px" }}>
        <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 800, textTransform: "uppercase" }}>
          Assignment
        </span>
        <strong>{order.assigned_to_staff_name}</strong>
        <span style={{ color: "#64748b", fontSize: "13px" }}>
          Owner: {order.production_owner_staff_name || "Unassigned"}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {primaryAction ? (
          <button
            type="button"
            onClick={() => onRunAction(order, primaryAction)}
            style={{
              border: primaryAction.targetStatus === "On Hold" ? "1px solid #fecdd3" : "1px solid #171717",
              background: primaryAction.targetStatus === "On Hold" ? "#fff1f2" : "#171717",
              color: primaryAction.targetStatus === "On Hold" ? "#be123c" : "#ffffff",
              borderRadius: "10px",
              padding: "9px 12px",
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {primaryAction.label}
          </button>
        ) : (
          <span style={{ color: "#64748b", fontWeight: 700 }}>No action</span>
        )}
      </div>
    </article>
  );
}

export default function Orders() {
  const storedOrders = useStoredOrders();
  const staffUser = getActiveStaffUser();
  const isStaffWorkspace = isStaffWorkspaceView(staffUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeStatusFilter = searchParams.get("status") || "active";
  const activeMethodFilter = searchParams.get("workflow") || "all";
  const activeDateFilter = searchParams.get("date") || "all";
  const searchTerm = searchParams.get("q") || "";
  const customStart = searchParams.get("start") || "";
  const customEnd = searchParams.get("end") || "";

  const hasActiveFilters =
    activeStatusFilter !== "active" ||
    activeMethodFilter !== "all" ||
    activeDateFilter !== "all" ||
    Boolean(searchTerm) ||
    Boolean(customStart) ||
    Boolean(customEnd);

  const orders = useMemo(
    () => sortOrdersByOperationalStatus(storedOrders.map(normalizeProductionOrder)),
    [storedOrders]
  );
  const workspaceOrders = useMemo(
    () => (isStaffWorkspace ? getOperationalOrdersForStaff(orders) : orders),
    [isStaffWorkspace, orders]
  );
  const statusCounts = useMemo(() => getProductionStatusCounts(workspaceOrders), [workspaceOrders]);
  const methodCounts = useMemo(() => getProductionMethodCounts(workspaceOrders), [workspaceOrders]);
  const workspaceSummary = useMemo(
    () => buildProductionWorkspaceSummary(workspaceOrders),
    [workspaceOrders]
  );

  const filteredOrders = useMemo(
    () =>
      sortQueueByPriority(
        workspaceOrders.filter(
          (order) =>
            matchesProductionStatus(order, activeStatusFilter) &&
            matchesProductionMethod(order, activeMethodFilter) &&
            matchesDateFilter(order, activeDateFilter, customStart, customEnd) &&
            matchesSearch(order, searchTerm)
        )
      ),
    [
      workspaceOrders,
      activeStatusFilter,
      activeMethodFilter,
      activeDateFilter,
      customStart,
      customEnd,
      searchTerm,
    ]
  );

  function updateFilters(nextValues) {
    const nextParams = new URLSearchParams(searchParams);

    Object.entries(nextValues).forEach(([key, value]) => {
      if (
        !value ||
        (key === "status" && value === "active") ||
        (key === "workflow" && value === "all") ||
        (key === "date" && value === "all")
      ) {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });

    if (
      (nextValues.date && nextValues.date !== "custom") ||
      (activeDateFilter !== "custom" && !nextValues.date)
    ) {
      nextParams.delete("start");
      nextParams.delete("end");
    }

    setSearchParams(nextParams);
  }

  function handleRunAction(order, action) {
    const updates = buildWorkflowActionUpdates(order, action);
    if (!updates) return;
    updateStoredOrder(order.order_number, updates);
  }

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "24px" }}>
      <div
        style={{
          background: "#ffffff",
          borderRadius: "24px",
          padding: "24px",
          border: "1px solid #e8edf3",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "grid", gap: "6px" }}>
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Production Queue
          </p>
          <h1 style={{ margin: 0 }}>Shop Production</h1>
          <p style={{ margin: 0, color: "#64748b", maxWidth: "780px" }}>
            Compact execution view for moving jobs through production, QC, pickup readiness, and completion with clear ownership and minimal clutter.
          </p>
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "10px",
          }}
        >
          <SummaryCard label="Active Work" value={workspaceSummary.activeOrders} />
          <SummaryCard label="Ready For Production" value={workspaceSummary.readyForProductionOrders} />
          <SummaryCard label="Urgent" value={workspaceSummary.urgentOrders} tone="warning" />
          <SummaryCard label="On Hold" value={workspaceSummary.onHoldOrders} tone="danger" />
          <SummaryCard label="Unassigned" value={workspaceSummary.unassignedOrders} tone="warning" />
          <SummaryCard label="Completed" value={workspaceSummary.completedOrders} tone="success" />
        </section>

        {!isStaffWorkspace ? (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "10px",
            }}
          >
            <Link
              to="/admin/assignments"
              style={{
                textDecoration: "none",
                color: "#171717",
                border: "1px solid #fde68a",
                background: "#fffbeb",
                borderRadius: "16px",
                padding: "14px 16px",
                display: "grid",
                gap: "4px",
              }}
            >
              <strong>Assignment Dispatch</strong>
              <span style={{ color: "#64748b" }}>{workspaceSummary.unassignedOrders} jobs still need assignment or ownership review.</span>
            </Link>
            <Link
              to="/admin/orders?status=on-hold"
              style={{
                textDecoration: "none",
                color: "#171717",
                border: "1px solid #fecaca",
                background: "#fef2f2",
                borderRadius: "16px",
                padding: "14px 16px",
                display: "grid",
                gap: "4px",
              }}
            >
              <strong>Held Work</strong>
              <span style={{ color: "#64748b" }}>{workspaceSummary.onHoldOrders} jobs are paused and need operational follow-up.</span>
            </Link>
          </section>
        ) : null}

        <section style={{ display: "grid", gap: "12px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {PRODUCTION_STATUS_FILTERS.map((filter) => (
              <FilterPill
                key={filter.key}
                active={activeStatusFilter === filter.key}
                count={statusCounts[filter.key] || 0}
                tone={
                  filter.key === "completed"
                    ? "success"
                    : filter.key === "canceled" || filter.key === "on-hold"
                    ? "danger"
                    : filter.key === "urgent" || filter.key === "unassigned"
                    ? "warning"
                    : "default"
                }
                onClick={() => updateFilters({ status: filter.key })}
              >
                {filter.label}
              </FilterPill>
            ))}
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {PRODUCTION_METHOD_FILTERS.map((filter) => (
              <FilterPill
                key={filter.key}
                active={activeMethodFilter === filter.key}
                count={methodCounts[filter.key] || 0}
                onClick={() => updateFilters({ workflow: filter.key })}
              >
                {filter.label}
              </FilterPill>
            ))}
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {PRODUCTION_DATE_FILTERS.map((filter) => (
              <FilterPill
                key={filter.key}
                active={activeDateFilter === filter.key}
                count={filteredOrders.length}
                onClick={() => updateFilters({ date: filter.key })}
              >
                {filter.label}
              </FilterPill>
            ))}
          </div>

          {activeDateFilter === "custom" ? (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <label style={{ display: "grid", gap: "6px", color: "#475569", fontWeight: 700 }}>
                Start
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => updateFilters({ start: event.target.value })}
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: "12px",
                    padding: "10px 12px",
                  }}
                />
              </label>
              <label style={{ display: "grid", gap: "6px", color: "#475569", fontWeight: 700 }}>
                End
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => updateFilters({ end: event.target.value })}
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: "12px",
                    padding: "10px 12px",
                  }}
                />
              </label>
            </div>
          ) : null}

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => updateFilters({ q: event.target.value })}
              placeholder="Search order, customer, garment, artwork, staff"
              style={{
                flex: "1 1 360px",
                minWidth: "240px",
                border: "1px solid #cbd5e1",
                borderRadius: "12px",
                padding: "11px 12px",
              }}
            />
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={() => setSearchParams(new URLSearchParams())}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  borderRadius: "12px",
                  padding: "11px 14px",
                  fontWeight: 700,
                }}
              >
                Reset Filters
              </button>
            ) : null}
            <strong style={{ color: "#475569" }}>{buildResultsLabel(filteredOrders.length, activeStatusFilter)}</strong>
          </div>
        </section>

        <section style={{ display: "grid", gap: "10px" }}>
          {filteredOrders.length ? (
            filteredOrders.map((order) => (
              <QueueRow key={order.order_number} order={order} onRunAction={handleRunAction} />
            ))
          ) : (
            <div
              style={{
                borderRadius: "16px",
                border: "1px dashed #cbd5e1",
                background: "#f8fafc",
                padding: "24px",
                color: "#64748b",
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              No production jobs match the current queue filters.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
