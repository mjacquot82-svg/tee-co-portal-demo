import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PlacementOptionList from "../components/PlacementOptionList";
import PricingSummary from "../components/PricingSummary";
import ProductionTypeSelect from "../components/ProductionTypeSelect";
import {
  normalizeProductionType,
} from "../constants/productionTypes";
import {
  buildPlacementPricingOptions,
  getProductDecorationOptions,
} from "../lib/orderConfiguration";
import {
  createStoredCustomer,
  getStoredCustomers,
  linkOrderToCustomer,
} from "../lib/customersStore";
import { customerIdsEqual } from "../lib/customerIds";
import { createStoredOrder } from "../lib/ordersStore";
import { useStoredProducts } from "../lib/productsStore";
import { generateQuoteSnapshot } from "../lib/quoteEngine";
import { uploadCustomerArtwork } from "../services/customerArtworkService";
import "./NewOrder.css";

const fallbackSizeKeys = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"];

function buildSizeState(sizeKeys) {
  return sizeKeys.reduce((sizes, size) => {
    sizes[size] = "";
    return sizes;
  }, {});
}

function normalizeLookup(value) {
  return String(value || "").trim().toLowerCase();
}

function findMatchingCustomer(customers, form) {
  const typedEmail = normalizeLookup(form.customer_email);
  const typedPhone = normalizeLookup(form.customer_phone).replace(/\D/g, "");
  const typedName = normalizeLookup(form.customer_name);
  const typedCompany = normalizeLookup(form.customer_company);

  return customers.find((customer) => {
    const customerEmail = normalizeLookup(customer.email);
    const customerPhone = normalizeLookup(customer.phone).replace(/\D/g, "");
    const customerName = normalizeLookup(customer.name);
    const customerCompany = normalizeLookup(customer.company);

    if (typedEmail && customerEmail && typedEmail === customerEmail) return true;
    if (typedPhone && customerPhone && typedPhone === customerPhone) return true;
    if (typedName && customerName === typedName && typedCompany === customerCompany) return true;

    return false;
  });
}

function findCustomerSuggestions(customers, value) {
  const searchValue = normalizeLookup(value);
  const searchPhone = searchValue.replace(/\D/g, "");

  if (searchValue.length < 2) return [];

  return customers
    .filter((customer) => {
      const searchableText = [
        customer.name,
        customer.company,
        customer.email,
        customer.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const customerPhone = normalizeLookup(customer.phone).replace(/\D/g, "");

      return (
        searchableText.includes(searchValue) ||
        (searchPhone.length >= 3 && customerPhone.includes(searchPhone))
      );
    })
    .slice(0, 5);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value <= 0) return "0 KB";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function calculateDepositTarget(totalAmount) {
  const normalizedTotal = roundCurrency(totalAmount);
  if (normalizedTotal <= 0) return 0;
  return roundCurrency(normalizedTotal * 0.5);
}

function formatPrice(value, isAvailable = true) {
  if (!isAvailable) return "Price unavailable";
  return money(value);
}

const fieldStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "15px",
  width: "100%",
  boxSizing: "border-box",
  background: "#ffffff",
};

const labelStyle = {
  display: "grid",
  gap: "8px",
  fontWeight: 600,
  color: "#292524",
};

export default function NewOrder() {
  const navigate = useNavigate();
  const artworkInputRef = useRef(null);
  const customerNameInputRef = useRef(null);
  const productSelectRef = useRef(null);
  const sizeSectionRef = useRef(null);
  const depositDecisionRef = useRef(null);
  const feedbackRef = useRef(null);
  const products = useStoredProducts().filter((product) => product.status !== "Inactive");
  const [customers, setCustomers] = useState(() => getStoredCustomers());
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedPlacements, setSelectedPlacements] = useState([]);
  const [artworkUpload, setArtworkUpload] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [depositRequirement, setDepositRequirement] = useState("");
  const [form, setForm] = useState({
    customer_id: "",
    customer_name: "",
    customer_phone: "",
    customer_email: "",
    customer_company: "",
    product_id: "",
    garment: "",
    garment_category: "",
    brand_model: "",
    garment_color: "",
    decoration_type: "Screen Print",
    due_date: "",
    notes: "",
    source: "Walk-in",
  });
  const [sizes, setSizes] = useState(buildSizeState(fallbackSizeKeys));
  const [submitState, setSubmitState] = useState("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [validationMessages, setValidationMessages] = useState([]);
  const [validationFields, setValidationFields] = useState({});

  function returnToQuoteWorkflow(state) {
    if (state) {
      navigate("/admin/quotes", { state });
      return;
    }

    navigate("/admin/quotes");
  }

  const selectedProduct = useMemo(() => {
    return products.find((product) => product.id === selectedProductId);
  }, [products, selectedProductId]);

  const sizeKeys = selectedProduct?.sizes?.length ? selectedProduct.sizes : fallbackSizeKeys;
  const colorOptions = selectedProduct?.colors?.length ? selectedProduct.colors : [];
  const totalQty = useMemo(() => {
    return Object.values(sizes).reduce((total, value) => {
      const qty = Number(value);
      return total + (Number.isFinite(qty) ? qty : 0);
    }, 0);
  }, [sizes]);
  const decorationOptions = useMemo(
    () => getProductDecorationOptions(selectedProduct),
    [selectedProduct]
  );
  const placementOptions = useMemo(
    () => buildPlacementPricingOptions(selectedProduct, totalQty),
    [selectedProduct, totalQty]
  );
  const placementLabels = useMemo(
    () => placementOptions.map((placement) => placement.label),
    [placementOptions]
  );
  const normalizedDecorationType = normalizeProductionType(form.decoration_type);
  const liveQuote = useMemo(() => {
    return generateQuoteSnapshot(
      {
        ...form,
        qty: totalQty,
        placement: selectedPlacements[0] || "",
        placements: selectedPlacements.map((placement) => ({
          placement,
          decoration_type: normalizedDecorationType,
        })),
        decoration_type: normalizedDecorationType,
        setup_fees: [],
      },
      selectedProduct
    );
  }, [form, normalizedDecorationType, selectedPlacements, selectedProduct, totalQty]);
  const financialPreview = useMemo(() => {
    const totalAmount = roundCurrency(liveQuote?.total || 0);
    const depositAmount =
      depositRequirement === "required" ? calculateDepositTarget(totalAmount) : 0;
    const balanceDue = Math.max(roundCurrency(totalAmount - depositAmount), 0);

    return {
      totalAmount,
      depositAmount,
      balanceDue,
      amountDueNow: depositRequirement === "required" ? depositAmount : totalAmount,
    };
  }, [depositRequirement, liveQuote]);

  function clearSubmitFeedback() {
    setSubmitState("idle");
    setSubmitMessage("");
    setValidationMessages([]);
    setValidationFields({});
  }

  function focusFeedback(targetRef) {
    window.requestAnimationFrame(() => {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

      if (targetRef?.current && typeof targetRef.current.focus === "function") {
        targetRef.current.focus();
        return;
      }

      if (feedbackRef.current && typeof feedbackRef.current.focus === "function") {
        feedbackRef.current.focus();
      }
    });
  }

  function buildValidationState() {
    const messages = [];
    const fields = {};
    let firstInvalidRef = null;

    if (!String(form.customer_name || "").trim()) {
      messages.push("Enter the customer name before saving the quote.");
      fields.customer_name = true;
      firstInvalidRef ||= customerNameInputRef;
    }

    if (!selectedProductId || !String(form.garment || "").trim()) {
      messages.push("Select a garment or product before saving the quote.");
      fields.product_id = true;
      firstInvalidRef ||= productSelectRef;
    }

    if (totalQty <= 0) {
      messages.push("Add at least one unit in the size breakdown before saving the quote.");
      fields.size_breakdown = true;
      firstInvalidRef ||= sizeSectionRef;
    }

    if (!depositRequirement) {
      messages.push("Choose whether this quote requires a deposit before saving.");
      fields.deposit_requirement = true;
      firstInvalidRef ||= depositDecisionRef;
    }

    if (depositRequirement === "required" && financialPreview.depositAmount <= 0) {
      messages.push("Deposit-required quotes need a calculated total so the deposit target can initialize correctly.");
      fields.deposit_requirement = true;
      firstInvalidRef ||= depositDecisionRef;
    }

    return { messages, fields, firstInvalidRef };
  }

  function selectCustomerById(customerId) {
    const customer = customers.find((item) => customerIdsEqual(item.id, customerId));
    if (!customer) return;

    setSelectedCustomerId(customer.id);
    setCustomerSearchResults([]);
    clearSubmitFeedback();

    setForm((current) => ({
      ...current,
      customer_id: customer.id,
      customer_name: customer.name || "",
      customer_phone: customer.phone || "",
      customer_email: customer.email || "",
      customer_company: customer.company || "",
      source: current.source === "Walk-in" ? "Repeat Order" : current.source,
    }));
  }

  function updateField(event) {
    const { name, value } = event.target;
    clearSubmitFeedback();

    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "customer_name" || name === "customer_phone" || name === "customer_email"
        ? { customer_id: "" }
        : {}),
    }));

    if (name === "customer_name" || name === "customer_phone" || name === "customer_email") {
      setSelectedCustomerId("");
      setCustomerSearchResults(findCustomerSuggestions(customers, value));
    }
  }

  function selectCustomer(event) {
    const customerId = event.target.value;
    clearSubmitFeedback();
    setSelectedCustomerId(customerId);
    setCustomerSearchResults([]);

    if (!customerId) {
      setForm((current) => ({
        ...current,
        customer_id: "",
      }));
      return;
    }

    selectCustomerById(customerId);
  }

  function resetArtworkUpload() {
    clearSubmitFeedback();
    setArtworkUpload(null);
    setUploadError("");

    if (artworkInputRef.current) {
      artworkInputRef.current.value = "";
    }
  }

  function updateDepositRequirement(event) {
    clearSubmitFeedback();
    setDepositRequirement(event.target.value);
  }

  function selectProduct(event) {
    const productId = event.target.value;
    const product = products.find((item) => item.id === productId);
    clearSubmitFeedback();
    setSelectedProductId(productId);

    if (!product) {
      setForm((current) => ({
        ...current,
        product_id: "",
        garment: "",
        garment_category: "",
        brand_model: "",
        garment_color: "",
        decoration_type: "Screen Print",
      }));
      setSelectedPlacements([]);
      setSizes(buildSizeState(fallbackSizeKeys));
      return;
    }

    setForm((current) => ({
      ...current,
      product_id: product.id,
      garment: product.name,
      garment_category: product.category,
      brand_model: product.brand_model || "",
      garment_color: product.colors?.[0] || "",
      decoration_type: getProductDecorationOptions(product)[0] || "Screen Print",
    }));
    setSelectedPlacements([]);
    setSizes(buildSizeState(product.sizes?.length ? product.sizes : fallbackSizeKeys));
  }

  async function updateArtwork(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const preview = await fileToDataUrl(file);
      setArtworkUpload({
        file,
        name: file.name,
        file_name: file.name,
        file_type: file.type || "application/octet-stream",
        file_size: file.size || 0,
        preview,
      });
      setUploadError("");
    } catch (error) {
      console.error("Unable to read uploaded artwork", error);
      setUploadError("Artwork could not be loaded. Try a different image file.");
      resetArtworkUpload();
    }
  }

  function updateSize(size, value) {
    clearSubmitFeedback();
    setSizes((current) => ({ ...current, [size]: value }));
  }

  function togglePlacement(placementLabel) {
    if (!placementLabels.includes(placementLabel)) return;
    clearSubmitFeedback();

    setSelectedPlacements((current) => {
      const exists = current.includes(placementLabel);
      const nextPlacements = exists
        ? current.filter((item) => item !== placementLabel)
        : [...current, placementLabel];

      return placementLabels.filter((placement) => nextPlacements.includes(placement));
    });
  }

  async function resolveCustomerForOrder() {
    if (form.customer_id) return form.customer_id;

    const matchingCustomer = findMatchingCustomer(customers, form);
    if (matchingCustomer) return matchingCustomer.id;

    const customer = await createStoredCustomer({
      name: form.customer_name,
      company: form.customer_company,
      phone: form.customer_phone,
      email: form.customer_email,
      notes: "Auto-created from staff order entry.",
    });

    setCustomers((current) => [customer, ...current]);
    return customer.id;
  }

  async function buildArtworkPayload(customerId) {
    if (!artworkUpload) return null;

    return uploadCustomerArtwork(customerId, artworkUpload.file, {
      displayName: artworkUpload.name,
      originalFilename: artworkUpload.file_name || artworkUpload.name,
      placementHint: selectedPlacements.join(", "),
      notes: `Uploaded during order intake for ${form.garment || "custom garment"}.`,
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const validationState = buildValidationState();
    if (validationState.messages.length) {
      setSubmitState("validation");
      setSubmitMessage("Quote not saved. Resolve the required items below.");
      setValidationMessages(validationState.messages);
      setValidationFields(validationState.fields);
      focusFeedback(validationState.firstInvalidRef);
      return;
    }

    setSubmitState("saving");
    setSubmitMessage("Saving quote…");
    setValidationMessages([]);
    setValidationFields({});

    try {
      const customerId = await resolveCustomerForOrder();
      const normalizedSizes = Object.fromEntries(
        Object.entries(sizes).map(([size, value]) => [size, Number(value) || 0])
      );
      const savedArtwork = await buildArtworkPayload(customerId);
      const artworkFiles = savedArtwork
        ? [
            {
              id: savedArtwork.id,
              name: savedArtwork.name,
              display_name: savedArtwork.display_name || savedArtwork.name,
              file_name: savedArtwork.file_name,
              original_filename: savedArtwork.original_filename || savedArtwork.file_name,
              type: savedArtwork.file_type,
              file_type: savedArtwork.file_type,
              size: savedArtwork.file_size,
              file_size: savedArtwork.file_size,
              preview: savedArtwork.preview,
              preview_url: savedArtwork.preview_url || savedArtwork.preview,
              asset_url:
                savedArtwork.asset_url ||
                savedArtwork.source_url ||
                savedArtwork.preview_url ||
                savedArtwork.preview,
              source_url:
                savedArtwork.source_url ||
                savedArtwork.asset_url ||
                savedArtwork.preview_url ||
                savedArtwork.preview,
              asset_reference:
                savedArtwork.asset_reference ||
                savedArtwork.id,
              placement_hint: savedArtwork.placement_hint,
              uploaded_at: savedArtwork.uploaded_at || savedArtwork.created_at,
              uploaded_by_staff_name: "Order Intake",
            },
          ]
        : [];
      const placements = selectedPlacements.map((placement) => ({
        placement,
        decoration_type: normalizeProductionType(form.decoration_type),
        artwork_id: savedArtwork?.id || "",
        artwork_name: savedArtwork?.name || "",
      }));
      const quote = generateQuoteSnapshot(
        {
          ...form,
          qty: totalQty,
          placement: selectedPlacements[0] || "",
          placements,
          decoration_type: normalizeProductionType(form.decoration_type),
          setup_fees: [],
        },
        selectedProduct
      );

      const order = createStoredOrder({
        ...form,
        customer_id: customerId,
        quote_status: "Draft",
        operational_visible: false,
        production_ready: false,
        product_image: selectedProduct?.image || "",
        product_notes: selectedProduct?.notes || "",
        qty: totalQty,
        size_breakdown: normalizedSizes,
        placement: selectedPlacements[0] || "",
        placements,
        decoration_type: normalizeProductionType(form.decoration_type),
        artwork_files: artworkFiles,
        customer_artwork_id: savedArtwork?.id || "",
        customer_artwork_name: savedArtwork?.name || "",
        deposit_requirement: depositRequirement,
        deposit_required: depositRequirement === "required",
        deposit_amount: financialPreview.depositAmount,
        deposit: {
          required: depositRequirement === "required",
          status: depositRequirement === "required" ? "pending" : "not_required",
          amount: financialPreview.depositAmount,
        },
        invoice: {
          status: "Draft",
        },
        payment_history: [],
        total_paid: 0,
        amount_paid: 0,
        balance_due: financialPreview.totalAmount,
        quote,
      });

      await linkOrderToCustomer(customerId, order.order_number);
      setSubmitState("success");
      setSubmitMessage(`Quote ${order.order_number} saved. Moving into quote workflow…`);
      returnToQuoteWorkflow({
        flashMessage: `Quote ${order.order_number} created successfully and added to workflow.`,
        flashTone: "success",
      });
    } catch (error) {
      console.error("Unable to save quote", error);
      setSubmitState("error");
      setSubmitMessage(
        error instanceof Error && error.message
          ? error.message
          : "Quote could not be saved. Try again."
      );
      focusFeedback();
    }
  }

  return (
    <div className="new-order-page">
      <form onSubmit={handleSubmit} className="new-order-form" noValidate>
        <div style={{ marginBottom: "22px" }}>
          <p
            style={{
              margin: 0,
              color: "#78716c",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Quote Intake
          </p>
          <h1 style={{ margin: "6px 0 8px", fontSize: "30px" }}>New Quote</h1>
          <p style={{ margin: 0, color: "#475569" }}>
            Build the customer quote, confirm pricing and artwork requirements, then hold it in sales workflow until it is ready for production release.
          </p>
        </div>

        <section
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "18px",
            padding: "18px",
            marginBottom: "20px",
          }}
        >
          <h2 style={{ margin: "0 0 12px", fontSize: "20px" }}>Customer</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
            <label style={labelStyle}>
              Existing Customer
              <select
                data-testid="new-order-existing-customer-select"
                value={selectedCustomerId}
                onChange={selectCustomer}
                style={fieldStyle}
              >
                <option value="">New customer / type manually...</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}{customer.company ? ` - ${customer.company}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ ...labelStyle, position: "relative" }}>
              Customer Name
              <input
                data-testid="new-order-customer-name-input"
                ref={customerNameInputRef}
                name="customer_name"
                value={form.customer_name}
                onChange={updateField}
                required
                placeholder="ABC Construction"
                style={{
                  ...fieldStyle,
                  borderColor: validationFields.customer_name ? "#dc2626" : "#cbd5e1",
                }}
              />

              {customerSearchResults.length > 0 && !selectedCustomerId && (
                <div
                  style={{
                    position: "absolute",
                    top: "78px",
                    left: 0,
                    right: 0,
                    zIndex: 20,
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    boxShadow: "0 12px 24px rgba(15, 23, 42, 0.12)",
                    overflow: "hidden",
                  }}
                >
                  {customerSearchResults.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => selectCustomerById(customer.id)}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "11px 12px",
                        background: "#ffffff",
                        border: "none",
                        borderBottom: "1px solid #f1f5f9",
                        textAlign: "left",
                        cursor: "pointer",
                        color: "#292524",
                      }}
                    >
                      <strong>{customer.name}</strong>
                      {customer.company ? ` — ${customer.company}` : ""}
                      <span style={{ display: "block", marginTop: "3px", color: "#64748b", fontSize: "13px" }}>
                        {[customer.phone, customer.email].filter(Boolean).join(" • ") || "Saved customer"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </label>

            <label style={labelStyle}>
              Phone
              <input name="customer_phone" value={form.customer_phone} onChange={updateField} placeholder="(555) 123-4567" style={fieldStyle} />
            </label>

            <label style={labelStyle}>
              Email
              <input name="customer_email" value={form.customer_email} onChange={updateField} placeholder="customer@example.com" style={fieldStyle} />
            </label>

            <label style={labelStyle}>
              Order Source
              <select name="source" value={form.source} onChange={updateField} style={fieldStyle}>
                <option>Walk-in</option>
                <option>Phone</option>
                <option>Email</option>
                <option>Website</option>
                <option>Repeat Order</option>
              </select>
            </label>
          </div>
          {selectedCustomerId ? (
            <p style={{ margin: "12px 0 0", color: "#166534", fontWeight: 700 }}>
              This order will be linked to the selected customer profile.
            </p>
          ) : (
            <p style={{ margin: "12px 0 0", color: "#475569", fontWeight: 700 }}>
              If this customer is not already saved, a new customer profile will be created automatically when the quote is saved.
            </p>
          )}
        </section>

        {(submitMessage || validationMessages.length > 0) && (
          <section
            ref={feedbackRef}
            aria-live="polite"
            tabIndex={-1}
            style={{
              marginBottom: "20px",
              borderRadius: "16px",
              padding: "16px 18px",
              border:
                submitState === "error" || submitState === "validation"
                  ? "1px solid #fecaca"
                  : submitState === "success"
                  ? "1px solid #bbf7d0"
                  : "1px solid #cbd5e1",
              background:
                submitState === "error" || submitState === "validation"
                  ? "#fef2f2"
                  : submitState === "success"
                  ? "#ecfdf5"
                  : "#f8fafc",
            }}
          >
            {submitMessage ? (
              <p
                style={{
                  margin: validationMessages.length ? "0 0 8px" : 0,
                  color:
                    submitState === "error" || submitState === "validation"
                      ? "#991b1b"
                      : submitState === "success"
                      ? "#166534"
                      : "#334155",
                  fontWeight: 700,
                }}
              >
                {submitMessage}
              </p>
            ) : null}

            {validationMessages.length ? (
              <ul style={{ margin: 0, paddingLeft: "18px", color: "#991b1b" }}>
                {validationMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
          </section>
        )}

        <section className="new-order-production-shell">
          <div className="new-order-config-panel">
            <div className="new-order-field-stack">
              <label style={labelStyle}>
                Garment / Product
                <select
                  data-testid="new-order-product-select"
                  ref={productSelectRef}
                  value={selectedProductId}
                  onChange={selectProduct}
                  required
                  style={{
                    ...fieldStyle,
                    borderColor: validationFields.product_id ? "#dc2626" : "#cbd5e1",
                  }}
                >
                  <option value="">Select a catalog product...</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}{product.brand_model ? ` (${product.brand_model})` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle}>
                Garment Color
                {colorOptions.length ? (
                  <select name="garment_color" value={form.garment_color} onChange={updateField} style={fieldStyle}>
                    {colorOptions.map((color) => <option key={color}>{color}</option>)}
                  </select>
                ) : (
                  <input name="garment_color" value={form.garment_color} onChange={updateField} placeholder="Black" style={fieldStyle} />
                )}
              </label>

              <ProductionTypeSelect
                value={form.decoration_type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    decoration_type: event.target.value,
                  }))
                }
                label="Production Type"
                options={decorationOptions}
              />
            </div>

            <div className="new-order-meta-strip">
              <span>
                <strong>Category:</strong> {selectedProduct?.category || "—"}
              </span>
              <span>
                <strong>Model:</strong> {selectedProduct?.brand_model || "General"}
              </span>
              <span>
                <strong>Unit Price:</strong>{" "}
                {selectedProduct ? formatPrice(liveQuote.garment_unit_price, liveQuote.garment_pricing_available) : "—"}
              </span>
              <span>
                <strong>Supported Methods:</strong>{" "}
                {selectedProduct ? decorationOptions.join(", ") : "—"}
              </span>
            </div>

            <div className="new-order-preview-panel">
              <div className="new-order-preview-header">
                <div>
                  <p className="new-order-section-kicker">Garment Preview</p>
                  <h2>{selectedProduct?.name || "Select a garment to preview"}</h2>
                </div>
                {selectedProduct?.notes ? (
                  <p className="new-order-preview-note">{selectedProduct.notes}</p>
                ) : null}
              </div>

              <div className="new-order-preview-stage">
                {selectedProduct?.image ? (
                  <img
                    src={selectedProduct.image}
                    alt={selectedProduct.name}
                    className="new-order-preview-image"
                  />
                ) : (
                  <div className="new-order-preview-empty">
                    Product preview will appear here.
                  </div>
                )}
              </div>
            </div>

            <section className="new-order-card new-order-inline-card">
              <div className="new-order-card-header">
                <div>
                  <h2>Artwork Upload</h2>
                </div>
              </div>

              <div className="new-order-upload-shell">
                <label htmlFor="order-artwork-upload" className="new-order-upload-button">
                  Upload Customer Artwork
                </label>
                <input
                  id="order-artwork-upload"
                  data-testid="new-order-artwork-upload-input"
                  ref={artworkInputRef}
                  type="file"
                  accept="image/*"
                  onChange={updateArtwork}
                  style={{ display: "none" }}
                />

                {artworkUpload ? (
                  <div className="new-order-artwork-preview">
                    <div className="new-order-artwork-thumb">
                      <img src={artworkUpload.preview} alt={artworkUpload.name} />
                    </div>
                    <div className="new-order-artwork-copy">
                      <strong>{artworkUpload.name}</strong>
                      <span>{formatFileSize(artworkUpload.file_size)}</span>
                      <span>
                        {selectedPlacements.length
                          ? `Linked to: ${selectedPlacements.join(", ")}`
                          : "No placement selected yet"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={resetArtworkUpload}
                      className="new-order-clear-button"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <p className="new-order-muted">
                    No artwork uploaded. You can still save the order and attach files later.
                  </p>
                )}

                {uploadError ? (
                  <p className="new-order-error">{uploadError}</p>
                ) : null}
              </div>
            </section>
          </div>

          <div className="new-order-production-panel">
            <section className="new-order-card new-order-inline-card new-order-size-card">
              <div className="new-order-size-header">
                <div>
                  <h2>Size Breakdown</h2>
                  <p className="new-order-size-note">
                    Size fields come directly from the selected product.
                  </p>
                </div>
                <span className="new-order-selection-count">Total {totalQty}</span>
              </div>

              <div
                ref={sizeSectionRef}
                className="new-order-size-grid"
                style={
                  validationFields.size_breakdown
                    ? {
                        border: "1px solid #fecaca",
                        borderRadius: "16px",
                        padding: "12px",
                        background: "#fef2f2",
                      }
                    : undefined
                }
              >
                {sizeKeys.map((size) => (
                  <label key={size} className="new-order-size-field">
                    <span>{size}</span>
                    <input
                      data-testid="new-order-size-input"
                      data-size-key={size}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={sizes[size] || ""}
                      onChange={(event) => updateSize(size, event.target.value)}
                      placeholder="0"
                      style={{ ...fieldStyle, textAlign: "center" }}
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="new-order-card">
              <div className="new-order-card-header">
                <div>
                  <h2>Logo Placements</h2>
                </div>
                <span className="new-order-selection-count">
                  {selectedPlacements.length} selected
                </span>
              </div>

              {placementOptions.length ? (
                <PlacementOptionList
                  options={placementOptions}
                  selectedPlacements={selectedPlacements}
                  onToggle={togglePlacement}
                  variant="card"
                />
              ) : (
                <p className="new-order-muted">
                  Select a garment to load its allowed production placements.
                </p>
              )}
            </section>

            <section className="new-order-card">
              <div className="new-order-card-header">
                <div>
                  <h2>Operational Details</h2>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                <label style={labelStyle}>
                  Needed By
                  <input type="date" name="due_date" value={form.due_date} onChange={updateField} style={fieldStyle} />
                </label>

                <label style={labelStyle}>
                  Notes
                  <textarea name="notes" value={form.notes} onChange={updateField} placeholder="Artwork notes, customer deadline, reorder details, etc." style={{ ...fieldStyle, minHeight: "120px", resize: "vertical" }} />
                </label>
              </div>
            </section>

            <section className="new-order-card">
              <div className="new-order-card-header">
                <div>
                  <h2>Deposit Requirement</h2>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: "14px",
                  border: validationFields.deposit_requirement ? "1px solid #fecaca" : "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "16px",
                  background: validationFields.deposit_requirement ? "#fef2f2" : "#f8fafc",
                }}
              >
                <p style={{ margin: 0, color: "#475569" }}>
                  Confirm whether this quote should enter the financial workflow with a required deposit or as a no-deposit job.
                </p>

                <div style={{ display: "grid", gap: "12px" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      padding: "14px",
                      border: depositRequirement === "required" ? "1px solid #0f766e" : "1px solid #cbd5e1",
                      borderRadius: "14px",
                      background: depositRequirement === "required" ? "#f0fdfa" : "#ffffff",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      ref={depositDecisionRef}
                      data-testid="new-order-deposit-required-radio"
                      type="radio"
                      name="deposit_requirement"
                      value="required"
                      checked={depositRequirement === "required"}
                      onChange={updateDepositRequirement}
                    />
                    <span>
                      <strong style={{ display: "block", color: "#0f172a" }}>Deposit Required</strong>
                      <span style={{ display: "block", marginTop: "4px", color: "#475569" }}>
                        Initialize this quote with a deposit target of {money(financialPreview.depositAmount)} due now and {money(financialPreview.balanceDue)} remaining after deposit.
                      </span>
                    </span>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "12px",
                      padding: "14px",
                      border: depositRequirement === "not_required" ? "1px solid #0f766e" : "1px solid #cbd5e1",
                      borderRadius: "14px",
                      background: depositRequirement === "not_required" ? "#f0fdfa" : "#ffffff",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      data-testid="new-order-no-deposit-radio"
                      type="radio"
                      name="deposit_requirement"
                      value="not_required"
                      checked={depositRequirement === "not_required"}
                      onChange={updateDepositRequirement}
                    />
                    <span>
                      <strong style={{ display: "block", color: "#0f172a" }}>No Deposit Required</strong>
                      <span style={{ display: "block", marginTop: "4px", color: "#475569" }}>
                        Save the quote with no upfront deposit and the full {money(financialPreview.totalAmount)} staying in the final balance workflow.
                      </span>
                    </span>
                  </label>
                </div>

                <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
                  Deposit-required quotes default to a 50% intake target so the downstream payment lifecycle can initialize with a concrete amount.
                </p>
              </div>
            </section>

            <section className="new-order-card new-order-summary-card">
              <div className="new-order-card-header">
                <div>
                  <p className="new-order-section-kicker">Final Review</p>
                  <h2>Pricing Summary</h2>
                </div>
                <span className="new-order-selection-count">Qty {totalQty}</span>
              </div>

              <div className="new-order-summary-shell">
                <PricingSummary quote={liveQuote} quantity={totalQty} />
              </div>
            </section>
          </div>
        </section>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", flexWrap: "wrap" }}>
          <button type="button" onClick={() => returnToQuoteWorkflow()} style={{ background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "12px", padding: "13px 18px", cursor: "pointer", fontWeight: 600 }}>
            Cancel
          </button>
          <button
            type="submit"
            data-testid="new-order-save-button"
            disabled={submitState === "saving"}
            style={{
              background: submitState === "saving" ? "#57534e" : "#171717",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              padding: "13px 18px",
              cursor: submitState === "saving" ? "progress" : "pointer",
              fontWeight: 700,
            }}
          >
            {submitState === "saving" ? "Saving..." : "Save Order"}
          </button>
        </div>
      </form>
    </div>
  );
}
