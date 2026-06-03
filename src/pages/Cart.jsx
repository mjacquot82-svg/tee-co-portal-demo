import { Link } from "react-router-dom";
import {
  clearCart,
  getCartItemCount,
  getCartTotal,
  removeCartItem,
  updateCartItemQuantity,
  useStoredCart,
} from "../lib/cartStore";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function Cart() {
  const cartItems = useStoredCart();
  const cartItemCount = getCartItemCount(cartItems);
  const cartTotal = getCartTotal(cartItems);

  function handleDecreaseQuantity(item) {
    if (item.quantity <= 1) {
      removeCartItem(item.id);
      return;
    }

    updateCartItemQuantity(item.id, item.quantity - 1);
  }

  function handleIncreaseQuantity(item) {
    updateCartItemQuantity(item.id, item.quantity + 1);
  }

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "18px 20px 36px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ marginBottom: "14px" }}>
        <Link
          to="/"
          style={{
            color: "#475569",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          ← Continue Shopping
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: cartItems.length ? "minmax(0, 1.4fr) minmax(280px, 0.8fr)" : "1fr",
          gap: "22px",
          alignItems: "start",
        }}
      >
        <section
          style={{
            background: "#ffffff",
            borderRadius: "26px",
            padding: "26px",
            border: "1px solid #e7e5e4",
            boxShadow: "0 18px 40px rgba(28, 25, 23, 0.06)",
            display: "grid",
            gap: "18px",
          }}
        >
          <div style={{ display: "grid", gap: "6px" }}>
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#0f766e",
              }}
            >
              Request Builder
            </p>
            <h1
              style={{
                margin: 0,
                color: "#0f172a",
                fontSize: "34px",
                lineHeight: 1.02,
                letterSpacing: "-0.03em",
              }}
            >
              Build Your Request
            </h1>
            <p style={{ margin: 0, color: "#475569", lineHeight: 1.65 }}>
              Review the products you want Tee &amp; Co to quote or scope together. Request
              submission happens in the next step.
            </p>
          </div>

          {!cartItems.length ? (
            <div
              style={{
                borderRadius: "22px",
                border: "1px dashed #cbd5e1",
                background: "#f8fafc",
                padding: "28px",
                display: "grid",
                gap: "12px",
              }}
            >
              <strong style={{ color: "#0f172a", fontSize: "20px" }}>Your request is empty.</strong>
              <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
                Add products from any product-detail page to begin building a customer request.
              </p>
              <Link
                to="/"
                style={{
                  width: "fit-content",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "44px",
                  borderRadius: "999px",
                  padding: "0 18px",
                  textDecoration: "none",
                  fontWeight: 800,
                  background: "#171717",
                  color: "#ffffff",
                }}
              >
                Browse Storefront
              </Link>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {cartItems.map((item) => {
                const lineTotal = item.unitPrice * item.quantity;

                return (
                  <article
                    key={item.id}
                    style={{
                      borderRadius: "22px",
                      border: "1px solid #e7e5e4",
                      background: "#ffffff",
                      padding: "18px",
                      display: "grid",
                      gridTemplateColumns: "120px minmax(0, 1fr)",
                      gap: "16px",
                      alignItems: "start",
                    }}
                  >
                    <div
                      style={{
                        width: "120px",
                        aspectRatio: "1 / 1",
                        borderRadius: "16px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        overflow: "hidden",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      {item.imageSrc ? (
                        <img
                          src={item.imageSrc}
                          alt={item.name}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            display: "block",
                          }}
                        />
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700 }}>
                          No Image
                        </span>
                      )}
                    </div>

                    <div style={{ display: "grid", gap: "12px" }}>
                      <div style={{ display: "grid", gap: "6px" }}>
                        <h2
                          style={{
                            margin: 0,
                            color: "#0f172a",
                            fontSize: "22px",
                            lineHeight: 1.1,
                            letterSpacing: "-0.02em",
                          }}
                        >
                          {item.name}
                        </h2>
                        <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>
                          {item.brand || "Tee & Co"}{item.category ? ` • ${item.category}` : ""}
                        </p>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                          gap: "10px",
                        }}
                      >
                        <div>
                          <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: "12px", fontWeight: 800 }}>
                            Color
                          </p>
                          <strong style={{ color: "#0f172a" }}>{item.selectedColor}</strong>
                        </div>
                        <div>
                          <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: "12px", fontWeight: 800 }}>
                            Size
                          </p>
                          <strong style={{ color: "#0f172a" }}>{item.selectedSize}</strong>
                        </div>
                        <div>
                          <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: "12px", fontWeight: 800 }}>
                            Unit Price
                          </p>
                          <strong style={{ color: "#0f172a" }}>{money(item.unitPrice)}</strong>
                        </div>
                        <div>
                          <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: "12px", fontWeight: 800 }}>
                            Line Total
                          </p>
                          <strong style={{ color: "#0f172a" }}>{money(lineTotal)}</strong>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "8px",
                            borderRadius: "14px",
                            border: "1px solid #e7e5e4",
                            background: "#fafaf9",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleDecreaseQuantity(item)}
                            style={{
                              width: "34px",
                              height: "34px",
                              borderRadius: "10px",
                              border: "1px solid #d6d3d1",
                              background: "#ffffff",
                              cursor: "pointer",
                              fontWeight: 800,
                              fontSize: "18px",
                              color: "#171717",
                            }}
                          >
                            -
                          </button>
                          <span
                            style={{
                              minWidth: "28px",
                              textAlign: "center",
                              fontWeight: 800,
                              color: "#171717",
                            }}
                          >
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleIncreaseQuantity(item)}
                            style={{
                              width: "34px",
                              height: "34px",
                              borderRadius: "10px",
                              border: "1px solid #d6d3d1",
                              background: "#ffffff",
                              cursor: "pointer",
                              fontWeight: 800,
                              fontSize: "18px",
                              color: "#171717",
                            }}
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeCartItem(item.id)}
                          style={{
                            border: "1px solid #fecaca",
                            background: "#fff5f5",
                            color: "#b91c1c",
                            borderRadius: "12px",
                            padding: "11px 14px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {cartItems.length ? (
          <aside
            style={{
              background: "#ffffff",
              borderRadius: "26px",
              padding: "24px",
              border: "1px solid #e7e5e4",
              boxShadow: "0 18px 40px rgba(28, 25, 23, 0.06)",
              display: "grid",
              gap: "16px",
              position: "sticky",
              top: "16px",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: "12px",
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Summary
              </p>
              <h2 style={{ margin: "6px 0 0", color: "#0f172a", fontSize: "28px" }}>
                {cartItemCount} item{cartItemCount === 1 ? "" : "s"}
              </h2>
            </div>

            <div
              style={{
                borderRadius: "22px",
                background: "#171717",
                color: "#ffffff",
                padding: "20px",
                display: "grid",
                gap: "6px",
              }}
            >
              <span style={{ fontSize: "13px", opacity: 0.78 }}>Request Total</span>
              <strong style={{ fontSize: "34px", lineHeight: 1 }}>{money(cartTotal)}</strong>
              <span style={{ fontSize: "13px", opacity: 0.78 }}>
                This is a request-building total only. Payment and shipping are not part of this phase.
              </span>
            </div>

            <button
              type="button"
              onClick={clearCart}
              style={{
                minHeight: "46px",
                borderRadius: "12px",
                border: "1px solid #d6d3d1",
                background: "#ffffff",
                color: "#171717",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Clear Request
            </button>

            <Link
              to="/checkout"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "46px",
                borderRadius: "12px",
                textDecoration: "none",
                background: "#0f766e",
                color: "#ffffff",
                fontWeight: 800,
              }}
            >
              Continue to Submit Request
            </Link>

            <Link
              to="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "46px",
                borderRadius: "12px",
                textDecoration: "none",
                background: "#ffffff",
                color: "#171717",
                fontWeight: 700,
                border: "1px solid #d6d3d1",
              }}
            >
              Continue Shopping
            </Link>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
