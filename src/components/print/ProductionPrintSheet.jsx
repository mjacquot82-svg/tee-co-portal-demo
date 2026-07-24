import { normalizeProductionType } from "../../constants/productionTypes";
import { formatShortDate } from "../../lib/dateFormatting";
import { getArtworkDisplayName, getLineItemArtwork, getOrderArtworkFiles } from "../../lib/orderArtwork";
import { getOrderLineItems } from "../../lib/orderLineItems";

function normalizeText(value, fallback = "—") {
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue || fallback;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  const normalizedValue = String(value).trim();
  return normalizedValue || fallback;
}

function buildOrderItems(order = {}) {
  const lineItems = getOrderLineItems(order);
  if (lineItems.length) {
    return lineItems.map((item) => ({
      id: item.id,
      garment: item.garment,
      quantity: item.quantity,
      placements: item.placements.map((placement) => placement?.placement).filter(Boolean).join(", ") || item.placement,
      productionType: normalizeProductionType(item.decoration_type || order.decoration_type || "Screen Printing"),
      sizeBreakdown: item.size_breakdown,
      artwork: getLineItemArtwork(order, item),
    }));
  }
  if (Array.isArray(order.items) && order.items.length) {
    return order.items.map((item, index) => ({
      id: item.id || item.sku || `${order.order_number || "order"}-item-${index + 1}`,
      garment: item.garment || item.name || item.item || order.garment || "Custom garment",
      quantity: Number(item.quantity || item.qty || 0),
      placements: Array.isArray(item.placements) && item.placements.length
        ? item.placements.map((placement) => placement?.placement || placement).filter(Boolean).join(", ")
        : item.placement || "",
      productionType: normalizeProductionType(
        item.productionType || item.production_type || item.decoration_type || order.decoration_type || order.production_type || "Screen Printing"
      ),
      sizeBreakdown: item.sizeBreakdown || item.size_breakdown || {},
      artwork: getLineItemArtwork(order, item),
    }));
  }

  return [
    {
      id: order.id || order.order_number || "item-1",
      garment: order.garment || order.item || "Custom garment",
      quantity: Number(order.qty || 0),
      placements: Array.isArray(order.placements) && order.placements.length
        ? order.placements.map((item) => item?.placement).filter(Boolean).join(", ")
        : order.placement || "",
      productionType: normalizeProductionType(
        order.decoration_type || order.production_type || "Screen Printing"
      ),
      sizeBreakdown: order.size_breakdown || {},
      artwork: getLineItemArtwork(order, order),
    },
  ];
}

function buildSizeBreakdownList(sizeBreakdown = {}) {
  return Object.entries(sizeBreakdown).filter(([, quantity]) => Number(quantity) > 0);
}

function resolveItemQuantity(item = {}) {
  if (Number(item.quantity) > 0) {
    return Number(item.quantity);
  }

  const sizeBreakdownTotal = buildSizeBreakdownList(
    item.sizeBreakdown || item.size_breakdown || {}
  ).reduce(
    (total, [, quantity]) => total + Number(quantity || 0),
    0
  );

  return sizeBreakdownTotal;
}

function buildInstructionSections(order = {}) {
  const notes = [
    {
      label: "Production Notes",
      value: normalizeText(order.production_notes, ""),
    },
    {
      label: "Internal Notes",
      value: normalizeText(order.internal_note || order.notes, ""),
    },
  ];

  return notes.filter((entry) => entry.value);
}

const sectionLabelStyle = {
  margin: 0,
  color: "#525252",
  fontSize: "10px",
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const sectionValueStyle = {
  margin: "4px 0 0",
  color: "#111111",
  fontSize: "13px",
  fontWeight: 600,
  lineHeight: 1.4,
};

export default function ProductionPrintSheet({ order = {} }) {
  const createdDate = order.created_at ? formatShortDate(order.created_at) : "—";
  const dueDate = order.due_date ? formatShortDate(order.due_date) : "—";
  const orderItems = buildOrderItems(order);
  const instructionSections = buildInstructionSections(order);
  const artworkFiles = getOrderArtworkFiles(order);

  return (
    <section
      aria-label="Production print sheet"
      style={{
        background: "#ffffff",
        color: "#111111",
        padding: "0",
        width: "100%",
        fontFamily: '"Helvetica Neue", Arial, sans-serif',
      }}
    >
      <header
        className="print-avoid-break"
        style={{
          borderBottom: "2px solid #111111",
          paddingBottom: "16px",
          marginBottom: "16px",
        }}
      >
        <p style={{ ...sectionLabelStyle, marginBottom: "6px" }}>Production Sheet</p>
        <h1 style={{ margin: 0, fontSize: "28px", lineHeight: 1.1 }}>
          Order {normalizeText(order.order_number, "Unnumbered Order")}
        </h1>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "12px 18px",
            marginTop: "14px",
          }}
        >
          <div>
            <p style={sectionLabelStyle}>Customer Name</p>
            <p style={sectionValueStyle}>{normalizeText(order.customer_name, "Customer identity unavailable")}</p>
          </div>

          <div>
            <p style={sectionLabelStyle}>Created Date</p>
            <p style={sectionValueStyle}>{createdDate}</p>
          </div>

          <div>
            <p style={sectionLabelStyle}>Due Date</p>
            <p style={sectionValueStyle}>{dueDate}</p>
          </div>
        </div>
      </header>

      <section style={{ marginBottom: "18px" }}>
        <h2 style={{ margin: "0 0 12px", fontSize: "18px" }}>Order Items</h2>

        <div style={{ display: "grid", gap: "12px" }}>
          {orderItems.map((item, index) => {
            const sizeBreakdown = buildSizeBreakdownList(
              item.sizeBreakdown || item.size_breakdown || {}
            );

            return (
              <article
                key={item.id || `${item.garment || "item"}-${index}`}
                className="print-avoid-break"
                style={{
                  border: "1px solid #d4d4d4",
                  padding: "12px",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1.5fr) repeat(2, minmax(0, 1fr))",
                    gap: "12px",
                    marginBottom: "10px",
                  }}
                >
                  <div>
                    <p style={sectionLabelStyle}>Item</p>
                    <p style={sectionValueStyle}>{normalizeText(item.garment, "Custom garment")}</p>
                  </div>

                  <div>
                    <p style={sectionLabelStyle}>Quantity</p>
                    <p style={sectionValueStyle}>{resolveItemQuantity(item)}</p>
                  </div>

                  <div>
                    <p style={sectionLabelStyle}>Production Type</p>
                    <p style={sectionValueStyle}>
                      {item.productionType
                        ? normalizeProductionType(item.productionType)
                        : "—"}
                    </p>
                  </div>
                </div>

                <div style={{ marginBottom: "10px" }}>
                    <p style={sectionLabelStyle}>Placements</p>
                    <p style={sectionValueStyle}>{normalizeText(item.placements)}</p>
                  </div>

                <div style={{ marginBottom: sizeBreakdown.length ? "10px" : 0 }}>
                  <p style={sectionLabelStyle}>Artwork</p>
                  <p style={sectionValueStyle}>{item.artwork ? getArtworkDisplayName(item.artwork) : "No artwork assigned"}</p>
                </div>

                <div>
                  <p style={sectionLabelStyle}>Sizes / Quantities</p>
                  {sizeBreakdown.length ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))",
                        gap: "8px",
                        marginTop: "8px",
                      }}
                    >
                      {sizeBreakdown.map(([size, quantity]) => (
                        <div
                          key={size}
                          className="print-avoid-break"
                          style={{
                            border: "1px solid #d4d4d4",
                            padding: "8px",
                          }}
                        >
                          <p style={sectionLabelStyle}>{size}</p>
                          <p style={sectionValueStyle}>{Number(quantity)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={sectionValueStyle}>No size breakdown recorded.</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="print-avoid-break">
        <h2 style={{ margin: "0 0 12px", fontSize: "18px" }}>Production Instructions</h2>

        {instructionSections.length || artworkFiles.length ? (
          <div style={{ display: "grid", gap: "12px" }}>
            {instructionSections.map((entry) => (
              <div key={entry.label}>
                <p style={sectionLabelStyle}>{entry.label}</p>
                <p style={{ ...sectionValueStyle, whiteSpace: "pre-wrap" }}>{entry.value}</p>
              </div>
            ))}

            <div>
              <p style={sectionLabelStyle}>Artwork Files</p>
              {artworkFiles.length ? (
                <div style={{ display: "grid", gap: "6px", marginTop: "6px" }}>
                  {artworkFiles.map((file, index) => (
                    <p
                      key={file.id || `${getArtworkDisplayName(file)}-${index}`}
                      style={{
                        ...sectionValueStyle,
                        margin: 0,
                        padding: "8px 10px",
                        border: "1px solid #d4d4d4",
                        background: "#fafafa",
                      }}
                    >
                      {getArtworkDisplayName(file)}
                    </p>
                  ))}
                </div>
              ) : (
                <p style={sectionValueStyle}>No artwork files recorded.</p>
              )}
            </div>
          </div>
        ) : (
          <p style={sectionValueStyle}>No production instructions recorded.</p>
        )}
      </section>
    </section>
  );
}
