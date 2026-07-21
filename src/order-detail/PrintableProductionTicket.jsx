import { forwardRef } from "react";
import { normalizeProductionType } from "../constants/productionTypes";
import { formatShortDate } from "../lib/dateFormatting";
import { getArtworkDisplayName, getOrderArtworkFiles } from "../lib/orderArtwork";
import { getOrderLineItems } from "../lib/orderLineItems";

function buildOrderItems(order = {}) {
  const lineItems = getOrderLineItems(order);
  if (lineItems.length) {
    return lineItems.map((item) => ({
      id: item.id,
      garment: item.garment,
      quantity: item.quantity,
      placements: item.placements.map((placement) => placement?.placement).filter(Boolean).join(", ") || item.placement,
      productionType: normalizeProductionType(item.decoration_type || "Screen Printing"),
      sizeBreakdown: item.size_breakdown,
    }));
  }

  if (Array.isArray(order.items) && order.items.length) {
    return order.items;
  }

  return [
    {
      id: order.id || order.order_number || "item-1",
      garment: order.garment || order.item || "Custom garment",
      quantity: Number(order.qty || 0),
      placements: Array.isArray(order.placements) && order.placements.length
        ? order.placements
            .map((item) => item?.placement)
            .filter(Boolean)
            .join(", ")
        : order.placement || "",
      productionType: normalizeProductionType(
        order.decoration_type ||
          order.production_type ||
          "Screen Printing"
      ),
      sizeBreakdown: order.size_breakdown || {},
    },
  ];
}

function buildSizeBreakdownList(sizeBreakdown = {}) {
  return Object.entries(sizeBreakdown).filter(([, quantity]) => Number(quantity) > 0);
}

const sectionLabelStyle = {
  color: "#44403c",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const sectionValueStyle = {
  color: "#171717",
  fontSize: "14px",
  fontWeight: 700,
  lineHeight: 1.3,
};

const PrintableProductionTicket = forwardRef(function PrintableProductionTicket(
  { order = {} },
  ref
) {
  const createdDate = order.created_at ? formatShortDate(order.created_at) : "—";
  const dueDate = order.due_date ? formatShortDate(order.due_date) : "—";
  const orderItems = buildOrderItems(order);
  const artworkFiles = getOrderArtworkFiles(order);

  return (
    <section
      ref={ref}
      aria-label="Printable production sheet"
      className="production-sheet-print-root"
      style={{
        background: "#ffffff",
        color: "#171717",
        padding: "24px",
        width: "100%",
        boxSizing: "border-box",
        fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        className="print-avoid-break"
        style={{
          display: "grid",
          gap: "6px",
          paddingBottom: "18px",
          marginBottom: "18px",
          borderBottom: "2px solid #171717",
        }}
      >
        <span
          style={{
            color: "#44403c",
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Production Sheet
        </span>

        <h1 style={{ margin: 0, fontSize: "28px", lineHeight: 1.1 }}>
          Order {order.order_number || "Unnumbered Order"}
        </h1>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "12px",
            marginTop: "8px",
          }}
        >
          <div style={{ display: "grid", gap: "2px" }}>
            <span style={sectionLabelStyle}>Customer</span>
            <span style={sectionValueStyle}>{order.customer_name || "Walk-in Customer"}</span>
          </div>

          <div style={{ display: "grid", gap: "2px" }}>
            <span style={sectionLabelStyle}>Created Date</span>
            <span style={sectionValueStyle}>{createdDate}</span>
          </div>

          <div style={{ display: "grid", gap: "2px" }}>
            <span style={sectionLabelStyle}>Due Date</span>
            <span style={sectionValueStyle}>{dueDate}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: "18px" }}>
        <section className="print-avoid-break" style={{ display: "grid", gap: "10px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px" }}>Order Items</h2>
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            {orderItems.map((item, index) => {
              const sizeBreakdown = buildSizeBreakdownList(item.sizeBreakdown);

              return (
                <article
                  key={item.id || `${item.garment}-${index}`}
                  className="print-avoid-break"
                  style={{
                    border: "1px solid #d6d3d1",
                    borderRadius: "12px",
                    padding: "14px",
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1.5fr) repeat(2, minmax(0, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "grid", gap: "2px" }}>
                      <span style={sectionLabelStyle}>Item</span>
                      <span style={sectionValueStyle}>{item.garment || "Custom garment"}</span>
                    </div>

                    <div style={{ display: "grid", gap: "2px" }}>
                      <span style={sectionLabelStyle}>Quantity</span>
                      <span style={sectionValueStyle}>{Number(item.quantity || 0)}</span>
                    </div>

                    <div style={{ display: "grid", gap: "2px" }}>
                      <span style={sectionLabelStyle}>Production Type</span>
                      <span style={sectionValueStyle}>{item.productionType || "—"}</span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: "2px" }}>
                    <span style={sectionLabelStyle}>Placements</span>
                    <span style={sectionValueStyle}>{item.placements || "—"}</span>
                  </div>

                  <div style={{ display: "grid", gap: "8px" }}>
                    <span style={sectionLabelStyle}>Sizes</span>

                    {sizeBreakdown.length ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))",
                          gap: "8px",
                        }}
                      >
                        {sizeBreakdown.map(([size, quantity]) => (
                          <div
                            key={size}
                            className="print-avoid-break"
                            style={{
                              border: "1px solid #d6d3d1",
                              borderRadius: "10px",
                              padding: "8px 10px",
                              display: "grid",
                              gap: "2px",
                            }}
                          >
                            <span style={sectionLabelStyle}>{size}</span>
                            <span style={sectionValueStyle}>{Number(quantity)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span style={sectionValueStyle}>No size breakdown recorded.</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section
          className="print-avoid-break"
          style={{
            display: "grid",
            gap: "8px",
            borderTop: "1px solid #d6d3d1",
            paddingTop: "18px",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "18px" }}>Production Instructions</h2>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ display: "grid", gap: "2px" }}>
              <span style={sectionLabelStyle}>Production Notes</span>
              <span style={{ ...sectionValueStyle, whiteSpace: "pre-wrap", fontWeight: 600 }}>
                {order.production_notes || "—"}
              </span>
            </div>

            <div style={{ display: "grid", gap: "2px" }}>
              <span style={sectionLabelStyle}>Internal Notes</span>
              <span style={{ ...sectionValueStyle, whiteSpace: "pre-wrap", fontWeight: 600 }}>
                {order.internal_note || "—"}
              </span>
            </div>

            <div style={{ display: "grid", gap: "8px" }}>
              <span style={sectionLabelStyle}>Artwork Files</span>

              {artworkFiles.length ? (
                <div style={{ display: "grid", gap: "6px" }}>
                  {artworkFiles.map((file, index) => (
                    <span
                      key={file.id || `${getArtworkDisplayName(file)}-${index}`}
                      style={{
                        ...sectionValueStyle,
                        margin: 0,
                        padding: "8px 10px",
                        border: "1px solid #d6d3d1",
                        borderRadius: "10px",
                      }}
                    >
                      {getArtworkDisplayName(file)}
                    </span>
                  ))}
                </div>
              ) : (
                <span style={sectionValueStyle}>No artwork files recorded.</span>
              )}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
});

export default PrintableProductionTicket;
