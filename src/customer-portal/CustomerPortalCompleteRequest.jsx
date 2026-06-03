import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import CustomerArtworkSection from "../components/CustomerArtworkSection";
import { updateStoredOrder, useStoredOrders } from "../lib/ordersStore";
import { useStoredCustomers } from "../lib/customersStore";
import { findCustomerProfileForSession } from "../lib/customerPortalData";
import { PortalPage, SectionCard } from "./CustomerPortalShared";

function normalizeText(value) {
  return String(value || "").trim();
}

function buildArtworkFileFromLibrary(file = {}) {
  const displayName =
    normalizeText(file.file_name) ||
    normalizeText(file.original_filename) ||
    normalizeText(file.name) ||
    "Customer artwork";
  const type = normalizeText(file.file_type || file.type);
  const size = Number(file.file_size ?? file.size ?? 0) || 0;
  const previewUrl =
    normalizeText(file.preview_url) ||
    normalizeText(file.preview) ||
    normalizeText(file.open_url) ||
    normalizeText(file.download_url);

  return {
    id: normalizeText(file.id) || `artwork-${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: displayName,
    display_name: displayName,
    file_name: displayName,
    original_filename: displayName,
    type,
    file_type: type,
    size,
    file_size: size,
    asset_url: normalizeText(file.open_url || file.download_url || previewUrl),
    source_url: normalizeText(file.open_url || file.download_url || previewUrl),
    preview: previewUrl,
    preview_url: previewUrl,
    url: normalizeText(file.open_url || file.download_url || previewUrl),
  };
}

function resolveCompletionCopy(status) {
  switch (status) {
    case "awaiting_artwork":
      return {
        label: "Awaiting Artwork",
        tone: "#92400e",
        background: "#fff7ed",
        border: "#fdba74",
      };
    case "artwork_assistance_required":
      return {
        label: "Artwork Assistance Required",
        tone: "#1d4ed8",
        background: "#eff6ff",
        border: "#93c5fd",
      };
    case "ready_for_review":
      return {
        label: "Ready For Review",
        tone: "#166534",
        background: "#ecfdf5",
        border: "#86efac",
      };
    default:
      return {
        label: "Complete Your Request",
        tone: "#7c2d12",
        background: "#fff7ed",
        border: "#fdba74",
      };
  }
}

export default function CustomerPortalCompleteRequest() {
  const navigate = useNavigate();
  const location = useLocation();
  const { orderNumber } = useParams();
  const { customerSession } = useOutletContext();
  const orders = useStoredOrders();
  const customers = useStoredCustomers();
  const profile = useMemo(
    () => findCustomerProfileForSession(customerSession, customers),
    [customerSession, customers]
  );
  const order = useMemo(
    () =>
      orders.find((record) => record.order_number === orderNumber && record.operational_visible === false) ||
      null,
    [orderNumber, orders]
  );
  const [libraryArtwork, setLibraryArtwork] = useState([]);
  const [selectedArtworkId, setSelectedArtworkId] = useState("");
  const [libraryArtworkCount, setLibraryArtworkCount] = useState(0);
  const [submitState, setSubmitState] = useState("idle");
  const [message, setMessage] = useState(() => String(location.state?.flashMessage || "").trim());
  const [selectedAction, setSelectedAction] = useState(() => {
    const existingIntent = normalizeText(order?.artwork_intent);
    if (existingIntent === "upload_now") return "upload_now";
    return "";
  });

  const completionStatus = normalizeText(order?.request_completion_status) || "pending_completion";
  const completionCopy = resolveCompletionCopy(completionStatus);
  const selectedArtwork = useMemo(
    () =>
      libraryArtwork.find(
        (file) => normalizeText(file?.id) === normalizeText(selectedArtworkId)
      ) || null,
    [libraryArtwork, selectedArtworkId]
  );
  const hasSingleArtworkOption = libraryArtworkCount === 1;
  const attachActionLabel = hasSingleArtworkOption ? "Attach Artwork" : "Attach To Request";

  function handleUpdate(updates, successMessage, redirectTo = "", redirectState = null) {
    if (!order) return;

    setSubmitState("submitting");
    setMessage("");

    try {
      const updatedOrder = updateStoredOrder(order.order_number, updates);
      if (!updatedOrder) {
        throw new Error("The request could not be found while saving your artwork update.");
      }
      setSelectedArtworkId("");
      setSubmitState("success");
      setMessage(successMessage);
      if (redirectTo) {
        navigate(redirectTo, {
          replace: true,
          state: redirectState,
        });
        return;
      }
    } catch (error) {
      console.error("Unable to update request completion", error);
      setSubmitState("error");
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : "The request could not be updated. Try again."
      );
    } finally {
      setSubmitState((current) => (current === "submitting" ? "idle" : current));
    }
  }

  function handleUploadLater() {
    setSelectedAction("upload_later");
    handleUpdate(
      {
        request_completion_status: "awaiting_artwork",
        artwork_intent: "upload_later",
        request_completed_at: new Date().toISOString(),
        activity_type: "request_completion",
        activity_note: "Customer marked the request as awaiting artwork.",
      },
      "Your request is saved as awaiting artwork. Upload artwork from the portal whenever you are ready.",
      "/portal/orders",
      {
        flashMessage:
          "Artwork status saved. This request is now marked as awaiting artwork.",
        createdOrderNumber: order?.order_number || "",
      }
    );
  }

  function handleNeedArtworkHelp() {
    setSelectedAction("need_artwork_help");
    handleUpdate(
      {
        request_completion_status: "artwork_assistance_required",
        artwork_intent: "need_artwork_help",
        request_completed_at: new Date().toISOString(),
        activity_type: "request_completion",
        activity_note: "Customer requested artwork help.",
      },
      "Tee & Co has been told you need artwork help. Your request is now ready for review.",
      "/portal/orders",
      {
        flashMessage:
          "Artwork status saved. Tee & Co has been told you need artwork help for this request.",
        createdOrderNumber: order?.order_number || "",
      }
    );
  }

  function handleUseSelectedArtwork() {
    if (!selectedArtwork || !order) {
      setSubmitState("error");
      setMessage("Select artwork from your library before attaching it to this request.");
      return;
    }

    const artworkFile = buildArtworkFileFromLibrary(selectedArtwork);
    const existingPlacements = Array.isArray(order.placements) ? order.placements : [];
    const nextPlacements = existingPlacements.map((placement) => ({
      ...placement,
      artwork_id: artworkFile.id,
      artwork_name: artworkFile.name,
    }));

    handleUpdate(
      {
        request_completion_status: "ready_for_review",
        artwork_intent: "upload_now",
        request_completed_at: order.request_completed_at || new Date().toISOString(),
        artwork_received_at: new Date().toISOString(),
        customer_artwork_id: artworkFile.id,
        customer_artwork_name: artworkFile.name,
        artwork_files: [artworkFile],
        placements: nextPlacements,
        activity_type: "request_completion",
        activity_note: "Customer attached artwork and marked the request ready for review.",
      },
      "Artwork attached successfully. Your request is now ready for review.",
      "/portal/orders",
      {
        flashMessage:
          "Artwork attached successfully. Request updated and moved to Ready For Review.",
        createdOrderNumber: order?.order_number || "",
      }
    );
  }

  if (!order) {
    return (
      <PortalPage
        eyebrow="Complete Request"
        title="Request not found"
        description="The request could not be found in your customer portal."
      >
        <SectionCard
          title="Return to your portal"
          subtitle="Use your request and quote views to find the correct record."
        >
          <Link
            to="/portal/orders"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "44px",
              borderRadius: "999px",
              padding: "0 18px",
              textDecoration: "none",
              fontWeight: 800,
              background: "#171717",
              color: "#ffffff",
            }}
          >
            Open My Requests
          </Link>
        </SectionCard>
      </PortalPage>
    );
  }

  return (
    <PortalPage
      eyebrow="Complete Request"
      title={`Complete request ${order.order_number}`}
      description="Tell Tee & Co what should happen next with artwork before the request moves into review."
    >
      <SectionCard
        title={completionCopy.label}
        subtitle="This step stays separate from quote, deposit, and production workflow statuses."
      >
        <div
          style={{
            borderRadius: "18px",
            padding: "16px 18px",
            background: completionCopy.background,
            border: `1px solid ${completionCopy.border}`,
            color: completionCopy.tone,
            fontWeight: 700,
            lineHeight: 1.6,
          }}
        >
          {message || "Choose how you want to handle artwork for this request."}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "14px",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setSelectedAction("upload_now");
              setMessage("Upload or select artwork below, then attach it to this request.");
            }}
            style={{
              borderRadius: "18px",
              border: "1px solid #bfdbfe",
              background: "#eff6ff",
              color: "#1d4ed8",
              padding: "18px",
              textAlign: "left",
              cursor: "pointer",
              display: "grid",
              gap: "8px",
            }}
          >
            <strong>Upload Artwork Now</strong>
            <span>Select or upload artwork in your authenticated customer library, then attach it to this request.</span>
          </button>

          <button
            type="button"
            onClick={handleUploadLater}
            style={{
              borderRadius: "18px",
              border: "1px solid #fdba74",
              background: "#fff7ed",
              color: "#9a3412",
              padding: "18px",
              textAlign: "left",
              cursor: "pointer",
              display: "grid",
              gap: "8px",
            }}
          >
            <strong>I'll Upload Artwork Later</strong>
            <span>Keep the request open and mark it as awaiting artwork so Tee &amp; Co knows files are still coming.</span>
          </button>

          <button
            type="button"
            onClick={handleNeedArtworkHelp}
            style={{
              borderRadius: "18px",
              border: "1px solid #93c5fd",
              background: "#eff6ff",
              color: "#1e40af",
              padding: "18px",
              textAlign: "left",
              cursor: "pointer",
              display: "grid",
              gap: "8px",
            }}
          >
            <strong>I Need Artwork Help</strong>
            <span>Tell Tee &amp; Co you need design or artwork assistance so the request can move into review immediately.</span>
          </button>
        </div>
      </SectionCard>

      {selectedAction === "upload_now" ? (
        <SectionCard
          title="Artwork"
          subtitle="Choose artwork visually from your customer library, then attach it to this request."
        >
          <CustomerArtworkSection
            customerId={profile?.id || ""}
            customerName={profile?.name || customerSession?.displayName || ""}
            selectedArtworkId={selectedArtworkId}
            onSelectedArtworkIdChange={setSelectedArtworkId}
            onArtworkLibraryChange={(libraryArtwork) => {
              const nextArtwork = Array.isArray(libraryArtwork) ? libraryArtwork : [];
              setLibraryArtwork(nextArtwork);
              setLibraryArtworkCount(nextArtwork.length);
              setSelectedArtworkId((currentSelectedArtworkId) => {
                if (nextArtwork.length === 1) {
                  return normalizeText(nextArtwork[0]?.id);
                }

                const matchingArtwork = nextArtwork.find(
                  (file) => normalizeText(file?.id) === normalizeText(currentSelectedArtworkId)
                );

                return matchingArtwork ? normalizeText(matchingArtwork.id) : "";
              });
            }}
            selectionActionLabel={attachActionLabel}
            selectionHelpText={
              hasSingleArtworkOption
                ? "Your only artwork file is already selected. Review it below and attach it to this request."
                : "Click any artwork card to select it. The selected card is highlighted and ready to attach to this request."
            }
          />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ color: "#475569", lineHeight: 1.6 }}>
              {selectedArtwork
                ? `Ready to attach: ${selectedArtwork.file_name || selectedArtwork.name || "Artwork file"}.`
                : "Select an artwork card to attach it to this request."}
            </div>

            <button
              type="button"
              onClick={handleUseSelectedArtwork}
              disabled={!selectedArtwork || submitState === "submitting"}
              style={{
                minHeight: "44px",
                borderRadius: "12px",
                border: "none",
                padding: "0 18px",
                background:
                  !selectedArtwork || submitState === "submitting" ? "#94a3b8" : "#0f766e",
                color: "#ffffff",
                fontWeight: 800,
                cursor:
                  !selectedArtwork || submitState === "submitting"
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {submitState === "submitting" ? "Saving..." : attachActionLabel}
            </button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Next Step"
        subtitle="Return to the portal once the request completion step is done."
      >
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => navigate("/portal/orders")}
            style={{
              minHeight: "44px",
              borderRadius: "999px",
              border: "none",
              padding: "0 18px",
              background: "#171717",
              color: "#ffffff",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Back to My Requests
          </button>
          <button
            type="button"
            onClick={() => navigate("/portal/orders")}
            style={{
              minHeight: "44px",
              borderRadius: "999px",
              border: "1px solid #cbd5e1",
              padding: "0 18px",
              background: "#ffffff",
              color: "#0f172a",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Open Quotes & Approvals
          </button>
        </div>
      </SectionCard>
    </PortalPage>
  );
}
