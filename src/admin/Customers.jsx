import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStoredCustomers } from "../lib/customersStore";

export default function Customers() {
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    setCustomers(getStoredCustomers());
  }, []);

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
          marginBottom: "20px",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Customers</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b" }}>
            Search customers and open profiles to view repeat order history.
          </p>
        </div>

        <Link
          to="/admin"
          style={{
            border: "1px solid #cbd5e1",
            borderRadius: "12px",
            padding: "10px 14px",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Back to Dashboard
        </Link>
      </div>

      <div
        style={{
          background: "#ffffff",
          borderRadius: "18px",
          padding: "20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        {customers.length ? (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#64748b" }}>
                <th>Name</th>
                <th>Company</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} style={{ borderTop: "1px solid #e2e8f0" }}>
                  <td>
                    <Link
                      to={`/admin/customers/${customer.id}`}
                      style={{ fontWeight: 600, textDecoration: "none" }}
                    >
                      {customer.name}
                    </Link>
                  </td>
                  <td>{customer.company || "—"}</td>
                  <td>{customer.phone || "—"}</td>
                  <td>{customer.email || "—"}</td>
                  <td>{customer.order_numbers?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: "#94a3b8" }}>No customers yet.</p>
        )}
      </div>
    </div>
  );
}
