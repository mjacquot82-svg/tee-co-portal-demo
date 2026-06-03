import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  DetailPair,
  EmptyState,
  MetricCard,
  PortalPage,
  SectionCard,
} from "./CustomerPortalShared";
import { updateCustomerPortalProfile } from "../lib/customerPortalProfileUpdates";
import { useCustomerPortalData } from "./useCustomerPortalData";

export default function CustomerPortalAccount() {
  const { customerSession } = useOutletContext();
  const { profile, requests, invoices } = useCustomerPortalData(customerSession);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    phone: "",
    company: "",
  });
  const [profileSaveStatus, setProfileSaveStatus] = useState("idle");
  const [profileSaveError, setProfileSaveError] = useState("");
  const actionNeededCount = requests.filter((request) => {
    const status = String(request.request_completion_status || "").trim().toLowerCase();
    return status === "pending_completion" || status === "awaiting_artwork";
  }).length;
  const resolvedProfileName =
    profile?.name || customerSession.displayName || "Customer Account";
  const resolvedProfilePhone = profile?.phone || customerSession.phone || "";
  const resolvedProfileCompany = profile?.company || "";

  function openProfileEditor() {
    setProfileForm({
      name: resolvedProfileName,
      phone: resolvedProfilePhone,
      company: resolvedProfileCompany,
    });
    setProfileSaveStatus("idle");
    setProfileSaveError("");
    setIsEditingProfile(true);
  }

  function updateProfileFormField(field, value) {
    setProfileForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setProfileSaveStatus("saving");
    setProfileSaveError("");

    try {
      await updateCustomerPortalProfile(customerSession, profileForm);
      setProfileSaveStatus("saved");
      setIsEditingProfile(false);
    } catch (error) {
      setProfileSaveStatus("error");
      setProfileSaveError(error?.message || "Unable to save your profile right now.");
    }
  }

  return (
    <PortalPage
      eyebrow="Account"
      title="Account and profile"
      description="Review the contact details connected to your portal access and see a lightweight summary of current customer work."
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "14px",
        }}
      >
        <MetricCard
          label="Requests"
          value={requests.length}
          helper="Customer requests submitted from this account."
        />
        <MetricCard
          label="Action Needed"
          value={actionNeededCount}
          helper="Requests waiting on completion or artwork from you."
        />
        <MetricCard
          label="Invoices"
          value={invoices.length}
          helper="Customer-visible billing records available."
        />
      </div>

      <SectionCard
        title="Profile Information"
        subtitle="These contact details help Tee & Co associate your storefront requests, approvals, and invoices with the right account."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "10px",
          }}
        >
          <DetailPair
            label="Name"
            value={resolvedProfileName}
          />
          <DetailPair label="Email" value={profile?.email || customerSession.email || "—"} />
          <DetailPair
            label="Phone"
            value={resolvedProfilePhone || "—"}
          />
          <DetailPair label="Company" value={resolvedProfileCompany || "—"} />
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={openProfileEditor}
            disabled={!profile}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "40px",
              borderRadius: "999px",
              padding: "0 16px",
              border: "0",
              fontWeight: 800,
              background: profile ? "#0f766e" : "#94a3b8",
              color: "#ffffff",
              cursor: profile ? "pointer" : "not-allowed",
            }}
          >
            Edit Profile
          </button>
          <Link
            to="/portal/request-order"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "40px",
              borderRadius: "999px",
              padding: "0 16px",
              textDecoration: "none",
              fontWeight: 800,
              border: "1px solid #cbd5e1",
              color: "#0f172a",
              background: "#ffffff",
            }}
          >
            Open Request Hub
          </Link>
        </div>

        {!profile ? (
          <EmptyState
            title="Customer record still syncing"
            description="Your account exists and your portal access is active. A linked customer profile will appear here once order history or customer records are associated with this email."
          />
        ) : null}
      </SectionCard>

      {isEditingProfile ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-profile-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "grid",
            placeItems: "center",
            padding: "20px",
            background: "rgba(15, 23, 42, 0.48)",
          }}
        >
          <form
            onSubmit={handleProfileSubmit}
            style={{
              width: "min(100%, 520px)",
              borderRadius: "24px",
              border: "1px solid #dbe4ee",
              background: "#ffffff",
              boxShadow: "0 24px 70px rgba(15, 23, 42, 0.24)",
              padding: "24px",
              display: "grid",
              gap: "16px",
            }}
          >
            <div style={{ display: "grid", gap: "6px" }}>
              <h2
                id="edit-profile-title"
                style={{ margin: 0, color: "#0f172a", fontSize: "24px", lineHeight: 1.15 }}
              >
                Edit Profile
              </h2>
              <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6 }}>
                Update the customer contact details shown across your portal.
              </p>
            </div>

            <label style={{ display: "grid", gap: "6px", color: "#334155", fontWeight: 800 }}>
              Name
              <input
                type="text"
                value={profileForm.name}
                onChange={(event) => updateProfileFormField("name", event.target.value)}
                required
                style={{
                  minHeight: "44px",
                  borderRadius: "12px",
                  border: "1px solid #cbd5e1",
                  padding: "0 12px",
                  font: "inherit",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: "6px", color: "#334155", fontWeight: 800 }}>
              Email
              <input
                type="email"
                value={profile?.email || customerSession.email || ""}
                disabled
                style={{
                  minHeight: "44px",
                  borderRadius: "12px",
                  border: "1px solid #cbd5e1",
                  padding: "0 12px",
                  font: "inherit",
                  color: "#64748b",
                  background: "#f8fafc",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: "6px", color: "#334155", fontWeight: 800 }}>
              Phone
              <input
                type="tel"
                value={profileForm.phone}
                onChange={(event) => updateProfileFormField("phone", event.target.value)}
                style={{
                  minHeight: "44px",
                  borderRadius: "12px",
                  border: "1px solid #cbd5e1",
                  padding: "0 12px",
                  font: "inherit",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: "6px", color: "#334155", fontWeight: 800 }}>
              Company
              <input
                type="text"
                value={profileForm.company}
                onChange={(event) => updateProfileFormField("company", event.target.value)}
                style={{
                  minHeight: "44px",
                  borderRadius: "12px",
                  border: "1px solid #cbd5e1",
                  padding: "0 12px",
                  font: "inherit",
                }}
              />
            </label>

            {profileSaveError ? (
              <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>{profileSaveError}</p>
            ) : null}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                disabled={profileSaveStatus === "saving"}
                style={{
                  minHeight: "42px",
                  borderRadius: "999px",
                  border: "1px solid #cbd5e1",
                  padding: "0 16px",
                  background: "#ffffff",
                  color: "#0f172a",
                  fontWeight: 800,
                  cursor: profileSaveStatus === "saving" ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={profileSaveStatus === "saving"}
                style={{
                  minHeight: "42px",
                  borderRadius: "999px",
                  border: "0",
                  padding: "0 16px",
                  background: "#0f766e",
                  color: "#ffffff",
                  fontWeight: 800,
                  cursor: profileSaveStatus === "saving" ? "not-allowed" : "pointer",
                }}
              >
                {profileSaveStatus === "saving" ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </PortalPage>
  );
}
