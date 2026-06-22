import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { customerIdsEqual } from "../lib/customerIds";
import { buildPotentialDuplicateCustomerGroups } from "../lib/customerDuplicates";
import { createStoredCustomer, useStoredCustomers } from "../lib/customersStore";
import { getStoredOrders } from "../lib/ordersStore";
import { getStoredQuickSales } from "../lib/salesStore";

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

function formatDate(value) {
  if (!value) return "Recently added";

  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Recently added";
  }
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return normalize(value).replace(/\D/g, "");
}

function buildSearchText(customer) {
  return [
    customer.name,
    customer.company,
    customer.phone,
    customer.email,
    ...(customer.order_numbers || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesSavedCustomer(customer, record) {
  if (!customer) return false;

  if (customer.id && record.customer_id && customerIdsEqual(customer.id, record.customer_id)) {
    return true;
  }

  const customerName = normalize(customer.name);
  const customerEmail = normalize(customer.email);
  const customerPhone = normalizePhone(customer.phone);
  const recordName = normalize(record.customer_name || record.name);
  const recordEmail = normalize(record.email);
  const recordPhone = normalizePhone(record.phone);
  const linkedOrders = new Set(customer.order_numbers || []);

  if (record.order_number && linkedOrders.has(record.order_number)) {
    return true;
  }

  if (customerName && recordName && customerName === recordName) {
    return true;
  }

  if (customerEmail && recordEmail && customerEmail === recordEmail) {
    return true;
  }

  if (customerPhone && recordPhone && customerPhone === recordPhone) {
    return true;
  }

  return false;
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

export default function Customers() {
  const customers = useStoredCustomers();
  const [orders] = useState(() => getStoredOrders());
  const [sales] = useState(() => getStoredQuickSales());
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({
    name: "",
    company: "",
    phone: "",
    email: "",
    notes: "",
  });

  const customerRecords = useMemo(() => {
    return customers
      .map((customer) => {
        const relatedOrders = orders.filter((order) => matchesSavedCustomer(customer, order));
        const relatedSales = sales.filter((sale) => matchesSavedCustomer(customer, sale));
        const openOrders = relatedOrders.filter(
          (order) =>
            order.operational_visible !== false &&
            !["Completed", "Picked Up", "Canceled"].includes(order.status)
        );
        const balanceDue = relatedOrders.reduce(
          (sum, order) => sum + Number(order.balance_due || 0),
          0
        );
        const counterBalanceDue = relatedSales.reduce(
          (sum, sale) => sum + Number(sale.balance_due || 0),
          0
        );
        const totalSales = relatedSales.reduce(
          (sum, sale) => sum + Number(sale.total || 0),
          0
        );
        const lastActivityAt = [customer.updated_at, customer.created_at]
          .concat(relatedOrders.map((order) => order.updated_at || order.created_at || order.date))
          .concat(relatedSales.map((sale) => sale.updated_at || sale.created_at))
          .sort(compareTimestamps)[0];

        return {
          ...customer,
          relatedOrders,
          relatedSales,
          openOrders,
          balanceDue,
          counterBalanceDue,
          totalSales,
          lastActivityAt,
        };
      })
      .sort((left, right) => compareTimestamps(left.lastActivityAt, right.lastActivityAt));
  }, [customers, orders, sales]);

  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const phoneQuery = normalizePhone(searchTerm);

    if (!query && !phoneQuery) return customerRecords;

    return customerRecords.filter((customer) => {
      const searchText = buildSearchText(customer);
      const customerPhone = normalizePhone(customer.phone);

      return (
        searchText.includes(query) ||
        (phoneQuery.length >= 3 && customerPhone.includes(phoneQuery))
      );
    });
  }, [customerRecords, searchTerm]);

  const duplicateGroups = useMemo(
    () => buildPotentialDuplicateCustomerGroups(customerRecords),
    [customerRecords]
  );

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.name.trim()) {
      alert("Please enter a customer name.");
      return;
    }

    try {
      await createStoredCustomer(form);
      setForm({ name: "", company: "", phone: "", email: "", notes: "" });
    } catch (error) {
      console.error("Unable to create customer", error);
      alert(error?.message || "Unable to create customer.");
    }
  }

  return (
    <div
      style={{
        maxWidth: "1200px",
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
          gap: "16px",
          alignItems: "flex-end",
          flexWrap: "wrap",
          marginBottom: "22px",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: "#78716c",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Records
          </p>
          <h1 style={{ margin: "6px 0 8px", fontSize: "32px" }}>Customers</h1>
          <p style={{ margin: 0, color: "#475569", maxWidth: "760px" }}>
            Find, open, or create a customer record here. Operational queue detail and financial follow-up live in the workspaces that own them.
          </p>
        </div>

        <div style={{ display: "grid", gap: "4px", textAlign: "right" }}>
          <strong style={{ fontSize: "28px", color: "#171717" }}>{customers.length}</strong>
          <span style={{ color: "#64748b", fontWeight: 700 }}>Saved Customers</span>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 0.95fr) minmax(0, 1.35fr)",
          gap: "18px",
          alignItems: "start",
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            background: "#ffffff",
            padding: "24px",
            borderRadius: "20px",
            display: "grid",
            gap: "18px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <div>
            <h2 style={{ margin: "0 0 6px", fontSize: "22px" }}>Add Customer</h2>
            <p style={{ margin: 0, color: "#64748b" }}>
              Keep intake lightweight. Save the core contact now and fill in the rest
              when more history builds up.
            </p>
          </div>

          <div style={{ display: "grid", gap: "16px" }}>
            <label style={labelStyle}>
              Customer Name
              <input
                placeholder="ABC Construction"
                value={form.name}
                onChange={(event) => updateForm("name", event.target.value)}
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Company
              <input
                placeholder="Company name"
                value={form.company}
                onChange={(event) => updateForm("company", event.target.value)}
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Phone
              <input
                placeholder="(555) 123-4567"
                value={form.phone}
                onChange={(event) => updateForm("phone", event.target.value)}
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Email
              <input
                type="email"
                placeholder="customer@example.com"
                value={form.email}
                onChange={(event) => updateForm("email", event.target.value)}
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Notes
              <textarea
                placeholder="Pickup instructions, billing preference, artwork reminders, or reorder details."
                value={form.notes}
                onChange={(event) => updateForm("notes", event.target.value)}
                style={{ ...fieldStyle, minHeight: "92px", resize: "vertical" }}
              />
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="submit"
              style={{
                background: "#171717",
                color: "#ffffff",
                border: "none",
                borderRadius: "12px",
                padding: "13px 18px",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Save Customer
            </button>
          </div>
        </form>

        <section
          style={{
            background: "#ffffff",
            padding: "24px",
            borderRadius: "20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          {duplicateGroups.length ? (
            <div
              style={{
                marginBottom: "18px",
                border: "1px solid #fde68a",
                background: "#fffbeb",
                borderRadius: "16px",
                padding: "16px",
                display: "grid",
                gap: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong style={{ color: "#92400e" }}>
                    {duplicateGroups.length} potential duplicate group
                    {duplicateGroups.length === 1 ? "" : "s"}
                  </strong>
                  <p style={{ margin: "4px 0 0", color: "#78350f", fontSize: "13px" }}>
                    Review these before customer history splits further across quotes, orders, artwork, and payments.
                  </p>
                </div>
                <span
                  style={{
                    borderRadius: "999px",
                    border: "1px solid #f59e0b",
                    padding: "6px 10px",
                    fontSize: "12px",
                    fontWeight: 800,
                    color: "#92400e",
                  }}
                >
                  Operator review
                </span>
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                {duplicateGroups.slice(0, 4).map((group) => (
                  <div
                    key={group.id}
                    style={{
                      display: "grid",
                      gap: "12px",
                      borderRadius: "14px",
                      padding: "12px 14px",
                      background: "rgba(255,255,255,0.72)",
                      border: "1px solid #fde68a",
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
                        <strong style={{ color: "#1f2937" }}>
                          {group.customers.map((customer) => customer.name || customer.id).join(" / ")}
                        </strong>
                        <div style={{ marginTop: "4px", color: "#6b7280", fontSize: "12px" }}>
                          {group.customers.length} linked records under review
                        </div>
                      </div>

                      <Link
                        to={`/admin/customers/${group.customers[0].id}`}
                        style={{ color: "#0f172a", fontWeight: 800, textDecoration: "none" }}
                      >
                        Review merge
                      </Link>
                    </div>

                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {group.pairs
                        .flatMap((pair) => pair.signals)
                        .slice(0, 4)
                        .map((signal, index) => (
                        <span
                          key={`${group.id}-${signal.type}-${index}`}
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

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "10px",
                      }}
                    >
                      {group.customers.map((customer) => (
                        <div
                          key={customer.id}
                          style={{
                            borderRadius: "12px",
                            border: "1px solid #fde68a",
                            background: "#ffffff",
                            padding: "10px 12px",
                            display: "grid",
                            gap: "4px",
                          }}
                        >
                          <strong style={{ color: "#111827", fontSize: "13px" }}>
                            {customer.name || customer.id}
                          </strong>
                          <span style={{ color: "#6b7280", fontSize: "12px" }}>
                            {[customer.phone, customer.email].filter(Boolean).join(" • ") ||
                              "No contact info"}
                          </span>
                          <span style={{ color: "#92400e", fontSize: "12px", fontWeight: 700 }}>
                            {customer.relatedOrders.length} orders • {customer.relatedSales.length} sales
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: "18px",
            }}
          >
            <div>
              <h2 style={{ margin: "0 0 6px", fontSize: "22px" }}>Customer Records</h2>
              <p style={{ margin: 0, color: "#64748b" }}>
                Open a profile to review contact details, order history, artwork, and payment visibility.
              </p>
            </div>

            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, phone, email, or order..."
              style={{ ...fieldStyle, maxWidth: "320px" }}
            />
          </div>

          {filteredCustomers.length ? (
            <div style={{ display: "grid", gap: "12px" }} data-testid="customer-records-list">
              {filteredCustomers.map((customer) => (
                <Link
                  key={customer.id}
                  to={`/admin/customers/${customer.id}`}
                  data-testid="customer-record-link"
                  data-customer-id={customer.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(220px, 1.4fr) repeat(2, minmax(160px, 0.8fr)) minmax(140px, auto)",
                    gap: "14px",
                    alignItems: "center",
                    padding: "16px",
                    border: "1px solid #e2e8f0",
                    borderRadius: "16px",
                    color: "inherit",
                    textDecoration: "none",
                    background: "#f8fafc",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "17px", color: "#171717" }}>{customer.name}</strong>
                    <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                      {customer.company || "No company saved"}
                    </p>
                    <p style={{ margin: "6px 0 0", color: "#475569", fontSize: "13px" }}>
                      {[customer.phone, customer.email].filter(Boolean).join(" • ") || "No contact info"}
                    </p>
                  </div>

                  <div style={{ color: "#475569" }}>
                    <strong style={{ display: "block", color: "#292524", fontSize: "13px" }}>
                      Orders
                    </strong>
                    {customer.relatedOrders.length} linked
                    <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                      {customer.openOrders.length} active
                    </div>
                  </div>

                  <div style={{ color: "#475569" }}>
                    <strong style={{ display: "block", color: "#292524", fontSize: "13px" }}>
                      Linked Records
                    </strong>
                    {customer.relatedOrders.length} orders
                    <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                      {customer.relatedSales.length} counter sales
                    </div>
                  </div>

                  <div style={{ color: "#475569" }}>
                    <strong style={{ display: "block", color: "#292524", fontSize: "13px" }}>
                      Recent Activity
                    </strong>
                    {formatDate(customer.lastActivityAt)}
                    <div style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                      {customer.openOrders.length} open orders
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      justifyItems: "end",
                      gap: "8px",
                      textAlign: "right",
                    }}
                  >
                    {duplicateGroups.some((group) =>
                      group.customers.some((entry) => entry.id === customer.id)
                    ) ? (
                      <span
                        style={{
                          borderRadius: "999px",
                          background: "#fffbeb",
                          color: "#92400e",
                          border: "1px solid #fcd34d",
                          padding: "6px 10px",
                          fontSize: "11px",
                          fontWeight: 900,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                        }}
                      >
                        Duplicate review
                      </span>
                    ) : null}
                    <span style={{ color: "#0f172a", fontWeight: 800 }}>View record</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div
              style={{
                border: "1px dashed #cbd5e1",
                borderRadius: "16px",
                padding: "28px",
                textAlign: "center",
                background: "#f8fafc",
              }}
            >
              <strong style={{ display: "block", marginBottom: "6px", color: "#292524" }}>
                {customers.length ? "No matching customers" : "No customers yet"}
              </strong>
              <p style={{ margin: 0, color: "#64748b" }}>
                {customers.length
                  ? "Try a different search term."
                  : "Add the first customer to make the lookup workspace operational."}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
