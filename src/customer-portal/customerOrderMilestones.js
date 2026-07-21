function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

function milestone(label, tone, reassurance, progress) {
  return { label, tone, reassurance, progress };
}

export function resolveCustomerOrderMilestone(order = {}) {
  const status = normalized(order.status);
  const quoteStatus = normalized(order.quote_status);
  const requestStatus = normalized(order.request_status);
  const approvalStatus = normalized(order.staff_review_status || order.approval_status);
  const artworkStatus = normalized(order.artwork_status || order.artwork_approval_status);
  const invoiceStatus = normalized(order.invoice_status);
  const pickupStatus = normalized(order.pickup_status);

  if (status === "canceled" || quoteStatus === "canceled") {
    return milestone("Canceled", "danger", "This order has been canceled.", "Contact Tee & Co if you have any questions.");
  }
  if (status === "completed" || pickupStatus === "picked up") {
    return milestone("Completed", "success", "Your order is complete.", "Thank you for choosing Tee & Co.");
  }
  if (status === "ready for pickup" || pickupStatus === "ready for pickup") {
    return milestone("Ready for Pickup", "info", "Your order is finished and ready.", "You can now arrange to pick it up.");
  }
  if (artworkStatus === "needs revision") {
    return milestone("Artwork Update Needed", "warning", "We need updated artwork before your order can continue.", "Upload the requested revision when it is ready.");
  }
  if (
    quoteStatus === "awaiting deposit" ||
    ["awaiting deposit", "awaiting payment", "awaiting final payment", "sent", "overdue"].includes(invoiceStatus)
  ) {
    return milestone("Deposit Required", "warning", "A deposit is needed before your order can move forward.", "Complete the payment request to continue.");
  }
  if (["printing", "embroidery", "qc / finishing", "in production"].includes(status)) {
    return milestone("In Production", "info", "Your order is being produced.", "We will notify you when it is ready for pickup.");
  }
  if (
    ["ready for production", "awaiting production"].includes(status) ||
    quoteStatus === "ready for production"
  ) {
    return milestone("Preparing for Production", "info", "Everything is ready.", "We're preparing your order for production.");
  }
  if (approvalStatus === "approved" || quoteStatus === "approved") {
    return milestone("Order Approved", "success", "Your order has been reviewed and approved by Tee & Co.", "We're preparing it for production.");
  }
  if (
    requestStatus === "pending staff review" ||
    status === "new" ||
    ["draft", "sent", "awaiting approval", "awaiting artwork approval"].includes(quoteStatus)
  ) {
    return milestone("Request Received", "neutral", "We received your order request.", "Tee & Co is reviewing the details.");
  }

  return milestone("Under Review", "neutral", "Tee & Co is reviewing your order.", "We will notify you when the review is complete.");
}
