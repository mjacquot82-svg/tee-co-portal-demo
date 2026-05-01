import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createStoredCustomer, getStoredCustomers } from "../lib/customersStore";

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

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({
    name: "",
    company: "",
    phone: "",
    email: "",
    notes: "",
  });

  useEffect(() => {
    setCustomers(getStoredCustomers());
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return customers;

    return customers.filter((customer) =>
      [customer.name, customer.company, customer.phone, customer.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [customers, searchTerm]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!form.name.trim()) {
      alert("Please enter a customer name.");
      return;
    }

    createStoredCustomer(form);
    setCustomers(getStoredCustomers());
    setForm({ name: "", company: "", phone: "", email: "", notes: "" });
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
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "22px" }}>
        <div>
          <p style={{ margin: 0, color: "#78716c", fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Records
          </p>
          <h1 style={{ margin: "6px 0 8px", fontSize: "32px" }}>Customers</h1>
          <p style={{ margin: 0, color: "#475569" }}>
            Add walk-in, phone, and repeat customers so sales and production orders can stay connected.
          </p>
        </div>

        <div style={{ display: "grid", gap: "4px", textAlign: "right" }}>
          <strong style={{ fontSize: "28px", color: "#171717" }}>{customers.length}</strong>
          <span style={{ color: "#64748b", fontWeight: 700 }}>Saved Customers</span>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          background: "#ffffff",
          padding: "24px",
          borderRadius: "20px",
          marginBottom: "18px",
          display: "grid",
          gap: "18px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 6px", fontSize: "22px" }}>Add Customer</h2>
          <p style={{ margin: 0, color: "#64748b" }}>
            Customer name is required. Everything else can be filled in later from the customer profile.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
          <label style={labelStyle}>
            Customer Name
            <input placeholder="ABC Construction" value={form.name} onChange={(event) => updateForm("name", event.target.value)} style={fieldStyle} />
          </label>

          <label style={labelStyle}>
            Company
            <input placeholder="Company name" value={form.company} onChange={(event) => updateForm("company", event.target.value)} style={fieldStyle} />
          </label>

          <label style={labelStyle}>
            Phone
            <input placeholder="(555) 123-4567" value={form.phone} onChange={(event) => updateForm("phone", event.target.value)} style={fieldStyle} />
          </label>

          <label style={labelStyle}>
            Email
            <input type="email" placeholder="customer@example.com" value={form.email} onChange={(event) => updateForm("email", event.target.value)} style={fieldStyle} />
          </label>
        </div>

        <label style={labelStyle}>
          Notes
          <textarea placeholder="Customer preferences, billing notes, logo details, or reorder reminders." value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} style={{ ...fieldStyle, minHeight: "92px", resize: "vertical" }} />
        </label>

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
        <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center", flexWrap: "wrap", marginBottom: "18px" }}>
          <div>
            <h2 style={{ margin: "0 0 6px", fontSize: "22px" }}>Customer List</h2>
            <p style={{ margin: 0, color: "#64748b" }}>
              Open a customer profile to view linked orders and customer details.
            </p>
          </div>

          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search customers..."
            style={{ ...fieldStyle, maxWidth: "280px" }}
          />
        </div>

        {filteredCustomers.length ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {filteredCustomers.map((customer) => (
              <Link
                key={customer.id}
                to={`/admin/customers/${customer.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 1.1fr) minmax(180px, 0.9fr) minmax(180px, 0.9fr) auto",
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
                  <p style={{ margin: "4px 0 0", color: "#64748b" }}>{customer.company || "No company saved"}</p>
                </div>

                <div style={{ color: "#475569" }}>
                  <strong style={{ display: "block", color: "#292524", fontSize: "13px" }}>Contact</strong>
                  {[customer.phone, customer.email].filter(Boolean).join(" • ") || "No contact info"}
                </div>

                <div style={{ color: "#475569" }}>
                  <strong style={{ display: "block", color: "#292524", fontSize: "13px" }}>Orders</strong>
                  {(customer.order_numbers || []).length} linked
                </div>

                <div style={{ textAlign: "right", color: "#64748b", fontWeight: 700 }}>
                  {formatDate(customer.created_at)}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div style={{ border: "1px dashed #cbd5e1", borderRadius: "16px", padding: "28px", textAlign: "center", background: "#f8fafc" }}>
            <strong style={{ display: "block", marginBottom: "6px", color: "#292524" }}>
              {customers.length ? "No matching customers" : "No customers yet"}
            </strong>
            <p style={{ margin: 0, color: "#64748b" }}>
              {customers.length ? "Try a different search term." : "Add the first customer above to start building the records area."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
