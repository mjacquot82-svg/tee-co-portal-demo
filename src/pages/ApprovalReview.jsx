import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { ensureOrdersHydrated, findStoredOrder, updateStoredOrder } from "../lib/ordersStore";
import {
  decideOrderApproval,
  isApprovalServerBacked,
  isWellFormedApprovalToken,
  loadOrderApproval,
  loadOrderApprovalPreviews,
} from "../lib/orderApprovalService";

const PAGE_STYLE = {
  maxWidth: "900px",
  margin: "0 auto",
  padding: "28px",
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};
const CARD_STYLE = { background: "#ffffff", borderRadius: "22px", padding: "26px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" };
const EYEBROW_STYLE = {
  margin: 0,
  color: "#78716c",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const APPROVE_BUTTON = { background: "#166534", color: "#ffffff", border: "none", borderRadius: "12px", padding: "13px 18px", cursor: "pointer", fontWeight: 700 };
const CHANGES_BUTTON = { background: "#fff7ed", color: "#9a3412", border: "1px solid #fed7aa", borderRadius: "12px", padding: "13px 18px", cursor: "pointer", fontWeight: 700 };
const FILE_BOX = {
  height: "170px",
  borderRadius: "12px",
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  marginBottom: "10px",
  color: "#64748b",
};

export default function ApprovalReview() {
  // With a database, the page works only from the tokenised email link (no order data is
  // readable anonymously). Demo/local mode keeps the original on-device behaviour.
  return isApprovalServerBacked() ? <TokenApprovalReview /> : <LocalApprovalReview />;
}

function TokenApprovalReview() {
  const { orderNumber } = useParams();
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get("token") || "").trim();
  const hasToken = isWellFormedApprovalToken(token);
  const [state, setState] = useState(hasToken ? "loading" : "missing-token");
  const [approval, setApproval] = useState(null);
  const [previews, setPreviews] = useState({});
  const [customerNote, setCustomerNote] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hasToken) return undefined;
    let active = true;
    loadOrderApproval(orderNumber, token)
      .then((data) => {
        if (!active) return;
        if (!data) {
          setState("invalid");
          return;
        }
        setApproval(data);
        setState(data.decided ? "decided" : "ready");
        if ((data.artwork_files || []).some((file) => file.has_preview)) {
          loadOrderApprovalPreviews(orderNumber, token).then((map) => {
            if (active) setPreviews(map);
          });
        }
      })
      .catch((error) => {
        if (!active) return;
        setErrorMessage(error?.message || "This approval link is not valid or has expired.");
        setState("invalid");
      });
    return () => {
      active = false;
    };
  }, [orderNumber, token, hasToken]);

  async function decide(decision) {
    setSubmitting(true);
    setErrorMessage("");
    try {
      const data = await decideOrderApproval(orderNumber, token, decision, customerNote);
      if (data) setApproval(data);
      setState("decided");
    } catch (error) {
      setErrorMessage(error?.message || "Unable to record your decision right now.");
    } finally {
      setSubmitting(false);
    }
  }

  const portalLink = `/portal/orders/${encodeURIComponent(orderNumber || "")}`;

  if (state === "missing-token" || state === "invalid") {
    return (
      <div style={PAGE_STYLE}>
        <div style={CARD_STYLE} data-testid="approval-link-problem">
          <p style={EYEBROW_STYLE}>Customer Approval</p>
          <h1 style={{ margin: "6px 0 8px" }}>Approval link problem</h1>
          <p style={{ color: "#64748b" }}>
            {state === "missing-token"
              ? "This approval link is incomplete. Please use the full link from your email, or sign in to your customer portal to review the order."
              : errorMessage || "This approval link is not valid or has expired."}
          </p>
          <p>
            <Link to={portalLink}>Sign in to your customer portal</Link> or contact Tee &amp; Co for a new link.
          </p>
        </div>
      </div>
    );
  }

  if (state === "loading" || !approval) {
    return (
      <div style={PAGE_STYLE}>
        <div style={CARD_STYLE}>
          <p style={{ color: "#64748b" }}>Loading approval…</p>
        </div>
      </div>
    );
  }

  const artworkFiles = approval.artwork_files || [];
  const decided = state === "decided";
  const approved = approval.decision === "approve";

  return (
    <div style={PAGE_STYLE}>
      <div style={CARD_STYLE}>
        <p style={EYEBROW_STYLE}>Customer Approval</p>
        <h1 style={{ margin: "6px 0 8px" }}>Review Mockup for Order {approval.order_number}</h1>
        <p style={{ color: "#64748b" }}>
          Review the attached artwork/mockup and either approve it for production or request changes.
        </p>

        <div style={{ display: "grid", gap: "6px", marginTop: "18px" }}>
          {approval.garment ? <span><strong>Garment:</strong> {approval.garment}</span> : null}
          {approval.placement ? <span><strong>Placement:</strong> {approval.placement}</span> : null}
          {approval.decoration_type ? <span><strong>Decoration:</strong> {approval.decoration_type}</span> : null}
          {approval.quantity ? <span><strong>Quantity:</strong> {approval.quantity}</span> : null}
          <span><strong>Status:</strong> {approval.artwork_approval_status || approval.approval_status || "Awaiting review"}</span>
        </div>

        <h2 style={{ marginTop: "24px" }}>Artwork / Mockup Files</h2>
        {artworkFiles.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "14px" }}>
            {artworkFiles.map((file) => (
              <article key={file.id} style={{ border: "1px solid #e2e8f0", borderRadius: "16px", padding: "12px", background: "#f8fafc" }}>
                <div style={FILE_BOX}>
                  {previews[file.id] && String(file.type || "").startsWith("image/") ? (
                    <img src={previews[file.id]} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    "File attached"
                  )}
                </div>
                <strong style={{ fontSize: "14px" }}>{file.name}</strong>
              </article>
            ))}
          </div>
        ) : (
          <p style={{ color: "#94a3b8" }}>No artwork files are attached yet.</p>
        )}

        {decided ? (
          <div data-testid="approval-decided" style={{ marginTop: "22px", padding: "16px", borderRadius: "14px", background: approved ? "#f0fdf4" : "#fff7ed" }}>
            <strong>
              {approved
                ? "Thank you, your approval has been recorded."
                : approval.decision === "request_changes"
                  ? "Thank you, your change request has been sent to Tee & Co."
                  : "A decision has already been recorded for this approval."}
            </strong>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>
              You can follow the order in your <Link to={portalLink}>customer portal</Link>.
            </p>
          </div>
        ) : (
          <>
            <label style={{ display: "grid", gap: "8px", fontWeight: 600, marginTop: "22px" }}>
              Approval Notes
              <textarea
                value={customerNote}
                maxLength={2000}
                onChange={(event) => setCustomerNote(event.target.value)}
                placeholder="Add approval comments or requested changes here."
                style={{ border: "1px solid #cbd5e1", borderRadius: "12px", padding: "12px", minHeight: "100px", resize: "vertical" }}
              />
            </label>
            {errorMessage ? <p role="alert" style={{ color: "#b91c1c" }}>{errorMessage}</p> : null}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "18px" }}>
              <button type="button" disabled={submitting} onClick={() => decide("approve")} style={APPROVE_BUTTON}>
                Approve for Production
              </button>
              <button type="button" disabled={submitting} onClick={() => decide("request_changes")} style={CHANGES_BUTTON}>
                Request Changes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LocalApprovalReview() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [customerNote, setCustomerNote] = useState("");

  useEffect(() => {
    let isMounted = true;

    ensureOrdersHydrated().then(() => {
      if (!isMounted) return;
      const stored = findStoredOrder(orderNumber);
      if (stored) {
        setOrder(stored);
        setCustomerNote(stored.customer_approval_note || "");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [orderNumber]);

  async function approveMockup() {
    const updated = await updateStoredOrder(orderNumber, {
      quote_status: order?.deposit_required ? "Awaiting Deposit" : "Approved",
      approval_status: "Customer Approved",
      artwork_approval_status: "Approved",
      customer_approval_note: customerNote,
      customer_approved_at: new Date().toISOString(),
    });
    if (updated) setOrder(updated);
  }

  async function requestChanges() {
    const updated = await updateStoredOrder(orderNumber, {
      quote_status: "Awaiting Artwork Approval",
      approval_status: "Customer Requested Changes",
      artwork_approval_status: "Needs Revision",
      customer_approval_note: customerNote,
      customer_revision_requested_at: new Date().toISOString(),
    });
    if (updated) setOrder(updated);
  }

  if (!order) {
    return (
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "32px" }}>
        <h1>Approval Review</h1>
        <p style={{ color: "#64748b" }}>
          This approval record was not found on this device yet. In production, this page will load from cloud storage.
        </p>
      </div>
    );
  }

  const artworkFiles = order.artwork_files || [];

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "28px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "22px",
          padding: "26px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#78716c",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Customer Approval
        </p>
        <h1 style={{ margin: "6px 0 8px" }}>Review Mockup for Order {order.order_number}</h1>
        <p style={{ color: "#64748b" }}>
          Review the attached artwork/mockup and either approve it for production or request changes.
        </p>

        <div style={{ display: "grid", gap: "6px", marginTop: "18px" }}>
          <span><strong>Customer:</strong> {order.customer_name}</span>
          <span><strong>Garment:</strong> {order.garment}</span>
          <span><strong>Placement:</strong> {order.placement}</span>
          <span><strong>Decoration:</strong> {order.decoration_type}</span>
          <span><strong>Status:</strong> {order.artwork_approval_status || order.approval_status || order.status}</span>
        </div>

        <h2 style={{ marginTop: "24px" }}>Artwork / Mockup Files</h2>
        {artworkFiles.length ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: "14px",
            }}
          >
            {artworkFiles.map((file) => (
              <article
                key={file.id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "12px",
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    height: "170px",
                    borderRadius: "12px",
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    marginBottom: "10px",
                    color: "#64748b",
                  }}
                >
                  {file.type?.startsWith("image/") ? (
                    <img src={file.preview} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    "File attached"
                  )}
                </div>
                <strong style={{ fontSize: "14px" }}>{file.name}</strong>
              </article>
            ))}
          </div>
        ) : (
          <p style={{ color: "#94a3b8" }}>No artwork files are attached yet.</p>
        )}

        <label style={{ display: "grid", gap: "8px", fontWeight: 600, marginTop: "22px" }}>
          Approval Notes
          <textarea
            value={customerNote}
            onChange={(event) => setCustomerNote(event.target.value)}
            placeholder="Add approval comments or requested changes here."
            style={{
              border: "1px solid #cbd5e1",
              borderRadius: "12px",
              padding: "12px",
              minHeight: "100px",
              resize: "vertical",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "18px" }}>
          <button
            type="button"
            onClick={approveMockup}
            style={{
              background: "#166534",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              padding: "13px 18px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Approve for Production
          </button>
          <button
            type="button"
            onClick={requestChanges}
            style={{
              background: "#fff7ed",
              color: "#9a3412",
              border: "1px solid #fed7aa",
              borderRadius: "12px",
              padding: "13px 18px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Request Changes
          </button>
        </div>
      </div>
    </div>
  );
}
