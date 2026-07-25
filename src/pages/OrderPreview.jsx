import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import NoImagePlaceholder from "../components/NoImagePlaceholder";
import PlacementOptionList from "../components/PlacementOptionList";
import SizeBreakdownEditor from "../components/SizeBreakdownEditor";
import GarmentConfigurationSummary from "../components/GarmentConfigurationSummary";
import {
  buildPlacementPricingOptions,
  getDefaultDecorationType,
  getProductDecorationOptions,
  resolveCustomerOrderProduct,
} from "../lib/orderConfiguration";
import { getActiveCustomerSession } from "../lib/customerSessionStore";
import {
  getPendingCustomerRequest,
  savePendingCustomerRequest,
  upsertPendingCustomerLineItem,
} from "../lib/pendingCustomerRequestStore";
import {
  clearPendingCustomerArtwork,
  savePendingCustomerArtworkAsset,
} from "../lib/pendingCustomerArtworkStore";
import { generateQuoteSnapshot } from "../lib/quoteEngine";
import { useStoredProducts } from "../lib/productsStore";
import {
  PORTAL_REQUEST_ORDER_PATH,
  PUBLIC_GARMENT_FLOW_SOURCE,
} from "../customer-portal/customerPortalStartOrderRoute";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatPrice(value, isAvailable = true) {
  if (!isAvailable) return "Price unavailable";
  return money(value);
}

export default function OrderPreview() {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);

  const passedState = useMemo(() => location.state || {}, [location.state]);
  const products = useStoredProducts();
  const selectedProduct = useMemo(
    () => resolveCustomerOrderProduct(products, passedState),
    [passedState, products]
  );
  const editingLineItem = passedState.lineItem || null;
  const existingRequest = getPendingCustomerRequest() || {};
  const artworkLibrary = existingRequest.artworkLibrary || [];
  const editingArtworkId =
    editingLineItem?.artworkId ||
    editingLineItem?.artwork_id ||
    artworkLibrary.find((asset) => asset.displayName === editingLineItem?.artworkName)?.id ||
    "";
  const initialSize = editingLineItem?.size_breakdown
    ? ""
    : passedState.selectedSize || passedState.availableSizes?.[0] || selectedProduct?.sizes?.[0] || "";
  const [sizeBreakdown, setSizeBreakdown] = useState(
    editingLineItem?.size_breakdown || (initialSize ? { [initialSize]: Number(passedState.quantity || 1) } : {})
  );
  const availableSizes = useMemo(() => {
    const source = editingLineItem?.availableSizes?.length
      ? editingLineItem.availableSizes
      : passedState.availableSizes?.length
      ? passedState.availableSizes
      : selectedProduct?.sizes || [];
    return Array.from(new Set(source.map((size) => String(size || "").trim()).filter((size) => size && size !== "Open")));
  }, [editingLineItem, passedState.availableSizes, selectedProduct]);
  const quantity = Object.values(sizeBreakdown).reduce((total, value) => total + Math.max(0, Number(value || 0)), 0);
  const placementOptions = useMemo(
    () => buildPlacementPricingOptions(selectedProduct, quantity),
    [quantity, selectedProduct]
  );
  const allowedPlacements = useMemo(
    () => placementOptions.map((placement) => placement.label),
    [placementOptions]
  );
  const defaultDecorationType = useMemo(
    () => getDefaultDecorationType(selectedProduct),
    [selectedProduct]
  );

  const garmentName = passedState.garmentName || selectedProduct?.name || "Selected Garment";
  const brand = passedState.brand || selectedProduct?.brand_model || "Tee & Co";
  const category = passedState.category || selectedProduct?.category || "Apparel";
  const description =
    passedState.description ||
    selectedProduct?.notes ||
    "Review your garment details, artwork, and decoration preferences before continuing to the secure request form.";
  const imageSrc = passedState.imageSrc || selectedProduct?.image || "";
  const selectedColor = passedState.selectedColor || "Black";
  const selectedSize = Object.keys(sizeBreakdown)[0] || passedState.selectedSize || "";

  const [requestedPlacements, setRequestedPlacements] = useState(
    editingLineItem?.placements || (editingLineItem?.placement ? [editingLineItem.placement] : [])
  );
  const [decorationType, setDecorationType] = useState(
    editingLineItem?.decorationType || editingLineItem?.decoration_type || defaultDecorationType
  );
  const [notes, setNotes] = useState("");
  const [artwork, setArtwork] = useState(null);
  const [artworkChoice, setArtworkChoice] = useState(
    editingArtworkId || artworkLibrary.length ? "existing" : "upload"
  );
  const [selectedArtworkId, setSelectedArtworkId] = useState(
    editingArtworkId || artworkLibrary[0]?.id || ""
  );
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);
  const [submitError, setSubmitError] = useState("");

  const selectedPlacements = useMemo(() => {
    if (!allowedPlacements.length) return [];

    const filtered = requestedPlacements.filter((placement) =>
      allowedPlacements.includes(placement)
    );

    return filtered.length ? filtered : [allowedPlacements[0]];
  }, [allowedPlacements, requestedPlacements]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const liveQuote = useMemo(() => {
    return generateQuoteSnapshot(
      {
        garment: garmentName,
        product_id: selectedProduct?.id || passedState.productId || "",
        qty: quantity,
        placement: selectedPlacements[0] || "",
        placements: selectedPlacements.map((placement) => ({
          placement,
          decoration_type: decorationType,
        })),
        decoration_type: decorationType,
        setup_fees: [],
      },
      selectedProduct
    );
  }, [
    decorationType,
    garmentName,
    passedState.productId,
    quantity,
    selectedPlacements,
    selectedProduct,
  ]);
  const customerTotal = liveQuote.garment_pricing_available
    ? liveQuote.garment_subtotal
    : liveQuote.total;

  function togglePlacement(placement) {
    if (!allowedPlacements.includes(placement)) return;

    setRequestedPlacements((current) => {
      const exists = current.includes(placement);
      const nextPlacements = exists
        ? current.filter((item) => item !== placement)
        : [...current, placement];

      return allowedPlacements.filter((item) => nextPlacements.includes(item));
    });
  }

  function acceptArtworkFile(file) {
    if (artwork?.previewUrl) URL.revokeObjectURL(artwork.previewUrl);
    const previewUrl = URL.createObjectURL(file);

    setArtwork({
      id: typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `draft-artwork-${Date.now()}`,
      file,
      name: file.name,
      displayName: file.name,
      previewUrl,
    });
  }

  function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    acceptArtworkFile(file);
    setArtworkChoice("upload");
  }

  function buildConfiguredLineItem() {
    const selectedExistingArtwork = artworkLibrary.find((asset) => asset.id === selectedArtworkId);
    const selectedArtwork = artworkChoice === "existing" ? selectedExistingArtwork : artwork;
    return {
      id: editingLineItem?.id || `line-${Date.now()}`,
      garmentId: passedState.garmentId || "",
      productId: selectedProduct?.id || passedState.productId || "",
      garmentName,
      brand,
      category,
      description,
      imageSrc,
      selectedColor,
      selectedSize,
      availableSizes,
      size_breakdown: sizeBreakdown,
      quantity,
      placements: selectedPlacements,
      placement: selectedPlacements[0] || "",
      decorationType,
      artworkId: selectedArtwork?.id || "",
      artworkName: selectedArtwork?.displayName || selectedArtwork?.name || "",
      estimatedStartingPrice: Number.isFinite(Number(customerTotal)) ? Number(customerTotal) : 0,
    };
  }

  async function saveConfiguredGarment(destination) {
    if (!quantity) {
      setSubmitError("Add at least one size and quantity before saving this garment.");
      return;
    }
    const configuredLineItem = buildConfiguredLineItem();
    const existingLineItems = existingRequest.lineItems || [];
    const updatedLineItems = upsertPendingCustomerLineItem(existingLineItems, configuredLineItem);
    const newArtworkAsset = artwork?.file
      ? {
          id: artwork.id,
          displayName: artwork.displayName,
          originalFilename: artwork.name,
          storageReference: "",
        }
      : null;
    const nextArtworkLibrary = newArtworkAsset && !artworkLibrary.some((asset) => asset.id === newArtworkAsset.id)
      ? [...artworkLibrary, newArtworkAsset]
      : artworkLibrary;
    const pendingRequest = {
      ...existingRequest,
      ...configuredLineItem,
      lineItems: updatedLineItems,
      notes: existingRequest.notes || notes,
      artworkName: nextArtworkLibrary[0]?.displayName || "",
      artworkLibrary: nextArtworkLibrary,
    };

    if (!savePendingCustomerRequest(pendingRequest)) {
      setSubmitError("We could not hold this request for sign-in. Please try again.");
      return;
    }

    const artworkSaved = artwork?.file
      ? await savePendingCustomerArtworkAsset(artwork.id, artwork.file)
      : nextArtworkLibrary.length
      ? true
      : await clearPendingCustomerArtwork();
    if (!artworkSaved) {
      setSubmitError("We could not carry your artwork into the secure request form. Please try again.");
      return;
    }

    if (destination === "catalogue") {
      navigate("/", { state: { addingAnotherGarment: true } });
      return;
    }

    const target = PORTAL_REQUEST_ORDER_PATH;
    const activeCustomerSession = getActiveCustomerSession();

    if (activeCustomerSession) {
      navigate(target, {
        state: {
          pendingRequestSource: PUBLIC_GARMENT_FLOW_SOURCE,
        },
      });
      return;
    }

    navigate(`/login?redirectTo=${encodeURIComponent(target)}`, {
      state: {
        pendingRequestSource: PUBLIC_GARMENT_FLOW_SOURCE,
      },
    });
  }

  async function handleSubmit() {
    await saveConfiguredGarment("review");
  }

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: isMobile ? "10px 14px 20px" : "12px 20px 24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          marginBottom: isMobile ? "10px" : "12px",
          fontSize: isMobile ? "12px" : "13px",
          color: "#78716c",
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Link
          to="/"
          style={{
            color: "#57534e",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          Home
        </Link>
        <span>/</span>
        <span style={{ color: "#171717", fontWeight: 700 }}>Selection Review</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "420px minmax(0, 1fr)",
          gap: isMobile ? "18px" : "28px",
          alignItems: "start",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: "26px",
            padding: isMobile ? "18px" : "24px",
            border: "1px solid #ece7e1",
            boxShadow: "0 18px 40px rgba(28, 25, 23, 0.06)",
            display: "flex",
            flexDirection: "column",
            position: isMobile ? "static" : "sticky",
            top: isMobile ? "auto" : "16px",
            gap: "18px",
          }}
        >
          <div
            style={{
              width: "100%",
              aspectRatio: "1 / 1",
              borderRadius: "24px",
              overflow: "hidden",
              background: "linear-gradient(180deg, #fbf7f2 0%, #f5efe7 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #f0e7dd",
            }}
          >
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={garmentName}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            ) : (
              <NoImagePlaceholder
                style={{ borderRadius: "24px" }}
                titleStyle={{ fontSize: isMobile ? "16px" : "18px" }}
                subtitleStyle={{ fontSize: isMobile ? "12px" : "13px" }}
              />
            )}
          </div>

          <div
            style={{
              width: "100%",
              padding: "18px",
              borderRadius: "20px",
              background: "#fcfaf7",
              border: "1px solid #eee7df",
            }}
          >
            <p
              style={{
                margin: "0 0 6px 0",
                fontWeight: "700",
                fontSize: "14px",
                color: "#171717",
              }}
            >
              Selection Summary
            </p>

            <p style={{ margin: "0 0 6px 0", color: "#57534e", fontSize: "14px" }}>
              Product: {garmentName}
            </p>
            <p style={{ margin: "0 0 6px 0", color: "#57534e", fontSize: "14px" }}>
              Color: {selectedColor}
            </p>
            <p style={{ margin: "0 0 6px 0", color: "#57534e", fontSize: "14px" }}>
              Total Pieces: {quantity}
            </p>
            <p style={{ margin: "0 0 6px 0", color: "#57534e", fontSize: "14px" }}>
              Size Breakdown: {Object.entries(sizeBreakdown).map(([size, amount]) => `${size} ×${Number(amount)}`).join(" · ") || "Not configured"}
            </p>
            <p style={{ margin: "0 0 6px 0", color: "#57534e", fontSize: "14px" }}>
              Custom decoration included
            </p>
            {artwork?.name || artworkLibrary.find((asset) => asset.id === selectedArtworkId)?.displayName || editingLineItem?.artworkName ? (
              <p style={{ margin: 0, color: "#57534e", fontSize: "14px" }}>
                Artwork: {artworkChoice === "existing" ? artworkLibrary.find((asset) => asset.id === selectedArtworkId)?.displayName : artwork?.name || editingLineItem?.artworkName}
              </p>
            ) : null}
          </div>

          <div
            style={{
              width: "100%",
              padding: "20px",
              borderRadius: "22px",
              background: "#171717",
              color: "#ffffff",
              display: "grid",
              gap: "8px",
            }}
          >
            <p style={{ margin: 0, fontSize: "13px", opacity: 0.76 }}>Estimated Total</p>
            <p style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? "30px" : "36px" }}>
              {formatPrice(customerTotal, liveQuote.garment_pricing_available)}
            </p>
            <p style={{ margin: 0, fontSize: "13px", opacity: 0.76 }}>
              Estimated decorated pricing
            </p>
          </div>

          {artwork?.previewUrl && artwork.file?.type?.startsWith("image/") && (
            <div
              style={{
                width: "100%",
                padding: "18px",
                borderRadius: "20px",
                background: "#fcfaf7",
                border: "1px solid #eee7df",
              }}
            >
              <p
                style={{
                  margin: "0 0 8px 0",
                  fontWeight: "700",
                  fontSize: "14px",
                  color: "#171717",
                }}
              >
                Artwork Preview
              </p>

              <img
                src={artwork.previewUrl}
                alt={artwork.name}
                style={{
                  width: "100%",
                  maxWidth: "240px",
                  height: "auto",
                  borderRadius: "12px",
                  border: "1px solid #e7e5e4",
                  display: "block",
                }}
              />
            </div>
          )}
        </div>

        <div
          style={{
            background: "#ffffff",
            borderRadius: "26px",
            padding: isMobile ? "20px" : "28px",
            border: "1px solid #ece7e1",
            boxShadow: "0 18px 40px rgba(28, 25, 23, 0.06)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#78716c",
            }}
          >
            {brand} · {category}
          </p>

          <h1
            style={{
              marginTop: "6px",
              marginBottom: "8px",
              fontSize: isMobile ? "20px" : "26px",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              color: "#171717",
            }}
          >
            {garmentName}
          </h1>

          <p
            style={{
              margin: "0 0 8px 0",
              color: "#57534e",
              lineHeight: 1.5,
              fontSize: isMobile ? "14px" : "15px",
            }}
          >
            {description}
          </p>

          <div
            style={{
              marginTop: "18px",
              padding: "18px 20px",
              borderRadius: "20px",
              background: "#fcfaf7",
              border: "1px solid #eee7df",
            }}
          >
            <p
              style={{
                margin: "0 0 6px 0",
                fontWeight: "700",
                fontSize: "14px",
                color: "#171717",
              }}
            >
              Garment Summary
            </p>

            <GarmentConfigurationSummary color={selectedColor} decorationType={decorationType} sizeBreakdown={sizeBreakdown} />
          </div>

          <div style={{ marginTop: "18px" }}>
            <p style={{ fontWeight: "700", margin: "0 0 8px 0", fontSize: "15px" }}>Size Breakdown</p>
            <p style={{ margin: "0 0 12px", color: "#78716c", fontSize: "13px" }}>Add every size needed for this garment and set its quantity.</p>
            <SizeBreakdownEditor availableSizes={availableSizes} value={sizeBreakdown} onChange={setSizeBreakdown} />
          </div>

          <div style={{ marginTop: "18px" }}>
            <label style={{ display: "grid", gap: "8px", fontWeight: 700 }}>Decoration Method
              <select value={decorationType} onChange={(event) => setDecorationType(event.target.value)} style={{ padding: "11px", borderRadius: "12px", border: "1px solid #d6d3d1", background: "#fff" }}>
                {getProductDecorationOptions(selectedProduct).map((method) => <option key={method} value={method}>{method}</option>)}
              </select>
            </label>
          </div>

          <div style={{ marginTop: "18px" }}>
            <p style={{ fontWeight: "700", margin: "0 0 8px 0", fontSize: "15px" }}>
              Decoration Preference
            </p>
            <p
              style={{
                margin: "0 0 12px 0",
                fontSize: "13px",
                color: "#78716c",
                lineHeight: 1.5,
              }}
            >
              Choose where you want your artwork placed. Final pricing already includes decoration.
            </p>

            {placementOptions.length ? (
              <PlacementOptionList
                options={placementOptions}
                selectedPlacements={selectedPlacements}
                onToggle={togglePlacement}
                variant="pill"
                showPricing={false}
              />
            ) : (
              <p style={{ margin: 0, color: "#78716c", fontSize: "14px" }}>
                Decoration placement can be confirmed after submission.
              </p>
            )}
          </div>

          <div style={{ marginTop: "18px" }}>
            <p style={{ fontWeight: "700", margin: "0 0 8px 0", fontSize: "15px" }}>
              Artwork
            </p>

            {artworkLibrary.length ? (
              <div style={{ display: "grid", gap: "8px", marginBottom: "12px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
                  <input type="radio" name="artwork_choice" checked={artworkChoice === "existing"} onChange={() => setArtworkChoice("existing")} />
                  Choose Existing Artwork
                </label>
                {artworkChoice === "existing" ? (
                  <select
                    aria-label="Choose existing artwork"
                    value={selectedArtworkId}
                    onChange={(event) => setSelectedArtworkId(event.target.value)}
                    style={{ padding: "11px", borderRadius: "12px", border: "1px solid #d6d3d1", background: "#ffffff" }}
                  >
                    {artworkLibrary.map((asset) => (
                      <option key={asset.id} value={asset.id}>{asset.displayName}</option>
                    ))}
                  </select>
                ) : null}
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700 }}>
                  <input type="radio" name="artwork_choice" checked={artworkChoice === "upload"} onChange={() => setArtworkChoice("upload")} />
                  Upload New Artwork
                </label>
              </div>
            ) : (
              <p style={{ margin: "0 0 10px", color: "#78716c", fontSize: "13px" }}>
                Upload artwork for this garment. You can reuse it on the next garment.
              </p>
            )}

            {artworkChoice === "upload" ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{ padding: "11px 14px", borderRadius: "12px", border: "1px solid #d6d3d1", background: "#ffffff", color: "#171717", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}
              >
                {artwork ? "Choose Another File" : "Upload New Artwork"}
              </button>
            ) : null}

            <input
              ref={fileInputRef}
              data-testid="order-artwork-upload-input"
              type="file"
              accept="image/*,.pdf,.ai,.eps,.svg"
              onChange={handleUpload}
              style={{ display: "none" }}
            />

            {artworkChoice === "upload" && artwork ? (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  borderRadius: "12px",
                  background: "#fafaf9",
                  border: "1px solid #e7e5e4",
                }}
              >
                <p style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#57534e" }}>
                  Uploaded file
                </p>
                <p
                  style={{
                    margin: 0,
                    fontWeight: 600,
                    color: "#171717",
                    wordBreak: "break-word",
                  }}
                >
                  {artwork.name}
                </p>
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: "18px" }}>
            <p style={{ fontWeight: "700", margin: "0 0 8px 0", fontSize: "15px" }}>
              Notes for Tee &amp; Co
            </p>

            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes about decoration, sizing, timing, or design preferences..."
              style={{
                width: "100%",
                minHeight: isMobile ? "110px" : "120px",
                resize: "vertical",
                padding: "12px 14px",
                borderRadius: "14px",
                border: "1px solid #d6d3d1",
                background: "#ffffff",
                color: "#171717",
                fontSize: "14px",
                lineHeight: 1.5,
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div
            style={{
              marginTop: "20px",
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {submitError ? (
              <p
                style={{
                  flexBasis: "100%",
                  margin: 0,
                  color: "#b91c1c",
                  fontWeight: 700,
                  fontSize: "14px",
                }}
              >
                {submitError}
              </p>
            ) : null}

            <p
              style={{
                flexBasis: "100%",
                margin: 0,
                color: "#57534e",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              Your request is not submitted yet. We’ll carry this selection into the secure
              request form for final review and submission.
            </p>

            <button
              type="button"
              onClick={handleSubmit}
              style={{
                background: "#171717",
                color: "#ffffff",
                padding: "12px 16px",
                borderRadius: "12px",
                border: "none",
                cursor: "pointer",
                fontWeight: "700",
                boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
                fontSize: "14px",
              }}
            >
              {editingLineItem ? "Save Garment Changes" : "Save Garment"}
            </button>

            {!editingLineItem ? (
              <button type="button" onClick={() => saveConfiguredGarment("catalogue")} style={{ border: "1px solid #171717", color: "#171717", padding: "12px 16px", borderRadius: "12px", background: "#ffffff", cursor: "pointer", fontWeight: 700 }}>
                Continue Shopping
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => navigate(-1)}
              style={{
                border: "1px solid #d6d3d1",
                color: "#171717",
                padding: "12px 16px",
                borderRadius: "12px",
                background: "#ffffff",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Back
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
