import { useEffect, useState } from "react";
import {
  getOwnerAdminAccount,
  getOperationalStaffUsers,
  isProtectedStaffUser,
  subscribeToStaffUsers,
  createStoredStaffUser,
  updateStoredStaffUser,
  disableStoredStaffUser,
  reactivateStoredStaffUser,
  generateUniqueStaffPin,
  STAFF_ROLES,
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
  padding: "10px 14px",
  borderRadius: "10px",
  border: "none",
  cursor: "pointer",
  fontWeight: 700,
};

const notificationPreferencePreviewItems = [
  {
    key: "orderCompleted",
    label: "Order Completed",
    description: "Operational completion milestones for finished production work.",
  },
  {
    key: "pickupCompleted",
    label: "Pickup Completed",
    description: "Customer handoff events once completed work leaves the counter.",
  },
  {
    key: "depositRecorded",
    label: "Deposit Recorded",
    description: "Payment progress updates when request work becomes cleared for payment.",
  },
  {
    key: "finalPaymentRecorded",
    label: "Final Payment Recorded",
    description: "Balance-clearing events for orders that have been fully paid.",
  },
  {
    key: "orderCanceled",
    label: "Order Canceled",
    description: "Important cancellation activity that may require owner awareness.",
  },
  {
    key: "assignmentCompleted",
    label: "Assignment Completed",
    description: "Operational execution updates as assigned work is finished.",
  },
  {
    key: "customerReadyCommunicationSent",
    label: "Customer-Ready Communication Sent",
    description: "Visibility into outbound ready-for-pickup communication milestones.",
  },
];

const notificationPreferencePreviewDefaults = {
  orderCompleted: true,
  pickupCompleted: true,
  depositRecorded: true,
  finalPaymentRecorded: true,
  orderCanceled: true,
  assignmentCompleted: false,
  customerReadyCommunicationSent: false,
};

export default function StaffUsers() {
  const [ownerAccount, setOwnerAccount] = useState(null);
  const [staff, setStaff] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [form, setForm] = useState({
    name: "",
    pin: "",
    role: "Staff",
  });
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [notificationPreview, setNotificationPreview] = useState(
    notificationPreferencePreviewDefaults
  );

  useEffect(() => {
    setOwnerAccount(getOwnerAdminAccount());
    setStaff(getOperationalStaffUsers());
    return subscribeToStaffUsers((users) => {
      setOwnerAccount(users.find((user) => isProtectedStaffUser(user)) || null);
      setStaff(users);
    });
  }, []);

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        staff.map((user) => [
          user.id,
          {
            name: user.name,
            pin: user.pin,
          },
        ])
      )
    );
  }, [staff]);

  async function refreshStaff() {
    setOwnerAccount(getOwnerAdminAccount());
    setStaff(getOperationalStaffUsers());
  }

  function setDraftValue(userId, field, value) {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [userId]: {
        ...currentDrafts[userId],
        [field]: field === "pin" ? String(value).replace(/\D/g, "").slice(0, 4) : value,
      },
    }));
  }

  function resetDraft(userId, user) {
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [userId]: {
        name: user.name,
        pin: user.pin,
      },
    }));
  }

  async function persistStaffUpdate(user, changes) {
    try {
      await updateStoredStaffUser(user.id, changes);
      await refreshStaff();
      return true;
    } catch (error) {
      alert(error.message || "Unable to save staff user.");
      resetDraft(user.id, user);
      await refreshStaff();
      return false;
    }
  }

  async function handleCreate(e) {
    e.preventDefault();

    if (!form.name || !form.pin) {
      alert("Name and PIN are required.");
      return;
    }

    try {
      await createStoredStaffUser({
        name: form.name,
        pin: form.pin,
        role: form.role,
      });
    } catch (error) {
      alert(error.message || "Unable to create staff user.");
      return;
    }

    setForm({
      name: "",
      pin: "",
      role: "Staff",
    });

    await refreshStaff();
  }

  async function handleDisable(id) {
    try {
      await disableStoredStaffUser(id);
    } catch (error) {
      alert(error.message || "Unable to disable staff user.");
      return;
    }

    await refreshStaff();
  }

  async function handleReactivate(id) {
    try {
      await reactivateStoredStaffUser(id);
    } catch (error) {
      alert(error.message || "Unable to reactivate staff user.");
      return;
    }

    await refreshStaff();
  }

  async function handleRoleChange(id, role) {
    const user = staff.find((staffUser) => staffUser.id === id);
    if (!user) return;
    await persistStaffUpdate(user, { role });
  }

  async function handleFieldBlur(user, field) {
    const draft = drafts[user.id];
    if (!draft) return;

    const nextValue = field === "name" ? draft.name.trim() : draft.pin;
    if (nextValue === user[field]) {
      if (field === "name" && draft.name !== user.name) {
        resetDraft(user.id, user);
      }
      return;
    }

    await persistStaffUpdate(user, { [field]: nextValue });
  }

  async function handleResetPin(user) {
    try {
      const nextPin = generateUniqueStaffPin(user.id);
      setDraftValue(user.id, "pin", nextPin);
      await persistStaffUpdate(user, { pin: nextPin });
    } catch (error) {
      alert(error.message || "Unable to reset PIN.");
    }
  }

  function handleNotificationPreviewToggle(key) {
    setNotificationPreview((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  const enabledNotificationPreviewCount = notificationPreferencePreviewItems.filter(
    (item) => notificationPreview[item.key]
  ).length;

  return (
    <div style={{ padding: "32px" }}>
      <div style={{ marginBottom: "28px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "32px",
            fontWeight: 900,
            color: "#171717",
          }}
        >
          Manage Staff
        </h1>

        <p
          style={{
            marginTop: "8px",
            color: "#57534e",
            fontSize: "15px",
          }}
        >
          Keep staff access direct and visible so everyone using the shop can understand who has
          PIN access and what role they carry.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "380px 1fr",
          gap: "24px",
          alignItems: "start",
        }}
      >
        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e7e5e4",
            borderRadius: "18px",
            padding: "20px",
          }}
        >
            <h2
              style={{
                marginTop: 0,
                marginBottom: "18px",
                fontSize: "20px",
              }}
            >
              Add Staff User
            </h2>

          <div
            style={{
              marginBottom: "18px",
              padding: "14px",
              borderRadius: "14px",
              background: "#fafaf9",
              border: "1px solid #e7e5e4",
              color: "#57534e",
              fontSize: "14px",
              lineHeight: 1.5,
            }}
          >
            Add managers and staff members here for day-to-day PIN access. Account sign-in
            stays available for protected management access, while PIN access stays fast for
            shared-workstation use.
          </div>

          <form
            onSubmit={handleCreate}
            style={{ display: "grid", gap: "14px" }}
          >
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontWeight: 700,
                }}
              >
                Name
              </label>

              <input
                style={inputStyle}
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                  })
                }
                placeholder="Staff member name"
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontWeight: 700,
                }}
              >
                PIN
              </label>

              <input
                style={inputStyle}
                value={form.pin}
                onChange={(e) =>
                  setForm({
                    ...form,
                    pin: e.target.value.replace(/\D/g, "").slice(0, 4),
                  })
                }
                placeholder="4-digit PIN"
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontWeight: 700,
                }}
              >
                Role
              </label>

              <select
                style={inputStyle}
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value,
                  })
                }
              >
                {STAFF_ROLES.filter((role) => role !== "Owner").map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              style={{
                ...buttonStyle,
                background: "#171717",
                color: "#ffffff",
              }}
            >
              Add Staff User
            </button>
          </form>
        </section>

        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e7e5e4",
            borderRadius: "18px",
            padding: "20px",
          }}
        >
          <div
            style={{
              marginBottom: "20px",
              padding: "18px",
              borderRadius: "16px",
              border: "1px solid #d6d3d1",
              background: "#fafaf9",
            }}
          >
            <p style={{ margin: "0 0 6px", fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#78716c" }}>
              Owner / Admin Account
            </p>
            <h2 style={{ margin: "0 0 8px", fontSize: "20px", color: "#171717" }}>
              {ownerAccount?.name || "Owner / Admin"}
            </h2>
            <p style={{ margin: "0 0 4px", color: "#57534e", lineHeight: 1.5 }}>
              Role: <strong style={{ color: "#171717" }}>{ownerAccount?.role || "Owner"}</strong>
            </p>
            <p style={{ margin: "0 0 4px", color: "#57534e", lineHeight: 1.5 }}>
              Status: <strong style={{ color: "#171717" }}>{ownerAccount?.status || "Active"}</strong>
            </p>
            <p style={{ margin: "10px 0 0", color: "#57534e", lineHeight: 1.5, fontSize: "14px" }}>
              This account stays visible in staff access alongside the rest of the team, with
              direct PIN entry available where operational access is needed.
            </p>
          </div>

          <div
            style={{
              marginBottom: "20px",
              padding: "14px 16px",
              borderRadius: "16px",
              border: isNotificationPanelOpen ? "1px solid #cbd5e1" : "1px solid #e2e8f0",
              background: isNotificationPanelOpen ? "#f8fafc" : "#fcfcfd",
            }}
          >
            <button
              type="button"
              onClick={() => setIsNotificationPanelOpen((current) => !current)}
              aria-expanded={isNotificationPanelOpen}
              aria-controls="operational-notification-settings-panel"
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
                width: "100%",
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ display: "grid", gap: "4px" }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "#78716c",
                  }}
                >
                  Advanced Settings
                </p>
                <h2 style={{ margin: 0, fontSize: "17px", color: "#171717" }}>
                  Operational Notification Settings
                </h2>
                <p style={{ margin: 0, color: "#64748b", fontSize: "13px", lineHeight: 1.45 }}>
                  Preview owner/admin notification preferences without interrupting staff
                  management.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginLeft: "auto",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "6px 10px",
                    borderRadius: "999px",
                    background: "#fff7ed",
                    border: "1px solid #fed7aa",
                    color: "#9a3412",
                    fontSize: "11px",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Coming Soon
                </span>
                <span
                  style={{
                    color: "#475569",
                    fontSize: "13px",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {enabledNotificationPreviewCount} of{" "}
                  {notificationPreferencePreviewItems.length} previewed on
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "999px",
                    border: "1px solid #d6d3d1",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#44403c",
                    fontSize: "14px",
                    fontWeight: 900,
                    background: "#ffffff",
                  }}
                >
                  {isNotificationPanelOpen ? "v" : ">"}
                </span>
              </div>
            </button>

            {isNotificationPanelOpen ? (
              <div id="operational-notification-settings-panel" style={{ marginTop: "14px" }}>
                <p
                  style={{
                    margin: "0 0 10px",
                    color: "#475569",
                    lineHeight: 1.5,
                    fontSize: "14px",
                  }}
                >
                  Pilot-stage preview of future owner/admin operational notification settings.
                  This establishes which workflow events will likely become configurable later
                  without introducing delivery systems or saved preferences yet.
                </p>

                <p
                  style={{
                    margin: "0 0 16px",
                    color: "#64748b",
                    lineHeight: 1.5,
                    fontSize: "13px",
                  }}
                >
                  Preview only. These toggles are not saved and do not send email, SMS, push,
                  or in-app notifications yet.
                </p>

                <div style={{ display: "grid", gap: "10px" }}>
                  {notificationPreferencePreviewItems.map((item) => (
                    <label
                      key={item.key}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "auto 1fr",
                        gap: "12px",
                        alignItems: "start",
                        padding: "12px 13px",
                        borderRadius: "14px",
                        border: "1px solid #e2e8f0",
                        background: notificationPreview[item.key] ? "#f8fafc" : "#ffffff",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(notificationPreview[item.key])}
                        onChange={() => handleNotificationPreviewToggle(item.key)}
                        aria-label={item.label}
                        style={{
                          marginTop: "2px",
                          width: "16px",
                          height: "16px",
                          accentColor: "#0f766e",
                        }}
                      />

                      <div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "10px",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <strong style={{ color: "#171717" }}>{item.label}</strong>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 800,
                              color: "#475569",
                              background: "#e2e8f0",
                              borderRadius: "999px",
                              padding: "4px 8px",
                            }}
                          >
                            Preview
                          </span>
                        </div>

                        <p
                          style={{
                            margin: "6px 0 0",
                            color: "#64748b",
                            fontSize: "13px",
                            lineHeight: 1.45,
                          }}
                        >
                          {item.description}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <h2
            style={{
              marginTop: 0,
              marginBottom: "18px",
              fontSize: "20px",
            }}
          >
            Staff Access
          </h2>

          {staff.length ? (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid #e7e5e4",
                      textAlign: "left",
                    }}
                  >
                    <th style={{ padding: "12px" }}>Name</th>
                    <th style={{ padding: "12px" }}>PIN</th>
                    <th style={{ padding: "12px" }}>Role</th>
                    <th style={{ padding: "12px" }}>Status</th>
                    <th style={{ padding: "12px" }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {staff.map((user) => {
                    const isInactive = user.status === "Inactive";
                    const isProtectedOwner = isProtectedStaffUser(user);
                    const draft = drafts[user.id] || {
                      name: user.name,
                      pin: user.pin,
                    };

                    return (
                      <tr
                        key={user.id}
                        style={{
                          borderBottom: "1px solid #f5f5f4",
                        }}
                      >
                        <td style={{ padding: "12px" }}>
                          <input
                            style={{
                              ...inputStyle,
                              minWidth: "180px",
                            }}
                            value={draft.name}
                            onChange={(e) =>
                              setDraftValue(user.id, "name", e.target.value)
                            }
                            onBlur={() => handleFieldBlur(user, "name")}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                          />
                        </td>

                        <td style={{ padding: "12px" }}>
                          <div
                            style={{
                              display: "grid",
                              gap: "8px",
                              minWidth: "160px",
                            }}
                          >
                            <input
                              style={{
                                ...inputStyle,
                                fontFamily: "monospace",
                                letterSpacing: "0.18em",
                              }}
                              value={draft.pin}
                              onChange={(e) =>
                                setDraftValue(user.id, "pin", e.target.value)
                              }
                              onBlur={() => handleFieldBlur(user, "pin")}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                }
                              }}
                            />

                            <button
                              onClick={() => handleResetPin(user)}
                              style={{
                                ...buttonStyle,
                                background: "#f5f5f4",
                                color: "#292524",
                                border: "1px solid #d6d3d1",
                              }}
                            >
                              Reset PIN
                            </button>
                          </div>
                        </td>

                        <td style={{ padding: "12px" }}>
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user.id, e.target.value)}
                            disabled={isProtectedOwner}
                            style={{
                              ...inputStyle,
                              minWidth: "140px",
                              background: isProtectedOwner ? "#f5f5f4" : inputStyle.background,
                              color: isProtectedOwner ? "#78716c" : "#171717",
                            }}
                          >
                            {isProtectedOwner ? (
                              <option value="Owner">Owner</option>
                            ) : (
                              STAFF_ROLES.filter((role) => role !== "Owner").map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))
                            )}
                          </select>
                        </td>

                        <td style={{ padding: "12px" }}>
                          {user.status}
                        </td>

                        <td style={{ padding: "12px" }}>
                          {isProtectedOwner ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "8px 10px",
                                borderRadius: "999px",
                                background: "#f5f5f4",
                                border: "1px solid #e7e5e4",
                                color: "#57534e",
                                fontSize: "12px",
                                fontWeight: 800,
                              }}
                            >
                              Protected
                            </span>
                          ) : (
                            <button
                              onClick={() =>
                                isInactive
                                  ? handleReactivate(user.id)
                                  : handleDisable(user.id)
                              }
                              style={{
                                ...buttonStyle,
                                background: isInactive ? "#16a34a" : "#dc2626",
                                color: "#ffffff",
                              }}
                            >
                              {isInactive ? "Reactivate" : "Disable"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                padding: "18px",
                borderRadius: "14px",
                border: "1px dashed #d6d3d1",
                background: "#fafaf9",
                color: "#57534e",
                lineHeight: 1.6,
              }}
            >
              No staff accounts are available yet. Create a manager or staff account to enable
              direct PIN sign-in.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
