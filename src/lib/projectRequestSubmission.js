import { ensureCustomerProfile } from "./customerProfileStore";
import { createCustomerRequest } from "../repositories/ordersRepository";
import { generateQuoteSnapshot } from "./quoteEngine";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeQuantity(value) {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) return 1;
  return Math.max(1, Math.round(parsedValue));
}

function buildArtworkFiles(artwork) {
  if (!artwork?.name) return [];

  return [
    {
      id:
        artwork.id ||
        `artwork-${normalizeText(artwork.name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`,
      name: artwork.name,
      display_name: artwork.name,
      file_name: artwork.name,
      original_filename: artwork.name,
      type: normalizeText(artwork.type),
      file_type: normalizeText(artwork.type),
      size: Number(artwork.size ?? 0) || 0,
      file_size: Number(artwork.size ?? 0) || 0,
      preview: normalizeText(artwork.dataUrl || artwork.previewUrl),
      preview_url: normalizeText(artwork.dataUrl || artwork.previewUrl),
      source_url: normalizeText(artwork.dataUrl || artwork.previewUrl),
      upload_pending: artwork.requiresReupload === true,
    },
  ];
}

function buildRequestNotes(notes, artwork) {
  const normalizedNotes = normalizeText(notes);
  const noteLines = normalizedNotes ? [normalizedNotes] : [];

  if (artwork?.name) {
    noteLines.push(`Artwork attached: ${artwork.name}.`);
  }

  if (artwork?.requiresReupload) {
    noteLines.push(
      "Artwork file metadata was restored after sign-in, but the original file must be re-uploaded before artwork review can begin."
    );
  }

  return noteLines.join("\n\n");
}

export async function submitProjectRequest({
  customerSession,
  selectedProduct,
  category = "",
  imageSrc = "",
  contactName = "",
  contactPhone = "",
  quantity = 1,
  selectedColor = "",
  selectedSize = "",
  selectedPlacements = [],
  decorationType = "",
  dueDate = "",
  notes = "",
  artwork = null,
  source = "Customer Portal",
  requestType = "Quote Request",
} = {}) {
  if (!customerSession) {
    throw new Error("A customer account is required before submitting a project request.");
  }

  if (!selectedProduct) {
    throw new Error("Choose a product before submitting a project request.");
  }

  const normalizedQuantity = normalizeQuantity(quantity);
  const profile = await ensureCustomerProfile(customerSession);
  const normalizedPlacements = (Array.isArray(selectedPlacements) ? selectedPlacements : [])
    .map((placement) => normalizeText(placement))
    .filter(Boolean);
  const artworkFiles = buildArtworkFiles(artwork);
  const artworkName = artworkFiles[0]?.name || "";
  const requestPlacements = normalizedPlacements.map((placement) => ({
    placement,
    decoration_type: decorationType,
    artwork_id: "",
    artwork_name: artworkName,
  }));
  const quote = generateQuoteSnapshot(
    {
      garment: selectedProduct.name,
      product_id: selectedProduct.id,
      qty: normalizedQuantity,
      placement: requestPlacements[0]?.placement || "",
      placements: requestPlacements,
      decoration_type: decorationType,
      setup_fees: [],
      customer_artwork_name: artworkName,
    },
    selectedProduct
  );
  const requestNotes = buildRequestNotes(notes, artwork);

  const createdOrder = await createCustomerRequest({
    profile,
    orderInput: {
      customer_id: profile?.id || "",
      customer_name: profile?.name || customerSession.displayName || "Customer Account",
      customer_email: customerSession.email || profile?.email || "",
      customer_phone: normalizeText(contactPhone) || profile?.phone || customerSession.phone || "",
      customer_company: profile?.company || "",
      contact_name: normalizeText(contactName) || customerSession.displayName || "",
      product_id: selectedProduct.id,
      garment: selectedProduct.name,
      category: normalizeText(category) || selectedProduct.category || "Apparel",
      product_image: imageSrc || selectedProduct.image || "",
      product_notes: selectedProduct.notes || "",
      source,
      request_type: requestType,
      status: "New",
      quote_status: "Draft",
      operational_visible: false,
      production_ready: false,
      qty: normalizedQuantity,
      selected_color: normalizeText(selectedColor),
      selected_size: normalizeText(selectedSize),
      size_breakdown:
        selectedSize && normalizeText(selectedSize) !== "Open"
          ? { [selectedSize]: normalizedQuantity }
          : {},
      placement: requestPlacements[0]?.placement || "",
      placements: requestPlacements,
      decoration_type: decorationType,
      due_date: normalizeText(dueDate),
      notes: requestNotes,
      customer_notes: requestNotes,
      request_details: requestNotes,
      payment_history: [],
      total_paid: 0,
      amount_paid: 0,
      balance_due: 0,
      deposit_amount: 0,
      deposit_required: false,
      invoice_status: "Draft",
      request_completion_status: "pending_completion",
      artwork_intent: "",
      artwork_files: artworkFiles,
      customer_artwork_name: artworkName,
      quote,
    },
  });

  return {
    createdOrder,
    profile,
    quote,
  };
}
