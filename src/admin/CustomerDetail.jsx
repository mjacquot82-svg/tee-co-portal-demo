import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { findStoredCustomer } from "../lib/customersStore";
import { duplicateStoredOrder, getStoredOrders } from "../lib/ordersStore";
import StatusBadge from "../components/StatusBadge";

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

function fileSizeLabel(size) {
  const bytes = Number(size || 0);
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CustomerDetail() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    setCustomer(findStoredCustomer(customerId));
    setOrders(getStoredOrders());
  }, [customerId]);

  const customerOrders = useMemo(() => {
    if (!customer) return [];
    const linkedNumbers = new Set(customer.order_numbers || []);
    return orders.filter(
      (order) =>
        order.customer_id === customer.id ||
        linkedNumbers.has(order.order_number) ||
        order.customer_name === customer.name
    );
  }, [customer, orders]);

  const customerArtwork = useMemo(() => {
    if (!customer) return [];

    return customerOrders.flatMap((order) =>
      (order.artwork_files || []).map((file) => ({
        ...file,
        source_order_number: order.order_number,
        source_order_status: order.status,
        source_order_garment: order.garment,
        customer_name: file.customer_name || order.customer_name || customer.name,
      }))
    );
  }, [customer, customerOrders]);

  function handleDuplicate(orderNumber) {
    const duplicated = duplicateStoredOrder(orderNumber);
    if (duplicated) {
      navigate(`/admin/orders/${duplicated.order_number}`);
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
        maxWidth: "1100px",
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
            View contact details, artwork library, notes, and repeat order history.
          </p>
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
          <Link
            to="/admin/orders/new"
            style={{
              background: "#171717",
              color: "#ffffff",
              borderRadius: "12px",
              padding: "11px 14px",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            New Order
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gap: "18px" }}>
        <section
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "22px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Contact Information</h2>
          <p><strong>Company:</strong> {customer.company || "—"}</p>
          <p><strong>Phone:</strong> {customer.phone || "—"}</p>
          <p><strong>Email:</strong> {customer.email || "—"}</p>
          {customer.notes && <p><strong>Notes:</strong> {customer.notes}</p>}
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "22px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
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
              <h2 style={{ margin: 0 }}>Artwork Library</h2>
              <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                Reusable customer artwork collected automatically from production orders.
              </p>
            </div>
            <strong>{customerArtwork.length} files</strong>
          </div>

          {customerArtwork.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
              {customerArtwork.map((file) => (
                <article
                  key={`${file.source_order_number}-${file.id}`}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "16px",
                    padding: "12px",
                    background: "#f8fafc",
                  }}
                >
                  <div
                    style={{
                      height: "130px",
                      borderRadius: "12px",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      color: "#64748b",
                      marginBottom: "10px",
                    }}
                  >
                    {file.type?.startsWith("image/") ? (
                      <img src={file.preview} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    ) : (
                      "File attached"
                    )}
                  </div>

                  <strong style={{ display: "block", fontSize: "14px" }}>{file.name}</strong>
                  <span style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "3px" }}>
                    {fileSizeLabel(file.size)} • {file.archived ? "Archived" : "Active"}
                  </span>
                  <span style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "3px" }}>
                    Uploaded {formatDateTime(file.uploaded_at) || "—"}
                  </span>
                  {file.uploaded_by_staff_name && (
                    <span style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "3px" }}>
                      By {file.uploaded_by_staff_name}
                    </span>
                  )}
                  <Link
                    to={`/admin/orders/${file.source_order_number}`}
                    style={{ display: "inline-block", marginTop: "8px", fontSize: "12px", fontWeight: 800, color: "#0f172a" }}
                  >
                    Source order {file.source_order_number}
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p style={{ color: "#94a3b8" }}>No artwork has been attached to this customer yet.</p>
          )}
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "22px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
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
              <h2 style={{ margin: 0 }}>Order History</h2>
              <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                Repeat jobs and past garment/artwork choices appear here.
              </p>
            </div>
            <strong>{customerOrders.length} orders</strong>
          </div>

          {customerOrders.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ padding: "10px 8px" }}>Order</th>
                    <th style={{ padding: "10px 8px" }}>Garment</th>
                    <th style={{ padding: "10px 8px" }}>Qty</th>
                    <th style={{ padding: "10px 8px" }}>Status</th>
                    <th style={{ padding: "10px 8px" }}>Due</th>
                    <th style={{ padding: "10px 8px" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customerOrders.map((order) => (
                    <tr key={order.order_number} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "12px 8px" }}>
                        <Link to={`/admin/orders/${order.order_number}`} style={{ fontWeight: 700 }}>
                          {order.order_number}
                        </Link>
                      </td>
                      <td style={{ padding: "12px 8px" }}>{order.garment || "—"}</td>
                      <td style={{ padding: "12px 8px" }}>{order.qty || "—"}</td>
                      <td style={{ padding: "12px 8px" }}>
                        <StatusBadge status={order.status || "Awaiting Artwork"} />
                      </td>
                      <td style={{ padding: "12px 8px" }}>{order.due_date || "—"}</td>
                      <td style={{ padding: "12px 8px" }}>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(order.order_number)}
                          style={{
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            borderRadius: "10px",
                            padding: "8px 10px",
                            cursor: "pointer",
                            fontWeight: 700,
                          }}
                        >
                          Duplicate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: "#94a3b8" }}>No linked orders yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
