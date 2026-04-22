import { Link, useLocation } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";

export default function MyOrders() {
  const location = useLocation();
  const latestOrder = location.state || null;

  const demoOrders = [
    {
      id: "TEE-1042",
      status: "Submitted",
      garmentName: latestOrder?.garmentName || "Gildan Softstyle T-Shirt",
      color: latestOrder?.selectedColor || "Black",
      size: latestOrder?.selectedSize || "XS",
      quantity: latestOrder?.quantity || 3,
      placement: latestOrder?.placement || "Sleeve",
      artworkName: latestOrder?.artworkName || "No artwork uploaded",
      submittedAt: "Today",
    },
    {
      id: "TEE-1038",
      status: "Deposit Requested",
      garmentName: "Bella + Canvas 3001",
      color: "White",
      size: "L",
      quantity: 12,
      placement: "Left Chest",
      artworkName: "team-logo-final.png",
      submittedAt: "2 days ago",
    },
    {
      id: "TEE-1031",
      status: "In Production",
      garmentName: "Richardson 112 Trucker Hat",
      color: "Navy",
      size: "Adjustable",
      quantity: 24,
      placement: "Front Panel",
      artworkName: "hat-patch-artwork.pdf",
      submittedAt: "5 days ago",
    },
  ];

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "16px 20px 28px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ marginBottom: "18px" }}>
        <p
          style={{
            margin: "0 0 4px 0",
            fontSize: "12px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#78716c",
          }}
        >
          Customer Portal
        </p>

        <h1
          style={{
            margin: 0,
            fontSize: "30px",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: "#171717",
          }}
        >
          My Orders
        </h1>

        <p
          style={{
            margin: "8px 0 0 0",
            color: "#57534e",
            fontSize: "15px",
            lineHeight: 1.5,
            maxWidth: "720px",
          }}
        >
          Track submitted orders, review statuses, and follow each request from
          approval through production.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gap: "16px",
        }}
      >
        {demoOrders.map((order) => (
          <div
            key={order.id}
            style={{
              background: "#ffffff",
              borderRadius: "18px",
              padding: "20px",
              border: "1px solid #e7e5e4",
              boxShadow: "0 10px 24px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                alignItems: "flex-start",
                flexWrap: "wrap",
                marginBottom: "14px",
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 4px 0",
                    fontSize: "12px",
                    color: "#78716c",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Order #{order.id}
                </p>

                <h2
                  style={{
                    margin: 0,
                    fontSize: "22px",
                    lineHeight: 1.15,
                    color: "#171717",
                  }}
                >
                  {order.garmentName}
                </h2>

                <p
                  style={{
                    margin: "6px 0 0 0",
                    color: "#78716c",
                    fontSize: "14px",
                  }}
                >
                  Submitted {order.submittedAt}
                </p>
              </div>

              <StatusBadge status={order.status} />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "14px",
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: "12px",
                    color: "#78716c",
                  }}
                >
                  Color
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>{order.color}</p>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: "12px",
                    color: "#78716c",
                  }}
                >
                  Size
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>{order.size}</p>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: "12px",
                    color: "#78716c",
                  }}
                >
                  Quantity
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>{order.quantity}</p>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: "12px",
                    color: "#78716c",
                  }}
                >
                  Placement
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>{order.placement}</p>
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 2px 0",
                    fontSize: "12px",
                    color: "#78716c",
                  }}
                >
                  Artwork File
                </p>
                <p
                  style={{
                    margin: 0,
                    fontWeight: 600,
                    wordBreak: "break-word",
                  }}
                >
                  {order.artworkName}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: "18px",
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <Link
          to="/"
          style={{
            background: "#171717",
            color: "#ffffff",
            padding: "12px 16px",
            borderRadius: "12px",
            textDecoration: "none",
            fontWeight: "700",
            fontSize: "14px",
            boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
          }}
        >
          Start New Order
        </Link>
      </div>
    </div>
  );
}