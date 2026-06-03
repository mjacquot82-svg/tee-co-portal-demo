import { Link } from "react-router-dom";
import { getCartItemCount, useStoredCart } from "../lib/cartStore";

export default function Header() {
  const cartItems = useStoredCart();
  const cartItemCount = getCartItemCount(cartItems);

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
          padding: "10px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: "72px",
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <Link
          to="/"
          style={{
            textDecoration: "none",
            color: "#171717",
            lineHeight: "1.1",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <img
            src="/assets/icon-512.png"
            alt="Tee & Co Ltd."
            width="48"
            height="48"
            loading="eager"
            decoding="async"
            style={{
              width: "48px",
              height: "48px",
              objectFit: "contain",
              flexShrink: 0,
              display: "block",
            }}
          />

          <div>
            <div
              style={{
                fontWeight: "700",
                fontSize: "18px",
              }}
            >
              Tee & Co Ltd.
            </div>

            <div
              style={{
                fontSize: "11px",
                color: "#78716c",
                marginTop: "1px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Customer Portal Demo
            </div>
          </div>
        </Link>

        <nav
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "center",
          }}
        >
          <Link
            to="/portal/orders"
            style={{
              textDecoration: "none",
              color: "#171717",
              fontWeight: "600",
              fontSize: "14px",
            }}
          >
            My Requests
          </Link>

          <Link
            to="/cart"
            style={{
              textDecoration: "none",
              color: "#171717",
              fontWeight: "600",
              fontSize: "14px",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>Request Builder</span>
            <span
              style={{
                minWidth: "22px",
                height: "22px",
                borderRadius: "999px",
                padding: "0 6px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: cartItemCount > 0 ? "#171717" : "#e7e5e4",
                color: cartItemCount > 0 ? "#ffffff" : "#57534e",
                fontSize: "12px",
                fontWeight: 800,
              }}
            >
              {cartItemCount}
            </span>
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
