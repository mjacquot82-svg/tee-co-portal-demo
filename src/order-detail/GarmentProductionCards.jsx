import { getOrderLineItems } from "../lib/orderLineItems";
import {
  getArtworkDisplayName,
  getLineItemArtwork,
  getOrderArtworkFiles,
} from "../lib/orderArtwork";

function value(value, fallback = "—") {
  return String(value || "").trim() || fallback;
}

export default function GarmentProductionCards({ order = {} }) {
  const lineItems = getOrderLineItems(order);

  return (
    <section data-testid="garment-production-cards" className="production-console-card production-console-garments">
      <header>
        <h2>Garments</h2>
        <span>{lineItems.length} line{lineItems.length === 1 ? "" : "s"}</span>
      </header>

      {lineItems.length ? (
        <div className="production-console-table-wrap">
          <table className="production-console-table">
            <thead>
              <tr>
                <th scope="col">Qty</th>
                <th scope="col">Garment</th>
                <th scope="col">Color</th>
                <th scope="col">Sizes</th>
                <th scope="col">Placement</th>
                <th scope="col">Decoration</th>
                <th scope="col">Artwork</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((lineItem) => {
                const artwork =
                  getLineItemArtwork(order, lineItem) ||
                  (lineItems.length === 1 ? getOrderArtworkFiles(order)[0] : null);
                const sizes = Object.entries(lineItem.size_breakdown || {});
                const lineNotes =
                  lineItem.production_notes || lineItem.manufacturing_instructions || "";
                const urgentNote = /urgent|warning|caution|rush/i.test(lineNotes);

                return (
                  <tr key={lineItem.id} data-testid="garment-production-card">
                    <td data-testid="job-identity-quantity">
                      <strong>{lineItem.quantity}</strong>
                    </td>
                    <td>
                      <strong data-testid="job-identity-garment">{lineItem.garment}</strong>
                      {lineNotes ? (
                        <details className={urgentNote ? "production-console-warning" : ""}>
                          <summary data-testid={urgentNote ? "garment-production-warning" : undefined}>
                            {urgentNote ? "Attention required" : "Production notes"}
                          </summary>
                          <p>{lineNotes}</p>
                        </details>
                      ) : null}
                    </td>
                    <td>{value(lineItem.selected_color)}</td>
                    <td data-testid="job-identity-sizes">
                      {sizes.length
                        ? sizes.map(([size, quantity]) => `${size}: ${quantity}`).join(" · ")
                        : "—"}
                    </td>
                    <td data-testid="job-identity-placement">
                      {value(
                        lineItem.placement ||
                          lineItem.placements
                            ?.map((entry) => entry.placement)
                            .filter(Boolean)
                            .join(", ")
                      )}
                    </td>
                    <td data-testid="job-identity-decoration-method">
                      {value(lineItem.decoration_type || order.decoration_type)}
                    </td>
                    <td data-testid="garment-production-artwork">
                      <span>{artwork ? getArtworkDisplayName(artwork) : "Not assigned"}</span>
                      <span
                        data-testid="garment-production-file"
                        className={artwork ? "is-ready" : "is-missing"}
                      >
                        {artwork ? "Ready" : "Missing"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="production-console-empty">
          No garment line items are available for production.
        </p>
      )}
    </section>
  );
}
