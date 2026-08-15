import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStoredProducts } from "../lib/productsStore";
import { createStoredQuickSale, getStoredQuickSales } from "../lib/salesStore";
import { validateCustomerIdentity } from "../lib/customerIdentity";
import { createStoredCustomer, getStoredCustomers } from "../lib/customersStore";
import { getCustomerDisplayName } from "../lib/customerRecordMatching";
import {
  getStoredOrders,
  recordStoredOrderPayment,
  updateStoredOrder,
  useStoredOrders,
} from "../lib/ordersStore";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import { validatePaymentAmount } from "../lib/financialValidation";
import { customerIdsEqual } from "../lib/customerIds";
import { PAYMENT_METHOD_OPTIONS } from "../orders/orderFinancials";
import { isStaffWorkspaceView } from "./adminRoleView";
import { formatNorthAmericanPhoneDisplay } from "../lib/phoneNormalization";
import {
  buildCompletedCustomerPickupUpdates,
  deriveFrontCounterState,
  isReleasedToFrontCounter,
} from "../front-counter/frontCounterWorkflow";
import {
  derivePickupPresentationStage,
  PICKUP_PRESENTATION_STAGES,
} from "../front-counter/frontCounterPresentation";
import { DEFAULT_SALES_TAX_RATE } from "../orders/salesTax";
import {
  cancelSquareTerminalCheckout,
  createSquareTerminalCheckout,
  getSquareTerminalCheckoutStatus,
  TERMINAL_FINAL_STATES,
} from "../services/squareTerminalCheckoutService";

const taxRate = DEFAULT_SALES_TAX_RATE;
const counterPaymentMethods = PAYMENT_METHOD_OPTIONS.filter((option) =>
  ["Cash", "Debit", "Credit", "E-Transfer", "Cheque"].includes(option)
);
const splitPaymentMethods = ["Cash", "Debit", "Credit", "E-Transfer", "Cheque"];
const paymentWorkflowActions = [
  {
    id: "terminal",
    title: "Square Terminal",
    recordMethod: "Square Terminal",
    shortLabel: "Terminal",
    buttonLabel: "Send to Terminal",
    description: "Send this single order's exact server-verified balance to the connected Terminal.",
    notePlaceholder: "Terminal checkout notes are recorded automatically.",
    accent: "#0f766e",
    background: "#f0fdfa",
    border: "1px solid #99f6e4",
  },
  {
    id: "card",
    title: "Record Card Manually",
    recordMethod: "Card",
    shortLabel: "Card",
    buttonLabel: "Confirm Card Payment Received",
    description:
      "Use after the customer has completed payment on the physical Square Terminal.",
    notePlaceholder: "Optional terminal note or reference.",
    accent: "#1d4ed8",
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
  },
  {
    id: "cash",
    title: "Cash",
    recordMethod: "Cash",
    shortLabel: "Cash",
    buttonLabel: "Record Cash",
    notePlaceholder: "Optional cash note.",
    accent: "#047857",
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
  },
  {
    id: "etransfer",
    title: "E-Transfer",
    recordMethod: "E-Transfer",
    shortLabel: "E-Transfer",
    buttonLabel: "Record E-Transfer",
    notePlaceholder: "Optional transfer reference.",
    accent: "#7c3aed",
    background: "#f5f3ff",
    border: "1px solid #ddd6fe",
  },
  {
    id: "split",
    title: "Split Payment",
    recordMethod: "Split Payment",
    shortLabel: "Split",
    buttonLabel: "Record Split Payment",
    notePlaceholder: "Optional split payment note.",
    accent: "#c2410c",
    background: "#fff7ed",
    border: "1px solid #fdba74",
  },
];

const transactionWorkspaceModes = {
  pickup: {
    id: "pickup",
    label: "Customer Pickup",
    title: "Customer Pickup",
    description:
      "Find the customer once. The system will guide payment and handoff.",
    selectionHeading: "Released Orders",
    selectionDescription:
      "Select an order to complete its next required action.",
    emptySelectedCustomerMessage:
      "No orders released to Front Counter are available for this customer.",
  },
  "quick-sale": {
    id: "quick-sale",
    label: "Quick Sale",
    title: "Quick Counter Sale",
    description:
      "Use the direct walk-in sale flow for immediate over-the-counter transactions.",
  },
};

const fieldStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "15px",
  width: "100%",
  boxSizing: "border-box",
  background: "#ffffff",
};

const touchFieldStyle = {
  ...fieldStyle,
  minHeight: "56px",
  borderRadius: "16px",
  padding: "15px 16px",
  fontSize: "17px",
};

const keypadReadyFieldStyle = {
  ...touchFieldStyle,
  fontSize: "22px",
  fontWeight: 800,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const labelStyle = {
  display: "grid",
  gap: "8px",
  fontWeight: 600,
  color: "#292524",
};

const compactFieldStyle = {
  ...fieldStyle,
  minHeight: "46px",
  padding: "10px 12px",
  borderRadius: "12px",
  fontSize: "16px",
};

const sectionCardStyle = {
  background: "#ffffff",
  borderRadius: "18px",
  border: "1px solid #e2e8f0",
  padding: "16px",
  display: "grid",
  gap: "12px",
};

const frontCounterActions = [
  {
    id: "pickup",
    title: "Customer Pickup",
    description: "Find the customer once, then follow the required payment or pickup action.",
    steps: ["Search Customer", "Review Order", "Complete Required Action", "Confirm Handoff"],
    accent: "#047857",
    background: "#ecfdf5",
    border: "#a7f3d0",
  },
  {
    id: "quick-sale",
    title: "Walk-In Sale",
    description: "Search products, select variants, build the cart, and finish payment.",
    steps: ["Search Product", "Select Variant", "Cart", "Payment", "Complete"],
    accent: "#c2410c",
    background: "#fff7ed",
    border: "#fed7aa",
  },
];

function currency(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return normalize(value).replace(/\D/g, "");
}

function isTypingField(element) {
  if (!element) return false;
  return ["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName);
}

function sumValues(values = []) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function getModeButtonStyle(active) {
  return {
    border: active ? "1px solid #0f172a" : "1px solid #cbd5e1",
    background: active ? "#0f172a" : "#ffffff",
    color: active ? "#ffffff" : "#0f172a",
    borderRadius: "999px",
    padding: "10px 14px",
    fontWeight: 800,
    cursor: "pointer",
  };
}

function WorkflowStepStrip({ action }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        flexWrap: "wrap",
        alignItems: "center",
      }}
      aria-label={`${action.title} workflow`}
    >
      {action.steps.map((step, index) => (
        <span
          key={step}
          style={{
            minHeight: "40px",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            borderRadius: "999px",
            border: `1px solid ${index === 0 ? action.border : "#e2e8f0"}`,
            background: index === 0 ? action.background : "#ffffff",
            color: "#0f172a",
            padding: "8px 12px",
            fontSize: "13px",
            fontWeight: 900,
          }}
        >
          <span
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "999px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: index === 0 ? action.accent : "#e2e8f0",
              color: index === 0 ? "#ffffff" : "#475569",
              fontSize: "12px",
            }}
          >
            {index + 1}
          </span>
          {step}
        </span>
      ))}
    </div>
  );
}

function getActionToneStyles(tone = "default") {
  if (tone === "danger") {
    return { background: "#fff1f2", border: "1px solid #fecdd3", accent: "#be123c" };
  }

  if (tone === "success") {
    return { background: "#ecfdf5", border: "1px solid #a7f3d0", accent: "#047857" };
  }

  return { background: "#eff6ff", border: "1px solid #bfdbfe", accent: "#1d4ed8" };
}

function getPaymentActionConfig(actionId) {
  return paymentWorkflowActions.find((action) => action.id === actionId) || null;
}

function terminalStatusLabel(status) {
  return ({
    creating: "Sending", create_unknown: "Sending — recovering", pending: "Waiting for customer",
    in_progress: "Waiting for customer", cancel_requested: "Cancel requested",
    completed_unverified: "Verifying payment", completed: "Payment approved",
    failed: "Declined/failed", canceled: "Canceled", timed_out: "Timed out",
    reconciliation_required: "Reconciliation required",
  })[status] || "Ready to send to Terminal";
}

function getSplitMethodButtonStyle(active) {
  return {
    border: active ? "1px solid #0f172a" : "1px solid #cbd5e1",
    background: active ? "#0f172a" : "#ffffff",
    color: active ? "#ffffff" : "#0f172a",
    minHeight: "48px",
    borderRadius: "16px",
    padding: "12px 14px",
    fontSize: "15px",
    fontWeight: 800,
    cursor: "pointer",
  };
}

function filterSelectionIdsForMode(mode, selectedIds, items) {
  if (mode === "quick-sale") return [];

  const allowedIds = new Set(items.map((item) => item.id));

  return selectedIds.filter((id) => allowedIds.has(id));
}

function buildCustomerDirectory(customers, orders) {
  const directory = new Map();

  customers.forEach((customer) => {
    const key = customer.id || `saved-${normalize(customer.name)}`;
    const customerName = getCustomerDisplayName(
      customer,
      customers,
      "Customer identity unavailable"
    );
    directory.set(key, {
      id: customer.id || key,
      source: "saved",
      name: customerName,
      company: customer.company || "",
      email: customer.email || "",
      phone: customer.phone || "",
      notes: customer.notes || "",
      order_numbers: Array.isArray(customer.order_numbers) ? [...customer.order_numbers] : [],
    });
  });

  orders.forEach((order) => {
    const normalizedName = normalize(order.customer_name);
    if (!normalizedName) return;

    const existingEntry = Array.from(directory.values()).find(
      (entry) =>
        (order.customer_id && entry.id === order.customer_id) || normalize(entry.name) === normalizedName
    );

    if (existingEntry) {
      const orderNumbers = new Set(existingEntry.order_numbers || []);
      orderNumbers.add(order.order_number);
      existingEntry.order_numbers = Array.from(orderNumbers);
      if (!existingEntry.company && order.company) existingEntry.company = order.company;
      return;
    }

    directory.set(`derived-${normalizedName}`, {
      id: `derived-${normalizedName}`,
      source: "orders",
      name: order.customer_name,
      company: "",
      email: "",
      phone: "",
      notes: "",
      order_numbers: order.order_number ? [order.order_number] : [],
    });
  });

  return Array.from(directory.values()).sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

function findCustomerMatches(customers, value) {
  const query = normalize(value);
  const phoneQuery = normalizePhone(value);

  if (query.length < 2 && phoneQuery.length < 3) return [];

  return customers
    .filter((customer) => {
      const searchableText = [
        customer.name,
        customer.company,
        customer.email,
        customer.phone,
        ...(customer.order_numbers || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const customerPhone = normalizePhone(customer.phone);

      return (
        searchableText.includes(query) ||
        (phoneQuery.length >= 3 && customerPhone.includes(phoneQuery))
      );
    })
    .slice(0, 6);
}

function cartItemsMatch(existingItem, newItem) {
  return (
    existingItem.product_id === newItem.product_id &&
    normalize(existingItem.name) === normalize(newItem.name) &&
    normalize(existingItem.color) === normalize(newItem.color) &&
    normalize(existingItem.size) === normalize(newItem.size) &&
    Number(existingItem.unit_price) === Number(newItem.unit_price)
  );
}

function getProductCategory(product = {}) {
  return (
    product.storefront_category ||
    product.category ||
    product.product_type ||
    "Other"
  );
}

function getProductPrice(product = {}) {
  return product.retail_price || product.unit_price || product.price || product.base_garment_price || "";
}

function getProductSearchText(product = {}) {
  return [
    product.name,
    product.brand_model,
    product.sku,
    product.category,
    product.storefront_category,
    product.product_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildCustomerOrders(selectedCustomer, orders) {
  if (!selectedCustomer) return [];

  const selectedName = normalize(selectedCustomer.name);
  const orderNumbers = new Set(selectedCustomer.order_numbers || []);

  return orders.filter((order) => {
    if (
      selectedCustomer.source === "saved" &&
      selectedCustomer.id &&
      customerIdsEqual(order.customer_id, selectedCustomer.id)
    ) {
      return true;
    }

    if (order.order_number && orderNumbers.has(order.order_number)) {
      return true;
    }

    return selectedName && normalize(order.customer_name) === selectedName;
  });
}

export function buildPaymentAction(order) {
  if (!isReleasedToFrontCounter(order)) return null;
  const frontCounterState = deriveFrontCounterState(order);
  if (!frontCounterState.canCollectPayment) return null;
  if (Number(order.balance_due || 0) <= 0) return null;

  const isDepositStep =
    order.payment_collection_state === "Awaiting Deposit" &&
    Number(order.deposit_outstanding || order.deposit_amount || 0) > 0;
  const amount = isDepositStep
    ? Number(order.deposit_outstanding || order.deposit_amount || 0)
    : Number(order.balance_due || 0);
  const readyForPickup = order.pickup_status === "Ready for Pickup";

  return {
    id: `${order.order_number}-payment-${isDepositStep ? "deposit" : "balance"}`,
    kind: "payment",
    paymentKind: isDepositStep ? "deposit" : "balance",
    label: isDepositStep ? "Collect Deposit" : readyForPickup ? "Collect Remaining Balance" : "Collect Payment",
    tone: readyForPickup ? "danger" : isDepositStep ? "default" : "default",
    orderNumber: order.order_number,
    customerName: order.customer_name,
    amount,
    summary: isDepositStep
      ? `${currency(amount)} deposit due before invoice collection continues.`
      : readyForPickup
      ? `${currency(amount)} due before this pickup can be released.`
      : `${currency(amount)} remains on this order.`,
  };
}

export function buildPickupAction(order) {
  if (!isReleasedToFrontCounter(order)) return null;
  const frontCounterState = deriveFrontCounterState(order);
  if (!frontCounterState.canRecordPickup) return null;
  if (order.pickup_status !== "Ready for Pickup") return null;
  if (Number(order.balance_due || 0) > 0) return null;

  return {
    id: `${order.order_number}-pickup-release`,
    kind: "pickup",
    label: "Release Pickup Order",
    tone: "success",
    orderNumber: order.order_number,
    customerName: order.customer_name,
    amount: 0,
    summary: "Order is paid in full and ready to hand off at the counter.",
  };
}

export function buildSelectableTransactionItems(orders = []) {
  const items = orders.flatMap((order) => {
    const transactionItems = [];
    const paymentAction = buildPaymentAction(order);
    const pickupAction = buildPickupAction(order);

    if (paymentAction) {
      transactionItems.push({
        ...paymentAction,
        order,
        selectionLabel:
          paymentAction.paymentKind === "deposit"
            ? "Deposit Due"
            : order.pickup_status === "Ready for Pickup"
            ? "Balance Before Pickup"
            : "Open Balance",
      });
    }

    if (pickupAction) {
      transactionItems.push({
        ...pickupAction,
        order,
        selectionLabel: "Pickup Release",
      });
    }

    return transactionItems;
  });

  return items.sort((left, right) => {
    const leftPriority = left.kind === "pickup" ? 0 : left.paymentKind === "deposit" ? 1 : 2;
    const rightPriority = right.kind === "pickup" ? 0 : right.paymentKind === "deposit" ? 1 : 2;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return Number(right.amount || 0) - Number(left.amount || 0);
  });
}

function CustomerPickupHeader({
  customer,
  releasedOrderCount,
  remainingToday,
  onChangeCustomer,
  onViewCustomer,
}) {
  return (
    <section
      data-testid="pickup-customer-header"
      className="pickup-customer-header"
      style={{
        ...sectionCardStyle,
        position: "sticky",
        top: "8px",
        zIndex: 10,
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
        padding: "14px 18px",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, color: "#0f172a", fontSize: "22px" }}>{customer.name}</h2>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "5px", color: "#475569" }}>
          {customer.phone ? <span>{formatNorthAmericanPhoneDisplay(customer.phone)}</span> : null}
          <strong>{releasedOrderCount} Released Order{releasedOrderCount === 1 ? "" : "s"}</strong>
          <strong style={{ color: remainingToday > 0 ? "#b91c1c" : "#166534" }}>
            {currency(remainingToday)} Remaining Today
          </strong>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button type="button" onClick={onChangeCustomer} style={getCompletionButtonStyle()}>
          Change Customer
        </button>
        <button type="button" onClick={onViewCustomer} style={getCompletionButtonStyle()}>
          View Customer
        </button>
      </div>
    </section>
  );
}

function PickupCompletionPanel({
  completion,
  hasRemainingOrders,
  onReturnToOrders,
  onStartNextCustomer,
  onViewOrder,
  onViewReceipt,
}) {
  return (
    <div
      data-testid="pickup-completion"
      style={{
        border: "1px solid #86efac",
        borderRadius: "18px",
        padding: "20px",
        background: "#f0fdf4",
        display: "grid",
        gap: "14px",
      }}
    >
      <div>
        <p style={{ margin: 0, color: "#15803d", fontWeight: 900 }}>Order completed</p>
        <h3 style={{ margin: "6px 0 0", color: "#0f172a", fontSize: "24px" }}>
          {completion.orderNumber}
        </h3>
        <p style={{ margin: "8px 0 0", color: "#475569" }}>
          The order was handed to the customer and completed.
        </p>
      </div>
      <button type="button" onClick={onStartNextCustomer} style={getCompletionButtonStyle(true)}>
        Start Next Customer
      </button>
      {hasRemainingOrders ? (
        <button type="button" onClick={onReturnToOrders} style={getCompletionButtonStyle()}>
          Return to Released Orders
        </button>
      ) : null}
      <button type="button" onClick={onViewOrder} style={getCompletionButtonStyle()}>
        View Order
      </button>
      {completion.saleNumber ? (
        <button type="button" onClick={onViewReceipt} style={getCompletionButtonStyle()}>
          View Receipt
        </button>
      ) : null}
    </div>
  );
}

function getCompletionButtonStyle(primary = false) {
  return {
    background: primary ? "#166534" : "#ffffff",
    color: primary ? "#ffffff" : "#0f172a",
    border: primary ? "none" : "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "13px 18px",
    cursor: "pointer",
    fontWeight: 800,
  };
}

function PaymentWorkflowActionButton({ action, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(action.id)}
      style={{
        minHeight: "54px",
        borderRadius: "18px",
        padding: "14px 18px",
        border: active ? `1px solid ${action.accent}` : action.border,
        background: active ? action.background : "#ffffff",
        color: active ? action.accent : "#0f172a",
        fontSize: "16px",
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: active ? `0 0 0 2px ${action.background}` : "none",
      }}
    >
      {action.title}
    </button>
  );
}

function QuantityStepper({
  label = "Quantity",
  value,
  onChange,
  onCommit,
  onDecrement,
  onIncrement,
  onKeyDown,
  testId,
  compact = false,
}) {
  const buttonSize = compact ? "46px" : "64px";
  const controlHeight = compact ? "48px" : "62px";
  const buttonFontSize = compact ? "22px" : "28px";

  return (
    <div style={{ display: "grid", gap: "8px" }} data-testid={testId}>
      <span style={{ color: "#292524", fontWeight: 700 }}>{label}</span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${buttonSize} minmax(64px, 1fr) ${buttonSize}`,
          gap: compact ? "6px" : "10px",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={onDecrement}
          style={{
            minHeight: controlHeight,
            borderRadius: compact ? "12px" : "16px",
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            color: "#0f172a",
            fontSize: buttonFontSize,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          -
        </button>
        <input
          aria-label={label}
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          style={{
            ...keypadReadyFieldStyle,
            minHeight: controlHeight,
            padding: compact ? "8px" : "12px",
            fontSize: compact ? "18px" : keypadReadyFieldStyle.fontSize,
            textAlign: "center",
          }}
        />
        <button
          type="button"
          aria-label="Increase quantity"
          onClick={onIncrement}
          style={{
            minHeight: controlHeight,
            borderRadius: compact ? "12px" : "16px",
            border: "1px solid #0f172a",
            background: "#0f172a",
            color: "#ffffff",
            fontSize: buttonFontSize,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function QuickSale() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const completedSaleNumber = searchParams.get("completed");
  const productSelectRef = useRef(null);
  const activeStaffUser = getActiveStaffUser();
  const isStaffWorkspace = isStaffWorkspaceView(activeStaffUser);

  const products = useStoredProducts().filter((product) => product.status !== "Inactive");
  const storedOrders = useStoredOrders();
  const [customers, setCustomers] = useState(() => getStoredCustomers());
  const customerDirectory = useMemo(
    () => buildCustomerDirectory(customers, storedOrders),
    [customers, storedOrders]
  );

  const [activeMode, setActiveMode] = useState("pickup");
  const [lookupQuery, setLookupQuery] = useState("");
  const [customerMatches, setCustomerMatches] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerLookupMessage, setCustomerLookupMessage] = useState("");
  const [showCreateCustomerForm, setShowCreateCustomerForm] = useState(false);
  const [createCustomerError, setCreateCustomerError] = useState("");
  const [createCustomerForm, setCreateCustomerForm] = useState({
    name: "",
    phone: "",
    email: "",
    company: "",
  });
  const [selectedTransactionIds, setSelectedTransactionIds] = useState([]);
  const [transactionMessage, setTransactionMessage] = useState("");
  const [paymentAmountOverride, setPaymentAmountOverride] = useState("");
  const [paymentAmountOverrideSelection, setPaymentAmountOverrideSelection] = useState("");
  const [selectedPaymentAction, setSelectedPaymentAction] = useState("");
  const [splitPrimaryMethod, setSplitPrimaryMethod] = useState("Cash");
  const [splitSecondaryMethod, setSplitSecondaryMethod] = useState("Credit");
  const [splitPrimaryAmount, setSplitPrimaryAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [paymentProcessingOrderNumber, setPaymentProcessingOrderNumber] = useState("");
  const [completedPickup, setCompletedPickup] = useState(null);
  const [terminalAttempt, setTerminalAttempt] = useState(null);

  const [linkedCustomerId, setLinkedCustomerId] = useState("");
  const [linkedCustomerName, setLinkedCustomerName] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [selectedProductCategory, setSelectedProductCategory] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [quickSalePaymentMethod, setQuickSalePaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [showQuickSaleNote, setShowQuickSaleNote] = useState(false);
  const [lineItem, setLineItem] = useState({
    name: "",
    color: "",
    size: "",
    qty: "1",
    unit_price: "",
  });
  const [cart, setCart] = useState([]);

  useEffect(() => {
    if (!completedSaleNumber && activeMode === "quick-sale") {
      productSelectRef.current?.focus();
    }
  }, [activeMode, completedSaleNumber]);

  const selectedProduct = useMemo(() => {
    return products.find((product) => product.id === selectedProductId);
  }, [products, selectedProductId]);
  const productCategories = useMemo(() => {
    return Array.from(new Set(products.map(getProductCategory).filter(Boolean))).sort((left, right) =>
      left.localeCompare(right)
    );
  }, [products]);
  const visibleProducts = useMemo(() => {
    const query = productSearchQuery.trim().toLowerCase();

    return products
      .filter((product) => {
        if (query) {
          return getProductSearchText(product).includes(query);
        }

        if (selectedProductCategory) {
          return getProductCategory(product) === selectedProductCategory;
        }

        return false;
      })
      .slice(0, 12);
  }, [products, productCategories, productSearchQuery, selectedProductCategory]);
  const activeProductCategory = selectedProductCategory || "";
  const selectedProductColors = selectedProduct?.colors?.length
    ? selectedProduct.colors
    : lineItem.name
    ? [lineItem.color].filter(Boolean)
    : [];
  const selectedProductSizes = selectedProduct?.sizes?.length
    ? selectedProduct.sizes
    : lineItem.name
    ? [lineItem.size].filter(Boolean)
    : [];

  const customerOrders = useMemo(() => {
    return buildCustomerOrders(selectedCustomer, storedOrders);
  }, [selectedCustomer, storedOrders]);

  const selectableItems = useMemo(
    () => buildSelectableTransactionItems(customerOrders),
    [customerOrders]
  );
  const visibleSelectableItems = selectableItems;
  const activeWorkspaceMode =
    transactionWorkspaceModes[activeMode] || transactionWorkspaceModes.pickup;
  const canOfferCustomerCreate =
    activeMode !== "quick-sale" &&
    lookupQuery.trim().length >= 2 &&
    !customerMatches.length &&
    (!selectedCustomer || normalize(selectedCustomer.name) !== normalize(lookupQuery));
  const selectedTransactionItems = useMemo(
    () => selectableItems.filter((item) => selectedTransactionIds.includes(item.id)),
    [selectableItems, selectedTransactionIds]
  );
  const selectedPaymentSignature = useMemo(
    () =>
      selectedTransactionItems
        .filter((item) => item.kind === "payment")
        .map((item) => item.id)
        .sort()
        .join("|"),
    [selectedTransactionItems]
  );
  const selectedTransactionKind = selectedTransactionItems[0]?.kind || "";
  const transactionSummary = useMemo(() => {
    const paymentItems = selectedTransactionItems.filter((item) => item.kind === "payment");
    const pickupItems = selectedTransactionItems.filter((item) => item.kind === "pickup");

    return {
      selectedCount: selectedTransactionItems.length,
      paymentCount: paymentItems.length,
      pickupCount: pickupItems.length,
      amountDue: sumValues(paymentItems.map((item) => item.amount)),
    };
  }, [selectedTransactionItems]);
  const pickupVisitSummary = useMemo(
    () => ({
      releasedOrderCount: selectableItems.length,
      remainingToday: sumValues(
        selectableItems
          .filter((item) => item.kind === "payment")
          .map((item) => item.amount)
      ),
    }),
    [selectableItems]
  );
  const pickupPresentationStage = derivePickupPresentationStage({
    hasCustomer: Boolean(selectedCustomer),
    hasSelectedOrder: selectedTransactionItems.length === 1,
    hasCompletedPickup: Boolean(completedPickup),
  });
  const pickupActionPanelTitle = completedPickup
    ? "Order Completed"
    : paymentProcessingOrderNumber
    ? "Payment Confirmation Pending"
    : selectedTransactionKind === "payment"
    ? `Collect ${currency(transactionSummary.amountDue)} Payment`
    : "Confirm Customer Handoff";
  const paymentSelectionKey = `${selectedPaymentSignature}:${Number(transactionSummary.amountDue || 0)}`;
  const paymentAmount =
    selectedTransactionKind !== "payment"
      ? ""
      : paymentAmountOverrideSelection === paymentSelectionKey
      ? paymentAmountOverride
      : String(Number(transactionSummary.amountDue || 0) || "");
  const enteredPaymentAmount = Number(paymentAmount || 0);
  const outstandingBalanceAfterPayment = Math.max(
    0,
    Number(transactionSummary.amountDue || 0) - enteredPaymentAmount
  );

  const subtotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.qty * item.unit_price, 0);
  }, [cart]);

  const taxTotal = subtotal * taxRate;
  const total = subtotal + taxTotal;
  const canAddItem = lineItem.name.trim() && Number(lineItem.qty) > 0;
  const canCompleteSale = cart.length > 0;
  const needsColorSelection = Boolean(selectedProduct?.colors?.length);
  const needsSizeSelection = Boolean(selectedProduct?.sizes?.length);
  const quickSaleStep = !lineItem.name
    ? "product"
    : needsColorSelection && !lineItem.color
    ? "color"
    : needsSizeSelection && !lineItem.size
    ? "size"
    : "quantity";
  const paymentValidation = validatePaymentAmount({
    amount: paymentAmount,
    remainingBalance: transactionSummary.amountDue || 0,
  });
  const activePaymentAction = useMemo(
    () => getPaymentActionConfig(selectedPaymentAction),
    [selectedPaymentAction]
  );
  const isSplitPaymentAction = selectedPaymentAction === "split";
  const isTerminalPaymentAction = selectedPaymentAction === "terminal";
  const splitPrimaryAmountValue =
    splitPrimaryAmount === "" ? 0 : Math.max(0, Number(splitPrimaryAmount) || 0);
  const splitSecondaryAmountValue = Math.max(
    0,
    Number(paymentAmount || 0) - splitPrimaryAmountValue
  );
  const splitTotalMatches = Math.abs(
    splitPrimaryAmountValue + splitSecondaryAmountValue - Number(paymentAmount || 0)
  ) < 0.001;
  const splitPaymentValidation = useMemo(() => {
    if (!isSplitPaymentAction) {
      return { valid: true, message: "" };
    }

    if (!paymentValidation.valid) {
      return { valid: false, message: paymentValidation.message || "Enter a valid payment amount." };
    }

    if (splitPrimaryAmount === "") {
      return { valid: false, message: "Enter the first split amount." };
    }

    if (splitPrimaryAmountValue <= 0) {
      return { valid: false, message: "The first split amount must be greater than zero." };
    }

    if (splitSecondaryAmountValue <= 0) {
      return { valid: false, message: "Split payments need a second payment leg greater than zero." };
    }

    if (!splitTotalMatches) {
      return { valid: false, message: "Split payment amounts must equal the entered transaction amount." };
    }

    return { valid: true, message: "" };
  }, [
    isSplitPaymentAction,
    paymentValidation.valid,
    paymentValidation.message,
    splitPrimaryAmount,
    splitPrimaryAmountValue,
    splitSecondaryAmountValue,
    splitTotalMatches,
    paymentAmount,
  ]);

  const handleGlobalEnter = useEffectEvent((event) => {
    if (completedSaleNumber || activeMode !== "quick-sale" || event.key !== "Enter" || !canCompleteSale) {
      return;
    }

    if (isTypingField(document.activeElement)) return;

    event.preventDefault();
    saveSale();
  });

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalEnter);
    return () => window.removeEventListener("keydown", handleGlobalEnter);
  }, []);

  useEffect(() => {
    if (!terminalAttempt?.id || TERMINAL_FINAL_STATES.has(terminalAttempt.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const next = await getSquareTerminalCheckoutStatus(terminalAttempt.id);
        setTerminalAttempt(next);
        if (next.status === "completed") {
          setTransactionMessage(`Payment approved on Square Terminal for ${next.orderNumber}. Balances were updated exactly once.`);
          setPaymentProcessingOrderNumber("");
        } else if (TERMINAL_FINAL_STATES.has(next.status)) {
          setPaymentProcessingOrderNumber("");
        }
      } catch (error) {
        setPaymentError(error instanceof Error ? error.message : "Unable to recover Terminal checkout status.");
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [terminalAttempt?.id, terminalAttempt?.status]);

  function resetPaymentForm(nextAmount = "") {
    setPaymentAmountOverride(nextAmount);
    setPaymentAmountOverrideSelection(nextAmount ? paymentSelectionKey : "");
    setSelectedPaymentAction("");
    setSplitPrimaryMethod("Cash");
    setSplitSecondaryMethod("Credit");
    setSplitPrimaryAmount("");
    setPaymentNote("");
    setPaymentError("");
    setTerminalAttempt(null);
  }

  function handleLookupChange(value) {
    setLookupQuery(value);
    setCustomerMatches(findCustomerMatches(customerDirectory, value));
    setCustomerLookupMessage("");
    setCreateCustomerError("");

    if (!showCreateCustomerForm) return;

    setCreateCustomerForm((current) => ({
      ...current,
      name: current.name || value.trim(),
    }));
  }

  function activateWorkspaceMode(mode) {
    setTransactionMessage("");
    setPaymentError("");
    setActiveMode(mode);

    if (mode === "quick-sale") {
      setSelectedTransactionIds([]);
      resetPaymentForm("");
      return;
    }

    setSelectedTransactionIds((current) =>
      filterSelectionIdsForMode(mode, current, selectableItems)
    );
    resetPaymentForm("");
  }

  function selectCustomer(customer, options = {}) {
    const { preserveLookupMessage = false } = options;
    const customerItems = buildSelectableTransactionItems(
      buildCustomerOrders(customer, storedOrders)
    );
    setSelectedCustomer(customer);
    setLookupQuery(customer.name || "");
    setCustomerMatches([]);
    if (!preserveLookupMessage) {
      setCustomerLookupMessage("");
    }
    setShowCreateCustomerForm(false);
    setCreateCustomerError("");
    setSelectedTransactionIds(
      customerItems.length === 1 ? [customerItems[0].id] : []
    );
    setTransactionMessage("");
    setCompletedPickup(null);
    setCustomerName(customer.name || "");
    setCustomerPhone(customer.phone || "");
    setLinkedCustomerId(customer.source === "saved" ? customer.id : "");
    setLinkedCustomerName(customer.name || "");
    setActiveMode((currentMode) => (currentMode === "quick-sale" ? "pickup" : currentMode));
    resetPaymentForm("");
  }

  function startNextCustomer() {
    setSelectedCustomer(null);
    setLookupQuery("");
    setCustomerMatches([]);
    setCustomerLookupMessage("");
    setSelectedTransactionIds([]);
    setTransactionMessage("");
    setCompletedPickup(null);
    setPaymentProcessingOrderNumber("");
    resetPaymentForm("");
  }

  function returnToReleasedOrders() {
    setCompletedPickup(null);
    setTransactionMessage("");
    setSelectedTransactionIds([]);
  }

  function viewSelectedCustomer() {
    if (!selectedCustomer?.id || selectedCustomer.source !== "saved") return;
    window.open(
      `/admin/customers/${selectedCustomer.id}`,
      "_blank",
      "noopener,noreferrer"
    );
  }

  function openCreateCustomerForm() {
    setShowCreateCustomerForm(true);
    setCreateCustomerError("");
    setCustomerLookupMessage("");
    setCreateCustomerForm({
      name: lookupQuery.trim(),
      phone: "",
      email: "",
      company: "",
    });
  }

  function closeCreateCustomerForm() {
    setShowCreateCustomerForm(false);
    setCreateCustomerError("");
    setCreateCustomerForm({
      name: "",
      phone: "",
      email: "",
      company: "",
    });
  }

  function updateCreateCustomerForm(field, value) {
    setCreateCustomerForm((current) => ({ ...current, [field]: value }));
    setCreateCustomerError("");
  }

  async function handleCreateCustomer(event) {
    event.preventDefault();

    const identityValidation = validateCustomerIdentity({
      name: createCustomerForm.name,
      phone: createCustomerForm.phone,
    });
    if (!identityValidation.valid) {
      setCreateCustomerError(identityValidation.message);
      return;
    }

    let createdCustomer;

    try {
      createdCustomer = await createStoredCustomer({
        name: createCustomerForm.name.trim(),
        phone: createCustomerForm.phone.trim(),
        email: createCustomerForm.email.trim(),
        company: createCustomerForm.company.trim(),
      });
    } catch (error) {
      setCreateCustomerError(error?.message || "Unable to create customer.");
      return;
    }

    setCustomers((current) => [createdCustomer, ...current]);
    setCustomerLookupMessage(`${createdCustomer.name} was added and linked to this counter workflow.`);
    closeCreateCustomerForm();
    selectCustomer(
      {
        ...createdCustomer,
        source: "saved",
        order_numbers: createdCustomer.order_numbers || [],
      },
      { preserveLookupMessage: true }
    );
  }

  function toggleTransactionItem(item) {
    setTransactionMessage("");
    setPaymentError("");
    setCompletedPickup(null);
    setSelectedTransactionIds((current) =>
      current.includes(item.id) ? [] : [item.id]
    );
  }

  function clearTransactionSelection() {
    setSelectedTransactionIds([]);
    setTransactionMessage("");
    resetPaymentForm("");
  }

  function selectPaymentWorkflowAction(actionId) {
    setSelectedPaymentAction(actionId);
    setPaymentError("");

    if (actionId === "split") {
      const suggestedAmount = Number(paymentAmount || 0);
      if (suggestedAmount > 0) {
        setSplitPrimaryAmount(String((suggestedAmount / 2).toFixed(2)));
      }
      return;
    }

    setSplitPrimaryAmount("");
  }

  function updateCustomerName(value) {
    setCustomerName(value);
    setLinkedCustomerId("");
    setLinkedCustomerName("");
  }

  function resetProductSelection() {
    setSelectedProductId("");
    setLineItem({ name: "", color: "", size: "", qty: "1", unit_price: "" });
  }

  function selectProduct(product) {
    setSelectedProductId(product.id);

    setLineItem((current) => ({
      ...current,
      name: product.name || "",
      color: "",
      size: "",
      qty: "1",
      unit_price: getProductPrice(product),
    }));
  }

  function selectCustomProduct() {
    const customName = productSearchQuery.trim();
    if (!customName) return;

    setLineItem((current) => ({
      ...current,
      name: customName,
      color: "",
      size: "",
      qty: "1",
      unit_price: "",
    }));
    setSelectedProductId("");
  }

  function updateLineItem(event) {
    const { name, value } = event.target;
    setLineItem((current) => ({ ...current, [name]: value }));
  }

  function updateLineItemQuantity(value) {
    setLineItem((current) => ({ ...current, qty: value }));
  }

  function commitLineItemQuantity() {
    setLineItem((current) => ({
      ...current,
      qty: String(Math.max(1, Number(current.qty) || 1)),
    }));
  }

  function stepLineItemQuantity(direction) {
    setLineItem((current) => {
      const nextQuantity = Math.max(1, (Number(current.qty) || 1) + direction);
      return { ...current, qty: String(nextQuantity) };
    });
  }

  function updateProductSearch(value) {
    setProductSearchQuery(value);
    if (selectedProductId || lineItem.name) {
      setSelectedProductId("");
      setLineItem({ name: "", color: "", size: "", qty: "1", unit_price: "" });
    }
  }

  function selectLineItemColor(color) {
    setLineItem((current) => ({ ...current, color, size: "" }));
  }

  function selectLineItemSize(size) {
    setLineItem((current) => ({ ...current, size }));
  }

  function handleLineItemKeyDown(event) {
    if (event.key !== "Enter") return;

    event.preventDefault();
    if (canAddItem) {
      addToCart();
    }
  }

  function handleCartEditKeyDown(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    productSelectRef.current?.focus();
  }

  function addToCart() {
    const qty = Number(lineItem.qty) || 0;
    const unitPrice = Number(lineItem.unit_price) || 0;

    if (!lineItem.name.trim() || qty <= 0 || unitPrice < 0) return;

    const item = {
      id: `cart-item-${Date.now()}`,
      product_id: selectedProductId,
      name: lineItem.name.trim(),
      color: lineItem.color.trim(),
      size: lineItem.size.trim(),
      qty,
      unit_price: unitPrice,
      line_total: qty * unitPrice,
    };

    setCart((current) => {
      const match = current.find((existingItem) => cartItemsMatch(existingItem, item));

      if (!match) return [...current, item];

      return current.map((existingItem) => {
        if (!cartItemsMatch(existingItem, item)) return existingItem;
        const nextQty = existingItem.qty + item.qty;
        return {
          ...existingItem,
          qty: nextQty,
          line_total: nextQty * existingItem.unit_price,
        };
      });
    });

    setSelectedProductId("");
    setLineItem({ name: "", color: "", size: "", qty: "1", unit_price: "" });
    setTimeout(() => productSelectRef.current?.focus(), 0);
  }

  function updateCartItem(itemId, field, value) {
    setCart((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;

        const nextValue =
          field === "qty" ? Math.max(1, Number(value) || 1) : Math.max(0, Number(value) || 0);
        const nextItem = {
          ...item,
          [field]: nextValue,
        };

        return {
          ...nextItem,
          line_total: nextItem.qty * nextItem.unit_price,
        };
      })
    );
  }

  function stepCartItemQuantity(itemId, direction) {
    setCart((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;

        const nextQty = Math.max(1, Number(item.qty || 1) + direction);
        return {
          ...item,
          qty: nextQty,
          line_total: nextQty * item.unit_price,
        };
      })
    );
  }

  function removeCartItem(itemId) {
    setCart((current) => current.filter((item) => item.id !== itemId));
  }

  function saveSale() {
    if (!cart.length) return;

    const identityValidation = validateCustomerIdentity({
      customer_name: customerName,
      customer_phone: customerPhone,
    });
    if (!identityValidation.valid) {
      alert(identityValidation.message);
      return;
    }

    let sale;

    try {
      sale = createStoredQuickSale({
        customer_id: linkedCustomerId,
        customer_first_name: identityValidation.identity.firstName,
        customer_last_name: identityValidation.identity.lastName,
        customer_name: identityValidation.identity.displayName,
        customer_phone: identityValidation.identity.phone,
        payment_method: quickSalePaymentMethod,
        payment_status: "Paid",
        amount_paid: total,
        balance_due: 0,
        items: cart,
        subtotal,
        tax_rate: taxRate,
        tax_total: taxTotal,
        total,
        notes,
      });
    } catch (error) {
      alert(
        error?.code === "OVERPAYMENT"
          ? "Payment exceeds remaining balance."
          : error?.message || "Unable to save payment."
      );
      return;
    }

    navigate(`/admin/sales/new?completed=${sale.sale_number}`);
  }

  function completeSale(event) {
    event.preventDefault();
    saveSale();
  }

  async function handleRecordCounterPayment(event) {
    event.preventDefault();

    if (!selectedTransactionItems.length || selectedTransactionKind !== "payment") {
      setPaymentError("Select at least one payment item before recording a counter payment.");
      return;
    }

    if (!paymentValidation.valid) {
      const message = paymentValidation.message || "Enter a valid payment amount.";
      setPaymentError(message);
      alert(
        paymentValidation.code === "OVERPAYMENT"
          ? "Payment exceeds remaining balance."
          : message
      );
      return;
    }

    if (!activePaymentAction) {
      setPaymentError("Choose a payment action before recording the transaction.");
      return;
    }

    if (!splitPaymentValidation.valid) {
      setPaymentError(splitPaymentValidation.message || "Complete the split payment workflow.");
      return;
    }

    if (isTerminalPaymentAction) {
      if (selectedTransactionItems.length !== 1) {
        setPaymentError("Square Terminal supports one existing order per checkout.");
        return;
      }
      if (Math.abs(Number(paymentAmount || 0) - Number(transactionSummary.amountDue || 0)) > 0.009) {
        setPaymentError("Square Terminal collects the exact remaining order balance; remove the custom amount.");
        return;
      }
      const orderNumber = selectedTransactionItems[0].orderNumber;
      setPaymentProcessingOrderNumber(orderNumber);
      setPaymentError("");
      try {
        const attempt = await createSquareTerminalCheckout({ orderNumber });
        setTerminalAttempt(attempt);
        if (attempt.status === "completed") {
          setTransactionMessage(`Payment approved on Square Terminal for ${orderNumber}.`);
          setPaymentProcessingOrderNumber("");
        }
      } catch (error) {
        setPaymentProcessingOrderNumber("");
        setPaymentError(error?.code === "TERMINAL_DISABLED" ? "Terminal unavailable. Terminal checkout is not enabled." : error?.message || "Terminal unavailable.");
      }
      return;
    }

    const paymentEntries = isSplitPaymentAction
      ? [
          {
            amount: splitPrimaryAmountValue,
            method: splitPrimaryMethod,
            note: paymentNote,
          },
          {
            amount: splitSecondaryAmountValue,
            method: splitSecondaryMethod,
            note: paymentNote,
          },
        ]
      : [
          {
            amount: Number(paymentAmount || 0),
            method: activePaymentAction.recordMethod,
            note: paymentNote,
          },
        ];

    const orderBalanceRemaining = new Map(
      selectedTransactionItems.map((item) => [item.orderNumber, Number(item.amount || 0)])
    );
    const updatedOrders = [];
    const activeOrderNumber = selectedTransactionItems[0]?.orderNumber || "";
    setPaymentProcessingOrderNumber(activeOrderNumber);

    try {
      for (const entry of paymentEntries) {
        let entryRemaining = Number(entry.amount || 0);
        if (entryRemaining <= 0) continue;

        for (const item of selectedTransactionItems) {
          if (entryRemaining <= 0) break;

          const orderRemaining = Number(orderBalanceRemaining.get(item.orderNumber) || 0);
          if (orderRemaining <= 0) continue;

          const amountForOrder = Math.min(entryRemaining, orderRemaining);
          if (amountForOrder <= 0) continue;

          const updatedOrder = await recordStoredOrderPayment(item.orderNumber, {
            amount: amountForOrder,
            method: entry.method,
            note: entry.note,
          });

          if (updatedOrder) {
            updatedOrders.push(updatedOrder);
            entryRemaining -= amountForOrder;
            orderBalanceRemaining.set(item.orderNumber, orderRemaining - amountForOrder);
          }
        }
      }
    } catch (error) {
      const message =
        error?.code === "OVERPAYMENT"
          ? "Payment exceeds remaining balance."
          : error?.message || "Unable to save payment.";
      setPaymentError(message);
      setPaymentProcessingOrderNumber("");
      alert(message);
      return;
    }

    if (!updatedOrders.length) {
      setPaymentError("No selected orders could be updated.");
      setPaymentProcessingOrderNumber("");
      return;
    }

    const confirmedOrders = getStoredOrders();
    const readyForRelease = Array.from(
      new Set(
        updatedOrders
          .map(
            (order) =>
              confirmedOrders.find(
                (candidate) => candidate.order_number === order.order_number
              ) || order
          )
          .filter((order) => deriveFrontCounterState(order).canRecordPickup)
          .map((order) => order.order_number)
      )
    );
    setPaymentProcessingOrderNumber("");
    setSelectedTransactionIds(
      readyForRelease.length === 1 && selectedTransactionItems.length === 1
        ? [`${readyForRelease[0]}-pickup-release`]
        : []
    );
    setTransactionMessage(
      readyForRelease.length
        ? `${activePaymentAction.title} recorded across ${selectedTransactionItems.length} selected item${
            selectedTransactionItems.length === 1 ? "" : "s"
          }. Financial balances were updated successfully. ${readyForRelease.length} order${
            readyForRelease.length === 1 ? " is" : "s are"
          } now ready to release.`
        : `${activePaymentAction.title} recorded across ${selectedTransactionItems.length} selected item${
            selectedTransactionItems.length === 1 ? "" : "s"
          }. Financial balances were updated successfully. Operational order status may still remain active until production or pickup workflow is complete.`
    );
    resetPaymentForm("");
  }

  async function handleCancelTerminal() {
    if (!terminalAttempt?.id) return;
    setPaymentError("");
    try {
      const next = await cancelSquareTerminalCheckout(terminalAttempt.id);
      setTerminalAttempt(next);
      if (TERMINAL_FINAL_STATES.has(next.status)) setPaymentProcessingOrderNumber("");
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Unable to cancel Terminal checkout.");
    }
  }

  async function handleReleasePickupSelection() {
    if (!selectedTransactionItems.length || selectedTransactionKind !== "pickup") return;

    const releasedOrders = [];
    let completedSale = null;

    for (const item of selectedTransactionItems) {
      const order = item.order;
      if (!order) continue;

      const completionUpdates = buildCompletedCustomerPickupUpdates(order);
      if (!completionUpdates) continue;

      await updateStoredOrder(order.order_number, completionUpdates);

      const existingSale = getStoredQuickSales().find((sale) =>
        (sale.production_order_numbers || []).includes(order.order_number)
      );
      if (!existingSale) {
        completedSale = createStoredQuickSale({
          sale_number: `SALE-${order.order_number}`,
          customer_id: order.customer_id,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          payment_method: order.payment_method || "Previously Recorded",
          payment_status: "Paid",
          items: Array.isArray(order.line_items) ? order.line_items : [],
          subtotal: Number(order.subtotal || 0),
          tax_rate: Number(order.tax_rate || taxRate),
          tax_total: Number(order.tax_amount || order.tax_total || 0),
          total: Number(order.total_amount || order.total || 0),
          amount_paid: Number(order.total_paid || order.total_amount || order.total || 0),
          balance_due: 0,
          production_order_numbers: [order.order_number],
          notes: "Completed through Front Counter customer pickup.",
        });
      } else {
        completedSale = existingSale;
      }
      releasedOrders.push(order.order_number);
    }

    setSelectedTransactionIds([]);
    if (releasedOrders.length === 1) {
      setCompletedPickup({
        orderNumber: releasedOrders[0],
        saleNumber: completedSale?.sale_number || "",
      });
    }
    setTransactionMessage(
      `Pickup released for ${releasedOrders.length} selected order${
        releasedOrders.length === 1 ? "" : "s"
      }.`
    );
  }

  if (completedSaleNumber) {
    return (
      <div
        style={{
          maxWidth: "720px",
          margin: "60px auto",
          padding: "32px",
          background: "#ffffff",
          borderRadius: "24px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.08)",
          textAlign: "center",
          fontFamily:
            'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#16a34a",
          }}
        >
          Front Counter
        </p>
        <h1 style={{ margin: "10px 0 12px", fontSize: "32px" }}>Quick Sale Completed</h1>
        <p style={{ marginBottom: "8px", color: "#0f172a", fontSize: "22px", fontWeight: 800 }}>
          Sale #{completedSaleNumber}
        </p>
        <p style={{ marginBottom: "28px", color: "#64748b", fontSize: "16px" }}>
          The transaction has been saved successfully.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "14px", flexWrap: "wrap" }}>
          <button
            onClick={() => navigate(`/admin/sales/receipt/${completedSaleNumber}`)}
            style={{
              background: "#171717",
              color: "#ffffff",
              border: "none",
              borderRadius: "14px",
              padding: "14px 20px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Print Receipt
          </button>
          <button
            onClick={() => navigate("/admin/sales/new")}
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "14px",
              padding: "14px 20px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Start Another Quick Sale
          </button>
          <button
            onClick={() => navigate("/admin")}
            style={{
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: "14px",
              padding: "14px 20px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {isStaffWorkspace ? "Return to My Assigned Work" : "Return to Dashboard"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="front-counter-workspace"
      style={{
        width: "100%",
        margin: "0 auto",
        padding: "14px",
        boxSizing: "border-box",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: "grid", gap: "12px" }}>
        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            padding: "8px 10px",
            display: "flex",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
          }}
        >
          <div>
            <p style={{ margin: 0, color: "#64748b", fontSize: "11px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Front Counter
            </p>
            <h1 style={{ margin: "1px 0 0", fontSize: "18px", color: "#0f172a" }}>
              Current transaction
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              gap: "6px",
              flexWrap: "wrap",
            }}
            aria-label="Transaction type"
          >
            {frontCounterActions.map((action) => (
              <button
                key={action.id}
                type="button"
                aria-pressed={activeMode === action.id}
                onClick={() => activateWorkspaceMode(action.id)}
                style={{
                  minHeight: "38px",
                  border: activeMode === action.id ? `2px solid ${action.accent}` : "1px solid #cbd5e1",
                  background: activeMode === action.id ? action.background : "#ffffff",
                  color: activeMode === action.id ? action.accent : "#334155",
                  borderRadius: "10px",
                  padding: "7px 12px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                {action.title}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate("/admin")}
            style={{
              border: "none",
              background: "transparent",
              color: "#64748b",
              padding: "8px",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Cancel transaction
          </button>
        </section>

        {activeMode !== "quick-sale" ? (
          <>
            {transactionMessage ? (
              <div
                style={{
                  border: "1px solid #bbf7d0",
                  background: "#f0fdf4",
                  color: "#166534",
                  borderRadius: "16px",
                  padding: "14px 16px",
                  fontWeight: 700,
                }}
              >
                {transactionMessage}
              </div>
            ) : null}

            <div
              className="front-counter-workspace-grid"
              data-stage={pickupPresentationStage}
              style={{
                display: "grid",
                gridTemplateColumns:
                  pickupPresentationStage === PICKUP_PRESENTATION_STAGES.ACTION
                    ? "minmax(320px, 0.4fr) minmax(0, 0.6fr)"
                    : "minmax(0, 1fr)",
                gap: "12px",
                alignItems: "start",
                minHeight: "398px",
              }}
            >
              {selectedCustomer ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <CustomerPickupHeader
                    customer={selectedCustomer}
                    releasedOrderCount={pickupVisitSummary.releasedOrderCount}
                    remainingToday={pickupVisitSummary.remainingToday}
                    onChangeCustomer={startNextCustomer}
                    onViewCustomer={viewSelectedCustomer}
                  />
                </div>
              ) : null}

              {!selectedCustomer ? (
              <aside className="front-counter-workspace-column" style={{ display: "grid", gap: "12px", minWidth: 0, minHeight: 0 }}>
                <section
                  data-testid="pickup-customer-search"
                  style={{
                    ...sectionCardStyle,
                    width: "min(760px, 100%)",
                    margin: "24px auto",
                    boxSizing: "border-box",
                  }}
                >
                  <div>
                    <h2 style={{ margin: "0 0 4px", fontSize: "22px", color: "#0f172a" }}>
                      Who is picking up today?
                    </h2>
                    <p style={{ margin: 0, color: "#64748b", lineHeight: 1.35, fontSize: "14px" }}>
                      Search by customer, phone, email, company, or order number.
                    </p>
                  </div>

                  <div style={{ position: "relative" }}>
                    <input
                      value={lookupQuery}
                      onChange={(event) => handleLookupChange(event.target.value)}
                      placeholder="Search name, phone, email, company, or order #"
                      style={touchFieldStyle}
                    />

                    {customerMatches.length > 0 ? (
                      <div
                        style={{
                          position: "absolute",
                          top: "54px",
                          left: 0,
                          right: 0,
                          zIndex: 20,
                          background: "#ffffff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "14px",
                          boxShadow: "0 18px 30px rgba(15, 23, 42, 0.12)",
                          overflow: "hidden",
                        }}
                      >
                        {customerMatches.map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            onClick={() => selectCustomer(customer)}
                            style={{
                              display: "block",
                              width: "100%",
                              padding: "12px 14px",
                              textAlign: "left",
                              border: "none",
                              borderBottom: "1px solid #f1f5f9",
                              background: "#ffffff",
                              cursor: "pointer",
                            }}
                          >
                            <strong>{customer.name}</strong>
                            {customer.company ? ` - ${customer.company}` : ""}
                            <span style={{ display: "block", marginTop: "4px", color: "#64748b", fontSize: "13px" }}>
                              {[
                                formatNorthAmericanPhoneDisplay(customer.phone),
                                customer.email,
                              ].filter(Boolean).join(" • ") ||
                                `${customer.order_numbers?.length || 0} linked orders`}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {customerLookupMessage ? (
                    <div
                      style={{
                        border: "1px solid #bbf7d0",
                        background: "#f0fdf4",
                        color: "#166534",
                        borderRadius: "14px",
                        padding: "12px 14px",
                        fontWeight: 700,
                      }}
                    >
                      {customerLookupMessage}
                    </div>
                  ) : null}

                  {canOfferCustomerCreate ? (
                    <div
                      style={{
                        border: "1px dashed #cbd5e1",
                        borderRadius: "18px",
                        padding: "16px",
                        background: "#f8fafc",
                        display: "grid",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "grid", gap: "4px" }}>
                        <strong style={{ color: "#0f172a" }}>No saved customer matched this lookup.</strong>
                        <span style={{ color: "#64748b", lineHeight: 1.5 }}>
                          Create a lightweight customer profile here, then continue the counter transaction.
                        </span>
                      </div>

                      {!showCreateCustomerForm ? (
                        <button
                          type="button"
                          onClick={openCreateCustomerForm}
                          style={{
                            background: "#0f172a",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "12px",
                            padding: "12px 14px",
                            fontWeight: 800,
                            cursor: "pointer",
                            justifySelf: "start",
                          }}
                        >
                          Create New Customer
                        </button>
                      ) : (
                        <form onSubmit={handleCreateCustomer} style={{ display: "grid", gap: "12px" }}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                              gap: "12px",
                            }}
                          >
                            <label style={labelStyle}>
                              Name
                              <input
                                value={createCustomerForm.name}
                                onChange={(event) => updateCreateCustomerForm("name", event.target.value)}
                                placeholder="Customer name"
                                style={touchFieldStyle}
                              />
                            </label>
                            <label style={labelStyle}>
                              Phone
                              <input
                                value={createCustomerForm.phone}
                                onChange={(event) => updateCreateCustomerForm("phone", event.target.value)}
                                placeholder="Phone number"
                                style={touchFieldStyle}
                              />
                            </label>
                            <label style={labelStyle}>
                              Email
                              <input
                                value={createCustomerForm.email}
                                onChange={(event) => updateCreateCustomerForm("email", event.target.value)}
                                placeholder="Email address"
                                style={touchFieldStyle}
                              />
                            </label>
                            <label style={labelStyle}>
                              Company
                              <input
                                value={createCustomerForm.company}
                                onChange={(event) => updateCreateCustomerForm("company", event.target.value)}
                                placeholder="Company (optional)"
                                style={touchFieldStyle}
                              />
                            </label>
                          </div>

                          {createCustomerError ? (
                            <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>
                              {createCustomerError}
                            </p>
                          ) : null}

                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            <button
                              type="submit"
                              style={{
                                background: "#0f172a",
                                color: "#ffffff",
                                border: "none",
                                borderRadius: "12px",
                                padding: "12px 14px",
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              Save Customer
                            </button>
                            <button
                              type="button"
                              onClick={closeCreateCustomerForm}
                              style={{
                                background: "#ffffff",
                                color: "#0f172a",
                                border: "1px solid #cbd5e1",
                                borderRadius: "12px",
                                padding: "12px 14px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  ) : null}

                </section>
              </aside>
              ) : null}

              {selectedCustomer && !completedPickup ? (
              <section className="front-counter-workspace-column" style={{ ...sectionCardStyle, minWidth: 0, minHeight: 0, maxHeight: "100%", overflow: "hidden" }}>
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: "22px", color: "#0f172a" }}>
                    Released Orders
                  </h2>
                  <p style={{ margin: 0, color: "#475569", lineHeight: 1.35, fontSize: "14px" }}>
                    {activeWorkspaceMode.selectionDescription}
                  </p>
                </div>

                {!selectedCustomer ? (
                  <div
                    style={{
                      border: "1px dashed #cbd5e1",
                      borderRadius: "18px",
                      padding: "20px",
                      background: "#f8fafc",
                      color: "#64748b",
                    }}
                    >
                      Begin with customer lookup.
                    </div>
                  ) : !visibleSelectableItems.length ? (
                  <div
                    style={{
                      border: "1px dashed #cbd5e1",
                      borderRadius: "18px",
                      padding: "20px",
                      background: "#f8fafc",
                      color: "#64748b",
                    }}
                  >
                    {activeWorkspaceMode.emptySelectedCustomerMessage}
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "10px", overflowY: "auto", paddingRight: "2px" }}>
                    {visibleSelectableItems.map((item) => {
                      const tones = getActionToneStyles(item.tone);
                      const isSelected = selectedTransactionIds.includes(item.id);
                      const nextActionLabel =
                        paymentProcessingOrderNumber === item.orderNumber
                          ? "Processing Payment"
                          : item.kind === "payment"
                          ? `Payment Required — ${currency(item.amount)} Remaining`
                          : "Ready for Pickup";

                      return (
                        <article
                          key={item.id}
                          data-testid="front-counter-order-card"
                          data-order-number={item.orderNumber}
                          style={{
                            borderRadius: "18px",
                            padding: "16px",
                            background: isSelected ? "#fff7ed" : "#ffffff",
                            border: isSelected ? "1px solid #f59e0b" : "1px solid #e2e8f0",
                            display: "grid",
                            gap: "12px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "start", flexWrap: "wrap" }}>
                            <div>
                              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                                <span
                                  style={{
                                    color: tones.accent,
                                    fontSize: "11px",
                                    fontWeight: 800,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.08em",
                                  }}
                                >
                                  {nextActionLabel}
                                </span>
                                <span
                                  style={{
                                    background: tones.background,
                                    border: tones.border,
                                    borderRadius: "999px",
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    color: "#0f172a",
                                  }}
                                >
                                  {item.kind === "pickup" ? "Handoff" : "Payment"}
                                </span>
                              </div>
                              <h3 style={{ margin: "6px 0 4px", fontSize: "20px", color: "#0f172a" }}>
                                {item.orderNumber}
                              </h3>
                              <p style={{ margin: 0, color: "#475569", lineHeight: 1.5 }}>
                                {item.summary}
                              </p>
                            </div>

                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "20px" }}>
                                {item.amount > 0 ? currency(item.amount) : "Release"}
                              </div>
                              <div style={{ color: "#64748b", fontSize: "13px" }}>
                                {item.order.garment || item.order.item || "Custom order"} • Qty {item.order.qty || 0}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                            <span style={{ color: "#475569", fontWeight: 700 }}>
                              {item.kind === "payment"
                                ? `${currency(item.amount)} must be collected before handoff.`
                                : "Paid in full and ready for customer handoff."}
                            </span>

                            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                onClick={() => toggleTransactionItem(item)}
                                style={{
                                  background: isSelected ? "#0f172a" : "#ffffff",
                                  color: isSelected ? "#ffffff" : "#0f172a",
                                  border: isSelected ? "1px solid #0f172a" : "1px solid #cbd5e1",
                                  borderRadius: "12px",
                                  padding: "11px 14px",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                }}
                              >
                                {isSelected ? "Selected" : "Continue"}
                              </button>
                              <button
                                type="button"
                                onClick={() => navigate(`/admin/orders/${item.orderNumber}`)}
                                style={{
                                  background: "#ffffff",
                                  color: "#0f172a",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "12px",
                                  padding: "11px 14px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                View Order
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
              ) : null}

              {selectedCustomer &&
              (selectedTransactionItems.length > 0 || completedPickup) ? (
              <aside className="front-counter-workspace-column front-counter-workspace-summary" style={{ display: "grid", gap: "12px", minWidth: 0, minHeight: 0 }}>
                <section data-testid="pickup-action-panel" style={{ ...sectionCardStyle, maxHeight: "100%", overflow: "hidden" }}>
                  <div>
                    <h2 style={{ margin: "0 0 4px", fontSize: "22px", color: "#0f172a" }}>
                      {pickupActionPanelTitle}
                    </h2>
                    <p style={{ margin: 0, color: "#64748b", fontSize: "14px", lineHeight: 1.35 }}>
                      Complete the required action for the selected order.
                    </p>
                  </div>

                  {completedPickup ? (
                    <PickupCompletionPanel
                      completion={completedPickup}
                      hasRemainingOrders={visibleSelectableItems.length > 0}
                      onReturnToOrders={returnToReleasedOrders}
                      onStartNextCustomer={startNextCustomer}
                      onViewOrder={() =>
                        navigate(`/admin/orders/${completedPickup.orderNumber}`)
                      }
                      onViewReceipt={() =>
                        navigate(`/admin/sales/receipt/${completedPickup.saleNumber}`)
                      }
                    />
                  ) : (
                    <>
                      <div style={{ display: "grid", gap: "10px" }}>
                        {selectedTransactionItems.map((item) => (
                          <article
                            key={`summary-${item.id}`}
                            style={{
                              border: "1px solid #e2e8f0",
                              borderRadius: "14px",
                              padding: "12px 14px",
                              background: "#f8fafc",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                              <strong style={{ color: "#0f172a" }}>{item.orderNumber}</strong>
                              <strong style={{ color: "#0f172a" }}>
                                {item.amount > 0 ? currency(item.amount) : "Release"}
                              </strong>
                            </div>
                            <div style={{ marginTop: "4px", color: "#64748b", fontSize: "13px" }}>
                              {item.label}
                            </div>
                            <div style={{ marginTop: "8px", color: "#475569", fontSize: "13px", fontWeight: 700 }}>
                              {item.order.garment || item.order.item || "Custom order"} • Qty {item.order.qty || 0}
                            </div>
                          </article>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={clearTransactionSelection}
                        style={{
                          background: "#ffffff",
                          color: "#0f172a",
                          border: "1px solid #cbd5e1",
                          borderRadius: "12px",
                          padding: "11px 14px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Back to Released Orders
                      </button>
                      {selectedTransactionKind === "payment" ? (
                        <form
                          onSubmit={handleRecordCounterPayment}
                          style={{ display: "grid", gap: "14px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}
                        >
                          <div style={{ display: "grid", gap: "10px" }}>
                            <div style={{ display: "grid", gap: "10px" }}>
                              <h3 style={{ margin: 0, fontSize: "17px", color: "#0f172a" }}>
                                Payment Actions
                              </h3>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                                  gap: "10px",
                                }}
                              >
                                {[
                                  ["Current Balance Due", transactionSummary.amountDue],
                                  ["Amount Being Recorded", enteredPaymentAmount],
                                  ["Balance After Recording", outstandingBalanceAfterPayment],
                                ].map(([label, amount]) => (
                                  <div
                                    key={label}
                                    style={{
                                      border: "1px solid #e2e8f0",
                                      borderRadius: "12px",
                                      padding: "10px 12px",
                                      background: "#f8fafc",
                                      display: "grid",
                                      gap: "3px",
                                    }}
                                  >
                                    <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 700 }}>
                                      {label}
                                    </span>
                                    <strong style={{ color: "#0f172a", fontSize: "17px" }}>
                                      {currency(amount)}
                                    </strong>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                              {paymentWorkflowActions.map((action) => (
                                <PaymentWorkflowActionButton
                                  key={action.id}
                                  action={action}
                                  active={selectedPaymentAction === action.id}
                                  onSelect={selectPaymentWorkflowAction}
                                />
                              ))}
                            </div>
                          </div>

                          {activePaymentAction ? (
                            <div
                              style={{
                                borderRadius: "18px",
                                padding: "16px",
                                border: activePaymentAction.border,
                                background: activePaymentAction.background,
                                display: "grid",
                                gap: "14px",
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                                <div style={{ display: "grid", gap: "4px" }}>
                                  <span
                                    style={{
                                      color: activePaymentAction.accent,
                                      fontSize: "11px",
                                      fontWeight: 800,
                                      textTransform: "uppercase",
                                      letterSpacing: "0.08em",
                                    }}
                                  >
                                    Active Action
                                  </span>
                                  <strong style={{ color: "#0f172a", fontSize: "18px" }}>
                                    {activePaymentAction.title}
                                  </strong>
                                  {activePaymentAction.description ? (
                                    <span style={{ color: "#475569", fontSize: "13px", fontWeight: 600 }}>
                                      {activePaymentAction.description}
                                    </span>
                                  ) : null}
                                </div>
                                <div style={{ textAlign: "right", display: "grid", gap: "4px" }}>
                                  <span style={{ color: "#475569", fontSize: "12px", fontWeight: 700 }}>
                                    Current Balance Due
                                  </span>
                                  <strong style={{ color: "#0f172a", fontSize: "18px" }}>
                                    {currency(transactionSummary.amountDue)}
                                  </strong>
                                </div>
                              </div>

                              <label style={labelStyle}>
                                Amount
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={paymentAmount}
                                  disabled={isTerminalPaymentAction}
                                  onChange={(event) => {
                                    setPaymentAmountOverride(event.target.value);
                                    setPaymentAmountOverrideSelection(paymentSelectionKey);
                                    setPaymentError("");
                                  }}
                                  style={{
                                    ...keypadReadyFieldStyle,
                                    border:
                                      paymentError || !paymentValidation.valid || !splitPaymentValidation.valid
                                        ? "1px solid #dc2626"
                                        : keypadReadyFieldStyle.border,
                                    background:
                                      paymentError || !paymentValidation.valid || !splitPaymentValidation.valid
                                        ? "#fff1f2"
                                        : keypadReadyFieldStyle.background,
                                  }}
                                />
                              </label>

                              {isSplitPaymentAction ? (
                                <div style={{ display: "grid", gap: "14px" }}>
                                  <div style={{ display: "grid", gap: "8px" }}>
                                    <span style={{ color: "#292524", fontWeight: 700 }}>Payment Leg 1</span>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={splitPrimaryAmount}
                                      onChange={(event) => {
                                        setSplitPrimaryAmount(event.target.value);
                                        setPaymentError("");
                                      }}
                                      placeholder="Enter first payment amount"
                                      style={keypadReadyFieldStyle}
                                    />
                                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                      {splitPaymentMethods.map((method) => (
                                        <button
                                          key={`split-primary-${method}`}
                                          type="button"
                                          onClick={() => setSplitPrimaryMethod(method)}
                                          style={getSplitMethodButtonStyle(splitPrimaryMethod === method)}
                                        >
                                          {method}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div
                                    style={{
                                      border: "1px solid #fed7aa",
                                      borderRadius: "14px",
                                      padding: "14px 16px",
                                      background: "#ffffff",
                                      display: "grid",
                                      gap: "10px",
                                    }}
                                  >
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                                      <span style={{ color: "#475569", fontWeight: 700 }}>Payment Leg 2</span>
                                      <strong style={{ color: "#0f172a" }}>
                                        {currency(splitSecondaryAmountValue)}
                                      </strong>
                                    </div>
                                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                      {splitPaymentMethods.map((method) => (
                                        <button
                                          key={`split-secondary-${method}`}
                                          type="button"
                                          onClick={() => setSplitSecondaryMethod(method)}
                                          style={getSplitMethodButtonStyle(splitSecondaryMethod === method)}
                                        >
                                          {method}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    border: "1px solid rgba(15, 23, 42, 0.08)",
                                    borderRadius: "14px",
                                    padding: "12px 14px",
                                    background: "#ffffff",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: "10px",
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                  }}
                                >
                                  <span style={{ color: "#475569", fontWeight: 700 }}>Method</span>
                                  <strong style={{ color: "#0f172a" }}>{activePaymentAction.shortLabel}</strong>
                                </div>
                              )}

                              <label style={labelStyle}>
                                Notes
                                <textarea
                                  value={paymentNote}
                                  disabled={isTerminalPaymentAction}
                                  onChange={(event) => setPaymentNote(event.target.value)}
                                  rows={3}
                                  placeholder={activePaymentAction.notePlaceholder}
                                  style={{ ...fieldStyle, resize: "vertical" }}
                                />
                              </label>

                              {isTerminalPaymentAction ? (
                                <div data-testid="terminal-checkout-status" aria-live="polite" style={{ border: "1px solid #99f6e4", borderRadius: "14px", padding: "12px 14px", background: "#ffffff", display: "grid", gap: "8px" }}>
                                  <strong>{terminalStatusLabel(terminalAttempt?.status)}</strong>
                                  {terminalAttempt ? (
                                    <span style={{ color: "#475569", fontSize: "13px" }}>
                                      {currency(terminalAttempt.amount)} · {terminalAttempt.orderNumber}
                                    </span>
                                  ) : (
                                    <span style={{ color: "#475569", fontSize: "13px" }}>Ready to send the exact remaining balance.</span>
                                  )}
                                  {terminalAttempt?.failureMessage ? <span style={{ color: "#b91c1c" }}>{terminalAttempt.failureMessage}</span> : null}
                                  {["pending", "in_progress", "cancel_requested"].includes(terminalAttempt?.status) ? (
                                    <button type="button" onClick={handleCancelTerminal} disabled={terminalAttempt.status === "cancel_requested"} style={{ justifySelf: "start", border: "1px solid #fca5a5", background: "#fff1f2", color: "#991b1b", borderRadius: "10px", padding: "9px 12px", fontWeight: 800 }}>
                                      {terminalAttempt.status === "cancel_requested" ? "Cancel requested…" : "Cancel Terminal checkout"}
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}

                              {paymentError || !paymentValidation.valid || !splitPaymentValidation.valid ? (
                                <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>
                                  {paymentError || splitPaymentValidation.message || paymentValidation.message}
                                </p>
                              ) : null}

                              <button
                                type="submit"
                                disabled={
                                  Boolean(paymentProcessingOrderNumber) ||
                                  (isTerminalPaymentAction && Boolean(terminalAttempt) && !TERMINAL_FINAL_STATES.has(terminalAttempt.status)) ||
                                  !paymentValidation.valid ||
                                  !splitPaymentValidation.valid
                                }
                                style={{
                                  background:
                                    paymentValidation.valid && splitPaymentValidation.valid
                                      ? "#171717"
                                      : "#a8a29e",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: "12px",
                                  padding: "13px 18px",
                                  cursor:
                                    paymentValidation.valid && splitPaymentValidation.valid
                                      ? "pointer"
                                      : "not-allowed",
                                  fontWeight: 800,
                                }}
                              >
                                {paymentProcessingOrderNumber
                                  ? isTerminalPaymentAction ? terminalStatusLabel(terminalAttempt?.status || "creating") : "Processing Payment…"
                                  : activePaymentAction.buttonLabel}
                              </button>
                            </div>
                          ) : null}
                        </form>
                      ) : selectedTransactionKind === "pickup" ? (
                        <div style={{ display: "grid", gap: "16px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}>
                          <div
                            style={{
                              border: "1px solid #bbf7d0",
                              background: "#f0fdf4",
                              color: "#166534",
                              borderRadius: "16px",
                              padding: "14px 16px",
                              fontWeight: 700,
                            }}
                          >
                            This order is paid in full and ready to hand to the customer.
                          </div>

                          <button
                            type="button"
                            onClick={handleReleasePickupSelection}
                            style={{
                              background: "#166534",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "12px",
                              padding: "13px 18px",
                              cursor: "pointer",
                              fontWeight: 800,
                            }}
                          >
                            Confirm Order Handed to Customer
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>
              </aside>
              ) : null}
            </div>
          </>
        ) : null}

            {activeMode === "quick-sale" ? (
              <form onSubmit={completeSale} style={{ display: "grid", gap: "12px" }}>
                <section
                  id="quick-sale-workflow"
                  style={{
                    ...sectionCardStyle,
                    padding: "12px",
                    gap: "10px",
                    height: "calc(100vh - 238px)",
                    minHeight: "482px",
                    gridTemplateRows: "auto minmax(0, 1fr)",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <p
                        style={{
                          margin: 0,
                          color: "#78716c",
                          fontSize: "11px",
                          fontWeight: 800,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                        }}
                      >
                        Walk-In Transaction
                      </p>
                      <h2 style={{ margin: "4px 0 0", fontSize: "24px", color: "#0f172a" }}>
                        Quick Sale
                      </h2>
                    </div>
                    <strong style={{ color: "#0f172a", fontSize: "24px" }}>{currency(total)}</strong>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(440px, 1.55fr) minmax(380px, 0.95fr)",
                      gap: "12px",
                      alignItems: "stretch",
                      minHeight: 0,
                      height: "auto",
                    }}
                  >
                    <section
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "16px",
                        padding: "14px",
                        display: "grid",
                        gap: "12px",
                        alignContent: "start",
                        minHeight: 0,
                        overflowX: "hidden",
                        overflowY: "auto",
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: "20px", color: "#0f172a" }}>
                        {quickSaleStep === "product" && productSearchQuery.trim()
                          ? "Product Search"
                          : quickSaleStep === "product" && selectedProductCategory
                          ? activeProductCategory
                          : cart.length
                          ? "Add Another Item"
                          : "Search Product"}
                      </h3>

                      {lineItem.name ? (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                            gap: "8px",
                          }}
                        >
                          <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", background: "#ffffff", padding: "10px" }}>
                            <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
                              Selected Product
                            </span>
                            <strong style={{ display: "block", marginTop: "3px", color: "#0f172a", fontSize: "15px" }}>
                              {lineItem.name}
                            </strong>
                          </div>
                          {lineItem.color ? (
                            <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", background: "#ffffff", padding: "10px" }}>
                              <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
                                Selected Colour
                              </span>
                              <strong style={{ display: "block", marginTop: "3px", color: "#0f172a", fontSize: "15px" }}>
                                {lineItem.color}
                              </strong>
                            </div>
                          ) : null}
                          {lineItem.size ? (
                            <div style={{ border: "1px solid #e2e8f0", borderRadius: "12px", background: "#ffffff", padding: "10px" }}>
                              <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 900, textTransform: "uppercase" }}>
                                Selected Size
                              </span>
                              <strong style={{ display: "block", marginTop: "3px", color: "#0f172a", fontSize: "15px" }}>
                                {lineItem.size}
                              </strong>
                            </div>
                          ) : null}
                          <button
                            type="button"
                            onClick={resetProductSelection}
                            style={{
                              minHeight: "52px",
                              border: "1px solid #cbd5e1",
                              background: "#ffffff",
                              borderRadius: "12px",
                              padding: "10px 12px",
                              fontWeight: 900,
                              cursor: "pointer",
                              alignSelf: "stretch",
                            }}
                          >
                            Change Product
                          </button>
                        </div>
                      ) : null}

                      {quickSaleStep === "product" ? (
                        <>
                          <label style={labelStyle}>
                            Product Search
                            <input
                              ref={productSelectRef}
                              value={productSearchQuery}
                              onChange={(event) => updateProductSearch(event.target.value)}
                              placeholder="Search product, SKU, brand, or category"
                              style={{ ...touchFieldStyle, minHeight: "52px", fontSize: "18px" }}
                            />
                          </label>

                          {!productSearchQuery.trim() && productCategories.length ? (
                            <div style={{ display: "grid", gap: "8px" }}>
                              <strong style={{ color: "#0f172a", fontSize: "16px" }}>Browse Categories</strong>
                              <div style={{ display: "flex", gap: "8px", flexWrap: "nowrap", overflow: "hidden" }}>
                                {productCategories.slice(0, 5).map((category) => (
                                  <button
                                    key={category}
                                    type="button"
                                    onClick={() => setSelectedProductCategory(category)}
                                    style={{
                                      minHeight: "48px",
                                      borderRadius: "12px",
                                      border:
                                        activeProductCategory === category
                                          ? "1px solid #0f172a"
                                          : "1px solid #cbd5e1",
                                      background: activeProductCategory === category ? "#0f172a" : "#ffffff",
                                      color: activeProductCategory === category ? "#ffffff" : "#0f172a",
                                      padding: "11px 14px",
                                      fontWeight: 900,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {category}
                                  </button>
                                ))}
                                {productCategories.length > 5 ? (
                                  <select
                                    value={productCategories.slice(5).includes(selectedProductCategory) ? selectedProductCategory : ""}
                                    onChange={(event) => setSelectedProductCategory(event.target.value)}
                                    aria-label="More product categories"
                                    style={{
                                      minHeight: "48px",
                                      borderRadius: "12px",
                                      border: "1px solid #cbd5e1",
                                      background: "#ffffff",
                                      color: "#0f172a",
                                      padding: "10px 12px",
                                      fontWeight: 900,
                                    }}
                                  >
                                    <option value="">More</option>
                                    {productCategories.slice(5).map((category) => (
                                      <option key={category} value={category}>{category}</option>
                                    ))}
                                  </select>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {visibleProducts.length ? (
                          <div
                            data-testid="pos-product-results"
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
                              gap: "10px",
                              paddingRight: "2px",
                            }}
                          >
                            {visibleProducts.map((product) => (
                              <button
                                key={product.id}
                                type="button"
                                data-testid="pos-product-result"
                                onClick={() => selectProduct(product)}
                                style={{
                                  minHeight: "92px",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "14px",
                                  background: "#ffffff",
                                  color: "#0f172a",
                                  padding: "12px",
                                  textAlign: "left",
                                  cursor: "pointer",
                                  display: "grid",
                                  gap: "5px",
                                }}
                              >
                                <strong style={{ fontSize: "17px" }}>{product.name}</strong>
                                <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                                  {[getProductCategory(product), product.brand_model].filter(Boolean).join(" • ")}
                                </span>
                                <span style={{ color: "#0f172a", fontSize: "16px", fontWeight: 900 }}>
                                  {getProductPrice(product) ? currency(getProductPrice(product)) : "Price at counter"}
                                </span>
                              </button>
                            ))}

                            {productSearchQuery.trim() ? (
                              <button
                                type="button"
                                onClick={selectCustomProduct}
                                style={{
                                  minHeight: "92px",
                                  border: "1px dashed #94a3b8",
                                  borderRadius: "14px",
                                  background: "#ffffff",
                                  color: "#0f172a",
                                  padding: "12px",
                                  textAlign: "left",
                                  cursor: "pointer",
                                  display: "grid",
                                  gap: "5px",
                                }}
                              >
                                <strong style={{ fontSize: "17px" }}>Custom item</strong>
                                <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                                  Add "{productSearchQuery.trim()}" manually
                                </span>
                              </button>
                            ) : null}
                          </div>
                          ) : productSearchQuery.trim() ? (
                            <button
                              type="button"
                              onClick={selectCustomProduct}
                              style={{
                                minHeight: "92px",
                                border: "1px dashed #94a3b8",
                                borderRadius: "14px",
                                background: "#ffffff",
                                color: "#0f172a",
                                padding: "12px",
                                textAlign: "left",
                                cursor: "pointer",
                                display: "grid",
                                gap: "5px",
                              }}
                            >
                              <strong style={{ fontSize: "17px" }}>Custom item</strong>
                              <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                                Add "{productSearchQuery.trim()}" manually
                              </span>
                            </button>
                          ) : null}
                        </>
                      ) : null}

                      {quickSaleStep === "color" ? (
                        <div style={{ display: "grid", gap: "10px" }}>
                          <strong style={{ color: "#0f172a", fontSize: "18px" }}>Choose Colour</strong>
                          {needsColorSelection ? (
                            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                              {selectedProduct.colors.map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  data-testid="pos-color-option"
                                  onClick={() => selectLineItemColor(color)}
                                  style={{
                                    minHeight: "54px",
                                    border: "1px solid #cbd5e1",
                                    background: "#ffffff",
                                    borderRadius: "14px",
                                    padding: "14px 18px",
                                    fontSize: "16px",
                                    fontWeight: 900,
                                    cursor: "pointer",
                                  }}
                                >
                                  {color}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <input
                              name="color"
                              value={lineItem.color}
                              onChange={updateLineItem}
                              onKeyDown={handleLineItemKeyDown}
                              placeholder="Black"
                              style={touchFieldStyle}
                            />
                          )}
                        </div>
                      ) : null}

                      {quickSaleStep === "size" ? (
                        <div style={{ display: "grid", gap: "10px" }}>
                          <strong style={{ color: "#0f172a", fontSize: "18px" }}>Choose Size</strong>
                          {needsSizeSelection ? (
                            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                              {selectedProduct.sizes.map((size) => (
                                <button
                                  key={size}
                                  type="button"
                                  data-testid="pos-size-option"
                                  onClick={() => selectLineItemSize(size)}
                                  style={{
                                    minWidth: "62px",
                                    minHeight: "54px",
                                    border: "1px solid #cbd5e1",
                                    background: "#ffffff",
                                    borderRadius: "14px",
                                    padding: "14px 18px",
                                    fontSize: "16px",
                                    fontWeight: 900,
                                    cursor: "pointer",
                                  }}
                                >
                                  {size}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <input
                              name="size"
                              value={lineItem.size}
                              onChange={updateLineItem}
                              onKeyDown={handleLineItemKeyDown}
                              placeholder="L"
                              style={touchFieldStyle}
                            />
                          )}
                        </div>
                      ) : null}

                      {quickSaleStep === "quantity" ? (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                            gap: "12px",
                            alignItems: "end",
                          }}
                        >
                          <QuantityStepper
                            value={lineItem.qty}
                            onChange={updateLineItemQuantity}
                            onCommit={commitLineItemQuantity}
                            onDecrement={() => stepLineItemQuantity(-1)}
                            onIncrement={() => stepLineItemQuantity(1)}
                            onKeyDown={handleLineItemKeyDown}
                            testId="pos-line-quantity-stepper"
                          />
                          <label style={labelStyle}>
                            Unit Price
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              name="unit_price"
                              value={lineItem.unit_price}
                              onChange={updateLineItem}
                              onKeyDown={handleLineItemKeyDown}
                              placeholder="24.99"
                              style={{ ...keypadReadyFieldStyle, minHeight: "54px" }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={addToCart}
                            disabled={!canAddItem}
                            style={{
                              background: canAddItem ? "#171717" : "#a8a29e",
                              color: "#ffffff",
                              border: "none",
                              borderRadius: "14px",
                              padding: "14px 18px",
                              minHeight: "58px",
                              cursor: canAddItem ? "pointer" : "not-allowed",
                              fontSize: "17px",
                              fontWeight: 900,
                            }}
                          >
                            Add to Cart
                          </button>
                        </div>
                      ) : null}
                    </section>

                    <aside
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: "16px",
                          padding: "10px",
                          background: "#ffffff",
                          display: "flex",
                          flexDirection: "column",
                          gap: "6px",
                          minHeight: 0,
                          overflowX: "hidden",
                          overflowY: "hidden",
                          boxShadow: "0 12px 28px rgba(15, 23, 42, 0.08)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "end" }}>
                          <div>
                            <span style={{ color: "#64748b", fontSize: "11px", fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                              Current Sale
                            </span>
                            <h3 style={{ margin: "3px 0 0", fontSize: "24px" }}>Cart</h3>
                          </div>
                          <div style={{ display: "grid", gap: "4px", justifyItems: "end" }}>
                            <strong style={{ color: "#0f172a", fontSize: "24px" }}>{currency(total)}</strong>
                            <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 700 }}>
                              {cart.length} {cart.length === 1 ? "item" : "items"}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "grid", gap: "8px", paddingRight: "2px", overflowY: "auto", alignContent: "start", minHeight: 0, flex: "1 1 72px" }}>
                          {!cart.length ? (
                            <div style={{ border: "1px dashed #cbd5e1", borderRadius: "12px", padding: "14px", color: "#64748b", textAlign: "center" }}>
                              Add a product to begin the sale.
                            </div>
                          ) : null}
                          {cart.map((item) => (
                            <div key={item.id} style={{ border: "1px solid #e7e5e4", borderRadius: "12px", padding: "9px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                                <strong style={{ color: "#0f172a" }}>{item.name}</strong>
                                <button
                                  type="button"
                                  onClick={() => removeCartItem(item.id)}
                                  style={{
                                    border: "none",
                                    background: "transparent",
                                    color: "#b91c1c",
                                    cursor: "pointer",
                                    fontWeight: 700,
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                              <p style={{ margin: "3px 0 7px", color: "#64748b", fontSize: "13px" }}>
                                {[item.color, item.size].filter(Boolean).join(" • ") || "No variant"} • {currency(item.line_total)}
                              </p>
                              <div style={{ display: "grid", gridTemplateColumns: "minmax(178px, 0.9fr) minmax(140px, 1fr)", gap: "12px", alignItems: "end" }}>
                                <QuantityStepper
                                  label="Qty"
                                  value={item.qty}
                                  onChange={(value) => updateCartItem(item.id, "qty", value)}
                                  onCommit={() => updateCartItem(item.id, "qty", item.qty)}
                                  onDecrement={() => stepCartItemQuantity(item.id, -1)}
                                  onIncrement={() => stepCartItemQuantity(item.id, 1)}
                                  onKeyDown={handleCartEditKeyDown}
                                  testId="pos-cart-quantity-stepper"
                                  compact
                                />
                                <label style={{ display: "grid", gap: "4px", color: "#64748b", fontSize: "12px", fontWeight: 700 }}>
                                  Unit Price
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.unit_price}
                                    onChange={(event) => updateCartItem(item.id, "unit_price", event.target.value)}
                                    onKeyDown={handleCartEditKeyDown}
                                    style={{ ...compactFieldStyle, minHeight: "40px", fontWeight: 800, textAlign: "right" }}
                                  />
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "6px", display: "grid", gap: "4px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Subtotal</span>
                            <strong>{currency(subtotal)}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Tax (13%)</span>
                            <strong>{currency(taxTotal)}</strong>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "19px" }}>
                            <span>Total</span>
                            <strong>{currency(total)}</strong>
                          </div>
                        </div>

                        <div style={{ display: "grid", gap: "8px", borderTop: "1px solid #e2e8f0", paddingTop: "8px" }}>
                          <strong style={{ color: "#0f172a", fontSize: "14px" }}>Customer</strong>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr", gap: "8px" }}>
                            <input
                              value={customerName}
                              onChange={(event) => updateCustomerName(event.target.value)}
                              placeholder="Customer first and last name"
                              style={{ ...compactFieldStyle, minHeight: "42px", fontSize: "14px" }}
                              aria-label="Customer Name"
                            />
                            <input
                              type="tel"
                              value={customerPhone}
                              onChange={(event) => setCustomerPhone(event.target.value)}
                              placeholder="Phone number"
                              style={{ ...compactFieldStyle, minHeight: "42px", fontSize: "14px" }}
                              aria-label="Customer Phone"
                            />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center" }}>
                            <strong style={{ color: "#0f172a", fontSize: "14px" }}>Payment</strong>
                            <button
                              type="button"
                              onClick={() => setShowQuickSaleNote((current) => !current)}
                              aria-expanded={showQuickSaleNote}
                              style={{ border: "none", background: "transparent", color: "#475569", cursor: "pointer", fontWeight: 800 }}
                            >
                              {showQuickSaleNote ? "Hide note" : "Add note"}
                            </button>
                          </div>
                          <div style={{ display: "flex", gap: "6px", flexWrap: "nowrap" }}>
                            {counterPaymentMethods.map((option) => {
                              const active = quickSalePaymentMethod === option;
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => setQuickSalePaymentMethod(option)}
                                  style={{
                                    minHeight: "38px",
                                    flex: "1 1 auto",
                                    border: active ? "2px solid #0f172a" : "1px solid #cbd5e1",
                                    background: active ? "#0f172a" : "#ffffff",
                                    color: active ? "#ffffff" : "#0f172a",
                                    borderRadius: "10px",
                                    padding: "7px 8px",
                                    fontSize: "12px",
                                    fontWeight: 900,
                                    cursor: "pointer",
                                  }}
                                >
                                  {option}
                                </button>
                              );
                            })}
                          </div>
                          {showQuickSaleNote ? (
                            <textarea
                              value={notes}
                              onChange={(event) => setNotes(event.target.value)}
                              placeholder="Optional sale note or payment reference."
                              style={{ ...fieldStyle, minHeight: "48px", resize: "none" }}
                              aria-label="Notes"
                            />
                          ) : null}
                        </div>

                          <button
                            type="submit"
                            disabled={!canCompleteSale}
                            style={{
                              width: "100%",
                              minHeight: "44px",
                              border: "none",
                              borderRadius: "12px",
                              background: canCompleteSale ? "#171717" : "#a8a29e",
                              color: "#ffffff",
                              cursor: canCompleteSale ? "pointer" : "not-allowed",
                              fontSize: "16px",
                              fontWeight: 900,
                            }}
                          >
                            Complete Sale · {currency(total)}
                          </button>
                      </aside>
                  </div>
                </section>
              </form>
            ) : null}
        </div>
    </div>
  );
}
