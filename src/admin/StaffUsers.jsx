import { useEffect, useState } from "react";
import {
  getStoredStaffUsers,
  createStoredStaffUser,
  updateStoredStaffUser,
  disableStoredStaffUser,
  STAFF_ROLES,
  isActiveStaffOwner,
} from "../lib/staffUsersStore";

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: "12px",
  border: "1px solid #d6d3d1",
  fontSize: "14px",
  boxSizing: "border-box",
};

const buttonStyle = {
  border: "none",
  borderRadius: "12px",
  padding: "11px 14px",
  fontWeight: 800,
  cursor: "pointer",
};

function cleanPin(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 4);
}

export default function StaffUsers() {
  const [staffUsers, setStaffUsers] = useState([]);
  const [newUser, setNewUser] = useState({ name: "", role: "Staff", pin: "" });
  const [pinUpdates, setPinUpdates] = useState({});
  const [message, setMessage] = useState("");

  const isOwner = isActiveStaffOwner();

  useEffect(() => {
    setStaffUsers(getStoredStaffUsers());
  }, []);

  function refresh() {
    setStaffUsers(getStoredStaffUsers());
  }

  function handleCreate(event) {
    event.preventDefault();
    setMessage("");

    if (!newUser.name.trim()) {
      setMessage("Enter a staff name first.");
      return;
    }

    if (newUser.pin.length !== 4) {
      setMessage("PIN must be 4 digits.");
      return;
    }

    createStoredStaffUser({ ...newUser, name: newUser.name.trim() });
    setNewUser({ name: "", role: "Staff", pin: "" });
    setMessage("Staff user created.");
    refresh();
  }

  function handleDisable(id) {
    disableStoredStaffUser(id);
    setMessage("Staff user disabled.");
    refresh();
  }

  function handleRoleChange(id, role) {
    updateStoredStaffUser(id, { role });
    setMessage("Role updated.");
    refresh();
  }

  function handlePinInput(id, value) {
    setPinUpdates((current) => ({ ...current, [id]: cleanPin(value) }));
  }

  function handlePinReset(id) {
    const nextPin = pinUpdates[id] || "";

    if (nextPin.length !== 4) {
      setMessage("Enter a 4-digit PIN before saving.");
      return;
    }

    updateStoredStaffUser(id, { pin: nextPin });
    setPinUpdates((current) => ({ ...current, [id]: "" }));
    setMessage("PIN updated.");
    refresh();
  }

  if (!isOwner) {
    return (
      <div style={{ padding: "24px" }}>
        <h2>Staff Users</h2>
        <p>Only the Owner can manage staff accounts.</p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "24px",
        maxWidth: "1050px",
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ marginBottom: "22px" }}>
        <p style={{ margin: 0, color: "#78716c", fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Owner Admin
        </p>
        <h1 style={{ margin: "6px 0 8px", fontSize: "34px" }}>Staff Users</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Manage employee access, roles, PINs, and active status for Central Operations.
        </p>
      </div>

      {message && (
        <div
          style={{
            marginBottom: "18px",
            padding: "12px 14px",
            borderRadius: "14px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            color: "#292524",
            fontWeight: 700,
          }}
        >
          {message}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        style={{
          background: "#ffffff",
          border: "1px solid #e7e5e4",
          borderRadius: "20px",
          padding: "20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          marginBottom: "22px",
        }}
      >
        <h2 style={{ margin: "0 0 14px", fontSize: "22px" }}>Add Staff Member</h2>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1.5fr) minmax(150px, 1fr) minmax(110px, 0.8fr) auto", gap: "12px", alignItems: "end" }}>
          <label style={{ display: "grid", gap: "7px", fontWeight: 700 }}>
            Name
            <input
              placeholder="Employee name"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              style={inputStyle}
            />
          </label>

          <label style={{ display: "grid", gap: "7px", fontWeight: 700 }}>
            Role
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              style={inputStyle}
            >
              {STAFF_ROLES.map((role) => (
                <option key={role}>{role}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: "7px", fontWeight: 700 }}>
            PIN
            <input
              placeholder="1234"
              inputMode="numeric"
              maxLength={4}
              value={newUser.pin}
              onChange={(e) => setNewUser({ ...newUser, pin: cleanPin(e.target.value) })}
              style={{ ...inputStyle, letterSpacing: "0.12em" }}
            />
          </label>

          <button type="submit" style={{ ...buttonStyle, background: "#171717", color: "#ffffff" }}>
            Create
          </button>
        </div>
      </form>

      <section
        style={{
          background: "#ffffff",
          border: "1px solid #e7e5e4",
          borderRadius: "20px",
          padding: "20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ marginBottom: "14px" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: "22px" }}>Employee List</h2>
          <p style={{ margin: 0, color: "#64748b" }}>
            PINs are not shown after saving. Enter a new PIN only when resetting access.
          </p>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "820px" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#78716c", fontSize: "12px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                <th style={{ padding: "10px", borderBottom: "1px solid #e7e5e4" }}>Name</th>
                <th style={{ padding: "10px", borderBottom: "1px solid #e7e5e4" }}>Role</th>
                <th style={{ padding: "10px", borderBottom: "1px solid #e7e5e4" }}>Status</th>
                <th style={{ padding: "10px", borderBottom: "1px solid #e7e5e4" }}>Reset PIN</th>
                <th style={{ padding: "10px", borderBottom: "1px solid #e7e5e4" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {staffUsers.map((user) => (
                <tr key={user.id}>
                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 800 }}>{user.name}</td>

                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #f1f5f9" }}>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      style={inputStyle}
                    >
                      {STAFF_ROLES.map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </select>
                  </td>

                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #f1f5f9" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        borderRadius: "999px",
                        padding: "6px 10px",
                        background: user.status === "Active" ? "#ecfdf5" : "#f1f5f9",
                        color: user.status === "Active" ? "#047857" : "#64748b",
                        fontWeight: 900,
                        fontSize: "12px",
                      }}
                    >
                      {user.status}
                    </span>
                  </td>

                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #f1f5f9" }}>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        placeholder="New PIN"
                        inputMode="numeric"
                        maxLength={4}
                        value={pinUpdates[user.id] || ""}
                        onChange={(e) => handlePinInput(user.id, e.target.value)}
                        style={{ ...inputStyle, maxWidth: "110px", letterSpacing: "0.12em" }}
                      />
                      <button
                        type="button"
                        onClick={() => handlePinReset(user.id)}
                        style={{ ...buttonStyle, background: "#292524", color: "#ffffff", whiteSpace: "nowrap" }}
                      >
                        Save PIN
                      </button>
                    </div>
                  </td>

                  <td style={{ padding: "12px 10px", borderBottom: "1px solid #f1f5f9" }}>
                    {user.status !== "Inactive" ? (
                      <button
                        type="button"
                        onClick={() => handleDisable(user.id)}
                        style={{ ...buttonStyle, background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa" }}
                      >
                        Disable
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          updateStoredStaffUser(user.id, { status: "Active" });
                          setMessage("Staff user reactivated.");
                          refresh();
                        }}
                        style={{ ...buttonStyle, background: "#ecfdf5", color: "#047857", border: "1px solid #a7f3d0" }}
                      >
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
