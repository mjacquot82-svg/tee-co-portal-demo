import { useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import NoImagePlaceholder from "../components/NoImagePlaceholder";
import { useCatalogLookups } from "../lib/catalogLookupsStore";
import { getCartItemCount, getCartTotal, useStoredCart } from "../lib/cartStore";
import { getDefaultDecorationType } from "../lib/orderConfiguration";
import { submitProjectRequest } from "../lib/projectRequestSubmission";
import {
  buildStorefrontCategories,
  buildStorefrontCategorySelectionValue,
  getStorefrontCategoryById,
  getStorefrontProductCategoryLabel,
  getStorefrontProductImage,
  getStorefrontProducts,
} from "../lib/storefrontCatalog";
import {
  areStoredProductsReady,
  getProductPlacementConfig,
  resolveProductBasePrice,
  useStoredProducts,
} from "../lib/productsStore";
import { PortalPage, SectionCard } from "./CustomerPortalShared";
import { useCustomerPortalData } from "./useCustomerPortalData";

function normalizeText(value) {
  return String(value || "").trim();
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function fieldStyle() {
  return {
    width: "100%",
    borderRadius: "14px",
    border: "1px solid #dbe4ee",
    background: "#ffffff",
    color: "#0f172a",
    padding: "12px 14px",
    fontSize: "14px",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
}

function labelStyle() {
  return {
    display: "grid",
    gap: "8px",
    color: "#0f172a",
    fontSize: "14px",
    fontWeight: 700,
  };
}

function getRequestAction(request = {}) {
  const orderNumber = normalizeText(request.order_number);
  const completionStatus = normalizeText(request.request_completion_status).toLowerCase();
  const quoteStatus = normalizeText(request.quote_status);
  const invoiceStatus = normalizeText(request.invoice_status);

  if (!orderNumber) {
    return {
      label: "View Requests",
      to: "/portal/orders",
    };
  }

  if (completionStatus === "pending_completion" || completionStatus === "awaiting_artwork") {
    return {
      label: completionStatus === "awaiting_artwork" ? "Upload Artwork" : "Complete Request",
      to: `/portal/requests/${encodeURIComponent(orderNumber)}/complete`,
    };
  }

  if (quoteStatus === "Awaiting Approval" || quoteStatus === "Awaiting Artwork Approval") {
    return {
      label: "Review & Confirm",
      to: `/approval/${encodeURIComponent(orderNumber)}`,
    };
  }

  if (
    quoteStatus === "Awaiting Deposit" ||
    invoiceStatus === "Awaiting Deposit" ||
    invoiceStatus === "Awaiting Payment"
  ) {
    return {
      label: "Pay Deposit",
      to: `/deposit-payment?order=${encodeURIComponent(orderNumber)}`,
    };
  }

  return {
    label: "View Request",
    to: "/portal/orders",
  };
}

function getRequestStatusLabel(request = {}) {
  const completionStatus = normalizeText(request.request_completion_status).toLowerCase();
  const quoteStatus = normalizeText(request.quote_status);
  const invoiceStatus = normalizeText(request.invoice_status);

  if (completionStatus === "pending_completion") return "Complete Request";
  if (completionStatus === "awaiting_artwork") return "Awaiting Artwork";
  if (completionStatus === "artwork_assistance_required") return "Artwork Help Requested";
  if (completionStatus === "ready_for_review" && quoteStatus === "Draft") return "Ready For Review";
  if (invoiceStatus === "Awaiting Deposit" || invoiceStatus === "Awaiting Payment") return invoiceStatus;
  if (quoteStatus) return quoteStatus;
  return "Request Started";
}

function requestNeedsCustomerAction(request = {}) {
  const completionStatus = normalizeText(request.request_completion_status).toLowerCase();
  const quoteStatus = normalizeText(request.quote_status);
  const invoiceStatus = normalizeText(request.invoice_status);

  return (
    completionStatus === "pending_completion" ||
    completionStatus === "awaiting_artwork" ||
    quoteStatus === "Awaiting Approval" ||
    quoteStatus === "Awaiting Artwork Approval" ||
    quoteStatus === "Awaiting Deposit" ||
    invoiceStatus === "Awaiting Deposit" ||
    invoiceStatus === "Awaiting Payment"
  );
}

function HubActionLink({ to, children, variant = "primary" }) {
  const primary = variant === "primary";

  return (
    <Link
      to={to}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "44px",
        borderRadius: "999px",
        padding: "0 18px",
        textDecoration: "none",
        fontWeight: 800,
        background: primary ? "#171717" : "#ffffff",
        color: primary ? "#ffffff" : "#0f172a",
        border: primary ? "1px solid #171717" : "1px solid #cbd5e1",
        boxShadow: primary ? "0 14px 28px rgba(15, 23, 42, 0.16)" : "none",
      }}
    >
      {children}
    </Link>
  );
}

function DashboardPanel({ eyebrow, title, body, children, background = "#ffffff" }) {
  return (
    <section
      style={{
        borderRadius: "24px",
        border: "1px solid #dbe4ee",
        background,
        padding: "22px",
        display: "grid",
        gap: "14px",
        boxShadow: "0 16px 34px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div style={{ display: "grid", gap: "6px" }}>
        <p
          style={{
            margin: 0,
            color: "#0f766e",
            fontSize: "12px",
            fontWeight: 900,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </p>
        <h2
          style={{
            margin: 0,
            color: "#0f172a",
            fontSize: "24px",
            lineHeight: 1.05,
          }}
        >
          {title}
        </h2>
        <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>{body}</p>
      </div>
      {children}
    </section>
  );
}

function WorkItem({ request, tone = "default" }) {
  const action = getRequestAction(request);
  const warning = tone === "warning";

  return (
    <article
      style={{
        borderRadius: "18px",
        border: warning ? "1px solid #fdba74" : "1px solid #dbe4ee",
        background: warning ? "#fff7ed" : "#ffffff",
        padding: "16px",
        display: "grid",
        gap: "12px",
      }}
    >
      <div style={{ display: "grid", gap: "4px" }}>
        <strong style={{ color: "#0f172a", fontSize: "16px" }}>
          {request.order_number || "Request"}
        </strong>
        <span style={{ color: warning ? "#9a3412" : "#475569", fontWeight: 800 }}>
          {getRequestStatusLabel(request)}
        </span>
        <span style={{ color: "#64748b", lineHeight: 1.5 }}>
          {request.garment || request.request_details || request.notes || "Customer request"}
        </span>
      </div>
      <div>
        <HubActionLink to={action.to} variant={warning ? "primary" : "secondary"}>
          {action.label}
        </HubActionLink>
      </div>
    </article>
  );
}

export default function CustomerPortalRequestOrder() {
  const navigate = useNavigate();
  const { customerSession } = useOutletContext();
  const cartItems = useStoredCart();
  const cartItemCount = getCartItemCount(cartItems);
  const cartTotal = getCartTotal(cartItems);
  const { requests } = useCustomerPortalData(customerSession);
  const products = useStoredProducts();
  const productsReady = areStoredProductsReady();
  const lookups = useCatalogLookups();
  const storefrontCategoryLookups = useMemo(
    () => lookups.storefront_categories || [],
    [lookups.storefront_categories]
  );
  const storefrontProducts = useMemo(() => getStorefrontProducts(products), [products]);
  const storefrontCategories = useMemo(
    () => buildStorefrontCategories(products, storefrontCategoryLookups).filter((category) => category.productCount > 0),
    [products, storefrontCategoryLookups]
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const activeCategoryId = selectedCategoryId || storefrontCategories[0]?.id || "";
  const activeCategory = useMemo(
    () => getStorefrontCategoryById(products, activeCategoryId, storefrontCategoryLookups),
    [activeCategoryId, products, storefrontCategoryLookups]
  );
  const categoryProducts = useMemo(
    () => storefrontCategories.find((category) => category.id === activeCategoryId)?.products || storefrontProducts,
    [activeCategoryId, storefrontCategories, storefrontProducts]
  );
  const [selectedProductId, setSelectedProductId] = useState("");
  const selectedProduct = useMemo(() => {
    const preferredProductId = selectedProductId || categoryProducts[0]?.id || storefrontProducts[0]?.id || "";
    return storefrontProducts.find((product) => product.id === preferredProductId) || null;
  }, [categoryProducts, selectedProductId, storefrontProducts]);
  const availableColors = selectedProduct?.colors?.length ? selectedProduct.colors : ["Open"];
  const availableSizes = selectedProduct?.sizes?.length ? selectedProduct.sizes : ["Open"];
  const placements = useMemo(
    () => getProductPlacementConfig(selectedProduct),
    [selectedProduct]
  );
  const [quantity, setQuantity] = useState(24);
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedPlacement, setSelectedPlacement] = useState("");
  const [needByDate, setNeedByDate] = useState("");
  const [notes, setNotes] = useState("");
  const [contactName, setContactName] = useState(customerSession.displayName || "");
  const [contactPhone, setContactPhone] = useState(customerSession.phone || "");
  const [submitState, setSubmitState] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const attentionRequests = requests.filter((request) => requestNeedsCustomerAction(request));
  const underReviewRequests = requests.filter((request) => !requestNeedsCustomerAction(request));
  const primaryAttentionRequest = attentionRequests[0] || null;
  const cartPreviewItems = cartItems.slice(0, 3);

  const resolvedColor = availableColors.includes(selectedColor) ? selectedColor : availableColors[0] || "";
  const resolvedSize = availableSizes.includes(selectedSize) ? selectedSize : availableSizes[0] || "";
  const resolvedPlacement = placements.some((placement) => placement.label === selectedPlacement)
    ? selectedPlacement
    : placements[0]?.label || "";
  const estimatedUnitPrice = resolveProductBasePrice(selectedProduct);
  const estimatedTotal =
    Number.isFinite(estimatedUnitPrice) && estimatedUnitPrice > 0 ? estimatedUnitPrice * Number(quantity || 0) : null;

  function handleSelectCategory(categoryId) {
    setSelectedCategoryId(categoryId);
    const firstProductId =
      storefrontCategories.find((category) => category.id === categoryId)?.products?.[0]?.id || "";
    setSelectedProductId(firstProductId);
  }

  function handleSelectProduct(productId) {
    setSelectedProductId(productId);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedProduct) {
      setSubmitState("error");
      setSubmitMessage("Choose a product before sending the request.");
      return;
    }

    const decorationType = getDefaultDecorationType(selectedProduct);

    try {
      setSubmitState("submitting");
      setSubmitMessage("");

      const { createdOrder } = await submitProjectRequest({
        customerSession,
        selectedProduct,
        category: getStorefrontProductCategoryLabel(selectedProduct, storefrontCategoryLookups),
        imageSrc: getStorefrontProductImage(selectedProduct),
        contactName,
        contactPhone,
        quantity,
        selectedColor: resolvedColor === "Open" ? "" : resolvedColor,
        selectedSize: resolvedSize === "Open" ? "" : resolvedSize,
        selectedPlacements: resolvedPlacement ? [resolvedPlacement] : [],
        decorationType,
        dueDate: needByDate,
        notes,
        source: "Customer Portal",
      });

      navigate("/portal/orders", {
        replace: true,
        state: {
          createdOrderNumber: createdOrder.order_number,
          flashMessage: `Your request for ${selectedProduct.name} has been added to Tee & Co's quote workflow.`,
        },
      });
    } catch (error) {
      console.error("Unable to create customer portal order request", error);
      setSubmitState("error");
      setSubmitMessage(
        error instanceof Error && error.message
          ? error.message
          : "The request could not be sent. Try again."
      );
    }
  }

  return (
    <PortalPage
      eyebrow="Request Hub"
      title="Start or continue a Tee & Co request"
      description="Continue a request, browse the storefront, or manage active work without leaving the Tee & Co storefront flow."
    >
      <SectionCard
        title="What needs attention"
        subtitle="Customer actions appear first. Storefront browsing stays available when there is nothing blocking a current request."
      >
        {primaryAttentionRequest ? (
          <WorkItem request={primaryAttentionRequest} tone="warning" />
        ) : (
          <div
            style={{
              borderRadius: "20px",
              border: "1px solid #a7f3d0",
              background: "#ecfdf5",
              padding: "18px",
              color: "#115e59",
              display: "grid",
              gap: "10px",
            }}
          >
            <strong style={{ color: "#064e3b", fontSize: "18px" }}>
              No customer action needed right now
            </strong>
            <span style={{ lineHeight: 1.6 }}>
              Continue your request builder, check submitted requests, or browse the storefront to
              start something new.
            </span>
          </div>
        )}

        {attentionRequests.length > 1 ? (
          <div style={{ display: "grid", gap: "10px" }}>
            {attentionRequests.slice(1, 4).map((request) => (
              <WorkItem key={request.order_number || request.id} request={request} tone="warning" />
            ))}
          </div>
        ) : null}
      </SectionCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "18px",
        }}
      >
        <DashboardPanel
          eyebrow="Builder"
          title="Request Builder"
          body={
            cartItemCount
              ? `${cartItemCount} item${cartItemCount === 1 ? "" : "s"} in progress, totaling ${formatMoney(cartTotal)} before review.`
              : "No products are in your request builder yet."
          }
          background={cartItemCount ? "#f0fdfa" : "#ffffff"}
        >
          {cartPreviewItems.length ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {cartPreviewItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    borderRadius: "14px",
                    background: "#ffffff",
                    border: "1px solid #ccfbf1",
                    padding: "10px 12px",
                    color: "#0f172a",
                    fontWeight: 700,
                  }}
                >
                  {item.name} x{item.quantity}
                </div>
              ))}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <HubActionLink to={cartItemCount ? "/cart" : "/"}>
              {cartItemCount ? "Continue Builder" : "Browse Storefront"}
            </HubActionLink>
            {cartItemCount ? (
              <HubActionLink to="/" variant="secondary">
                Browse More
              </HubActionLink>
            ) : null}
          </div>
        </DashboardPanel>

        <DashboardPanel
          eyebrow="Submitted"
          title="Under Review"
          body={
            underReviewRequests.length
              ? `${underReviewRequests.length} request${underReviewRequests.length === 1 ? "" : "s"} with Tee & Co.`
              : "Submitted requests will appear here while Tee & Co reviews them."
          }
          background="#f8fafc"
        >
          {underReviewRequests.slice(0, 3).map((request) => (
            <WorkItem key={request.order_number || request.id} request={request} />
          ))}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <HubActionLink to="/portal/orders" variant={underReviewRequests.length ? "secondary" : "primary"}>
              My Requests
            </HubActionLink>
            {!cartItemCount && !attentionRequests.length ? (
              <HubActionLink to="/" variant="secondary">
                Browse Storefront
              </HubActionLink>
            ) : null}
          </div>
        </DashboardPanel>
      </div>

      <details
        style={{
          borderRadius: "26px",
          border: "1px solid #e2e8f0",
          background: "rgba(255,255,255,0.72)",
          padding: "20px",
          display: "grid",
          gap: "18px",
          boxShadow: "0 12px 30px rgba(15, 23, 42, 0.04)",
        }}
      >
        <summary
          style={{
            display: "grid",
            gap: "6px",
            cursor: "pointer",
            listStyle: "none",
          }}
        >
          <span
            style={{
              color: "#64748b",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Optional Tool
          </span>
          <span style={{ color: "#0f172a", fontSize: "24px", lineHeight: 1.1, fontWeight: 800 }}>
            Quick single product request
          </span>
          <span style={{ color: "#64748b", lineHeight: 1.6 }}>
            This legacy shortcut stays available for one-off requests, but the recommended path is
            to browse the storefront, add products to the request builder, and submit from checkout.
          </span>
        </summary>

        <div
          style={{
            marginTop: "18px",
            borderRadius: "18px",
            border: "1px solid #dbe4ee",
            background: "#f8fafc",
            padding: "14px 16px",
            color: "#475569",
            lineHeight: 1.6,
            fontWeight: 650,
          }}
        >
          Use this section only if you already know the product and want to send a simple quote
          request without building a multi-item request.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(300px, 0.9fr)",
            gap: "18px",
            alignItems: "start",
          }}
        >
          <SectionCard
            title="Product shortcut"
            subtitle="A compact selector for single-product requests. Use the storefront for full product discovery."
          >
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <HubActionLink to="/" variant="secondary">
                Browse Storefront
              </HubActionLink>
              <HubActionLink to="/cart" variant="secondary">
                Open Request Builder
              </HubActionLink>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              {storefrontCategories.map((category) => (
                <button
                  key={buildStorefrontCategorySelectionValue(category)}
                  type="button"
                  onClick={() => handleSelectCategory(category.id)}
                  style={{
                    borderRadius: "999px",
                    border:
                      activeCategoryId === category.id ? "1px solid #5eead4" : "1px solid #dbe4ee",
                    background: activeCategoryId === category.id ? "#ccfbf1" : "#ffffff",
                    color: activeCategoryId === category.id ? "#115e59" : "#334155",
                    padding: "8px 11px",
                    fontWeight: 800,
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  {category.name} ({category.productCount})
                </button>
              ))}
            </div>

            {!productsReady ? (
              <p style={{ margin: 0, color: "#64748b" }}>Loading catalog...</p>
            ) : null}

            {productsReady && !storefrontProducts.length ? (
              <div
                style={{
                  borderRadius: "18px",
                  border: "1px dashed #cbd5e1",
                  background: "#f8fafc",
                  padding: "22px",
                  color: "#475569",
                }}
              >
                No storefront products are available yet.
              </div>
            ) : null}

            {productsReady && categoryProducts.length ? (
              <div
                style={{
                  borderRadius: "18px",
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  padding: "12px",
                  maxHeight: "420px",
                  overflow: "auto",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "10px",
                  }}
                >
                  {categoryProducts.map((product) => {
                    const imageSrc = getStorefrontProductImage(product);
                    const isSelected = selectedProduct?.id === product.id;

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleSelectProduct(product.id)}
                        style={{
                          textAlign: "left",
                          borderRadius: "16px",
                          border: isSelected ? "1px solid #14b8a6" : "1px solid #dbe4ee",
                          background: isSelected ? "#f0fdfa" : "#ffffff",
                          padding: "10px",
                          boxShadow: isSelected
                            ? "0 12px 24px rgba(20, 184, 166, 0.12)"
                            : "none",
                          cursor: "pointer",
                          display: "grid",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            width: "100%",
                            aspectRatio: "4 / 3",
                            borderRadius: "12px",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            overflow: "hidden",
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          {imageSrc ? (
                            <img
                              src={imageSrc}
                              alt={product.name}
                              style={{ width: "100%", height: "100%", objectFit: "contain" }}
                            />
                          ) : (
                            <NoImagePlaceholder
                              style={{ borderRadius: "12px", width: "100%", height: "100%" }}
                              titleStyle={{ fontSize: "12px" }}
                              subtitleStyle={{ fontSize: "10px" }}
                            />
                          )}
                        </div>

                        <div style={{ display: "grid", gap: "4px" }}>
                          <strong style={{ color: "#0f172a", fontSize: "14px", lineHeight: 1.2 }}>
                            {product.name}
                          </strong>
                          <span style={{ color: "#0f766e", fontWeight: 800, fontSize: "12px" }}>
                            {resolveProductBasePrice(product) > 0
                              ? `From ${formatMoney(resolveProductBasePrice(product))}`
                              : "Pricing during review"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </SectionCard>

          <form onSubmit={handleSubmit} noValidate>
            <SectionCard
              title="Request details"
              subtitle="Preserved direct intake fields for this optional quick request path."
            >
              {selectedProduct ? (
                <div
                  style={{
                    borderRadius: "18px",
                    border: "1px solid #dbe4ee",
                    background: "#f8fafc",
                    padding: "16px",
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  <p style={{ margin: 0, color: "#0f766e", fontSize: "12px", fontWeight: 900 }}>
                    Selected Product
                  </p>
                  <strong style={{ color: "#0f172a", fontSize: "18px" }}>{selectedProduct.name}</strong>
                  <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
                    {activeCategory?.name || getStorefrontProductCategoryLabel(selectedProduct, storefrontCategoryLookups)}
                  </p>
                  <p style={{ margin: 0, color: "#334155", fontSize: "14px" }}>
                    {estimatedTotal !== null
                      ? `Starting estimate: ${formatMoney(estimatedTotal)} for ${Math.max(1, Number(quantity || 1))} units before final review.`
                      : "Pricing will be confirmed after review."}
                  </p>
                </div>
              ) : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "14px",
              }}
            >
              <label style={labelStyle()}>
                Quantity
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  style={fieldStyle()}
                />
              </label>

              <label style={labelStyle()}>
                Color
                <select
                  value={resolvedColor}
                  onChange={(event) => setSelectedColor(event.target.value)}
                  style={fieldStyle()}
                >
                  {availableColors.map((color) => (
                    <option key={color} value={color}>
                      {color === "Open" ? "Open / flexible" : color}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle()}>
                Size
                <select
                  value={resolvedSize}
                  onChange={(event) => setSelectedSize(event.target.value)}
                  style={fieldStyle()}
                >
                  {availableSizes.map((size) => (
                    <option key={size} value={size}>
                      {size === "Open" ? "Open / mixed sizing" : size}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "14px",
              }}
            >
              <label style={labelStyle()}>
                Placement preference
                <select
                  value={resolvedPlacement}
                  onChange={(event) => setSelectedPlacement(event.target.value)}
                  style={fieldStyle()}
                >
                  <option value="">Confirm with me later</option>
                  {placements.map((placement) => (
                    <option key={placement.id || placement.label} value={placement.label}>
                      {placement.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle()}>
                Needed by
                <input
                  type="date"
                  value={needByDate}
                  onChange={(event) => setNeedByDate(event.target.value)}
                  style={fieldStyle()}
                />
              </label>
            </div>

            <label style={labelStyle()}>
              Customization notes
              <textarea
                rows="6"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Share artwork direction, imprint ideas, team breakdown, or anything else Tee & Co should know."
                style={{ ...fieldStyle(), resize: "vertical" }}
              />
            </label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "14px",
              }}
            >
              <label style={labelStyle()}>
                Contact name
                <input
                  type="text"
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  style={fieldStyle()}
                />
              </label>

              <label style={labelStyle()}>
                Contact phone
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(event) => setContactPhone(event.target.value)}
                  placeholder="Optional"
                  style={fieldStyle()}
                />
              </label>
            </div>

            {submitMessage ? (
              <div
                style={{
                  borderRadius: "16px",
                  border: submitState === "error" ? "1px solid #fecaca" : "1px solid #cbd5e1",
                  background: submitState === "error" ? "#fef2f2" : "#f8fafc",
                  color: submitState === "error" ? "#b91c1c" : "#475569",
                  padding: "14px 16px",
                }}
              >
                {submitMessage}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={submitState === "submitting" || !selectedProduct}
                style={{
                  borderRadius: "999px",
                  border: "none",
                  background: submitState === "submitting" || !selectedProduct ? "#94a3b8" : "#0f766e",
                  color: "#ffffff",
                  padding: "13px 18px",
                  fontWeight: 800,
                  cursor: submitState === "submitting" || !selectedProduct ? "not-allowed" : "pointer",
                }}
              >
                {submitState === "submitting" ? "Sending Request..." : "Request Quote"}
              </button>

              <button
                type="button"
                onClick={() => navigate("/portal/orders")}
                style={{
                  borderRadius: "999px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  padding: "13px 18px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Back to Portal
              </button>
            </div>
          </SectionCard>
        </form>
        </div>
      </details>
    </PortalPage>
  );
}
