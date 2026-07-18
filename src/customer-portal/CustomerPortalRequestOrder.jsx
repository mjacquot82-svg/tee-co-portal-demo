import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import NoImagePlaceholder from "../components/NoImagePlaceholder";
import { useCatalogLookups } from "../lib/catalogLookupsStore";
import { ensureCustomerProfile } from "../lib/customerProfileStore";
import { linkOrderToCustomer } from "../lib/customersStore";
import { createStoredOrder } from "../lib/ordersStore";
import { getDefaultDecorationType } from "../lib/orderConfiguration";
import {
  clearPendingCustomerRequest,
  getPendingCustomerRequest,
} from "../lib/pendingCustomerRequestStore";
import { generateQuoteSnapshot } from "../lib/quoteEngine";
import {
  buildStorefrontCategories,
  buildStorefrontCategorySelectionValue,
  getStorefrontCategoryById,
  getStorefrontProductCategoryLabel,
  getStorefrontProductImage,
  getStorefrontProducts,
  resolveStorefrontProductImage,
} from "../lib/storefrontCatalog";
import {
  areStoredProductsReady,
  getProductPlacementConfig,
  resolveProductBasePrice,
  useStoredProducts,
} from "../lib/productsStore";
import { uploadCustomerArtwork } from "../services/customerArtworkService";
import { PortalPage, SectionCard } from "./CustomerPortalShared";
import {
  PUBLIC_STOREFRONT_PATH,
  shouldRedirectRequestOrderToStorefront,
} from "./customerPortalStartOrderRoute";

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

export default function CustomerPortalRequestOrder() {
  const location = useLocation();
  const navigate = useNavigate();
  const { customerSession } = useOutletContext();
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
  const [artworkOption, setArtworkOption] = useState("upload_later");
  const [artworkFile, setArtworkFile] = useState(null);
  const [contactName, setContactName] = useState(customerSession.displayName || "");
  const [contactPhone, setContactPhone] = useState(customerSession.phone || "");
  const [submitState, setSubmitState] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [pendingRequest, setPendingRequest] = useState(() => getPendingCustomerRequest());
  const appliedPendingRequestRef = useRef("");
  const pendingRequestSource = location.state?.pendingRequestSource || "";

  const resolvedColor = availableColors.includes(selectedColor) ? selectedColor : availableColors[0] || "";
  const resolvedSize = availableSizes.includes(selectedSize) ? selectedSize : availableSizes[0] || "";
  const resolvedPlacement = placements.some((placement) => placement.label === selectedPlacement)
    ? selectedPlacement
    : placements[0]?.label || "";
  const estimatedUnitPrice = resolveProductBasePrice(selectedProduct);
  const estimatedTotal =
    Number.isFinite(estimatedUnitPrice) && estimatedUnitPrice > 0 ? estimatedUnitPrice * Number(quantity || 0) : null;

  useEffect(() => {
    if (!shouldRedirectRequestOrderToStorefront({ pendingRequest, pendingRequestSource })) {
      return;
    }

    navigate(PUBLIC_STOREFRONT_PATH, {
      replace: true,
      state: {
        portalOrderStart: true,
      },
    });
  }, [navigate, pendingRequest, pendingRequestSource]);

  useEffect(() => {
    if (!pendingRequest || !storefrontProducts.length) return;

    const pendingKey = `${pendingRequest.created_at || ""}:${pendingRequest.productId || ""}`;
    if (appliedPendingRequestRef.current === pendingKey) return;

    const matchedProduct = storefrontProducts.find(
      (product) => product.id === pendingRequest.productId
    );

    if (matchedProduct) {
      setSelectedProductId(matchedProduct.id);
      const matchedCategory = storefrontCategories.find((category) =>
        category.products.some((product) => product.id === matchedProduct.id)
      );
      if (matchedCategory?.id) {
        setSelectedCategoryId(matchedCategory.id);
      }
    }

    if (pendingRequest.quantity) setQuantity(pendingRequest.quantity);
    if (pendingRequest.selectedColor) setSelectedColor(pendingRequest.selectedColor);
    if (pendingRequest.selectedSize) setSelectedSize(pendingRequest.selectedSize);
    if (pendingRequest.placement) setSelectedPlacement(pendingRequest.placement);
    if (pendingRequest.notes || pendingRequest.artworkName) {
      const artworkNote = pendingRequest.artworkName
        ? `Artwork reference: ${pendingRequest.artworkName}`
        : "";
      setNotes([pendingRequest.notes, artworkNote].filter(Boolean).join("\n\n"));
    }
    if (pendingRequest.artworkName) {
      setArtworkOption("upload_later");
    }

    appliedPendingRequestRef.current = pendingKey;
  }, [pendingRequest, storefrontCategories, storefrontProducts]);

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

    const normalizedQuantity = Math.max(1, Number(quantity || 1));
    const normalizedArtworkOption = ["upload_now", "upload_later", "need_help"].includes(artworkOption)
      ? artworkOption
      : "upload_later";

    if (normalizedArtworkOption === "upload_now" && !artworkFile) {
      setSubmitState("error");
      setSubmitMessage("Choose an artwork file or select Upload Artwork Later.");
      return;
    }

    setSubmitState("submitting");
    setSubmitMessage("");

    let profile;
    try {
      profile = await ensureCustomerProfile(customerSession);
    } catch (error) {
      console.error("Unable to prepare customer profile for order request", error);
      setSubmitState("error");
      setSubmitMessage("Your customer account could not be linked. Please try again.");
      return;
    }
    const decorationType = getDefaultDecorationType(selectedProduct);
    const artworkReferenceName = normalizeText(pendingRequest?.artworkName);
    let uploadedArtwork = null;

    if (normalizedArtworkOption === "upload_now" && artworkFile) {
      try {
        uploadedArtwork = await uploadCustomerArtwork(profile?.id || "", artworkFile, {
          uploadedBy: customerSession.displayName || customerSession.email || "Customer Portal",
          notes: "Uploaded with customer order request.",
        });
      } catch (error) {
        setSubmitState("error");
        setSubmitMessage(
          error instanceof Error && error.message
            ? error.message
            : "Artwork could not be uploaded. Try again or choose Upload Artwork Later."
        );
        return;
      }
    }

    const artworkDisplayName =
      uploadedArtwork?.file_name ||
      uploadedArtwork?.name ||
      artworkFile?.name ||
      artworkReferenceName;
    const artworkRequirement =
      normalizedArtworkOption === "upload_now"
        ? "Uploaded"
        : normalizedArtworkOption === "need_help"
        ? "Help Needed"
        : "Upload Later";
    const artworkFiles = uploadedArtwork
      ? [
          {
            ...uploadedArtwork,
            id: uploadedArtwork.id || "",
            name: artworkDisplayName,
            file_name: uploadedArtwork.file_name || artworkDisplayName,
            artwork_approval_status: "Pending Review",
          },
        ]
      : [];
    const requestPlacements = resolvedPlacement
      ? [
          {
            placement: resolvedPlacement,
            decoration_type: decorationType,
            artwork_id: uploadedArtwork?.id || "",
            artwork_name: artworkDisplayName,
          },
        ]
      : [];
    const quote = generateQuoteSnapshot(
      {
        garment: selectedProduct.name,
        product_id: selectedProduct.id,
        qty: normalizedQuantity,
        placement: resolvedPlacement,
        placements: requestPlacements,
        decoration_type: decorationType,
        setup_fees: [],
      },
      selectedProduct
    );

    try {
      const createdOrder = await createStoredOrder({
        customer_id: profile?.id || "",
        customer_name: profile?.name || customerSession.displayName || "Customer Account",
        customer_email: customerSession.email || profile?.email || "",
        customer_phone: normalizeText(contactPhone) || profile?.phone || "",
        customer_company: profile?.company || "",
        contact_name: normalizeText(contactName) || customerSession.displayName || "",
        product_id: selectedProduct.id,
        garment: selectedProduct.name,
        category: getStorefrontProductCategoryLabel(selectedProduct, storefrontCategoryLookups),
        product_image: getStorefrontProductImage(selectedProduct),
        product_notes: selectedProduct.notes || "",
        source: "Customer Portal",
        request_type: "Order Request",
        request_status: "Pending Staff Review",
        staff_review_status: "Pending Review",
        status: "New",
        quote_status: "Draft",
        operational_visible: false,
        production_ready: false,
        qty: normalizedQuantity,
        selected_color: resolvedColor === "Open" ? "" : resolvedColor,
        selected_size: resolvedSize === "Open" ? "" : resolvedSize,
        size_breakdown: resolvedSize && resolvedSize !== "Open" ? { [resolvedSize]: normalizedQuantity } : {},
        placement: resolvedPlacement,
        placements: requestPlacements,
        decoration_type: decorationType,
        customer_artwork_id: uploadedArtwork?.id || "",
        customer_artwork_name: artworkDisplayName,
        artwork_files: artworkFiles,
        artwork_reference_names: artworkDisplayName ? [artworkDisplayName] : [],
        artwork_requirement: artworkRequirement,
        artwork_status: uploadedArtwork ? "Pending Review" : "Missing",
        artwork_approval_required: true,
        artwork_approval_status: "Pending Review",
        approval_status: "Pending Review",
        due_date: needByDate || "",
        notes: normalizeText(notes),
        customer_notes: normalizeText(notes),
        request_details: normalizeText(notes),
        payment_history: [],
        total_paid: 0,
        amount_paid: 0,
        balance_due: 0,
        deposit_amount: 0,
        deposit_required: null,
        deposit_requirement: "undecided",
        deposit_requirement_status: "Undecided",
        deposit_workflow_status: "Pending Decision",
        invoice_status: "Draft",
        quote,
      });

      if (profile?.id) {
        try {
          await linkOrderToCustomer(profile.id, createdOrder.order_number);
        } catch (linkError) {
          console.error("Order was created but the customer summary could not be updated", linkError);
        }
      }

      if (pendingRequest) {
        clearPendingCustomerRequest();
        setPendingRequest(null);
      }

      navigate("/order-submitted", {
        replace: true,
        state: {
          createdOrderNumber: createdOrder.order_number,
          garmentName: selectedProduct.name,
          category: getStorefrontProductCategoryLabel(selectedProduct, storefrontCategoryLookups),
          selectedColor: resolvedColor,
          selectedSize: resolvedSize,
          quantity: normalizedQuantity,
          artworkName: artworkDisplayName,
          notes: normalizeText(notes),
          quote,
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
      eyebrow="Start New Order"
      title="Submit an order request"
      description="Browse the live storefront catalog, choose the product you want, and send an order request with quantity, artwork, and customization notes. Tee & Co will review it before production."
    >
      <SectionCard
        title="How this works"
        subtitle="This stays intentionally lightweight. You are not checking out, building a cart, or locking production details yet."
      >
        {pendingRequest ? (
          <div
            style={{
              borderRadius: "18px",
              border: "1px solid #a7f3d0",
              background: "#ecfdf5",
              padding: "16px",
              color: "#115e59",
              marginBottom: "14px",
            }}
          >
            <strong style={{ display: "block" }}>Garment selection restored</strong>
            <p style={{ margin: "6px 0 0", lineHeight: 1.6 }}>
              Review the details below, then submit an order request for Tee & Co staff review.
            </p>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          {[
            "Browse a category and choose a product.",
            "Set quantity and share the basics we should know.",
            "Tee & Co reviews the request and turns it into a quote or active order workflow.",
          ].map((step, index) => (
            <div
              key={step}
              style={{
                borderRadius: "18px",
                border: "1px solid #dbe4ee",
                background: "#f8fafc",
                padding: "16px",
              }}
            >
              <p style={{ margin: "0 0 8px", color: "#0f766e", fontSize: "12px", fontWeight: 900 }}>
                Step {index + 1}
              </p>
              <p style={{ margin: 0, color: "#334155", lineHeight: 1.6 }}>{step}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
          gap: "24px",
          alignItems: "start",
        }}
      >
        <SectionCard
          title="Browse the catalog"
          subtitle="This request flow uses the same storefront catalog and category-first browse already driving the public catalog."
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {storefrontCategories.map((category) => (
              <button
                key={buildStorefrontCategorySelectionValue(category)}
                type="button"
                onClick={() => handleSelectCategory(category.id)}
                style={{
                  borderRadius: "999px",
                  border: activeCategoryId === category.id ? "1px solid #99f6e4" : "1px solid #dbe4ee",
                  background: activeCategoryId === category.id ? "#ccfbf1" : "#ffffff",
                  color: activeCategoryId === category.id ? "#115e59" : "#0f172a",
                  padding: "10px 14px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {category.name} ({category.productCount})
              </button>
            ))}
          </div>

          {!productsReady ? (
            <p style={{ margin: 0, color: "#64748b" }}>Loading catalog…</p>
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
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "14px",
              }}
            >
              {categoryProducts.map((product) => {
                const productImage = resolveStorefrontProductImage(product, { size: "thumb" });
                const isSelected = selectedProduct?.id === product.id;

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleSelectProduct(product.id)}
                    style={{
                      textAlign: "left",
                      borderRadius: "20px",
                      border: isSelected ? "1px solid #99f6e4" : "1px solid #dbe4ee",
                      background: isSelected ? "#f0fdfa" : "#ffffff",
                      padding: "14px",
                      boxShadow: isSelected
                        ? "0 16px 32px rgba(20, 184, 166, 0.12)"
                        : "0 10px 24px rgba(15, 23, 42, 0.05)",
                      cursor: "pointer",
                      display: "grid",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "1 / 1",
                        borderRadius: "16px",
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        overflow: "hidden",
                        display: "grid",
                        placeItems: "center",
                      }}
                    >
                      {productImage.src ? (
                        <img
                          src={productImage.src}
                          alt={productImage.alt}
                          width="320"
                          height="320"
                          loading="lazy"
                          decoding="async"
                          style={{ width: "100%", height: "100%", objectFit: "contain" }}
                        />
                      ) : (
                        <NoImagePlaceholder
                          style={{ borderRadius: "16px", width: "100%", height: "100%" }}
                          titleStyle={{ fontSize: "13px" }}
                          subtitleStyle={{ fontSize: "11px" }}
                        />
                      )}
                    </div>

                    <div style={{ display: "grid", gap: "6px" }}>
                      <strong style={{ color: "#0f172a", fontSize: "16px" }}>{product.name}</strong>
                      <p style={{ margin: 0, color: "#475569", lineHeight: 1.5, fontSize: "13px" }}>
                        {product.notes || "Available for custom order requests."}
                      </p>
                      <span style={{ color: "#0f766e", fontWeight: 800, fontSize: "13px" }}>
                        {resolveProductBasePrice(product) > 0
                          ? `From ${formatMoney(resolveProductBasePrice(product))} each`
                          : "Pricing confirmed during review"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </SectionCard>

        <form onSubmit={handleSubmit} noValidate>
          <SectionCard
            title="Request details"
            subtitle="Keep it simple. Share the product, quantity, and the basics Tee & Co needs to start the quote."
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

            <fieldset
              style={{
                border: "1px solid #dbe4ee",
                borderRadius: "16px",
                padding: "14px",
                display: "grid",
                gap: "12px",
              }}
            >
              <legend style={{ padding: "0 6px", color: "#0f172a", fontWeight: 800 }}>
                Artwork
              </legend>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "10px",
                }}
              >
                {[
                  ["upload_now", "Upload Artwork Now"],
                  ["upload_later", "Upload Artwork Later"],
                  ["need_help", "Need Artwork Help"],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "9px",
                      border: artworkOption === value ? "1px solid #0f766e" : "1px solid #dbe4ee",
                      background: artworkOption === value ? "#ecfdf5" : "#ffffff",
                      color: "#0f172a",
                      borderRadius: "14px",
                      padding: "11px 12px",
                      fontWeight: 800,
                    }}
                  >
                    <input
                      type="radio"
                      name="artwork_option"
                      value={value}
                      checked={artworkOption === value}
                      onChange={(event) => setArtworkOption(event.target.value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {artworkOption === "upload_now" ? (
                <label style={labelStyle()}>
                  Artwork file
                  <input
                    type="file"
                    accept=".png,.jpg,.jpeg,.pdf,.svg,.ai"
                    onChange={(event) => setArtworkFile(event.target.files?.[0] || null)}
                    style={fieldStyle()}
                  />
                </label>
              ) : null}
            </fieldset>

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
                {submitState === "submitting" ? "Sending Request..." : "Submit Order Request"}
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
    </PortalPage>
  );
}
