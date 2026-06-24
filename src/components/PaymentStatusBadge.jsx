function badgeStyle(background, color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "999px",
    padding: "6px 10px",
    background,
    color,
    fontSize: "12px",
    fontWeight: 800,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  };
}

function getPaymentStatusStyle(status) {
  if (status === "Paid" || status === "Paid in Full") return badgeStyle("#dcfce7", "#166534");
  if (
    status === "Partial Payment" ||
    status === "Partial" ||
    status === "Deposit Applied" ||
    status === "Deposit Paid" ||
    status === "Partially Paid" ||
    status === "Deposit Received" ||
    status === "Balance Due"
  ) {
    return badgeStyle("#fef3c7", "#92400e");
  }
  if (status === "Awaiting Deposit" || status === "Deposit Required" || status === "Overdue" || status === "Payment Failed") {
    return badgeStyle("#fef2f2", "#b91c1c");
  }
  if (status === "Sent" || status === "Awaiting Payment" || status === "Awaiting Final Payment" || status === "Payment Sent - Awaiting Verification") {
    return badgeStyle("#dbeafe", "#1d4ed8");
  }
  if (status === "Processing") {
    return badgeStyle("#fef3c7", "#92400e");
  }
  if (status === "Draft") {
    return badgeStyle("#f1f5f9", "#475569");
  }
  if (status === "Refunded" || status === "Void") {
    return badgeStyle("#ede9fe", "#6d28d9");
  }
  if (status === "Cancelled") {
    return badgeStyle("#e2e8f0", "#334155");
  }

  return badgeStyle("#e2e8f0", "#334155");
}

export default function PaymentStatusBadge({ status }) {
  return <span style={getPaymentStatusStyle(status)}>{status}</span>;
}
