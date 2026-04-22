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
          padding: "16px 24px",
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
          }}
        >
          <div
            style={{
              fontWeight: "700",
              fontSize: "20px",
            }}
          >
            Tee & Co Ltd.
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#78716c",
              marginTop: "2px",
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
            gap: "18px",
            alignItems: "center",
          }}
        >
          <Link
            to="/my-orders"
            style={{
              textDecoration: "none",
              color: "#171717",
              fontWeight: "600",
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
            }}
          >
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}