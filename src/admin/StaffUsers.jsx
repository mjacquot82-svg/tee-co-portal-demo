import { useEffect, useState } from "react";
import {
  getStoredStaffUsers,
  createStoredStaffUser,
  updateStoredStaffUser,
  disableStoredStaffUser,
  STAFF_ROLES,
  isActiveStaffOwner,
} from "../lib/staffUsersStore";

export default function StaffUsers() {
  const [staffUsers, setStaffUsers] = useState([]);
  const [newUser, setNewUser] = useState({ name: "", role: "Staff", pin: "" });

  const isOwner = isActiveStaffOwner();

  useEffect(() => {
    setStaffUsers(getStoredStaffUsers());
  }, []);

  function refresh() {
    setStaffUsers(getStoredStaffUsers());
  }

  function handleCreate(event) {
    event.preventDefault();
    if (!newUser.name || newUser.pin.length !== 4) return;

    createStoredStaffUser(newUser);
    setNewUser({ name: "", role: "Staff", pin: "" });
    refresh();
  }

  function handleDisable(id) {
    disableStoredStaffUser(id);
    refresh();
  }

  function handleRoleChange(id, role) {
    updateStoredStaffUser(id, { role });
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
    <div style={{ padding: "24px", maxWidth: "900px" }}>
      <h1>Staff Users</h1>

      <form onSubmit={handleCreate} style={{ marginBottom: "24px" }}>
        <h3>Add Staff Member</h3>

        <input
          placeholder="Name"
          value={newUser.name}
          onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
        />

        <select
          value={newUser.role}
          onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
        >
          {STAFF_ROLES.map((role) => (
            <option key={role}>{role}</option>
          ))}
        </select>

        <input
          placeholder="PIN"
          maxLength={4}
          value={newUser.pin}
          onChange={(e) =>
            setNewUser({
              ...newUser,
              pin: e.target.value.replace(/\\D/g, "").slice(0, 4),
            })
          }
        />

        <button type="submit">Create</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>

        <tbody>
          {staffUsers.map((user) => (
            <tr key={user.id}>
              <td>{user.name}</td>

              <td>
                <select
                  value={user.role}
                  onChange={(e) => handleRoleChange(user.id, e.target.value)}
                >
                  {STAFF_ROLES.map((role) => (
                    <option key={role}>{role}</option>
                  ))}
                </select>
              </td>

              <td>{user.status}</td>

              <td>
                {user.status !== "Inactive" && (
                  <button onClick={() => handleDisable(user.id)}>
                    Disable
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
