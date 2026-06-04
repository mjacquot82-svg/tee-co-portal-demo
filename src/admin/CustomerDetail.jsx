import { Link, useNavigate, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { customerIdsEqual, normalizeCustomerId } from "../lib/customerIds";
import { updateStoredCustomer, useStoredCustomers } from "../lib/customersStore";
import { duplicateOrder, listOrders } from "../repositories/ordersRepository";
import { getStoredQuickSales } from "../lib/salesStore";
import CustomerArtworkSection from "../components/CustomerArtworkSection";
import CustomerTimelineSection from "../components/CustomerTimelineSection";
import StatusBadge from "../components/StatusBadge";
import { matchesCustomerRecord } from "../lib/customerRecordMatching";
import { findPotentialDuplicatesForCustomer } from "../lib/customerDuplicates";
import { previewCustomerMerge, mergeCustomers } from "../lib/customerMergeService";
import { getAllCustomerArtwork } from "../lib/customerArtworkStore";
import { listCustomerTimelineEvents } from "../lib/customerTimelineStore";
import {
  deriveOperationalWorkflowState,
  getWorkflowStateTone,
  isWorkflowActiveState,
  isWorkflowCompletedState,
} from "../lib/operationalWorkflow";
import { canManageCustomerMerges, getAdminViewer } from "./adminRoleView";

function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function compareTimestamps(left, right) {
  return new Date(right || 0).getTime() - new Date(left || 0).getTime();
}

function describeSignal(signal) {
  if (!signal) {
    return "";
  }

  return signal.value ? `${signal.label}: ${signal.value}` : signal.label;
}

const sectionCardStyle = {
  background: "#ffffff",
  borderRadius: "20px",
  padding: "22px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

const summaryCardStyle = {
  background: "#f8fafc",
  borderRadius: "18px",
  border: "1px solid #e2e8f0",
  padding: "18px",
  display: "grid",
  gap: "6px",
};

const fieldStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "15px",
  width: "100%",
  boxSizing: "border-box",
  background: "#ffffff",
};

const labelStyle = {
  display: "grid",
  gap: "8px",
  fontWeight: 600,
  color: "#292524",
};

const compactSectionStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: "18px",
  padding: "16px",
  background: "#fcfcfd",
  display: "grid",
  gap: "12px",
};

const compactRowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: "12px",
  alignItems: "center",
  padding: "12px 0",
  borderTop: "1px solid #e2e8f0",
};

function buildCustomerForm(customer) {
  return {
    name: customer?.name || "",
    company: customer?.company || "",
    phone: customer?.phone || "",
    email: customer?.email || "",
    notes: customer?.notes || "",
  };
}

export default function CustomerDetail() {
  const { customerId } = useParams();
  const normalizedRouteCustomerId = normalizeCustomerId(customerId);
  const navigate = useNavigate();
  const customers = useStoredCustomers();
  const [orders, setOrders] = useState(() => listOrders());
  const [sales, setSales] = useState(() => getStoredQuickSales());
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(() => buildCustomerForm());
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [archiveState, setArchiveState] = useState("idle");
  const [archiveError, setArchiveError] = useState("");
  const [selectedMergeCustomerId, setSelectedMergeCustomerId] = useState("");
  const [mergeDirection, setMergeDirection] = useState("current-primary");
  const [mergeState, setMergeState] = useState("idle");
  const [mergeError, setMergeError] = useState("");
  const [mergeWarnings, setMergeWarnings] = useState([]);
  const [mergeConfirmationText, setMergeConfirmationText] = useState("");
  const canManageMerges = canManageCustomerMerges();

  const customer = useMemo(
    () => customers.find((entry) => customerIdsEqual(entry.id, normalizedRouteCustomerId)) || null,
    [customers, normalizedRouteCustomerId]
  );

  const customerOrders = useMemo(() => {
    if (!customer) return [];

    return orders
      .filter((order) => matchesCustomerRecord(customer, order))
      .sort((left, right) =>
        compareTimestamps(
          left.updated_at || left.created_at || left.date,
          right.updated_at || right.created_at || right.date
        )
      );
  }, [customer, orders]);

  const customerSales = useMemo(() => {
    if (!customer) return [];

    return sales
      .filter((sale) => matchesCustomerRecord(customer, sale))
      .sort((left, right) =>
        compareTimestamps(
          left.updated_at || left.created_at,
          right.updated_at || right.created_at
        )
      );
  }, [customer, sales]);

  const quoteRecords = useMemo(
    () =>
      customerOrders
        .filter((order) => order.operational_visible === false && order.quote_archived !== true)
        .sort((left, right) =>
          compareTimestamps(
            left.updated_at || left.created_at || left.date,
            right.updated_at || right.created_at || right.date
          )
        ),
    [customerOrders]
  );

  const activeOrderRecords = useMemo(
    () =>
      customerOrders
        .filter(
          (order) =>
            order.operational_visible !== false &&
            isWorkflowActiveState(deriveOperationalWorkflowState(order))
        )
        .sort((left, right) => {
          const leftDue = left.due_date ? new Date(left.due_date).getTime() : Number.MAX_SAFE_INTEGER;
          const rightDue = right.due_date ? new Date(right.due_date).getTime() : Number.MAX_SAFE_INTEGER;

          if (leftDue !== rightDue) {
            return leftDue - rightDue;
          }

          return compareTimestamps(
            left.updated_at || left.created_at || left.date,
            right.updated_at || right.created_at || right.date
          );
        }),
    [customerOrders]
  );

  const completedOrderRecords = useMemo(
    () =>
      customerOrders
        .filter(
          (order) =>
            order.operational_visible !== false &&
            isWorkflowCompletedState(deriveOperationalWorkflowState(order))
        )
        .sort((left, right) =>
          compareTimestamps(
            left.completed_at || left.updated_at || left.created_at || left.date,
            right.completed_at || right.updated_at || right.created_at || right.date
          )
        ),
    [customerOrders]
  );

  const operationalSummary = useMemo(() => {
    const orderBalanceDue = customerOrders.reduce(
      (sum, order) => sum + Number(order.balance_due || 0),
      0
    );
    const salesBalanceDue = customerSales.reduce(
      (sum, sale) => sum + Number(sale.balance_due || 0),
      0
    );
    const paidCounterTotal = customerSales.reduce(
      (sum, sale) => sum + Number(sale.amount_paid || sale.total || 0),
      0
    );
    const activeOrders = customerOrders.filter(
      (order) =>
        order.operational_visible !== false &&
        !["Completed", "Picked Up", "Canceled"].includes(order.status)
    ).length;
    const lastActivityAt = customerOrders
      .map((order) => order.updated_at || order.created_at || order.date)
      .concat(customerSales.map((sale) => sale.updated_at || sale.created_at))
      .sort(compareTimestamps)[0];

    return {
      orderBalanceDue,
      salesBalanceDue,
      paidCounterTotal,
      activeOrders,
      lastActivityAt,
    };
  }, [customerOrders, customerSales]);

  const duplicateCandidates = useMemo(() => {
    if (!customer) return [];
    return findPotentialDuplicatesForCustomer(customer.id, customers);
  }, [customer, customers]);

  const effectiveSelectedMergeCustomerId =
    duplicateCandidates.some((candidate) =>
      customerIdsEqual(candidate.candidate.id, selectedMergeCustomerId)
    )
      ? selectedMergeCustomerId
      : duplicateCandidates[0]?.candidate?.id || "";

  const selectedMergeCustomer = useMemo(
    () =>
      customers.find((entry) => customerIdsEqual(entry.id, effectiveSelectedMergeCustomerId)) ||
      null,
    [customers, effectiveSelectedMergeCustomerId]
  );

  const mergePreview = useMemo(() => {
    if (!customer || !selectedMergeCustomer) {
      return null;
    }

    const primaryCustomerId =
      mergeDirection === "current-primary" ? customer.id : selectedMergeCustomer.id;
    const duplicateCustomerId =
      mergeDirection === "current-primary" ? selectedMergeCustomer.id : customer.id;

    return previewCustomerMerge(primaryCustomerId, duplicateCustomerId, {
      customers,
      orders,
      sales,
      timelineEvents: listCustomerTimelineEvents(),
      artwork: getAllCustomerArtwork(),
    });
  }, [customer, customers, mergeDirection, orders, sales, selectedMergeCustomer]);

  function handleDuplicate(orderNumber) {
    const duplicated = duplicateOrder(orderNumber);
    if (duplicated) {
      navigate(`/admin/orders/${duplicated.order_number}`);
    }
  }

  function renderWorkflowStatePill(record) {
    const workflowState = deriveOperationalWorkflowState(record);
    const tone = getWorkflowStateTone(workflowState);

    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          borderRadius: "999px",
          padding: "6px 10px",
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          background: tone.background,
          color: tone.color,
          border: `1px solid ${tone.border}`,
          whiteSpace: "nowrap",
        }}
      >
        {workflowState}
      </span>
    );
  }

  function renderArtworkIndicator(record) {
    const artworkCount = Array.isArray(record.artwork_files) ? record.artwork_files.length : 0;
    const firstArtwork = record.artwork_reference_names?.[0] || record.customer_artwork_name || "";

    if (!artworkCount && !firstArtwork) {
      return (
        <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700 }}>
          No artwork linked
        </span>
      );
    }

    return (
      <a
        href="#customer-artwork-library"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          color: "#0f172a",
          textDecoration: "none",
          fontSize: "12px",
          fontWeight: 700,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "22px",
            height: "22px",
            borderRadius: "999px",
            background: "#eff6ff",
            color: "#1d4ed8",
            fontSize: "11px",
            fontWeight: 900,
          }}
        >
          A
        </span>
        <span title={firstArtwork || "Linked artwork"}>
          {artworkCount > 1 ? `${artworkCount} artwork linked` : firstArtwork || "Linked artwork"}
        </span>
      </a>
    );
  }

  function renderOperationalSection(title, description, records, emptyMessage, type) {
    return (
      <section style={compactSectionStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "10px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ margin: 0, color: "#171717", fontSize: "17px" }}>{title}</h3>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13px" }}>{description}</p>
          </div>
          <strong style={{ color: "#334155", fontSize: "13px" }}>
            {records.length} {records.length === 1 ? "record" : "records"}
          </strong>
        </div>

        {!records.length ? (
          <div
            style={{
              borderRadius: "14px",
              border: "1px dashed #cbd5e1",
              padding: "14px",
              color: "#64748b",
              fontSize: "14px",
            }}
          >
            {emptyMessage}
          </div>
        ) : (
          <div>
            {records.map((record, index) => (
              <article
                key={record.order_number}
                style={{
                  ...compactRowStyle,
                  borderTop: index === 0 ? "1px solid #e2e8f0" : compactRowStyle.borderTop,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <Link
                    to={`${type === "quote" ? "/admin/quotes" : "/admin/orders"}/${record.order_number}`}
                    style={{ color: "#0f172a", fontWeight: 800, textDecoration: "none" }}
                  >
                    {record.order_number}
                  </Link>
                  <div style={{ marginTop: "4px", color: "#475569", fontSize: "13px" }}>
                    {record.garment || "Custom item"}
                    {record.qty ? ` • ${record.qty} pcs` : ""}
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  {renderWorkflowStatePill(record)}
                  <div style={{ marginTop: "6px", color: "#64748b", fontSize: "12px" }}>
                    {type === "completed"
                      ? `Completed ${formatDateTime(record.completed_at || record.updated_at) || "recently"}`
                      : `Updated ${formatDateTime(record.updated_at || record.created_at) || "recently"}`}
                  </div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#0f172a", fontSize: "13px", fontWeight: 700 }}>
                    {record.due_date || "No due date"}
                  </div>
                  <div style={{ marginTop: "6px" }}>{renderArtworkIndicator(record)}</div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", flexWrap: "wrap" }}>
                  {type !== "quote" ? <StatusBadge status={record.status || "Draft"} /> : null}
                  {type !== "quote" ? (
                    <button
                      type="button"
                      data-testid="customer-order-repeat-button"
                      data-order-number={record.order_number}
                      onClick={() => handleDuplicate(record.order_number)}
                      style={{
                        border: "1px solid #cbd5e1",
                        background: "#ffffff",
                        borderRadius: "10px",
                        padding: "8px 10px",
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      Repeat
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  function updateEditForm(field, value) {
    setEditForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function openEditor() {
    setEditForm(buildCustomerForm(customer));
    setSaveError("");
    setArchiveError("");
    setIsEditing(true);
  }

  function closeEditor() {
    setEditForm(buildCustomerForm(customer));
    setSaveError("");
    setIsEditing(false);
  }

  async function handleSave(event) {
    event.preventDefault();

    if (saveState === "saving") return;

    const nextName = editForm.name.trim();
    if (!nextName) {
      setSaveError("Customer name is required.");
      return;
    }

    setSaveState("saving");
    setSaveError("");

    try {
      const updatedCustomer = await updateStoredCustomer(customerId, {
        name: nextName,
        company: editForm.company.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim(),
        notes: editForm.notes.trim(),
      });
      if (!updatedCustomer) {
        throw new Error("Customer record could not be found.");
      }
      setIsEditing(false);
    } catch (error) {
      console.error("Unable to update customer", error);
      setSaveError(error?.message || "Unable to save customer changes.");
    } finally {
      setSaveState("idle");
    }
  }

  async function handleArchiveToggle() {
    if (!customer || archiveState === "saving") return;

    setArchiveState("saving");
    setArchiveError("");

    try {
      const updatedCustomer = await updateStoredCustomer(customer.id, {
        archived: !customer.archived,
        archived_at: customer.archived ? null : new Date().toISOString(),
      });
      if (!updatedCustomer) {
        throw new Error("Customer record could not be found.");
      }
    } catch (error) {
      console.error("Unable to archive customer", error);
      setArchiveError(
        error?.message ||
          `Unable to ${customer.archived ? "restore" : "archive"} customer right now.`
      );
    } finally {
      setArchiveState("idle");
    }
  }

  async function handleMergeCustomers() {
    if (
      !customer ||
      !selectedMergeCustomer ||
      mergeState === "saving" ||
      !canManageMerges
    ) {
      return;
    }

    const primaryCustomer =
      mergeDirection === "current-primary" ? customer : selectedMergeCustomer;
    const duplicateCustomer =
      mergeDirection === "current-primary" ? selectedMergeCustomer : customer;

    const confirmed = window.confirm(
      `Merge ${duplicateCustomer.name || duplicateCustomer.id} into ${primaryCustomer.name || primaryCustomer.id}?\n\nThis will move quotes, orders, artwork, timeline events, and counter sales onto the primary customer. The duplicate record will be archived, not deleted.`
    );

    if (!confirmed) {
      return;
    }

    setMergeState("saving");
    setMergeError("");
    setMergeWarnings([]);

    try {
      const result = await mergeCustomers({
        primaryCustomerId: primaryCustomer.id,
        duplicateCustomerId: duplicateCustomer.id,
        actor: getAdminViewer(),
        confirmationLabel: `${primaryCustomer.id}<-${duplicateCustomer.id}`,
      });

      setMergeWarnings(result.warnings || []);
      setOrders(listOrders());
      setSales(getStoredQuickSales());
      setMergeConfirmationText("");

      if (!customerIdsEqual(primaryCustomer.id, customer.id)) {
        navigate(`/admin/customers/${primaryCustomer.id}`, { replace: true });
      }
    } catch (error) {
      console.error("Unable to merge customers", error);
      setMergeError(error?.message || "Unable to merge customer records right now.");
    } finally {
      setMergeState("idle");
    }
  }

  if (!customer) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px" }}>
        <h1>Customer not found</h1>
        <Link to="/admin/customers">Back to Customers</Link>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "1160px",
        margin: "0 auto",
        padding: "24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "14px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "#78716c",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Customer Profile
          </p>
          <h1 style={{ margin: "6px 0 8px" }}>{customer.name}</h1>
          <p style={{ margin: 0, color: "#64748b" }}>
            Review linked production orders, counter sales, artwork history, and amounts due before the next handoff.
          </p>
          {customer.archived ? (
            <div
              style={{
                marginTop: "10px",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                borderRadius: "999px",
                border: "1px solid #fecaca",
                background: "#fff1f2",
                color: "#9f1239",
                padding: "7px 12px",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              Archived Customer
            </div>
          ) : null}
          {customer.merged_into_customer_id ? (
            <div
              style={{
                marginTop: "10px",
                color: "#92400e",
                fontSize: "13px",
                fontWeight: 700,
              }}
            >
              Merged into{" "}
              <Link
                to={`/admin/customers/${customer.merged_into_customer_id}`}
                style={{ color: "#92400e" }}
              >
                {customer.merged_into_customer_id}
              </Link>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link
            to="/admin/customers"
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
              padding: "11px 14px",
              textDecoration: "none",
              color: "#0f172a",
              fontWeight: 700,
            }}
          >
            Back to Customers
          </Link>
          <button
            type="button"
            onClick={openEditor}
            disabled={saveState === "saving" || archiveState === "saving"}
            style={{
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              borderRadius: "12px",
              padding: "11px 14px",
              color: "#0f172a",
              fontWeight: 700,
              cursor:
                saveState === "saving" || archiveState === "saving" ? "not-allowed" : "pointer",
              opacity: saveState === "saving" || archiveState === "saving" ? 0.65 : 1,
            }}
          >
            Edit Customer
          </button>
          <Link
            to="/admin/quotes/new"
            style={{
              background: "#171717",
              color: "#ffffff",
              borderRadius: "12px",
              padding: "11px 14px",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            New Quote
          </Link>
        </div>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
          marginBottom: "18px",
        }}
      >
        <article style={summaryCardStyle}>
          <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
            Active Orders
          </span>
          <strong style={{ fontSize: "28px", color: "#171717" }}>
            {operationalSummary.activeOrders}
          </strong>
          <span style={{ color: "#475569" }}>
            Production orders still in motion for this customer.
          </span>
        </article>

        <article style={summaryCardStyle}>
          <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
            Order Balance Due
          </span>
          <strong style={{ fontSize: "28px", color: "#171717" }}>
            {currency(operationalSummary.orderBalanceDue)}
          </strong>
          <span style={{ color: "#475569" }}>
            Remaining balance across linked production orders.
          </span>
        </article>

        <article style={summaryCardStyle}>
          <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
            Counter Sales Due
          </span>
          <strong style={{ fontSize: "28px", color: "#171717" }}>
            {currency(operationalSummary.salesBalanceDue)}
          </strong>
          <span style={{ color: "#475569" }}>
            Outstanding front-counter balance still attached to this record.
          </span>
        </article>

        <article style={summaryCardStyle}>
          <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
            Last Activity
          </span>
          <strong style={{ fontSize: "20px", color: "#171717" }}>
            {formatDateTime(operationalSummary.lastActivityAt) || "No activity yet"}
          </strong>
          <span style={{ color: "#475569" }}>
            Counter payments collected: {currency(operationalSummary.paidCounterTotal)}
          </span>
        </article>
      </section>

      <div style={{ display: "grid", gap: "18px" }}>
        {canManageMerges ? (
          <section
            style={{
              ...sectionCardStyle,
              border: duplicateCandidates.length ? "1px solid #fcd34d" : "1px solid #e2e8f0",
              background: duplicateCandidates.length ? "#fffbeb" : "#ffffff",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>Duplicate Review</h2>
                <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                  Keep one canonical customer and move operational history onto it without deleting the duplicate.
                </p>
              </div>
              <strong style={{ color: duplicateCandidates.length ? "#92400e" : "#475569" }}>
                {duplicateCandidates.length} candidate{duplicateCandidates.length === 1 ? "" : "s"}
              </strong>
            </div>

            {duplicateCandidates.length ? (
              <div style={{ display: "grid", gap: "14px", marginTop: "14px" }}>
                <label style={labelStyle}>
                  Duplicate Customer
                  <select
                    value={effectiveSelectedMergeCustomerId}
                    onChange={(event) => {
                      setSelectedMergeCustomerId(event.target.value);
                      setMergeDirection("current-primary");
                      setMergeError("");
                      setMergeWarnings([]);
                      setMergeConfirmationText("");
                    }}
                    disabled={mergeState === "saving"}
                    style={fieldStyle}
                  >
                    {duplicateCandidates.map((candidate) => (
                      <option key={candidate.candidate.id} value={candidate.candidate.id}>
                        {candidate.candidate.name || candidate.candidate.id} • {candidate.signals
                          .map((signal) => signal.label)
                          .slice(0, 2)
                          .join(" / ")}
                      </option>
                    ))}
                  </select>
                </label>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => setMergeDirection("current-primary")}
                    disabled={mergeState === "saving"}
                    style={{
                      border: "1px solid #cbd5e1",
                      background: mergeDirection === "current-primary" ? "#171717" : "#ffffff",
                      color: mergeDirection === "current-primary" ? "#ffffff" : "#0f172a",
                      borderRadius: "999px",
                      padding: "9px 12px",
                      fontWeight: 700,
                      cursor: mergeState === "saving" ? "not-allowed" : "pointer",
                    }}
                  >
                    Keep {customer.name || customer.id}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMergeDirection("candidate-primary")}
                    disabled={mergeState === "saving"}
                    style={{
                      border: "1px solid #cbd5e1",
                      background: mergeDirection === "candidate-primary" ? "#171717" : "#ffffff",
                      color: mergeDirection === "candidate-primary" ? "#ffffff" : "#0f172a",
                      borderRadius: "999px",
                      padding: "9px 12px",
                      fontWeight: 700,
                      cursor: mergeState === "saving" ? "not-allowed" : "pointer",
                    }}
                  >
                    Keep {selectedMergeCustomer?.name || "selected duplicate"}
                  </button>
                </div>

                {mergePreview ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                      gap: "10px",
                    }}
                  >
                    {[
                      ["Quotes", mergePreview.counts.quotes],
                      ["Orders", mergePreview.counts.orders],
                      ["Artwork", mergePreview.counts.artwork],
                      ["Timeline", mergePreview.counts.timelineEvents],
                      ["Counter Sales", mergePreview.counts.sales],
                      ["Workflow", mergePreview.counts.activeWorkflowReferences],
                      ["Production", mergePreview.counts.productionReferences],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        style={{
                          borderRadius: "14px",
                          border: "1px solid #fde68a",
                          background: "rgba(255,255,255,0.72)",
                          padding: "12px",
                          display: "grid",
                          gap: "4px",
                        }}
                      >
                        <span style={{ color: "#78350f", fontSize: "12px", fontWeight: 800 }}>
                          {label}
                        </span>
                        <strong style={{ color: "#111827", fontSize: "24px" }}>{value}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}

                {selectedMergeCustomer ? (
                  <div style={{ display: "grid", gap: "10px" }}>
                    <div
                      style={{
                        borderRadius: "14px",
                        border: "1px solid #fde68a",
                        background: "rgba(255,255,255,0.72)",
                        padding: "12px 14px",
                        color: "#78350f",
                        fontSize: "13px",
                      }}
                    >
                      <strong style={{ color: "#92400e" }}>
                        Merge path:
                      </strong>{" "}
                      {mergeDirection === "current-primary"
                        ? `${selectedMergeCustomer.name || selectedMergeCustomer.id} -> ${customer.name || customer.id}`
                        : `${customer.name || customer.id} -> ${selectedMergeCustomer.name || selectedMergeCustomer.id}`}
                    </div>

                    <div
                      style={{
                        borderRadius: "14px",
                        border: "1px solid #fde68a",
                        background: "rgba(255,255,255,0.72)",
                        padding: "12px 14px",
                        display: "grid",
                        gap: "8px",
                      }}
                    >
                      <strong style={{ color: "#92400e", fontSize: "13px" }}>
                        Duplicate signals
                      </strong>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {duplicateCandidates
                          .find((candidate) =>
                            customerIdsEqual(candidate.candidate.id, selectedMergeCustomer.id)
                          )
                          ?.signals.map((signal) => (
                            <span
                              key={`${selectedMergeCustomer.id}-${signal.type}`}
                              title={describeSignal(signal)}
                              style={{
                                borderRadius: "999px",
                                background: "#fff7ed",
                                color: "#9a3412",
                                border: "1px solid #fdba74",
                                padding: "5px 8px",
                                fontSize: "11px",
                                fontWeight: 800,
                              }}
                            >
                              {signal.label}
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {mergePreview ? (
                  <label style={labelStyle}>
                    Type `MERGE` to confirm
                    <input
                      value={mergeConfirmationText}
                      onChange={(event) => setMergeConfirmationText(event.target.value)}
                      placeholder="MERGE"
                      disabled={mergeState === "saving"}
                      style={fieldStyle}
                    />
                  </label>
                ) : null}

                {mergeError ? (
                  <div
                    style={{
                      border: "1px solid #fecaca",
                      background: "#fff1f2",
                      color: "#9f1239",
                      borderRadius: "14px",
                      padding: "12px 14px",
                      fontWeight: 600,
                    }}
                  >
                    {mergeError}
                  </div>
                ) : null}

                {mergeWarnings.length ? (
                  <div
                    style={{
                      border: "1px solid #fed7aa",
                      background: "#fff7ed",
                      color: "#9a3412",
                      borderRadius: "14px",
                      padding: "12px 14px",
                      display: "grid",
                      gap: "4px",
                      fontWeight: 600,
                    }}
                  >
                    {mergeWarnings.map((warning) => (
                      <div key={warning}>{warning}</div>
                    ))}
                  </div>
                ) : null}

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ color: "#78350f", fontSize: "13px", fontWeight: 600 }}>
                    Confirmation is required before the duplicate is archived. Nothing is auto-deleted, and linked records stay attached to the retained customer.
                  </div>
                  <button
                    type="button"
                    onClick={handleMergeCustomers}
                    disabled={
                      mergeState === "saving" ||
                      !selectedMergeCustomer ||
                      mergeConfirmationText.trim().toUpperCase() !== "MERGE"
                    }
                    style={{
                      border: "none",
                      background: "#171717",
                      color: "#ffffff",
                      borderRadius: "12px",
                      padding: "11px 16px",
                      fontWeight: 700,
                      cursor:
                        mergeState === "saving" ||
                        !selectedMergeCustomer ||
                        mergeConfirmationText.trim().toUpperCase() !== "MERGE"
                          ? "not-allowed"
                          : "pointer",
                      opacity:
                        mergeState === "saving" ||
                        !selectedMergeCustomer ||
                        mergeConfirmationText.trim().toUpperCase() !== "MERGE"
                          ? 0.8
                          : 1,
                    }}
                  >
                    {mergeState === "saving" ? "Merging..." : "Merge Customer Records"}
                  </button>
                </div>
              </div>
            ) : (
              <div
                style={{
                  marginTop: "14px",
                  borderRadius: "14px",
                  border: "1px dashed #cbd5e1",
                  padding: "14px",
                  color: "#64748b",
                }}
              >
                No current duplicate matches detected for this customer by email, phone, or highly similar name.
              </div>
            )}
          </section>
        ) : null}

        {renderOperationalSection(
          "Active Quotes",
          "Open quote work, approvals, and deposit checkpoints for this account.",
          quoteRecords,
          "No active quotes linked to this customer yet.",
          "quote"
        )}

        {renderOperationalSection(
          "Active Orders",
          "Current production and pickup workflow in operational sequence.",
          activeOrderRecords,
          "No active production orders linked to this customer yet.",
          "order"
        )}

        {renderOperationalSection(
          "Completed Orders",
          "Recent finished work for repeat-order context and handoff history.",
          completedOrderRecords,
          "No completed orders linked to this customer yet.",
          "completed"
        )}

        <CustomerTimelineSection customerId={customer.id} />

        {isEditing ? (
          <section style={sectionCardStyle}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>Edit Customer</h2>
                <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                  Update the saved customer record without leaving the detail view.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditor}
                disabled={saveState === "saving" || archiveState === "saving"}
                style={{
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  borderRadius: "12px",
                  padding: "10px 12px",
                  color: "#0f172a",
                  fontWeight: 700,
                  cursor:
                    saveState === "saving" || archiveState === "saving" ? "not-allowed" : "pointer",
                  opacity: saveState === "saving" || archiveState === "saving" ? 0.65 : 1,
                }}
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: "grid", gap: "16px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "14px",
                }}
              >
                <label style={labelStyle}>
                  Name
                  <input
                    value={editForm.name}
                    onChange={(event) => updateEditForm("name", event.target.value)}
                    style={fieldStyle}
                    placeholder="Customer name"
                    disabled={saveState === "saving"}
                  />
                </label>
                <label style={labelStyle}>
                  Company
                  <input
                    value={editForm.company}
                    onChange={(event) => updateEditForm("company", event.target.value)}
                    style={fieldStyle}
                    placeholder="Company"
                    disabled={saveState === "saving"}
                  />
                </label>
                <label style={labelStyle}>
                  Phone
                  <input
                    value={editForm.phone}
                    onChange={(event) => updateEditForm("phone", event.target.value)}
                    style={fieldStyle}
                    placeholder="Phone"
                    disabled={saveState === "saving"}
                  />
                </label>
                <label style={labelStyle}>
                  Email
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(event) => updateEditForm("email", event.target.value)}
                    style={fieldStyle}
                    placeholder="Email"
                    disabled={saveState === "saving"}
                  />
                </label>
              </div>

              <label style={labelStyle}>
                Notes
                <textarea
                  value={editForm.notes}
                  onChange={(event) => updateEditForm("notes", event.target.value)}
                  style={{ ...fieldStyle, minHeight: "120px", resize: "vertical" }}
                  placeholder="Operational notes, relationship context, or follow-up details."
                  disabled={saveState === "saving"}
                />
              </label>

              {saveError ? (
                <div
                  style={{
                    border: "1px solid #fecaca",
                    background: "#fff1f2",
                    color: "#9f1239",
                    borderRadius: "14px",
                    padding: "12px 14px",
                    fontWeight: 600,
                  }}
                >
                  {saveError}
                </div>
              ) : null}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div style={{ color: "#64748b", fontSize: "14px", fontWeight: 600 }}>
                  {saveState === "saving" ? "Saving customer changes..." : "Changes save to the live customer record."}
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleArchiveToggle}
                    disabled={saveState === "saving" || archiveState === "saving"}
                    style={{
                      border: "1px solid #fca5a5",
                      background: "#fff1f2",
                      color: "#9f1239",
                      borderRadius: "12px",
                      padding: "11px 14px",
                      fontWeight: 700,
                      cursor:
                        saveState === "saving" || archiveState === "saving"
                          ? "not-allowed"
                          : "pointer",
                      opacity: saveState === "saving" || archiveState === "saving" ? 0.65 : 1,
                    }}
                  >
                    {archiveState === "saving"
                      ? customer.archived
                        ? "Restoring..."
                        : "Archiving..."
                      : customer.archived
                        ? "Restore Customer"
                        : "Archive Customer"}
                  </button>
                  <button
                    type="submit"
                    disabled={saveState === "saving" || archiveState === "saving"}
                    style={{
                      border: "none",
                      background: "#171717",
                      color: "#ffffff",
                      borderRadius: "12px",
                      padding: "11px 16px",
                      fontWeight: 700,
                      cursor:
                        saveState === "saving" || archiveState === "saving"
                          ? "not-allowed"
                          : "pointer",
                      opacity: saveState === "saving" || archiveState === "saving" ? 0.8 : 1,
                    }}
                  >
                    {saveState === "saving" ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>

              {archiveError ? (
                <div
                  style={{
                    border: "1px solid #fecaca",
                    background: "#fff1f2",
                    color: "#9f1239",
                    borderRadius: "14px",
                    padding: "12px 14px",
                    fontWeight: 600,
                  }}
                >
                  {archiveError}
                </div>
              ) : null}
            </form>
          </section>
        ) : null}

        <section style={sectionCardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: 0 }}>Contact Information</h2>
            <button
              type="button"
              onClick={handleArchiveToggle}
              disabled={saveState === "saving" || archiveState === "saving"}
              style={{
                border: customer.archived ? "1px solid #86efac" : "1px solid #fca5a5",
                background: customer.archived ? "#f0fdf4" : "#fff1f2",
                color: customer.archived ? "#166534" : "#9f1239",
                borderRadius: "12px",
                padding: "10px 12px",
                fontWeight: 700,
                cursor:
                  saveState === "saving" || archiveState === "saving" ? "not-allowed" : "pointer",
                opacity: saveState === "saving" || archiveState === "saving" ? 0.65 : 1,
              }}
            >
              {archiveState === "saving"
                ? customer.archived
                  ? "Restoring..."
                  : "Archiving..."
                : customer.archived
                  ? "Restore Customer"
                  : "Archive Customer"}
            </button>
          </div>
          <p><strong>Company:</strong> {customer.company || "—"}</p>
          <p><strong>Phone:</strong> {customer.phone || "—"}</p>
          <p><strong>Email:</strong> {customer.email || "—"}</p>
          {customer.notes && <p><strong>Notes:</strong> {customer.notes}</p>}
          {archiveError ? (
            <div
              style={{
                marginTop: "14px",
                border: "1px solid #fecaca",
                background: "#fff1f2",
                color: "#9f1239",
                borderRadius: "14px",
                padding: "12px 14px",
                fontWeight: 600,
              }}
            >
              {archiveError}
            </div>
          ) : null}
          {customer.archived_at ? (
            <p style={{ color: "#64748b", marginBottom: 0 }}>
              <strong>Status:</strong> {customer.archived ? "Archived" : "Active"}
              {customer.archived ? ` on ${formatDateTime(customer.archived_at)}` : ""}
            </p>
          ) : null}
        </section>

        <CustomerArtworkSection customerId={customer.id} customerName={customer.name} />

        <section style={sectionCardStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: "14px",
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>Payment & Counter Activity</h2>
              <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                Quick sales and in-person payment visibility for day-to-day follow-up.
              </p>
            </div>
            <strong>{customerSales.length} counter sales</strong>
          </div>

          {customerSales.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 8px" }}>Sale</th>
                    <th style={{ padding: "10px 8px" }}>Payment</th>
                    <th style={{ padding: "10px 8px" }}>Paid</th>
                    <th style={{ padding: "10px 8px" }}>Balance</th>
                    <th style={{ padding: "10px 8px" }}>Linked Orders</th>
                    <th style={{ padding: "10px 8px" }}>Date</th>
                    <th style={{ padding: "10px 8px" }}>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {customerSales.map((sale) => (
                    <tr key={sale.sale_number} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "12px 8px", fontWeight: 700 }}>
                        {sale.sale_number}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <div>{sale.payment_method || "Not recorded"}</div>
                        <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                          {sale.payment_status || "Unknown"}
                        </div>
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        {currency(sale.amount_paid ?? sale.total)}
                      </td>
                      <td
                        style={{
                          padding: "12px 8px",
                          fontWeight: 700,
                          color: Number(sale.balance_due || 0) > 0 ? "#b45309" : "#166534",
                        }}
                      >
                        {currency(sale.balance_due)}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        {(sale.production_order_numbers || []).length
                          ? sale.production_order_numbers.join(", ")
                          : "None"}
                      </td>
                      <td style={{ padding: "12px 8px", color: "#64748b" }}>
                        {formatDateTime(sale.created_at) || "—"}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <Link
                          to={`/admin/sales/receipt/${sale.sale_number}`}
                          style={{ fontWeight: 700 }}
                        >
                          Open receipt
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: "#94a3b8" }}>No counter sales have been linked to this customer yet.</p>
          )}
        </section>

      </div>
    </div>
  );
}
