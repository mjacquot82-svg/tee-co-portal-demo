import { formatNorthAmericanPhoneDisplay } from "../lib/phoneNormalization";
import {
  getArtworkAssetUrl,
  getArtworkDisplayName,
  getOrderArtworkFiles,
  isArtworkImage,
} from "../lib/orderArtwork";
import { getOrderLineItems, getOrderTotalQuantity } from "../lib/orderLineItems";

function text(value) {
  return String(value || "").trim();
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function statusState(value, successValues, warningValues = []) {
  const normalized = text(value).toLowerCase();
  if (successValues.some((candidate) => normalized.includes(candidate))) return "complete";
  if (warningValues.some((candidate) => normalized.includes(candidate))) return "blocked";
  return "pending";
}

function workflowStages(order, readiness) {
  const orderReview = statusState(
    order.staff_review_status || order.approval_status,
    ["approved", "complete", "reviewed"],
    ["rejected", "blocked"]
  );
  const artworkCheck = readiness?.gating?.checks?.find(
    (check) => check.key === "artworkApproval"
  );
  const depositCheck = readiness?.gating?.checks?.find(
    (check) => check.key === "depositRequirement"
  );
  const stages = [
    {
      key: "order-review",
      label: "Order Review",
      state: orderReview,
    },
    {
      key: "artwork-review",
      label: "Artwork Review",
      state: artworkCheck?.satisfied
        ? "complete"
        : /revision|blocked/i.test(artworkCheck?.statusLabel || "")
          ? "blocked"
          : "pending",
    },
    {
      key: "deposit-decision",
      label: "Deposit Decision",
      state: depositCheck?.satisfied
        ? "complete"
        : /awaiting|requested|required|blocked/i.test(depositCheck?.statusLabel || "")
          ? "blocked"
          : "pending",
    },
  ];
  const currentIndex = stages.findIndex((stage) => stage.state !== "complete");
  return stages.map((stage, index) => ({
    ...stage,
    current: index === currentIndex,
  }));
}

function Metric({ label, value, testId }) {
  return (
    <div className="production-console-metric" data-testid={testId}>
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

export default function ProductionWorkspaceConsole({
  order,
  normalizedOrder,
  readiness,
  placedAt,
  action,
  assignment,
  garments,
  notes,
}) {
  const stages = workflowStages(order, readiness);
  const lineItems = getOrderLineItems(order);
  const artworkFiles = getOrderArtworkFiles(order);
  const neededBy = order.due_date || order.need_by_date || order.needed_by || "";
  const depositDecision =
    order.deposit_workflow_status ||
    order.deposit_requirement_status ||
    (normalizedOrder?.deposit_required ? "Required" : "Not required");

  return (
    <div className="production-console" data-testid="production-console">
      <section className="production-console-workflow" aria-label="Order workflow">
        <div className="production-console-workflow-label">
          <span>Workflow</span>
          <strong>{stages.find((stage) => stage.current)?.label || "Complete"}</strong>
        </div>
        <ol className="production-console-pills">
          {stages.map((stage) => (
            <li
              key={stage.key}
              className={`production-console-pill is-${stage.state} ${
                stage.current ? "is-current" : ""
              }`}
              aria-current={stage.current ? "step" : undefined}
            >
              <span aria-hidden="true">
                {stage.state === "complete" ? "✓" : stage.state === "blocked" ? "!" : "•"}
              </span>
              {stage.label}
            </li>
          ))}
        </ol>
      </section>

      <div className="production-console-action">{action}</div>

      <div className="production-console-overview">
        <section className="production-console-card" aria-labelledby="order-summary-title">
          <header>
            <h2 id="order-summary-title">Order summary</h2>
            <span>{lineItems.length} garment line{lineItems.length === 1 ? "" : "s"}</span>
          </header>
          <div className="production-console-metrics">
            <Metric label="Customer" value={order.customer_name} testId="job-identity-customer" />
            <Metric label="Phone" value={formatNorthAmericanPhoneDisplay(order.customer_phone || order.phone)} />
            <Metric label="Email" value={order.customer_email || order.email} />
            <Metric label="Company" value={order.customer_company || order.company} />
            <Metric label="Order date" value={`${placedAt.date} ${placedAt.time}`} />
            <Metric label="Needed by" value={neededBy} testId="job-identity-due-date" />
            <Metric label="Garments" value={lineItems.length} />
            <Metric label="Pieces" value={getOrderTotalQuantity(order)} />
          </div>
        </section>

        <section className="production-console-card" aria-labelledby="pricing-summary-title">
          <header>
            <h2 id="pricing-summary-title">Pricing</h2>
            <span>Current estimate</span>
          </header>
          <div className="production-console-pricing">
            <Metric label="Estimated total" value={money(normalizedOrder?.total_amount || order.total_amount || order.total)} />
            <Metric label="Deposit" value={money(normalizedOrder?.deposit_amount || order.deposit_amount || order.deposit?.amount)} />
            <Metric label="Balance" value={money(normalizedOrder?.balance_due || order.balance_due)} />
            <Metric label="Deposit decision" value={depositDecision} />
          </div>
        </section>
      </div>

      <section className="production-console-assignment" aria-label="Production assignment">
        {assignment}
      </section>

      {garments}

      <section className="production-console-card production-console-artwork" data-testid="production-artwork">
        <header>
          <h2>Artwork</h2>
          <span>{artworkFiles.length} file{artworkFiles.length === 1 ? "" : "s"}</span>
        </header>
        <div className="production-console-artwork-list">
          {artworkFiles.length ? (
            artworkFiles.map((file) => {
              const artworkUrl = getArtworkAssetUrl(file);
              return (
                <article key={file.id || getArtworkDisplayName(file)}>
                  <div className="production-console-artwork-thumb">
                    {artworkUrl && isArtworkImage(file) ? (
                      <img src={artworkUrl} alt="" />
                    ) : (
                      <span aria-hidden="true">FILE</span>
                    )}
                  </div>
                  <div className="production-console-artwork-name">
                    <strong>{getArtworkDisplayName(file)}</strong>
                    <span>{order.artwork_status || order.artwork_approval_status || "Pending review"}</span>
                  </div>
                  <div className="production-console-artwork-actions">
                    {artworkUrl ? (
                      <>
                        <a href={artworkUrl} target="_blank" rel="noreferrer">Preview</a>
                        <a href={artworkUrl} download>Download</a>
                      </>
                    ) : (
                      <span>File unavailable</span>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <p className="production-console-empty">No artwork files attached.</p>
          )}
        </div>
      </section>

      <div className="production-console-secondary">{notes}</div>
    </div>
  );
}
