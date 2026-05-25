import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { formatShortDate } from "../lib/dateFormatting";
import { updateStoredOrder, useStoredOrders } from "../lib/ordersStore";
import {
  canAdvanceOperationalStatus,
  getNextOperationalStatus,
  isReadyForProductionStatus,
  sortOrdersByOperationalStatus,
} from "../orders/orderWorkflow";
import {
  buildProductionWorkspaceSummary,
  buildResultsLabel,
  getProductionMethodCounts,
  getProductionStatusCounts,
  matchesCustomer,
  matchesDateFilter,
  matchesProductionMethod,
  matchesProductionStatus,
  matchesSearch,
  normalizeLookup,
  normalizeProductionOrder,
  PRODUCTION_DATE_FILTERS,
  PRODUCTION_METHOD_FILTERS,
  PRODUCTION_STATUS_FILTERS,
} from "../production/productionWorkspace";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import {
  getOperationalOrdersForStaff,
  isStaffWorkspaceView,
} from "./adminRoleView";

function OrdersTable({
  orders,
  emptyMessage,
  onAdvanceStatus,
  statusActionLabel = "Mark",
}) {
  return (
    <div
      style={{
        overflowX: "auto",
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        background: "#ffffff",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
            <th style={{ padding: "12px 8px", textAlign: "left" }}>Order</th>
            <th style={{ padding: "12px 8px", textAlign: "left" }}>Customer</th>
            <th style={{ padding: "12px 8px", textAlign: "left" }}>Garment</th>
            <th style={{ padding: "12px 8px", textAlign: "left" }}>Production Type</th>
            <th style={{ padding: "12px 8px", textAlign: "left" }}>Assigned Worker</th>
            <th style={{ padding: "12px 8px", textAlign: "left", minWidth: "120px" }}>Created</th>
            <th style={{ padding: "12px 8px", textAlign: "left", minWidth: "120px" }}>Due Date</th>
            <th style={{ padding: "12px 8px", textAlign: "left" }}>Status</th>
            <th style={{ padding: "12px 8px", textAlign: "left" }}>Action</th>
          </tr>
        </thead>

        <tbody>
          {orders.map((order) => (
            <tr key={order.order_number} style={{ borderBottom: "1px solid #e2e8f0" }}>
              <td style={{ padding: "14px 8px" }}>
                <Link
                  to={`/admin/orders/${order.order_number}`}
                  style={{
                    color: "#0f172a",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  {order.order_number}
                </Link>
              </td>

              <td style={{ padding: "14px 8px" }}>{order.customer_name}</td>
              <td style={{ padding: "14px 8px" }}>{order.garment}</td>
              <td style={{ padding: "14px 8px" }}>{order.decoration_type}</td>

              <td style={{ padding: "14px 8px" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: "999px",
                    padding: "6px 10px",
                    color: order.assigned_to_staff_name === "Unassigned" ? "#b45309" : "#166534",
                    fontWeight: 700,
                    background: order.assigned_to_staff_name === "Unassigned" ? "#fff7ed" : "#ecfdf5",
                  }}
                >
                  {order.assigned_to_staff_name}
                </span>
              </td>

              <td style={{ padding: "14px 8px", color: "#57534e", whiteSpace: "nowrap" }}>
                {formatShortDate(order.created_at)}
              </td>

              <td style={{ padding: "14px 8px", color: "#57534e", whiteSpace: "nowrap" }}>
                {order.due_date ? formatShortDate(order.due_date) : "—"}
              </td>

              <td style={{ padding: "14px 8px" }}>
                <StatusBadge status={order.status} />
              </td>

              <td style={{ padding: "14px 8px" }}>
                {canAdvanceOperationalStatus(order.status) ? (
                  <button
                    type="button"
                    onClick={() => onAdvanceStatus(order)}
                    style={{
                      border: "none",
                      background: isReadyForProductionStatus(order.status) ? "#171717" : "#334155",
                      color: "#ffffff",
                      borderRadius: "10px",
                      padding: "9px 12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {statusActionLabel} {getNextOperationalStatus(order.status)}
                  </button>
                ) : (
                  <span style={{ color: "#64748b", fontWeight: 700 }}>Complete</span>
                )}
              </td>
            </tr>
          ))}

          {orders.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                style={{
                  padding: "24px 8px",
                  textAlign: "center",
                  color: "#64748b",
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

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
        padding: tone === "warning" || tone === "success" ? "8px 11px" : "10px 14px",
        fontWeight: 700,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        whiteSpace: "nowrap",
        boxShadow: active ? "0 8px 18px rgba(15, 23, 42, 0.08)" : "none",
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

export default function Orders() {
  const storedOrders = useStoredOrders();
  const staffUser = getActiveStaffUser();
  const isStaffWorkspace = isStaffWorkspaceView(staffUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeStatusFilter = searchParams.get("status") || "active";
  const activeMethodFilter = searchParams.get("workflow") || "all";
  const activeDateFilter = searchParams.get("date") || "all";
  const searchTerm = searchParams.get("q") || "";
  const activeCustomerFilter = searchParams.get("customer") || "";
  const customStart = searchParams.get("start") || "";
  const customEnd = searchParams.get("end") || "";
  const [customerInput, setCustomerInput] = useState(activeCustomerFilter);
  const [isCustomerMenuOpen, setIsCustomerMenuOpen] = useState(false);

  const hasActiveFilters =
    activeStatusFilter !== "active" ||
    activeMethodFilter !== "all" ||
    activeDateFilter !== "all" ||
    Boolean(activeCustomerFilter) ||
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

  const customerOptions = useMemo(() => {
    const uniqueCustomers = new Map();

    workspaceOrders.forEach((order) => {
      const customerName = String(order.customer_name || "").trim();
      const normalizedCustomerName = normalizeLookup(customerName);
      if (!normalizedCustomerName || uniqueCustomers.has(normalizedCustomerName)) return;
      uniqueCustomers.set(normalizedCustomerName, customerName);
    });

    return Array.from(uniqueCustomers.entries())
      .map(([normalizedName, name]) => ({ normalizedName, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [workspaceOrders]);

  const customerSuggestions = useMemo(() => {
    const normalizedInput = normalizeLookup(customerInput);
    if (!normalizedInput) return customerOptions;

    return customerOptions.filter((customer) =>
      customer.normalizedName.includes(normalizedInput)
    );
  }, [customerInput, customerOptions]);

  const statusCounts = useMemo(() => getProductionStatusCounts(workspaceOrders), [workspaceOrders]);
  const methodCounts = useMemo(() => getProductionMethodCounts(workspaceOrders), [workspaceOrders]);
  const workspaceSummary = useMemo(
    () => buildProductionWorkspaceSummary(workspaceOrders),
    [workspaceOrders]
  );
  const paymentFollowUpCount = useMemo(
    () => workspaceOrders.filter((order) => Number(order.balance_due || 0) > 0).length,
    [workspaceOrders]
  );

  const filteredOrders = useMemo(
    () =>
      workspaceOrders.filter(
        (order) =>
          matchesProductionStatus(order, activeStatusFilter) &&
          matchesProductionMethod(order, activeMethodFilter) &&
          matchesDateFilter(order, activeDateFilter, customStart, customEnd) &&
          matchesCustomer(order, activeCustomerFilter) &&
          matchesSearch(order, searchTerm)
      ),
    [
      workspaceOrders,
      activeStatusFilter,
      activeMethodFilter,
      activeDateFilter,
      customStart,
      customEnd,
      activeCustomerFilter,
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

  function handleAdvanceStatus(order) {
    const nextStatus = getNextOperationalStatus(order.status);
    const updates = {
      status: nextStatus,
      activity_type: "status_change",
      activity_note: `Status changed to ${nextStatus}.`,
    };

    if (nextStatus === "In Production") {
      updates.production_started_at = order.production_started_at || new Date().toISOString();
      updates.production_ready = true;
    }

    if (nextStatus === "Completed") {
      updates.completed_at = new Date().toISOString();
    }

    updateStoredOrder(order.order_number, updates);
  }

  function handleResetFilters() {
    setCustomerInput("");
    setIsCustomerMenuOpen(false);
    setSearchParams(new URLSearchParams());
  }

  function selectCustomerFilter(customerName) {
    setCustomerInput(customerName);
    setIsCustomerMenuOpen(false);
    updateFilters({ customer: customerName });
  }

  function handleCustomerInputChange(event) {
    const nextValue = event.target.value;
    const normalizedNextValue = normalizeLookup(nextValue);
    const exactMatch = customerOptions.find(
      (customer) => customer.normalizedName === normalizedNextValue
    );

    setCustomerInput(nextValue);
    setIsCustomerMenuOpen(true);

    if (!nextValue.trim()) {
      updateFilters({ customer: "" });
      return;
    }

    if (exactMatch) {
      updateFilters({ customer: exactMatch.name });
    }
  }

  function handleCustomerInputBlur() {
    window.setTimeout(() => {
      setIsCustomerMenuOpen(false);
      setCustomerInput(activeCustomerFilter);
    }, 120);
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
          gap: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
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
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Shop Production
            </p>
            <h1 style={{ margin: "8px 0 6px" }}>Shop Production</h1>
            <p style={{ margin: 0, color: "#64748b", maxWidth: "760px" }}>
              {isStaffWorkspace
                ? "Use this workspace for production movement and status updates across the floor. Your personal queue stays in My Assigned Work."
                : "Use this workspace for production movement, queue handling, and status changes. Assignment balancing and payment follow-up stay in their own workspaces."}
            </p>
          </div>
        </div>

        {!isStaffWorkspace && (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "10px",
            }}
          >
            <Link
              to={workspaceSummary.urgentOrders ? "/admin/orders?status=urgent" : "/admin/orders"}
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
              <strong>Urgent Production</strong>
              <span style={{ color: "#64748b" }}>{workspaceSummary.urgentOrders} jobs need immediate production review.</span>
            </Link>
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
              <span style={{ color: "#64748b" }}>{workspaceSummary.unassignedOrders} jobs still need assignment or rebalancing.</span>
            </Link>
            <Link
              to="/admin/financial"
              style={{
                textDecoration: "none",
                color: "#171717",
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                borderRadius: "16px",
                padding: "14px 16px",
                display: "grid",
                gap: "4px",
              }}
            >
              <strong>Financial Follow-up</strong>
              <span style={{ color: "#64748b" }}>{paymentFollowUpCount} production orders still carry a balance due.</span>
            </Link>
          </section>
        )}

        <section style={{ display: "grid", gap: "16px" }}>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {PRODUCTION_STATUS_FILTERS.filter((filter) => {
              if (filter.key === "urgent") return false;
              return true;
            }).map((filter) => (
              <FilterPill
                key={filter.key}
                active={activeStatusFilter === filter.key}
                count={statusCounts[filter.key] || 0}
                tone={
                  filter.key === "completed"
                    ? "success"
                    : filter.key === "canceled"
                    ? "danger"
                    : "default"
                }
                onClick={() => updateFilters({ status: filter.key })}
              >
                {filter.label}
              </FilterPill>
            ))}

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              {PRODUCTION_STATUS_FILTERS.filter((filter) =>
                isStaffWorkspace ? false : ["unassigned", "urgent"].includes(filter.key)
              ).map((filter) => (
                <FilterPill
                  key={filter.key}
                  active={activeStatusFilter === filter.key}
                  count={statusCounts[filter.key] || 0}
                  tone="warning"
                  onClick={() => updateFilters({ status: filter.key })}
                >
                  {filter.label}
                </FilterPill>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: "12px",
              paddingTop: "14px",
              borderTop: "1px solid #eef2f7",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
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
                Search And Filters
              </p>

              <button
                type="button"
                onClick={handleResetFilters}
                disabled={!hasActiveFilters}
                style={{
                  border: "1px solid #d6dbe4",
                  background: hasActiveFilters ? "#ffffff" : "#f8fafc",
                  color: hasActiveFilters ? "#171717" : "#94a3b8",
                  borderRadius: "12px",
                  padding: "10px 12px",
                  fontWeight: 700,
                  cursor: hasActiveFilters ? "pointer" : "not-allowed",
                  whiteSpace: "nowrap",
                }}
              >
                Reset Filters
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(220px, 1.6fr) minmax(180px, 1fr) repeat(2, minmax(160px, 0.8fr))",
                gap: "10px",
              }}
            >
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => updateFilters({ q: event.target.value })}
                placeholder="Search order, garment, worker, or artwork"
                style={{
                  width: "100%",
                  minWidth: 0,
                  border: "1px solid #cbd5e1",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  boxSizing: "border-box",
                  fontSize: "15px",
                }}
              />

              <div style={{ position: "relative", minWidth: 0 }}>
                <input
                  type="search"
                  value={customerInput}
                  onChange={handleCustomerInputChange}
                  onFocus={() => setIsCustomerMenuOpen(true)}
                  onBlur={handleCustomerInputBlur}
                  placeholder="Customer"
                  style={{
                    width: "100%",
                    minWidth: 0,
                    border: "1px solid #cbd5e1",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    boxSizing: "border-box",
                    fontSize: "15px",
                  }}
                />

                {isCustomerMenuOpen && customerSuggestions.length > 0 ? (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      zIndex: 20,
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "12px",
                      boxShadow: "0 12px 24px rgba(15, 23, 42, 0.12)",
                      overflow: "hidden",
                      maxHeight: "240px",
                      overflowY: "auto",
                    }}
                  >
                    {customerSuggestions.slice(0, 8).map((customer) => (
                      <button
                        key={customer.normalizedName}
                        type="button"
                        onMouseDown={() => selectCustomerFilter(customer.name)}
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "11px 12px",
                          background:
                            normalizeLookup(activeCustomerFilter) === customer.normalizedName
                              ? "#f8fafc"
                              : "#ffffff",
                          border: "none",
                          borderBottom: "1px solid #f1f5f9",
                          textAlign: "left",
                          cursor: "pointer",
                          color: "#292524",
                        }}
                      >
                        <strong>{customer.name}</strong>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <select
                value={activeMethodFilter}
                onChange={(event) => updateFilters({ workflow: event.target.value })}
                style={{
                  width: "100%",
                  minWidth: 0,
                  border: "1px solid #cbd5e1",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  boxSizing: "border-box",
                  fontSize: "15px",
                  background: "#ffffff",
                }}
              >
                {PRODUCTION_METHOD_FILTERS.map((filter) => (
                  <option key={filter.key} value={filter.key}>
                    {filter.label}
                    {filter.key !== "all" ? ` (${methodCounts[filter.key] || 0})` : ""}
                  </option>
                ))}
              </select>

              <select
                value={activeDateFilter}
                onChange={(event) => updateFilters({ date: event.target.value })}
                style={{
                  width: "100%",
                  minWidth: 0,
                  border: "1px solid #cbd5e1",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  boxSizing: "border-box",
                  fontSize: "15px",
                  background: "#ffffff",
                }}
              >
                {PRODUCTION_DATE_FILTERS.map((filter) => (
                  <option key={filter.key} value={filter.key}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </div>

            {activeDateFilter === "custom" ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 220px))",
                  gap: "10px",
                }}
              >
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) =>
                    updateFilters({ date: "custom", start: event.target.value })
                  }
                  aria-label="Start date"
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: "12px",
                    padding: "11px 12px",
                  }}
                />

                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) =>
                    updateFilters({ date: "custom", end: event.target.value })
                  }
                  aria-label="End date"
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: "12px",
                    padding: "11px 12px",
                  }}
                />
              </div>
            ) : null}
          </div>
        </section>

        <section style={{ display: "grid", gap: "12px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "18px" }}>Order Table</h2>
              <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                {buildResultsLabel(filteredOrders.length, activeStatusFilter)}
              </p>
            </div>
          </div>

          <OrdersTable
            orders={filteredOrders}
            emptyMessage={
              isStaffWorkspace
                ? activeStatusFilter === "unassigned"
                  ? "No unassigned production jobs match the current filters."
                  : "No shop production jobs match the current filters."
                : "No production orders match the current workspace filters."
            }
            onAdvanceStatus={handleAdvanceStatus}
            statusActionLabel={isStaffWorkspace ? "Move to" : "Mark"}
          />
        </section>
      </div>
    </div>
  );
}
