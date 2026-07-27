import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { useCatalogLookups } from "../lib/catalogLookupsStore";
import { ensureCustomerProfile } from "../lib/customerProfileStore";
import { linkOrderToCustomer } from "../lib/customersStore";
import { createStoredOrder } from "../lib/ordersStore";
import { validateCustomerIdentity } from "../lib/customerIdentity";
import { formatNorthAmericanPhoneDisplay } from "../lib/phoneNormalization";
import { getDefaultDecorationType } from "../lib/orderConfiguration";
import {
  clearPendingCustomerRequest,
  getPendingCustomerRequest,
  savePendingCustomerRequest,
} from "../lib/pendingCustomerRequestStore";
import {
  clearPendingCustomerArtwork,
  getPendingCustomerArtworkAssets,
} from "../lib/pendingCustomerArtworkStore";
import { generateOrderQuoteSnapshot } from "../lib/quoteEngine";
import { getLineItemQuantity } from "../lib/orderLineItems";
import {
  buildStorefrontCategories,
  getStorefrontProductCategoryLabel,
  getStorefrontProductImage,
  getStorefrontProducts,
} from "../lib/storefrontCatalog";
import {
  areStoredProductsReady,
  getProductPlacementConfig,
  useStoredProducts,
} from "../lib/productsStore";
import { uploadCustomerArtwork } from "../services/customerArtworkService";
import { PortalPage, SectionCard } from "./CustomerPortalShared";
import {
  PORTAL_ORDER_SUBMITTED_PATH,
  PORTAL_ORDER_CATALOG_PATH,
  shouldOfferPendingDraftRecovery,
} from "./customerPortalStartOrderRoute";
import { resolveRequestContactDefaults } from "./requestContactDefaults";
import { useCustomerPortalData } from "./useCustomerPortalData";

function normalizeText(value) {
  return String(value || "").trim();
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDraftStarted(value) {
  if (!value) return "Start time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Start time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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

function ReviewItem({ label, value }) {
  return (
    <div style={{ display: "grid", gap: "5px" }}>
      <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 800 }}>{label}</span>
      <strong style={{ color: "#0f172a", fontSize: "15px", lineHeight: 1.4 }}>{value || "—"}</strong>
    </div>
  );
}

export default function CustomerPortalRequestOrder() {
  const location = useLocation();
  const navigate = useNavigate();
  const { customerSession } = useOutletContext();
  const { profile } = useCustomerPortalData(customerSession);
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
  const [lineItems, setLineItems] = useState([]);
  const [needByDate, setNeedByDate] = useState("");
  const [notes, setNotes] = useState("");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [pendingArtworkAssets, setPendingArtworkAssets] = useState([]);
  const [contactName, setContactName] = useState(customerSession.displayName || "");
  const [contactPhone, setContactPhone] = useState(customerSession.phone || "");
  const [submitState, setSubmitState] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const pendingRequestSource = location.state?.pendingRequestSource || "";
  const [pendingRequest, setPendingRequest] = useState(() => getPendingCustomerRequest());
  const [draftRecoveryState, setDraftRecoveryState] = useState(() =>
    shouldOfferPendingDraftRecovery({ pendingRequest, pendingRequestSource })
      ? "choose"
      : "resume"
  );
  const [draftRecoveryError, setDraftRecoveryError] = useState("");
  const [draftRecoveryBusy, setDraftRecoveryBusy] = useState(false);
  const appliedPendingRequestRef = useRef("");
  const initializedLineItemsRef = useRef(false);
  const contactNameEditedRef = useRef(false);
  const contactPhoneEditedRef = useRef(false);

  const resolvedColor = availableColors.includes(selectedColor) ? selectedColor : availableColors[0] || "";
  const resolvedSize = availableSizes.includes(selectedSize) ? selectedSize : availableSizes[0] || "";
  const resolvedPlacement = placements.some((placement) => placement.label === selectedPlacement)
    ? selectedPlacement
    : placements[0]?.label || "";
  const draftRecoveryRequired = Boolean(
    pendingRequest &&
      (draftRecoveryState === "choose" || location.state?.draftRecoveryRequested)
  );
  const isAuthenticatedCustomer = Boolean(
    customerSession?.id || customerSession?.email
  );

  useEffect(() => {
    const defaults = resolveRequestContactDefaults(customerSession, profile);

    if (!contactNameEditedRef.current && defaults.name) {
      setContactName(defaults.name);
    }
    if (!contactPhoneEditedRef.current && defaults.phone) {
      setContactPhone(defaults.phone);
    }
  }, [customerSession, profile]);

  useEffect(() => {
    if (!selectedProduct || draftRecoveryRequired || initializedLineItemsRef.current) return;
    if (pendingRequest && !appliedPendingRequestRef.current) return;
    if (pendingRequest?.lineItems?.length) {
      setLineItems(pendingRequest.lineItems.map((item) => ({
        id: item.id,
        product_id: item.productId,
        selected_color: item.selectedColor,
        placement: item.placement,
        decoration_type: item.decorationType,
        artwork_id: item.artworkId || "",
        artwork_name: item.artworkName || "",
        size_breakdown: item.size_breakdown,
        quantity: item.quantity,
      })));
      initializedLineItemsRef.current = true;
      return;
    }
    const initialSize = resolvedSize === "Open" ? "" : resolvedSize;
    const decorationType = getDefaultDecorationType(selectedProduct);
    setLineItems([
      {
        id: `line-${Date.now()}`,
        product_id: selectedProduct.id,
        selected_color: resolvedColor === "Open" ? "" : resolvedColor,
        placement: resolvedPlacement,
        decoration_type: decorationType,
        size_breakdown: initialSize ? { [initialSize]: Math.max(1, Number(quantity || 1)) } : {},
        quantity: Math.max(1, Number(quantity || 1)),
      },
    ]);
    initializedLineItemsRef.current = true;
  }, [draftRecoveryRequired, pendingRequest, quantity, resolvedColor, resolvedPlacement, resolvedSize, selectedProduct]);

  const configuredLineItems = lineItems.map((lineItem) => {
    const product = storefrontProducts.find((item) => item.id === lineItem.product_id);
    const quantityFromSizes = getLineItemQuantity(lineItem);
    const placement = lineItem.placement || getProductPlacementConfig(product)[0]?.label || "";
    const decorationType = lineItem.decoration_type || getDefaultDecorationType(product);
    return {
      ...lineItem,
      product_id: product?.id || lineItem.product_id,
      garment: product?.name || "Custom garment",
      category: getStorefrontProductCategoryLabel(product, storefrontCategoryLookups),
      product_image: getStorefrontProductImage(product),
      product_notes: product?.notes || "",
      placement,
      placements: placement ? [{ placement, decoration_type: decorationType }] : [],
      decoration_type: decorationType,
      quantity: quantityFromSizes,
    };
  });
  const orderQuantity = configuredLineItems.reduce((total, item) => total + item.quantity, 0);
  const estimatedOrderQuote = configuredLineItems.length
    ? generateOrderQuoteSnapshot({ line_items: configuredLineItems }, storefrontProducts)
    : null;

  function removeReviewedGarment(lineItemId) {
    const remainingDraftItems = (pendingRequest?.lineItems || []).filter((item) => item.id !== lineItemId);
    if (!remainingDraftItems.length) return;
    const nextPendingRequest = { ...pendingRequest, lineItems: remainingDraftItems };
    if (savePendingCustomerRequest(nextPendingRequest)) {
      setPendingRequest(nextPendingRequest);
      setLineItems((current) => current.filter((item) => item.id !== lineItemId));
    }
  }

  useEffect(() => {
    if (!pendingRequest || !storefrontProducts.length) return;
    if (draftRecoveryRequired) return;

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
    appliedPendingRequestRef.current = pendingKey;
  }, [draftRecoveryRequired, pendingRequest, storefrontCategories, storefrontProducts]);

  useEffect(() => {
    if (draftRecoveryRequired) return undefined;
    let active = true;

    void getPendingCustomerArtworkAssets().then((assets) => {
      if (!active) return;
      setPendingArtworkAssets(assets);
    });

    return () => {
      active = false;
    };
  }, [draftRecoveryRequired]);

  function handleResumeDraft() {
    setDraftRecoveryState("resume");
    navigate(location.pathname, { replace: true, state: null });
  }

  async function clearPendingDraft() {
    const requestCleared = clearPendingCustomerRequest();
    const artworkCleared = await clearPendingCustomerArtwork();
    return requestCleared && artworkCleared;
  }

  async function handleDiscardDraft() {
    setDraftRecoveryBusy(true);
    setDraftRecoveryError("");
    const cleared = await clearPendingDraft();

    if (!cleared) {
      setDraftRecoveryBusy(false);
      setDraftRecoveryError("We could not safely discard this draft. Please try again.");
      return;
    }

    setPendingRequest(null);
    navigate("/portal/orders", { replace: true });
  }

  async function handleStartFreshOrder() {
    setDraftRecoveryBusy(true);
    setDraftRecoveryError("");
    const cleared = await clearPendingDraft();

    if (!cleared) {
      setDraftRecoveryBusy(false);
      setDraftRecoveryError("We could not safely discard this draft. Please try again.");
      return;
    }

    setPendingRequest(null);
    navigate(PORTAL_ORDER_CATALOG_PATH, {
      replace: true,
      state: { portalOrderStart: true },
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const identityValidation = validateCustomerIdentity({
      customer_name: normalizeText(contactName) || customerSession.displayName || "",
      customer_first_name: customerSession.firstName || "",
      customer_last_name: customerSession.lastName || "",
      customer_phone: normalizeText(contactPhone) || customerSession.phone || "",
    });
    if (!identityValidation.valid) {
      setSubmitState("error");
      setSubmitMessage(
        isAuthenticatedCustomer && identityValidation.missingFields.includes("Phone Number")
          ? "Your Tee & Co. account is missing a contact phone number. Use Manage Account to add it before submitting this request."
          : identityValidation.message
      );
      return;
    }

    if (!configuredLineItems.length || configuredLineItems.some((item) => !item.product_id || item.quantity < 1)) {
      setSubmitState("error");
      setSubmitMessage("Add at least one garment and a quantity before sending the request.");
      return;
    }

    const normalizedQuantity = orderQuantity;
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
    const primaryLineItem = configuredLineItems[0];
    const primaryProduct = storefrontProducts.find((product) => product.id === primaryLineItem.product_id);
    const decorationType = primaryLineItem.decoration_type;
    const draftArtworkLibrary = pendingRequest?.artworkLibrary || [];
    const uploadedByDraftId = new Map();
    try {
      for (const draftAsset of draftArtworkLibrary) {
        const pendingAsset = pendingArtworkAssets.find((asset) => asset.id === draftAsset.id);
        if (!pendingAsset?.file) continue;
        const uploaded = await uploadCustomerArtwork(profile?.id || "", pendingAsset.file, {
          uploadedBy: customerSession.displayName || customerSession.email || "Customer Portal",
          notes: "Uploaded with customer order request.",
        });
        uploadedByDraftId.set(draftAsset.id, uploaded);
      }
    } catch (error) {
      setSubmitState("error");
      setSubmitMessage(error instanceof Error && error.message ? error.message : "Artwork could not be uploaded. Please try again.");
      return;
    }

    const artworkLibrary = draftArtworkLibrary.map((draftAsset) => {
      const uploaded = uploadedByDraftId.get(draftAsset.id);
      return {
        ...(uploaded || {}),
        id: uploaded?.id || draftAsset.id,
        display_name: draftAsset.displayName,
        name: draftAsset.displayName,
        original_filename: draftAsset.originalFilename,
        file_name: uploaded?.file_name || draftAsset.originalFilename,
        storage_reference: uploaded?.storage_path || uploaded?.asset_reference || draftAsset.storageReference || "",
      };
    });
    const persistedIdByDraftId = new Map(
      draftArtworkLibrary.map((asset, index) => [asset.id, artworkLibrary[index]?.id || asset.id])
    );
    const finalNotes = [normalizeText(notes), normalizeText(additionalInstructions)]
      .filter(Boolean)
      .join("\n\n");
    const artworkFiles = artworkLibrary;
    const primaryArtworkId = persistedIdByDraftId.get(primaryLineItem.artwork_id) || primaryLineItem.artwork_id || "";
    const primaryArtworkName = primaryLineItem.artwork_name || "";
    const requestPlacements = primaryLineItem.placement
      ? [
          {
            placement: primaryLineItem.placement,
            decoration_type: decorationType,
            artwork_id: primaryArtworkId,
            artwork_name: primaryArtworkName,
          },
        ]
      : [];
    const submittedLineItems = configuredLineItems.map((lineItem) => {
      const artworkId = persistedIdByDraftId.get(lineItem.artwork_id) || lineItem.artwork_id || "";
      return {
        ...lineItem,
        artwork_id: artworkId,
        placements: lineItem.placements.map((placement) => ({
          ...placement,
          artwork_id: artworkId,
          artwork_name: lineItem.artwork_name || "",
        })),
      };
    });
    const quote = generateOrderQuoteSnapshot({ line_items: submittedLineItems, setup_fees: [] }, storefrontProducts);

    try {
      const createdOrder = await createStoredOrder({
        customer_id: profile?.id || "",
        customer_first_name: identityValidation.identity.firstName,
        customer_last_name: identityValidation.identity.lastName,
        customer_name: identityValidation.identity.displayName,
        customer_email: customerSession.email || profile?.email || "",
        customer_phone: identityValidation.identity.phone,
        customer_company: profile?.company || "",
        contact_name: normalizeText(contactName) || customerSession.displayName || "",
        product_id: primaryLineItem.product_id,
        garment: primaryLineItem.garment,
        category: primaryLineItem.category,
        product_image: primaryLineItem.product_image,
        product_notes: primaryProduct?.notes || "",
        source: "Customer Portal",
        request_type: "Order Request",
        request_status: "Pending Staff Review",
        staff_review_status: "Pending Review",
        status: "New",
        quote_status: "Draft",
        operational_visible: false,
        production_ready: false,
        qty: normalizedQuantity,
        selected_color: primaryLineItem.selected_color,
        selected_size: Object.keys(primaryLineItem.size_breakdown)[0] || "",
        size_breakdown: primaryLineItem.size_breakdown,
        line_items: submittedLineItems,
        placement: primaryLineItem.placement,
        placements: requestPlacements,
        decoration_type: decorationType,
        customer_artwork_id: artworkLibrary.length === 1 ? artworkLibrary[0].id : "",
        customer_artwork_name: artworkLibrary.length === 1 ? artworkLibrary[0].display_name : "",
        artwork_library: artworkLibrary,
        artwork_files: artworkFiles,
        artwork_reference_names: artworkLibrary.map((asset) => asset.display_name),
        artwork_requirement: artworkLibrary.length ? "Uploaded" : "Upload Later",
        artwork_status: artworkLibrary.length ? "Pending Review" : "Missing",
        artwork_approval_required: artworkLibrary.length > 0,
        artwork_approval_status: artworkLibrary.length ? "Pending Review" : "Not Required",
        approval_status: "Pending Review",
        due_date: needByDate || "",
        notes: finalNotes,
        customer_notes: finalNotes,
        request_details: finalNotes,
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
      }
      await clearPendingCustomerArtwork();

      navigate(PORTAL_ORDER_SUBMITTED_PATH, {
        replace: true,
        state: {
          createdOrderNumber: createdOrder.order_number,
          garmentName: configuredLineItems.map((item) => item.garment).join(", "),
          category: primaryLineItem.category,
          selectedColor: primaryLineItem.selected_color,
          selectedSize: Object.keys(primaryLineItem.size_breakdown).join(", "),
          quantity: normalizedQuantity,
          artworkName: artworkLibrary.map((asset) => asset.display_name).join(", "),
          notes: finalNotes,
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

  if (draftRecoveryRequired && pendingRequest) {
    return (
      <PortalPage
        eyebrow="Unfinished Order"
        title="You have an unfinished order"
        description="Your previous selection is still saved. Choose whether to continue it or start over—nothing will be discarded without your decision."
      >
        <SectionCard
          title="Saved Draft"
          subtitle="Review the saved request before choosing what to do next."
        >
          <div style={{ display: "grid", gap: "20px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", borderRadius: "16px", border: "1px solid #dbe4ee", background: "#f8fafc", padding: "16px" }}>
              <ReviewItem label="Garment" value={pendingRequest.garmentName || "Selected garment"} />
              <ReviewItem label="Started" value={formatDraftStarted(pendingRequest.created_at)} />
              <ReviewItem label="Color" value={pendingRequest.selectedColor || "Not selected"} />
              <ReviewItem label="Quantity" value={pendingRequest.quantity || 1} />
            </div>

            {draftRecoveryError ? (
              <div role="alert" style={{ borderRadius: "14px", border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", padding: "12px 14px", fontWeight: 700 }}>
                {draftRecoveryError}
              </div>
            ) : null}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
              <button
                type="button"
                disabled={draftRecoveryBusy}
                onClick={handleResumeDraft}
                style={{ textAlign: "left", borderRadius: "16px", border: "1px solid #0f766e", background: "#0f766e", color: "#ffffff", padding: "16px", cursor: draftRecoveryBusy ? "not-allowed" : "pointer" }}
              >
                <strong style={{ display: "block", fontSize: "16px" }}>Resume Draft</strong>
                <span style={{ display: "block", marginTop: "5px", lineHeight: 1.45 }}>Continue where you left off.</span>
              </button>
              <button
                type="button"
                disabled={draftRecoveryBusy}
                onClick={handleDiscardDraft}
                style={{ textAlign: "left", borderRadius: "16px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#0f172a", padding: "16px", cursor: draftRecoveryBusy ? "not-allowed" : "pointer" }}
              >
                <strong style={{ display: "block", fontSize: "16px" }}>Discard Draft</strong>
                <span style={{ display: "block", marginTop: "5px", color: "#475569", lineHeight: 1.45 }}>Delete this unfinished request and return to My Orders.</span>
              </button>
              <button
                type="button"
                disabled={draftRecoveryBusy}
                onClick={handleStartFreshOrder}
                style={{ textAlign: "left", borderRadius: "16px", border: "1px solid #0f766e", background: "#ffffff", color: "#0f766e", padding: "16px", cursor: draftRecoveryBusy ? "not-allowed" : "pointer" }}
              >
                <strong style={{ display: "block", fontSize: "16px" }}>Start New Order</strong>
                <span style={{ display: "block", marginTop: "5px", color: "#475569", lineHeight: 1.45 }}>Discard this draft and begin a brand-new order.</span>
              </button>
            </div>
          </div>
        </SectionCard>
      </PortalPage>
    );
  }

  return (
    <PortalPage
      eyebrow="Final Review"
      title="Review and Submit Your Request"
      description="Your garment selection has been carried forward. Confirm the details below, provide the remaining information, and submit the request to Tee & Co."
    >
        <SectionCard
          title="Your Request"
          subtitle="Review each completed garment. Use Edit Garment only when a product configuration needs to change."
        >
          {!productsReady ? (
            <p style={{ margin: 0, color: "#64748b" }}>Loading your selection…</p>
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
              Your selected product is not currently available. Return to the order catalog to update the selection.
            </div>
          ) : null}

          {lineItems.map((lineItem, index) => {
            const product = storefrontProducts.find((item) => item.id === lineItem.product_id);
            return (
              <article key={lineItem.id} data-testid="customer-order-line-item" style={{ display: "grid", gap: "14px", border: "1px solid #dbe4ee", borderRadius: "18px", padding: "18px", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <strong>Line Item {index + 1}: {product?.name || lineItem.garment || "Custom garment"}</strong>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button type="button" onClick={() => { const editItem = { ...pendingRequest.lineItems[index], productId: lineItem.product_id, artworkId: lineItem.artwork_id, artworkName: lineItem.artwork_name }; navigate(`${PORTAL_ORDER_CATALOG_PATH}/order-preview`, { state: { ...editItem, lineItem: editItem } }); }}>Edit Garment</button>
                    {lineItems.length > 1 ? <button type="button" onClick={() => removeReviewedGarment(lineItem.id)}>Remove Garment</button> : null}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px" }}>
                  <ReviewItem label="Quantity" value={getLineItemQuantity(lineItem)} />
                  <ReviewItem label="Color" value={lineItem.selected_color || "Open / flexible"} />
                  <ReviewItem label="Size" value={Object.entries(lineItem.size_breakdown || {}).map(([size, amount]) => `${size} ×${amount}`).join(" · ") || "Open / mixed sizing"} />
                  <ReviewItem label="Placement" value={lineItem.placement || "Confirm later"} />
                  <ReviewItem label="Decoration" value={lineItem.decoration_type || "Confirm later"} />
                  <ReviewItem label="Artwork" value={lineItem.artwork_name || "No artwork selected for this garment"} />
                </div>
              </article>
            );
          })}
          <button type="button" onClick={() => navigate(PORTAL_ORDER_CATALOG_PATH, { state: { addingAnotherGarment: true } })}>Add Another Garment</button>
          <div style={{ marginTop: "16px", borderRadius: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", padding: "14px 16px" }}>
            <ReviewItem label="Order Summary" value={`${lineItems.length} garment line ${lineItems.length === 1 ? "item" : "items"} · ${orderQuantity} total pieces`} />
            <ReviewItem label="Estimated Pricing" value={estimatedOrderQuote?.total !== null && estimatedOrderQuote?.total !== undefined ? `${formatMoney(estimatedOrderQuote.total)} estimated total` : "Pricing confirmed after review"} />
          </div>
        </SectionCard>

        <form onSubmit={handleSubmit} noValidate>
          <SectionCard
            title="Additional Information Needed"
            subtitle="Add the remaining contact, timing, and artwork information before final submission."
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "14px",
              }}
            >
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
                Artwork Library
              </legend>
              {(pendingRequest?.artworkLibrary || []).length ? (
                <div data-testid="final-review-artwork-library" style={{ display: "grid", gap: "12px" }}>
                  {pendingRequest.artworkLibrary.map((asset) => {
                    const usedBy = configuredLineItems
                      .filter((lineItem) => lineItem.artwork_id === asset.id)
                      .map((lineItem) => lineItem.garment);
                    return (
                      <div key={asset.id} style={{ borderRadius: "14px", background: "#f8fafc", padding: "12px 14px" }}>
                        <strong style={{ color: "#0f172a" }}>{asset.displayName}</strong>
                        <span style={{ display: "block", marginTop: "5px", color: "#64748b", fontSize: "13px" }}>
                          Used by: {usedBy.join(", ") || "No garments"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ margin: 0, color: "#64748b" }}>No artwork has been added. Tee &amp; Co can confirm artwork after submission.</p>
              )}
            </fieldset>

            <div style={{ display: "grid", gap: "8px", borderRadius: "16px", border: "1px solid #e2e8f0", background: "#f8fafc", padding: "14px 16px" }}>
              <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 800 }}>Notes Already Provided</span>
              <p style={{ margin: 0, color: "#0f172a", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {notes || "No notes provided."}
              </p>
              <span style={{ color: "#64748b", fontSize: "13px" }}>These notes will be included with your request.</span>
            </div>

            <label style={labelStyle()}>
              Additional instructions
              <textarea
                rows="4"
                value={additionalInstructions}
                onChange={(event) => setAdditionalInstructions(event.target.value)}
                placeholder="Add any final scheduling, artwork, or customization details."
                style={{ ...fieldStyle(), resize: "vertical" }}
              />
            </label>

            {isAuthenticatedCustomer ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  flexWrap: "wrap",
                  borderRadius: "16px",
                  border: "1px solid #dbeafe",
                  background: "#eff6ff",
                  padding: "13px 16px",
                  color: "#1e3a8a",
                }}
              >
                <span style={{ lineHeight: 1.5 }}>
                  This order will be associated with your Tee &amp; Co. account.
                </span>
                <Link
                  to="/portal/account"
                  style={{
                    color: "#1d4ed8",
                    fontSize: "13px",
                    fontWeight: 800,
                    textDecoration: "none",
                  }}
                >
                  Manage Account
                </Link>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "14px",
                }}
              >
                <label style={labelStyle()}>
                  Contact name (First and Last)
                  <input
                    type="text"
                    value={contactName}
                    onChange={(event) => {
                      contactNameEditedRef.current = true;
                      setContactName(event.target.value);
                    }}
                    required
                    style={fieldStyle()}
                  />
                </label>

                <label style={labelStyle()}>
                  Contact phone
                  <input
                    type="tel"
                    value={formatNorthAmericanPhoneDisplay(contactPhone)}
                    onChange={(event) => {
                      contactPhoneEditedRef.current = true;
                      setContactPhone(event.target.value);
                    }}
                    required
                    placeholder="Best number for questions about this request"
                    style={fieldStyle()}
                  />
                </label>
              </div>
            )}

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

            <div style={{ borderRadius: "18px", border: "1px solid #a7f3d0", background: "#ecfdf5", padding: "16px", color: "#115e59" }}>
              <strong style={{ display: "block", fontSize: "16px" }}>Ready for final submission</strong>
              <p style={{ margin: "6px 0 0", lineHeight: 1.6 }}>
                Submitting sends this request to Tee & Co for review. It does not authorize production or payment.
              </p>
              <p style={{ margin: "8px 0 0", lineHeight: 1.6 }}>
                Next, Tee & Co will review the garment, artwork, pricing, and production requirements. You can track updates in My Orders.
              </p>
            </div>

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
                {submitState === "submitting" ? "Submitting Request..." : "Submit Order Request"}
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
    </PortalPage>
  );
}
