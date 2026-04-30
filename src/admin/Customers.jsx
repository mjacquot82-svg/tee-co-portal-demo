cat > src/admin/Customers.jsx <<'EOF'
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createStoredCustomer, getStoredCustomers } from "../lib/customersStore";

export default function Customers() {
  const [customers, setCustomers] = useState([]);
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
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px" }}>
      <h1>Customers</h1>

      <form onSubmit={handleSubmit} style={{ background: "#fff", padding: "20px", borderRadius: "18px", marginBottom: "18px", display: "grid", gap: "12px" }}>
        <h2>Add Customer</h2>

        <input placeholder="Customer name" value={form.name} onChange={(e) => updateForm("name", e.target.value)} />
        <input placeholder="Company" value={form.company} onChange={(e) => updateForm("company", e.target.value)} />
        <input placeholder="Phone" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} />
        <input placeholder="Email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} />
        <textarea placeholder="Notes" value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} />

        <button type="submit">Save Customer</button>
      </form>

      <div style={{ background: "#fff", padding: "20px", borderRadius: "18px" }}>
        <h2>Customer List</h2>

        {customers.length ? (
          customers.map((customer) => (
            <div key={customer.id} style={{ borderBottom: "1px solid #e2e8f0", padding: "12px 0" }}>
              <Link to={`/admin/customers/${customer.id}`} style={{ fontWeight: 700 }}>
                {customer.name}
              </Link>
              <div>{customer.company || "No company"}</div>
              <div>{customer.phone || "No phone"}</div>
              <div>{customer.email || "No email"}</div>
            </div>
          ))
        ) : (
          <p>No customers yet.</p>
        )}
      </div>
    </div>
  );
}
EOF

git add src/admin/Customers.jsx
git commit -m "Add customer creation form"
git push