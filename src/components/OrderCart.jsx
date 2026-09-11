export default function OrderCart({ lineItems = [], onReviewRequest }) {
  const garmentCount = lineItems.length;
  const totalPieces = lineItems.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const estimatedStartingPrice = lineItems.reduce(
    (total, item) => total + Number(item.estimatedStartingPrice || 0),
    0
  );
  const estimatedLabel =
    estimatedStartingPrice > 0 ? `$${estimatedStartingPrice.toFixed(2)}` : "Pending";
  const itemLabel = garmentCount === 1 ? "item" : "items";
  const garmentLabel = garmentCount === 1 ? "Garment" : "Garments";

  return (
    <aside
      className="order-cart"
      aria-label="Current order cart"
      data-testid="order-cart"
    >
      <div className="order-cart-desktop">
        <div className="order-cart-desktop-copy">
          <strong className="order-cart-desktop-title">Current Order</strong>
          <div className="order-cart-desktop-stats">
            <span>
              <strong>{garmentCount}</strong> {garmentLabel}
            </span>
            <span>
              <strong>{totalPieces}</strong> Total Pieces
            </span>
            <span>
              <strong>{estimatedLabel}</strong> Estimated Starting Price
            </span>
          </div>
          <div className="order-cart-desktop-chips">
            {lineItems.map((item) => (
              <span key={item.id} className="order-cart-chip">
                ✓ {item.garmentName || "Configured Garment"}
              </span>
            ))}
            {!garmentCount ? (
              <span className="order-cart-empty-note">No garments added yet</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="order-cart-review-button"
          onClick={onReviewRequest}
          disabled={!garmentCount}
        >
          Review Request
        </button>
      </div>

      <div className="order-cart-phone" aria-hidden="false">
        <div className="order-cart-phone-copy">
          <strong className="order-cart-phone-title">Current Order</strong>
          <p className="order-cart-phone-summary">
            <span>
              {garmentCount} {itemLabel}
            </span>
            <span aria-hidden="true">·</span>
            {garmentCount > 0 ? (
              <>
                <span>{totalPieces} pcs</span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            <span>Estimated: {estimatedLabel}</span>
          </p>
        </div>
        <button
          type="button"
          className="order-cart-phone-review"
          onClick={onReviewRequest}
          disabled={!garmentCount}
        >
          Review
        </button>
      </div>
    </aside>
  );
}
