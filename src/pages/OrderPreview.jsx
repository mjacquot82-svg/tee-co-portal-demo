import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import NoImagePlaceholder from "../components/NoImagePlaceholder";
import PlacementOptionList from "../components/PlacementOptionList";
import {
  buildPlacementPricingOptions,
  getDefaultDecorationType,
  resolveCustomerOrderProduct,
} from "../lib/orderConfiguration";
import { getActiveCustomerSession } from "../lib/customerSessionStore";
import { savePendingCustomerRequest } from "../lib/pendingCustomerRequestStore";
import { generateQuoteSnapshot } from "../lib/quoteEngine";
import { useStoredProducts } from "../lib/productsStore";

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
  const quantity = Number(passedState.quantity || 1);
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
    "Review your garment details, artwork, and decoration preferences before submitting.";
  const imageSrc = passedState.imageSrc || selectedProduct?.image || "";
  const selectedColor = passedState.selectedColor || "Black";
  const selectedSize = passedState.selectedSize || "M";

  const [requestedPlacements, setRequestedPlacements] = useState([]);
  const [notes, setNotes] = useState("");
  const [artwork, setArtwork] = useState(null);
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
          decoration_type: defaultDecorationType,
        })),
        decoration_type: defaultDecorationType,
        setup_fees: [],
      },
      selectedProduct
    );
  }, [
    defaultDecorationType,
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

  function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);

    setArtwork({
      file,
      name: file.name,
      previewUrl,
    });
  }

  function handleSubmit() {
    const pendingRequest = {
      garmentId: passedState.garmentId || "",
      productId: selectedProduct?.id || passedState.productId || "",
      garmentName,
      brand,
      category,
      description,
      imageSrc,
      selectedColor,
      selectedSize,
      quantity,
      placements: selectedPlacements,
      placement: selectedPlacements[0] || "",
      notes,
      artworkName: artwork?.name || "",
      decorationType: defaultDecorationType,
    };

    if (!savePendingCustomerRequest(pendingRequest)) {
      setSubmitError("We could not hold this request for sign-in. Please try again.");
      return;
    }

    const target = "/portal/request-order";
    const activeCustomerSession = getActiveCustomerSession();

    if (activeCustomerSession) {
      navigate(target, {
        state: {
          pendingRequestSource: "public-garment-flow",
        },
      });
      return;
    }

    navigate(`/login?redirectTo=${encodeURIComponent(target)}`, {
      state: {
        pendingRequestSource: "public-garment-flow",
      },
    });
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
        <span style={{ color: "#171717", fontWeight: 700 }}>Order Preview</span>
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
              Order Summary
            </p>

            <p style={{ margin: "0 0 6px 0", color: "#57534e", fontSize: "14px" }}>
              Product: {garmentName}
            </p>
            <p style={{ margin: "0 0 6px 0", color: "#57534e", fontSize: "14px" }}>
              Color: {selectedColor}
            </p>
            <p style={{ margin: "0 0 6px 0", color: "#57534e", fontSize: "14px" }}>
              Size: {selectedSize}
            </p>
            <p style={{ margin: "0 0 6px 0", color: "#57534e", fontSize: "14px" }}>
              Quantity: {quantity}
            </p>
            <p style={{ margin: "0 0 6px 0", color: "#57534e", fontSize: "14px" }}>
              Custom decoration included
            </p>
            {artwork?.name ? (
              <p style={{ margin: 0, color: "#57534e", fontSize: "14px" }}>
                Artwork: {artwork.name}
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
            <p style={{ margin: 0, fontSize: "13px", opacity: 0.76 }}>Order Total</p>
            <p style={{ margin: 0, fontWeight: 800, fontSize: isMobile ? "30px" : "36px" }}>
              {formatPrice(customerTotal, liveQuote.garment_pricing_available)}
            </p>
            <p style={{ margin: 0, fontSize: "13px", opacity: 0.76 }}>
              Final decorated catalog pricing
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
              Selected Options
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                gap: "10px 16px",
              }}
            >
              <div>
                <p style={{ margin: "0 0 2px 0", fontSize: "12px", color: "#78716c" }}>
                  Color
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>{selectedColor}</p>
              </div>

              <div>
                <p style={{ margin: "0 0 2px 0", fontSize: "12px", color: "#78716c" }}>
                  Size
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>{selectedSize}</p>
              </div>

              <div>
                <p style={{ margin: "0 0 2px 0", fontSize: "12px", color: "#78716c" }}>
                  Quantity
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>{quantity}</p>
              </div>

              <div>
                <p style={{ margin: "0 0 2px 0", fontSize: "12px", color: "#78716c" }}>
                  Decoration
                </p>
                <p style={{ margin: 0, fontWeight: 600 }}>Custom decoration included</p>
              </div>
            </div>
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
              Artwork Upload
            </p>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: "11px 14px",
                borderRadius: "12px",
                border: "1px solid #d6d3d1",
                background: "#ffffff",
                color: "#171717",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "14px",
              }}
            >
              {artwork ? "Replace Artwork" : "Upload Artwork"}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.ai,.eps,.svg"
              onChange={handleUpload}
              style={{ display: "none" }}
            />

            {artwork ? (
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
            ) : (
              <p
                style={{
                  margin: "10px 0 0 0",
                  color: "#78716c",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                Upload artwork, logo, or design reference for this order request.
              </p>
            )}
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
              Submit Order Request
            </button>

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
