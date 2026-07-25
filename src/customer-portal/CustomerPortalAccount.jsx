import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { isValidCustomerName } from "../lib/customerName";
import { updateStoredCustomer } from "../lib/customersStore";
import {
  DetailPair,
  EmptyState,
  MetricCard,
  PortalPage,
  SectionCard,
} from "./CustomerPortalShared";
import { useCustomerPortalData } from "./useCustomerPortalData";

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "11px 13px",
  background: "#ffffff",
  color: "#0f172a",
  font: "inherit",
};

function buildProfileForm(profile = {}) {
  return {
    name: profile.name || "",
    company: profile.company || "",
    phone: profile.phone || "",
  };
}

export default function CustomerPortalAccount() {
  const { customerSession } = useOutletContext();
  const { profile, summary } = useCustomerPortalData(customerSession);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(() => buildProfileForm(profile));
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");

  function openEditor() {
    setForm(buildProfileForm(profile));
    setSaveError("");
    setIsEditing(true);
  }

  function cancelEditor() {
    setForm(buildProfileForm(profile));
    setSaveError("");
    setIsEditing(false);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (!profile?.id || saveState === "saving") return;

    const name = form.name.trim();
    if (!isValidCustomerName(name)) {
      setSaveError("Enter your full name.");
      return;
    }

    setSaveState("saving");
    setSaveError("");

    try {
      const updatedProfile = await updateStoredCustomer(profile.id, {
        name,
        company: form.company.trim(),
        phone: form.phone.trim(),
      });
      if (!updatedProfile) {
        throw new Error("Customer profile could not be found.");
      }
      setIsEditing(false);
    } catch (error) {
      setSaveError(error?.message || "Unable to save your profile.");
    } finally {
      setSaveState("idle");
    }
  }

  return (
    <PortalPage
      eyebrow="Account"
      title="Account and profile"
      description="Your profile section stays lightweight: basic contact details, customer record linkage, and a quick account summary."
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "14px",
        }}
      >
        <MetricCard
          label="Orders"
          value={summary.orderCount}
          helper="Visible orders attached to this account."
        />
        <MetricCard
          label="Account Total"
          value={`$${summary.totalValue.toFixed(2)}`}
          helper="Combined visible order value."
        />
        <MetricCard
          label="Balance Due"
          value={`$${summary.outstandingBalance.toFixed(2)}`}
          helper="Current balance still open."
        />
      </div>

      <SectionCard
        title="Profile Details"
        subtitle="This is the customer-facing account record connected to your portal access."
      >
        {isEditing ? (
          <form onSubmit={saveProfile} style={{ display: "grid", gap: "16px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "14px",
              }}
            >
              <label style={{ display: "grid", gap: "7px", fontWeight: 700 }}>
                Name
                <input
                  value={form.name}
                  onChange={(event) => updateForm("name", event.target.value)}
                  disabled={saveState === "saving"}
                  required
                  style={fieldStyle}
                />
              </label>
              <label style={{ display: "grid", gap: "7px", fontWeight: 700 }}>
                Company
                <input
                  value={form.company}
                  onChange={(event) => updateForm("company", event.target.value)}
                  disabled={saveState === "saving"}
                  style={fieldStyle}
                />
              </label>
              <label style={{ display: "grid", gap: "7px", fontWeight: 700 }}>
                Phone
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => updateForm("phone", event.target.value)}
                  disabled={saveState === "saving"}
                  style={fieldStyle}
                />
              </label>
              <label style={{ display: "grid", gap: "7px", fontWeight: 700 }}>
                Email
                <input
                  type="email"
                  value={profile?.email || customerSession.email || ""}
                  readOnly
                  aria-readonly="true"
                  style={{ ...fieldStyle, background: "#f1f5f9", color: "#64748b" }}
                />
              </label>
            </div>

            {saveError ? (
              <div role="alert" style={{ color: "#b91c1c", fontWeight: 700 }}>
                {saveError}
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                onClick={cancelEditor}
                disabled={saveState === "saving"}
                style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#ffffff", fontWeight: 800 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveState === "saving"}
                style={{ padding: "10px 14px", borderRadius: "10px", border: 0, background: "#0f766e", color: "#ffffff", fontWeight: 800 }}
              >
                {saveState === "saving" ? "Saving…" : "Save Profile"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "10px",
              }}
            >
              <DetailPair
                label="Name"
                value={profile?.name || customerSession.displayName || "Customer Account"}
              />
              <DetailPair label="Email" value={profile?.email || customerSession.email || "—"} />
              <DetailPair
                label="Phone"
                value={profile?.phone || customerSession.phone || "Not added yet"}
              />
              <DetailPair label="Company" value={profile?.company || "Not added yet"} />
            </div>

            {profile ? (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
                <button
                  type="button"
                  onClick={openEditor}
                  style={{ padding: "10px 14px", borderRadius: "10px", border: "1px solid #0f766e", background: "#ffffff", color: "#0f766e", fontWeight: 800 }}
                >
                  Edit Profile
                </button>
              </div>
            ) : null}
          </>
        )}

        {!profile ? (
          <EmptyState
            title="Customer record still syncing"
            description="Your account exists and your portal access is active. A linked customer profile will appear here once order history or customer records are associated with this email."
          />
        ) : null}
      </SectionCard>
    </PortalPage>
  );
}
