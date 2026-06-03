import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  clearCart,
  getCartItemCount,
  getCartTotal,
  useStoredCart,
} from "../lib/cartStore";
import { consumeCheckoutAuthReturn, markCheckoutAuthReturn } from "../lib/checkoutReturnStore";
import { getActiveCustomerSession, subscribeToActiveCustomerSession } from "../lib/customerSessionStore";
import { submitStorefrontOrder } from "../lib/storefrontOrderSubmission";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function Checkout() {
  const navigate = useNavigate();
  const cartItems = useStoredCart();
  const cartTotal = getCartTotal(cartItems);
  const cartItemCount = getCartItemCount(cartItems);
  const [customerSession, setCustomerSession] = useState(() => getActiveCustomerSession());
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const totalQuantity = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [cartItems]
  );

  useEffect(() => {
    function syncCustomer(nextSession = getActiveCustomerSession()) {
      setCustomerSession(nextSession);
    }

    syncCustomer();
    return subscribeToActiveCustomerSession((nextSession) => {
      syncCustomer(nextSession);
    });
  }, []);

  useEffect(() => {
    if (!cartItems.length || customerSession) return;

    markCheckoutAuthReturn();
    navigate(`/login?redirectTo=${encodeURIComponent("/checkout")}`, { replace: true });
  }, [cartItems.length, customerSession, navigate]);

  useEffect(() => {
    if (!customerSession) return;

    const authReturn = consumeCheckoutAuthReturn();
    if (!authReturn) return;

    setMessage("You're signed in. Review your request and submit it when you're ready.");
  }, [customerSession]);

  async function handlePlaceOrder() {
    if (!customerSession) {
      markCheckoutAuthReturn();
      navigate(`/login?redirectTo=${encodeURIComponent("/checkout")}`);
      return;
    }

    if (!cartItems.length) {
      setStatus("error");
      setMessage("Add at least one item to the request before submitting it.");
      return;
    }

    setStatus("submitting");
    setMessage("");

    try {
      const { createdOrder } = await submitStorefrontOrder({
        customerSession,
        cartItems,
      });

      clearCart();
      navigate(`/portal/requests/${createdOrder.order_number}/complete`, {
        replace: true,
        state: {
          flashMessage:
            "Your request has been created and linked to your customer account. Choose how you want to handle artwork next.",
        },
      });
      return;
    } catch (error) {
      console.error("Unable to place storefront order", error);
      setStatus("error");
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : "The request could not be created. Try again."
      );
    } finally {
      setStatus((current) => (current === "submitting" ? "idle" : current));
    }
  }

  if (!cartItems.length && status !== "success") {
    return (
      <div
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          padding: "18px 20px 36px",
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: "26px",
            padding: "26px",
            border: "1px solid #e7e5e4",
            boxShadow: "0 18px 40px rgba(28, 25, 23, 0.06)",
            display: "grid",
            gap: "12px",
          }}
        >
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
            Submit Request
          </p>
          <h1 style={{ margin: 0, color: "#0f172a", fontSize: "34px", lineHeight: 1.02 }}>
            Your request is empty
          </h1>
          <p style={{ margin: 0, color: "#475569", lineHeight: 1.65 }}>
            Add at least one product to the request before moving into submission.
          </p>
          <Link
            to="/cart"
            style={{
              width: "fit-content",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "46px",
              borderRadius: "12px",
              padding: "0 18px",
              textDecoration: "none",
              fontWeight: 800,
              background: "#171717",
              color: "#ffffff",
            }}
          >
            Return to Request Builder
          </Link>
        </div>
      </div>
    );
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
          to="/cart"
          style={{
            color: "#475569",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          ← Back to Request Builder
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 0.8fr)",
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
              Submit Request
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
              Review Customer Request
            </h1>
            <p style={{ margin: 0, color: "#475569", lineHeight: 1.65 }}>
              This step confirms the customer account and creates a real request record. Payment,
              shipping, taxes, and inventory are intentionally out of scope.
            </p>
          </div>

          {message ? (
            <div
              style={{
                padding: "16px 18px",
                borderRadius: "18px",
                background: status === "error" ? "#fff5f5" : "#ecfdf5",
                border: status === "error" ? "1px solid #fecaca" : "1px solid #a7f3d0",
                color: status === "error" ? "#b91c1c" : "#166534",
                fontWeight: 700,
                lineHeight: 1.6,
              }}
            >
              {message}
            </div>
          ) : null}

          <div
            style={{
              borderRadius: "22px",
              border: "1px solid #e7e5e4",
              background: "#fcfaf7",
              padding: "18px",
              display: "grid",
              gap: "10px",
            }}
          >
            <strong style={{ color: "#0f172a", fontSize: "18px" }}>Account confirmation</strong>
            <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
              Signed in as {customerSession?.displayName || customerSession?.email || "Customer"}.
              The request will be linked to this customer account and appear in the portal after it
              is created.
            </p>
          </div>

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
                    gridTemplateColumns: "96px minmax(0, 1fr)",
                    gap: "16px",
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      width: "96px",
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

                  <div style={{ display: "grid", gap: "10px" }}>
                    <div style={{ display: "grid", gap: "4px" }}>
                      <h2
                        style={{
                          margin: 0,
                          color: "#0f172a",
                          fontSize: "20px",
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
                        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
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
                          Quantity
                        </p>
                        <strong style={{ color: "#0f172a" }}>{item.quantity}</strong>
                      </div>
                      <div>
                        <p style={{ margin: "0 0 4px", color: "#64748b", fontSize: "12px", fontWeight: 800 }}>
                          Line Total
                        </p>
                        <strong style={{ color: "#0f172a" }}>{money(lineTotal)}</strong>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

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
              Request Summary
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
                {totalQuantity} total unit{totalQuantity === 1 ? "" : "s"} across this customer
                request.
              </span>
          </div>

          <button
            type="button"
            onClick={handlePlaceOrder}
            disabled={status === "submitting"}
            style={{
              minHeight: "48px",
              borderRadius: "12px",
              border: "none",
              background: status === "submitting" ? "#94a3b8" : "#0f766e",
              color: "#ffffff",
              fontWeight: 800,
              cursor: status === "submitting" ? "wait" : "pointer",
            }}
          >
            {status === "submitting" ? "Submitting Request..." : "Submit Request"}
          </button>

          <Link
            to="/cart"
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
            Edit Request
          </Link>
        </aside>
      </div>
    </div>
  );
}
