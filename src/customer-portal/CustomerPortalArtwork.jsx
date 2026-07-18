import { useMemo, useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import {
  getArtworkAssetUrl,
  getArtworkDisplayName,
  getOrderArtworkFiles,
  getOrderArtworkReferenceNames,
  getUploadedOrderArtworkFiles,
  isArtworkImage,
} from "../lib/orderArtwork";
import { updateStoredOrder } from "../lib/ordersStore";
import { uploadCustomerArtwork } from "../services/customerArtworkService";
import { getCustomerArtworkActionState } from "../lib/customerArtworkActions";
import { EmptyState, PortalPage, SectionCard, DetailPair } from "./CustomerPortalShared";
import { useCustomerPortalData } from "./useCustomerPortalData";

function normalizeText(value) {
  return String(value || "").trim();
}

function buildLocalArtworkFile(file, options = {}) {
  const now = new Date().toISOString();
  const safeName = normalizeText(file?.name) || "customer-artwork";

  return {
    id: `portal-artwork-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: safeName,
    display_name: safeName,
    file_name: safeName,
    original_filename: safeName,
    type: file?.type || "",
    file_type: file?.type || "",
    size: Number(file?.size || 0),
    file_size: Number(file?.size || 0),
    uploaded_at: now,
    uploaded_by: "customer",
    uploaded_by_customer: true,
    source: "customer_portal_local",
    revision: options.revision === true,
    notes: options.notes || "",
  };
}

function resolveArtworkStatus(order = {}) {
  return (
    normalizeText(order.artwork_status) ||
    normalizeText(order.artwork_approval_status) ||
    normalizeText(order.approval_status) ||
    "Artwork Required"
  );
}

function resolveStaffMessage(order = {}) {
  return (
    normalizeText(order.artwork_request_message) ||
    normalizeText(order.artwork_revision_message) ||
    normalizeText(order.artwork_message) ||
    normalizeText(order.revision_note) ||
    normalizeText(order.approval_note) ||
    ""
  );
}

function ExistingArtworkList({ files = [] }) {
  if (!files.length) {
    return <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>No artwork uploaded yet.</p>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
      {files.map((file, index) => {
        const displayName = getArtworkDisplayName(file);
        const assetUrl = getArtworkAssetUrl(file);
        const image = isArtworkImage(file) && assetUrl;

        return (
          <article
            key={file.id || displayName || index}
            style={{
              border: "1px solid #dbe4ee",
              borderRadius: "16px",
              background: "#f8fafc",
              padding: "12px",
              display: "grid",
              gap: "8px",
            }}
          >
            {image ? (
              <img
                src={assetUrl}
                alt={displayName}
                style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: "12px" }}
              />
            ) : null}
            <strong style={{ color: "#0f172a" }}>{displayName}</strong>
            {file.notes ? <span style={{ color: "#64748b", fontSize: "13px" }}>{file.notes}</span> : null}
          </article>
        );
      })}
    </div>
  );
}

function SecondaryLink({ children, to }) {
  return (
    <Link
      to={to}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "44px",
        borderRadius: "999px",
        border: "1px solid #cbd5e1",
        background: "#ffffff",
        color: "#0f172a",
        fontWeight: 800,
        padding: "10px 16px",
        textDecoration: "none",
      }}
    >
      {children}
    </Link>
  );
}

export default function CustomerPortalArtwork() {
  const { orderNumber } = useParams();
  const [searchParams] = useSearchParams();
  const { customerSession } = useOutletContext() || {};
  const portalData = useCustomerPortalData(customerSession);
  const decodedOrderNumber = decodeURIComponent(orderNumber || "");
  const scopedRecord = useMemo(
    () =>
      portalData.allOrders.find(
        (record) => String(record.order_number || "") === decodedOrderNumber
      ) || null,
    [decodedOrderNumber, portalData.allOrders]
  );
  const [localRecord, setLocalRecord] = useState(null);
  const record = localRecord || scopedRecord;
  const [selectedFile, setSelectedFile] = useState(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [helpMessage, setHelpMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const mode = searchParams.get("mode") === "help" ? "help" : "upload";

  if (!record) {
    return (
      <PortalPage
        eyebrow="Artwork"
        title="Artwork Upload"
        description="We could not find that order in your portal account."
      >
        <EmptyState
          title="Order not available"
          description="Open the order from your portal dashboard or contact Tee & Co if you need help."
          actionLabel="Back to My Orders"
          actionTo="/portal/orders"
        />
      </PortalPage>
    );
  }

  const artworkFiles = getOrderArtworkFiles(record);
  const uploadedArtworkFiles = getUploadedOrderArtworkFiles(record);
  const artworkReferenceNames = getOrderArtworkReferenceNames(record);
  const artworkAction = getCustomerArtworkActionState(record);
  const revisionRequested = artworkAction.revisionRequested;
  const staffMessage = resolveStaffMessage(record);

  async function buildUploadedArtwork(file, notes) {
    try {
      return await uploadCustomerArtwork(portalData.profile?.id || customerSession?.id || "", file, {
        notes,
        skipTimelineEvent: true,
      });
    } catch (error) {
      console.warn("[portal-artwork] Supabase upload unavailable, using local artwork reference", error);
      return buildLocalArtworkFile(file, { revision: revisionRequested, notes });
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    setUploadError("");
    setFeedback("");

    if (!selectedFile) {
      setUploadError("Select an artwork file to upload.");
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const notes = normalizeText(revisionNotes);
      const uploadedArtwork = await buildUploadedArtwork(selectedFile, notes);
      const nextArtworkFiles = [
        {
          ...uploadedArtwork,
          revision: revisionRequested,
          uploaded_at: uploadedArtwork.uploaded_at || now,
          notes,
        },
        ...artworkFiles,
      ];
      const activityType = revisionRequested ? "artwork_revised" : "artwork_uploaded";
      const updatedOrder = await updateStoredOrder(record.order_number, {
        artwork_files: nextArtworkFiles,
        artwork_reference_names: nextArtworkFiles.map((file) => getArtworkDisplayName(file)),
        customer_artwork_id: uploadedArtwork.id || record.customer_artwork_id || "",
        customer_artwork_name: getArtworkDisplayName(uploadedArtwork),
        artwork_requirement: "Uploaded",
        artwork_status: "Pending Review",
        artwork_approval_required: true,
        artwork_approval_status: "Pending Review",
        approval_status: "Pending Review",
        customer_artwork_notes: notes,
        customer_artwork_uploaded_at: now,
        activity_type: activityType,
        activity_note: revisionRequested
          ? `Customer uploaded revised artwork: ${getArtworkDisplayName(uploadedArtwork)}.`
          : `Customer uploaded artwork: ${getArtworkDisplayName(uploadedArtwork)}.`,
      });

      setLocalRecord(updatedOrder);
      setSelectedFile(null);
      setRevisionNotes("");
      setFeedback(revisionRequested ? "Revised artwork uploaded for staff review." : "Artwork uploaded for staff review.");
    } catch (error) {
      setUploadError(error?.message || "Unable to upload artwork.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUploadLater() {
    const updatedOrder = await updateStoredOrder(record.order_number, {
      artwork_requirement: "Upload Later",
      artwork_status: "Missing",
      artwork_approval_required: true,
      artwork_approval_status: "Pending Review",
      activity_type: "artwork_upload_later",
      activity_note: "Customer chose to upload artwork later.",
    });
    setLocalRecord(updatedOrder);
    setFeedback("Artwork marked for upload later.");
  }

  async function handleHelpRequest(event) {
    event.preventDefault();
    setUploadError("");
    setFeedback("");

    const message = normalizeText(helpMessage);
    if (!message) {
      setUploadError("Tell us how Tee & Co can help with your artwork.");
      return;
    }

    const updatedOrder = await updateStoredOrder(record.order_number, {
      artwork_requirement: "Help Needed",
      artwork_status: "Help Requested",
      artwork_approval_required: true,
      artwork_approval_status: "Pending Review",
      artwork_help_message: message,
      customer_artwork_help_requested_at: new Date().toISOString(),
      activity_type: "artwork_help_requested",
      activity_note: `Customer requested artwork help: ${message}`,
    });
    setLocalRecord(updatedOrder);
    setHelpMessage("");
    setFeedback("Artwork help request sent to Tee & Co.");
  }

  return (
    <PortalPage
      eyebrow="Action Needed"
      title={revisionRequested ? "Upload Revised Artwork" : "Upload Artwork"}
      description="Send Tee & Co the artwork or instructions needed to continue your order."
    >
      <SectionCard title={`Order ${record.order_number}`} subtitle="Artwork details">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
          <DetailPair label="Order Number" value={record.order_number} />
          <DetailPair label="Garment" value={record.garment || record.item || "Custom order"} />
          <DetailPair label="Artwork Status" value={resolveArtworkStatus(record)} />
          <DetailPair label="Artwork Choice" value={record.artwork_requirement || "Upload Artwork"} />
          <DetailPair label="Customer Selected" value={artworkReferenceNames.join(", ") || "No filename provided"} />
          <DetailPair label="Artwork Uploaded" value={uploadedArtworkFiles.map((file) => getArtworkDisplayName(file)).join(", ") || "None"} />
        </div>

        {!uploadedArtworkFiles.length && artworkReferenceNames.length ? (
          <p style={{ margin: 0, color: "#92400e", lineHeight: 1.6, fontWeight: 700 }}>
            The selected filename is a reference only. Tee & Co is still waiting for the actual artwork file.
          </p>
        ) : null}

        {staffMessage ? (
          <div
            style={{
              borderRadius: "18px",
              border: "1px solid #bfdbfe",
              background: "#eff6ff",
              color: "#1e3a8a",
              padding: "14px 16px",
              lineHeight: 1.6,
              fontWeight: 700,
            }}
          >
            {staffMessage}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Existing Uploaded Files" subtitle="Files currently attached to this order.">
        <ExistingArtworkList files={uploadedArtworkFiles} />
      </SectionCard>

      {mode === "help" ? (
        <SectionCard title="Tell us how we can help with your artwork" subtitle="Provide design instructions or artwork requirements.">
          <form onSubmit={handleHelpRequest} style={{ display: "grid", gap: "14px" }}>
            <textarea
              data-testid="artwork-help-message"
              value={helpMessage}
              onChange={(event) => setHelpMessage(event.target.value)}
              rows={5}
              placeholder="Describe what you need designed, changed, or prepared."
              style={{ border: "1px solid #cbd5e1", borderRadius: "16px", padding: "12px 14px", font: "inherit", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button type="submit" style={{ border: 0, borderRadius: "999px", background: "#1d4ed8", color: "#ffffff", minHeight: "44px", padding: "10px 16px", fontWeight: 900 }}>
                Message Tee & Co
              </button>
              <SecondaryLink to={`/portal/orders/${encodeURIComponent(record.order_number)}/artwork`}>Upload Artwork Instead</SecondaryLink>
            </div>
          </form>
        </SectionCard>
      ) : (
        <SectionCard
          title={revisionRequested ? "Upload Revised Artwork" : "Upload Options"}
          subtitle={revisionRequested ? "Send the corrected file and notes for staff review." : "Upload now, upload later, or ask Tee & Co for artwork help."}
        >
          <form onSubmit={handleUpload} style={{ display: "grid", gap: "14px" }}>
            <input
              data-testid="artwork-file-input"
              type="file"
              accept=".png,.jpg,.jpeg,.pdf,.svg,.ai,image/png,image/jpeg,application/pdf,image/svg+xml"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              style={{ border: "1px solid #cbd5e1", borderRadius: "16px", padding: "12px", background: "#ffffff" }}
            />
            {revisionRequested ? (
              <textarea
                data-testid="artwork-revision-notes"
                value={revisionNotes}
                onChange={(event) => setRevisionNotes(event.target.value)}
                rows={4}
                placeholder="Add revision notes for Tee & Co."
                style={{ border: "1px solid #cbd5e1", borderRadius: "16px", padding: "12px 14px", font: "inherit", resize: "vertical" }}
              />
            ) : null}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  border: 0,
                  borderRadius: "999px",
                  background: submitting ? "#94a3b8" : "#1d4ed8",
                  color: "#ffffff",
                  minHeight: "44px",
                  padding: "10px 16px",
                  fontWeight: 900,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                {revisionRequested ? "Upload Revised Artwork" : "Upload Artwork"}
              </button>
              {!revisionRequested ? (
                <button
                  type="button"
                  onClick={handleUploadLater}
                  style={{ border: "1px solid #cbd5e1", borderRadius: "999px", background: "#ffffff", color: "#0f172a", minHeight: "44px", padding: "10px 16px", fontWeight: 800 }}
                >
                  Upload Later
                </button>
              ) : null}
              <SecondaryLink to={`/portal/orders/${encodeURIComponent(record.order_number)}/artwork?mode=help`}>Need Artwork Help</SecondaryLink>
            </div>
          </form>
        </SectionCard>
      )}

      {feedback ? (
        <div data-testid="artwork-action-success" style={{ borderRadius: "18px", border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", padding: "14px 16px", fontWeight: 800 }}>
          {feedback}
        </div>
      ) : null}

      {uploadError ? (
        <div style={{ borderRadius: "18px", border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", padding: "14px 16px", fontWeight: 800 }}>
          {uploadError}
        </div>
      ) : null}

      <div>
        <SecondaryLink to="/portal/orders">Back to My Orders</SecondaryLink>
      </div>
    </PortalPage>
  );
}
