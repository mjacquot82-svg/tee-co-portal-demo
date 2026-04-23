import { Link } from "react-router-dom";

export default function Header() {
  return (
    <header
      style={{
        background: "#ffffff",
        borderBottom: "1px solid #e7e5e4",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          padding: "10px 24px", // reduced from 16px → tighter header height
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <Link
          to="/"
          style={{
            textDecoration: "none",
            color: "#171717",
            lineHeight: "1.1", // tighter vertical stacking
          }}
        >
          <div
            style={{
              fontWeight: "700",
              fontSize: "18px", // slightly reduced from 20px
            }}
          >
            Tee & Co Ltd.
          </div>

          <div
            style={{
              fontSize: "11px", // slightly reduced
              color: "#78716c",
              marginTop: "1px", // reduced from 2px
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Customer Portal Demo
          </div>
        </Link>

        <nav
          style={{
            display: "flex",
            gap: "16px", // slightly tighter spacing
            alignItems: "center",
          }}
        >
          <Link
            to="/my-orders"
            style={{
              textDecoration: "none",
              color: "#171717",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            My Orders
          </Link>

          <Link
            to="/login"
            style={{
              textDecoration: "none",
              color: "#57534e",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}