import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useStoredProducts } from "../lib/productsStore";
import { createStoredQuickSale } from "../lib/salesStore";
import { createStoredCustomer, getStoredCustomers } from "../lib/customersStore";
import {
  recordStoredOrderPayment,
  updateStoredOrder,
  useStoredOrders,
} from "../lib/ordersStore";
import { getActiveStaffUser } from "../lib/staffUsersStore";
import { validatePaymentAmount } from "../lib/financialValidation";
import PaymentStatusBadge from "../components/PaymentStatusBadge";
import { PAYMENT_METHOD_OPTIONS } from "../orders/orderFinancials";
import { isStaffWorkspaceView } from "./adminRoleView";

const taxRate = 0.13;
const counterPaymentMethods = PAYMENT_METHOD_OPTIONS.filter((option) =>
  ["Cash", "Debit", "Credit", "E-Transfer", "Cheque", "Other"].includes(option)
);
const quickSalePaymentMethods = [...counterPaymentMethods, "Pay Later"];
const splitPaymentMethods = ["Cash", "Debit", "Credit", "E-Transfer", "Cheque", "Other"];
const paymentWorkflowActions = [
  {
    id: "card",
    title: "Charge Card",
    recordMethod: "Card",
    shortLabel: "Card",
    buttonLabel: "Record Card",
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
  payment: {
    id: "payment",
    label: "Payment Items",
    title: "Payment Collection",
    description:
      "Collect deposits and balances that are due now.",
    selectionHeading: "Select Payment Items",
    selectionDescription:
      "Select the balances to collect.",
    emptySelectedCustomerMessage:
      "No payment items are due for this customer right now. Deposits and unpaid balances appear here when collection is needed.",
  },
  pickup: {
    id: "pickup",
    label: "Pickup Items",
    title: "Pickup Release",
    description:
      "Release completed orders that are ready to hand off.",
    selectionHeading: "Select Pickup Releases",
    selectionDescription:
      "Select the ready orders being handed to the customer.",
    emptySelectedCustomerMessage:
      "No pickup releases are ready for this customer. Paid, release-ready orders appear here when they can be handed off.",
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

const labelStyle = {
  display: "grid",
  gap: "8px",
  fontWeight: 600,
  color: "#292524",
};

const compactFieldStyle = {
  ...fieldStyle,
  padding: "8px 10px",
  borderRadius: "10px",
  fontSize: "14px",
};

const sectionCardStyle = {
  background: "#ffffff",
  borderRadius: "20px",
  border: "1px solid #e2e8f0",
  padding: "22px",
  display: "grid",
  gap: "16px",
};

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

function getSplitMethodButtonStyle(active) {
  return {
    border: active ? "1px solid #0f172a" : "1px solid #cbd5e1",
    background: active ? "#0f172a" : "#ffffff",
    color: active ? "#ffffff" : "#0f172a",
    borderRadius: "999px",
    padding: "8px 12px",
    fontWeight: 700,
    cursor: "pointer",
  };
}

function filterSelectionIdsForMode(mode, selectedIds, items) {
  if (mode === "quick-sale") return [];

  const allowedIds = new Set(
    items
      .filter((item) => {
        if (mode === "payment") return item.kind === "payment";
        if (mode === "pickup") return item.kind === "pickup";
        return false;
      })
      .map((item) => item.id)
  );

  return selectedIds.filter((id) => allowedIds.has(id));
}

function buildCustomerDirectory(customers, orders) {
  const directory = new Map();

  customers.forEach((customer) => {
    const key = customer.id || `saved-${normalize(customer.name)}`;
    directory.set(key, {
      id: customer.id || key,
      source: "saved",
      name: customer.name || "Unnamed Customer",
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

function buildCustomerOrders(selectedCustomer, orders) {
  if (!selectedCustomer) return [];

  const selectedName = normalize(selectedCustomer.name);
  const orderNumbers = new Set(selectedCustomer.order_numbers || []);

  return orders.filter((order) => {
    if (selectedCustomer.source === "saved" && selectedCustomer.id && order.customer_id === selectedCustomer.id) {
      return true;
    }

    if (order.order_number && orderNumbers.has(order.order_number)) {
      return true;
    }

    return selectedName && normalize(order.customer_name) === selectedName;
  });
}

function buildPaymentAction(order) {
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

function buildPickupAction(order) {
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

function buildSelectableTransactionItems(orders = []) {
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

function buildCustomerSummary(orders = []) {
  const activeOrders = orders.length;
  const unpaidBalances = orders.filter((order) => Number(order.balance_due || 0) > 0).length;
  const paidOrders = Math.max(0, orders.length - unpaidBalances);
  const pickupReady = orders.filter((order) => order.pickup_status === "Ready for Pickup").length;
  const releaseReady = orders.filter(
    (order) => order.pickup_status === "Ready for Pickup" && Number(order.balance_due || 0) <= 0
  ).length;
  const pickupAwaitingPayment = Math.max(0, pickupReady - releaseReady);
  const outstandingBalance = sumValues(orders.map((order) => order.balance_due));

  return {
    activeOrders,
    unpaidBalances,
    paidOrders,
    pickupReady,
    releaseReady,
    pickupAwaitingPayment,
    outstandingBalance,
  };
}

function OperationalStat({ label, value, emphasis = "default" }) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "16px",
        padding: "14px 16px",
        background: "#f8fafc",
        display: "grid",
        gap: "4px",
      }}
    >
      <span
        style={{
          color: "#64748b",
          fontSize: "11px",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: emphasis === "danger" ? "#b91c1c" : emphasis === "success" ? "#166534" : "#0f172a",
          fontSize: "22px",
          fontWeight: 800,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function PaymentWorkflowActionButton({ action, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(action.id)}
      style={{
        borderRadius: "999px",
        padding: "10px 14px",
        border: active ? `1px solid ${action.accent}` : action.border,
        background: active ? action.background : "#ffffff",
        color: active ? action.accent : "#0f172a",
        fontWeight: 800,
        cursor: "pointer",
        boxShadow: active ? `0 0 0 2px ${action.background}` : "none",
      }}
    >
      {action.title}
    </button>
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

  const [activeMode, setActiveMode] = useState("payment");
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

  const [linkedCustomerId, setLinkedCustomerId] = useState("");
  const [linkedCustomerName, setLinkedCustomerName] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [quickSalePaymentMethod, setQuickSalePaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
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

  const customerOrders = useMemo(() => {
    return buildCustomerOrders(selectedCustomer, storedOrders);
  }, [selectedCustomer, storedOrders]);

  const selectableItems = useMemo(
    () => buildSelectableTransactionItems(customerOrders),
    [customerOrders]
  );
  const visibleSelectableItems = useMemo(() => {
    if (activeMode === "payment") {
      return selectableItems.filter((item) => item.kind === "payment");
    }

    if (activeMode === "pickup") {
      return selectableItems.filter((item) => item.kind === "pickup");
    }

    return selectableItems;
  }, [activeMode, selectableItems]);
  const activeWorkspaceMode =
    transactionWorkspaceModes[activeMode] || transactionWorkspaceModes.payment;
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
  const customerSummary = useMemo(() => buildCustomerSummary(customerOrders), [customerOrders]);
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
  const paymentValidation = validatePaymentAmount({
    amount: paymentAmount,
    remainingBalance: transactionSummary.amountDue || 0,
  });
  const activePaymentAction = useMemo(
    () => getPaymentActionConfig(selectedPaymentAction),
    [selectedPaymentAction]
  );
  const isSplitPaymentAction = selectedPaymentAction === "split";
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
    setSelectedTransactionIds((current) =>
      filterSelectionIdsForMode(activeMode, current, selectableItems)
    );
  }, [activeMode, selectableItems]);

  function resetPaymentForm(nextAmount = "") {
    setPaymentAmountOverride(nextAmount);
    setPaymentAmountOverrideSelection(nextAmount ? paymentSelectionKey : "");
    setSelectedPaymentAction("");
    setSplitPrimaryMethod("Cash");
    setSplitSecondaryMethod("Credit");
    setSplitPrimaryAmount("");
    setPaymentNote("");
    setPaymentError("");
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
    setSelectedCustomer(customer);
    setLookupQuery(customer.name || "");
    setCustomerMatches([]);
    if (!preserveLookupMessage) {
      setCustomerLookupMessage("");
    }
    setShowCreateCustomerForm(false);
    setCreateCustomerError("");
    setSelectedTransactionIds([]);
    setTransactionMessage("");
    setCustomerName(customer.name || "");
    setLinkedCustomerId(customer.source === "saved" ? customer.id : "");
    setLinkedCustomerName(customer.name || "");
    setActiveMode("payment");
    resetPaymentForm("");
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

  function handleCreateCustomer(event) {
    event.preventDefault();

    if (!createCustomerForm.name.trim()) {
      setCreateCustomerError("Customer name is required.");
      return;
    }

    let createdCustomer;

    try {
      createdCustomer = createStoredCustomer({
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
    setSelectedTransactionIds((current) => {
      const nextSet = new Set(current);
      const alreadySelected = nextSet.has(item.id);
      const currentItems = selectableItems.filter((entry) => nextSet.has(entry.id));
      const currentKind = currentItems[0]?.kind;

      if (alreadySelected) {
        nextSet.delete(item.id);
        return Array.from(nextSet);
      }

      if (currentKind && currentKind !== item.kind) {
        return [item.id];
      }

      nextSet.add(item.id);
      return Array.from(nextSet);
    });

    if (item.kind === "payment") {
      setActiveMode("payment");
    } else if (item.kind === "pickup") {
      setActiveMode("pickup");
    }
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

  function removeTransactionItem(itemId) {
    setSelectedTransactionIds((current) => current.filter((id) => id !== itemId));
    setTransactionMessage("");
    setPaymentError("");
  }

  function updateCustomerName(value) {
    setCustomerName(value);
    setLinkedCustomerId("");
    setLinkedCustomerName("");
  }

  function selectProduct(event) {
    const productId = event.target.value;
    const product = products.find((item) => item.id === productId);
    setSelectedProductId(productId);

    if (!product) {
      setLineItem({ name: "", color: "", size: "", qty: "1", unit_price: "" });
      return;
    }

    setLineItem((current) => ({
      ...current,
      name: product.name || "",
      color: product.colors?.[0] || "",
      size: product.sizes?.[0] || "",
      unit_price: product.retail_price || product.price || "",
    }));
  }

  function updateLineItem(event) {
    const { name, value } = event.target;
    setLineItem((current) => ({ ...current, [name]: value }));
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

  function removeCartItem(itemId) {
    setCart((current) => current.filter((item) => item.id !== itemId));
  }

  function saveSale() {
    if (!cart.length) return;

    let sale;

    try {
      sale = createStoredQuickSale({
        customer_id: linkedCustomerId,
        customer_name: customerName.trim() || "Walk-in Customer",
        payment_method: quickSalePaymentMethod,
        payment_status: quickSalePaymentMethod === "Pay Later" ? "Unpaid" : "Paid",
        amount_paid: quickSalePaymentMethod === "Pay Later" ? 0 : total,
        balance_due: quickSalePaymentMethod === "Pay Later" ? total : 0,
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

  function handleRecordCounterPayment(event) {
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

    try {
      paymentEntries.forEach((entry) => {
        let entryRemaining = Number(entry.amount || 0);
        if (entryRemaining <= 0) return;

        selectedTransactionItems.forEach((item) => {
          if (entryRemaining <= 0) return;

          const orderRemaining = Number(orderBalanceRemaining.get(item.orderNumber) || 0);
          if (orderRemaining <= 0) return;

          const amountForOrder = Math.min(entryRemaining, orderRemaining);
          if (amountForOrder <= 0) return;

          const updatedOrder = recordStoredOrderPayment(item.orderNumber, {
            amount: amountForOrder,
            method: entry.method,
            note: entry.note,
          });

          if (updatedOrder) {
            updatedOrders.push(updatedOrder);
            entryRemaining -= amountForOrder;
            orderBalanceRemaining.set(item.orderNumber, orderRemaining - amountForOrder);
          }
        });
      });
    } catch (error) {
      const message =
        error?.code === "OVERPAYMENT"
          ? "Payment exceeds remaining balance."
          : error?.message || "Unable to save payment.";
      setPaymentError(message);
      alert(message);
      return;
    }

    if (!updatedOrders.length) {
      setPaymentError("No selected orders could be updated.");
      return;
    }

    const readyForRelease = Array.from(
      new Set(
        updatedOrders
          .filter((order) => order.pickup_status === "Ready for Pickup" && Number(order.balance_due || 0) <= 0)
          .map((order) => order.order_number)
      )
    );
    setSelectedTransactionIds([]);
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
    if (readyForRelease.length) {
      setActiveMode("pickup");
    }
    resetPaymentForm("");
  }

  function handleReleasePickupSelection() {
    if (!selectedTransactionItems.length || selectedTransactionKind !== "pickup") return;

    const releasedOrders = [];

    selectedTransactionItems.forEach((item) => {
      const order = item.order;
      if (!order) return;

      const balanceNote =
        Number(order.balance_due || 0) > 0 ? ` Outstanding balance: ${currency(order.balance_due)}.` : "";

      updateStoredOrder(order.order_number, {
        pickup_status: "Picked Up",
        picked_up_at: order.picked_up_at || new Date().toISOString(),
        status: order.status === "Ready for Pickup" ? "Picked Up" : order.status,
        activity_type: "pickup",
        activity_note: `Order marked as picked up.${balanceNote}`,
      });
      releasedOrders.push(order.order_number);
    });

    setSelectedTransactionIds([]);
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
      style={{
        maxWidth: "1480px",
        margin: "0 auto",
        padding: "24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ display: "grid", gap: "20px" }}>
        <section
          style={{
            background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 45%, #eff6ff 100%)",
            border: "1px solid #e2e8f0",
            borderRadius: "24px",
            padding: "24px",
            display: "grid",
            gap: "18px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ maxWidth: "780px" }}>
              <p
                style={{
                  margin: 0,
                  color: "#9a3412",
                  fontSize: "12px",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Front Counter Workspace
              </p>
              <h1 style={{ margin: "8px 0 10px", fontSize: "36px", color: "#0f172a" }}>
                Front Counter
              </h1>
              <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
                Find the customer, select the payment or pickup action, and complete the transaction.
              </p>
            </div>

          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => activateWorkspaceMode("payment")} style={getModeButtonStyle(activeMode === "payment")}>
              Payment Items
            </button>
            <button type="button" onClick={() => activateWorkspaceMode("pickup")} style={getModeButtonStyle(activeMode === "pickup")}>
              Pickup Items
            </button>
            <button type="button" onClick={() => activateWorkspaceMode("quick-sale")} style={getModeButtonStyle(activeMode === "quick-sale")}>
              Quick Sale
            </button>
          </div>
          <p style={{ margin: 0, color: "#475569", maxWidth: "860px" }}>
            <strong style={{ color: "#0f172a" }}>{activeWorkspaceMode.title}.</strong>{" "}
            {activeWorkspaceMode.description}
          </p>
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
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(280px, 340px) minmax(0, 1fr) minmax(320px, 380px)",
                gap: "20px",
                alignItems: "start",
              }}
            >
              <aside style={{ display: "grid", gap: "18px" }}>
                <section style={sectionCardStyle}>
                  <div>
                    <h2 style={{ margin: "0 0 8px", fontSize: "26px", color: "#0f172a" }}>
                      Customer & Transaction Lookup
                    </h2>
                    <p style={{ margin: 0, color: "#64748b", lineHeight: 1.5 }}>
                      Search by customer, phone, email, company, or order number.
                    </p>
                  </div>

                  <div style={{ position: "relative" }}>
                    <input
                      value={lookupQuery}
                      onChange={(event) => handleLookupChange(event.target.value)}
                      placeholder="Search name, phone, email, company, or order #"
                      style={fieldStyle}
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
                              {[customer.phone, customer.email].filter(Boolean).join(" • ") ||
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
                                style={fieldStyle}
                              />
                            </label>
                            <label style={labelStyle}>
                              Phone
                              <input
                                value={createCustomerForm.phone}
                                onChange={(event) => updateCreateCustomerForm("phone", event.target.value)}
                                placeholder="Phone number"
                                style={fieldStyle}
                              />
                            </label>
                            <label style={labelStyle}>
                              Email
                              <input
                                value={createCustomerForm.email}
                                onChange={(event) => updateCreateCustomerForm("email", event.target.value)}
                                placeholder="Email address"
                                style={fieldStyle}
                              />
                            </label>
                            <label style={labelStyle}>
                              Company
                              <input
                                value={createCustomerForm.company}
                                onChange={(event) => updateCreateCustomerForm("company", event.target.value)}
                                placeholder="Company (optional)"
                                style={fieldStyle}
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

                  {selectedCustomer ? (
                    <div
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "18px",
                        padding: "16px",
                        background: "#f8fafc",
                        display: "grid",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "start" }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: "22px", color: "#0f172a" }}>
                            {selectedCustomer.name}
                          </h3>
                          <p style={{ margin: "4px 0 0", color: "#64748b" }}>
                            {selectedCustomer.company || "Customer profile"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCustomer(null);
                            setLookupQuery("");
                            setCustomerMatches([]);
                            setCustomerLookupMessage("");
                            clearTransactionSelection();
                          }}
                          style={{
                            border: "1px solid #cbd5e1",
                            background: "#ffffff",
                            borderRadius: "10px",
                            padding: "8px 10px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Clear
                        </button>
                      </div>

                      <div style={{ display: "grid", gap: "6px", color: "#475569", fontSize: "14px" }}>
                        {selectedCustomer.phone ? <span>{selectedCustomer.phone}</span> : null}
                        {selectedCustomer.email ? <span>{selectedCustomer.email}</span> : null}
                        {selectedCustomer.order_numbers?.length ? (
                          <span>{selectedCustomer.order_numbers.length} linked order records</span>
                        ) : (
                          <span>No linked order numbers stored yet.</span>
                        )}
                        <span>
                          {customerSummary.activeOrders} active orders • {customerSummary.pickupReady} pickup ready • {currency(customerSummary.outstandingBalance)} due
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        border: "1px dashed #cbd5e1",
                        borderRadius: "18px",
                        padding: "18px",
                        color: "#64748b",
                        background: "#f8fafc",
                      }}
                    >
                      Select a customer to open payment or pickup items.
                    </div>
                  )}
                </section>
              </aside>

              <section style={{ ...sectionCardStyle, minHeight: "520px" }}>
                <div>
                  <h2 style={{ margin: "0 0 8px", fontSize: "28px", color: "#0f172a" }}>
                    {activeWorkspaceMode.selectionHeading}
                  </h2>
                  <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
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
                  <div style={{ display: "grid", gap: "14px" }}>
                    {visibleSelectableItems.map((item) => {
                      const tones = getActionToneStyles(item.tone);
                      const isSelected = selectedTransactionIds.includes(item.id);

                      return (
                        <article
                          key={item.id}
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
                                  {item.selectionLabel}
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
                                  {item.kind === "pickup" ? "Pickup" : "Payment"}
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

                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                            <PaymentStatusBadge status={item.order.payment_status || "Draft"} />
                            <PaymentStatusBadge status={item.order.invoice_status || "Draft"} />
                            <span style={{ color: "#475569", fontWeight: 700 }}>
                              Pickup: {item.order.pickup_status || "Pending"}
                            </span>
                            <span style={{ color: "#475569", fontWeight: 700 }}>
                              Paid to date: {currency(item.order.paid_to_date)}
                            </span>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                            <p style={{ margin: 0, color: "#475569" }}>
                              {item.order.deposit_credited_message} {item.order.balance_summary}
                            </p>

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
                                {isSelected ? "Selected" : "Select"}
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

              <aside style={{ display: "grid", gap: "18px" }}>
                <section style={sectionCardStyle}>
                  <div>
                    <h2 style={{ margin: "0 0 8px", fontSize: "24px", color: "#0f172a" }}>
                      Transaction Summary
                    </h2>
                    <p style={{ margin: 0, color: "#64748b" }}>
                      Review the active items, total due, and complete the counter action.
                    </p>
                  </div>

                  {!selectedTransactionItems.length ? (
                    <div
                      style={{
                        border: "1px dashed #cbd5e1",
                        borderRadius: "18px",
                        padding: "18px",
                        background: "#f8fafc",
                        color: "#64748b",
                      }}
                    >
                      Select one or more payment items or pickup releases to build the active
                      counter transaction.
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                        <OperationalStat label="Selected Items" value={transactionSummary.selectedCount} />
                        <OperationalStat
                          label="Transaction Total"
                          value={currency(transactionSummary.amountDue)}
                          emphasis={transactionSummary.amountDue > 0 ? "danger" : "success"}
                        />
                      </div>

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
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center", marginTop: "10px", flexWrap: "wrap" }}>
                              <span style={{ color: "#475569", fontSize: "13px", fontWeight: 700 }}>
                                {item.kind === "pickup" ? "Customer release-ready item" : "Selected for counter payment"}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeTransactionItem(item.id)}
                                style={{
                                  border: "1px solid #fecaca",
                                  background: "#ffffff",
                                  color: "#b91c1c",
                                  borderRadius: "10px",
                                  padding: "8px 10px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                Remove
                              </button>
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
                        Clear Selection
                      </button>
                      {selectedTransactionKind === "payment" ? (
                        <form
                          onSubmit={handleRecordCounterPayment}
                          style={{ display: "grid", gap: "14px", borderTop: "1px solid #e2e8f0", paddingTop: "16px" }}
                        >
                          <div style={{ display: "grid", gap: "10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                              <h3 style={{ margin: 0, fontSize: "17px", color: "#0f172a" }}>
                                Payment Actions
                              </h3>
                              <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                                Remaining {currency(outstandingBalanceAfterPayment)}
                              </span>
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
                                </div>
                                <div style={{ textAlign: "right", display: "grid", gap: "4px" }}>
                                  <span style={{ color: "#475569", fontSize: "12px", fontWeight: 700 }}>
                                    Total Due
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
                                  onChange={(event) => {
                                    setPaymentAmountOverride(event.target.value);
                                    setPaymentAmountOverrideSelection(paymentSelectionKey);
                                    setPaymentError("");
                                  }}
                                  style={{
                                    ...fieldStyle,
                                    border:
                                      paymentError || !paymentValidation.valid || !splitPaymentValidation.valid
                                        ? "1px solid #dc2626"
                                        : fieldStyle.border,
                                    background:
                                      paymentError || !paymentValidation.valid || !splitPaymentValidation.valid
                                        ? "#fff1f2"
                                        : fieldStyle.background,
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
                                      style={fieldStyle}
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
                                  onChange={(event) => setPaymentNote(event.target.value)}
                                  rows={3}
                                  placeholder={activePaymentAction.notePlaceholder}
                                  style={{ ...fieldStyle, resize: "vertical" }}
                                />
                              </label>

                              {paymentError || !paymentValidation.valid || !splitPaymentValidation.valid ? (
                                <p style={{ margin: 0, color: "#b91c1c", fontWeight: 700 }}>
                                  {paymentError || splitPaymentValidation.message || paymentValidation.message}
                                </p>
                              ) : null}

                              <button
                                type="submit"
                                disabled={!paymentValidation.valid || !splitPaymentValidation.valid}
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
                                {activePaymentAction.buttonLabel}
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
                            {transactionSummary.pickupCount} pickup item{transactionSummary.pickupCount === 1 ? "" : "s"} selected and ready to release.
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
                            Release Selected Pickup
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>
              </aside>
            </div>
          </>
        ) : null}

            {activeMode === "quick-sale" ? (
              <form onSubmit={completeSale} style={{ display: "grid", gap: "18px" }}>
                <section id="quick-sale-workflow" style={sectionCardStyle}>
                  <div>
                    <p
                      style={{
                        margin: 0,
                        color: "#78716c",
                        fontSize: "12px",
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      Walk-In Transaction
                    </p>
                    <h2 style={{ margin: "6px 0 8px", fontSize: "30px", color: "#0f172a" }}>
                      Quick Sale
                    </h2>
                    <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
                      Quick Sale stays available for immediate counter purchases while the rest of
                      Front Counter now handles customer lookup, payment collection, and pickup
                      workflow in the same workspace.
                    </p>
                  </div>

                  <section
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "18px",
                      padding: "18px",
                    }}
                  >
                    <h3 style={{ margin: "0 0 12px", fontSize: "20px" }}>Customer & Payment</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                      <label style={labelStyle}>
                        Customer Name <span style={{ color: "#78716c", fontWeight: 500 }}>(optional)</span>
                        <input
                          value={customerName}
                          onChange={(event) => updateCustomerName(event.target.value)}
                          placeholder="Walk-in Customer"
                          style={fieldStyle}
                        />
                      </label>
                      <label style={labelStyle}>
                        Payment Method
                        <select
                          value={quickSalePaymentMethod}
                          onChange={(event) => setQuickSalePaymentMethod(event.target.value)}
                          style={fieldStyle}
                        >
                          {quickSalePaymentMethods.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {linkedCustomerId ? (
                      <p style={{ margin: "12px 0 0", color: "#166534", fontWeight: 700 }}>
                        Linked to existing customer: {linkedCustomerName}
                      </p>
                    ) : (
                      <p style={{ margin: "12px 0 0", color: "#64748b", fontWeight: 700 }}>
                        Use the customer lookup mode first if this quick sale should stay tied to a
                        saved customer profile.
                      </p>
                    )}
                  </section>

                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 0.8fr)", gap: "18px", alignItems: "start" }}>
                    <section
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "18px",
                        padding: "18px",
                      }}
                    >
                      <h3 style={{ margin: "0 0 12px", fontSize: "20px" }}>Add Item</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
                        <label style={labelStyle}>
                          Product
                          <select
                            ref={productSelectRef}
                            value={selectedProductId}
                            onChange={selectProduct}
                            onKeyDown={handleLineItemKeyDown}
                            style={fieldStyle}
                          >
                            <option value="">Select product or type manually...</option>
                            {products.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                                {product.brand_model ? ` (${product.brand_model})` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={labelStyle}>
                          Item Name
                          <input
                            name="name"
                            value={lineItem.name}
                            onChange={updateLineItem}
                            onKeyDown={handleLineItemKeyDown}
                            placeholder="T-Shirt"
                            style={fieldStyle}
                          />
                        </label>
                        <label style={labelStyle}>
                          Color
                          {selectedProduct?.colors?.length ? (
                            <select
                              name="color"
                              value={lineItem.color}
                              onChange={updateLineItem}
                              onKeyDown={handleLineItemKeyDown}
                              style={fieldStyle}
                            >
                              {selectedProduct.colors.map((color) => (
                                <option key={color}>{color}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              name="color"
                              value={lineItem.color}
                              onChange={updateLineItem}
                              onKeyDown={handleLineItemKeyDown}
                              placeholder="Black"
                              style={fieldStyle}
                            />
                          )}
                        </label>
                        <label style={labelStyle}>
                          Size
                          {selectedProduct?.sizes?.length ? (
                            <select
                              name="size"
                              value={lineItem.size}
                              onChange={updateLineItem}
                              onKeyDown={handleLineItemKeyDown}
                              style={fieldStyle}
                            >
                              {selectedProduct.sizes.map((size) => (
                                <option key={size}>{size}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              name="size"
                              value={lineItem.size}
                              onChange={updateLineItem}
                              onKeyDown={handleLineItemKeyDown}
                              placeholder="L"
                              style={fieldStyle}
                            />
                          )}
                        </label>
                        <label style={labelStyle}>
                          Qty
                          <input
                            type="number"
                            min="1"
                            name="qty"
                            value={lineItem.qty}
                            onChange={updateLineItem}
                            onKeyDown={handleLineItemKeyDown}
                            style={fieldStyle}
                          />
                        </label>
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
                            style={fieldStyle}
                          />
                        </label>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
                        <button
                          type="button"
                          onClick={addToCart}
                          disabled={!canAddItem}
                          style={{
                            background: canAddItem ? "#171717" : "#a8a29e",
                            color: "#ffffff",
                            border: "none",
                            borderRadius: "12px",
                            padding: "13px 18px",
                            cursor: canAddItem ? "pointer" : "not-allowed",
                            fontWeight: 700,
                          }}
                        >
                          Add to Cart
                        </button>
                      </div>
                    </section>

                    <aside
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: "18px",
                        padding: "18px",
                        background: "#ffffff",
                        position: "sticky",
                        top: "18px",
                      }}
                    >
                      <h3 style={{ margin: "0 0 12px", fontSize: "20px" }}>Cart</h3>
                      {cart.length ? (
                        <div style={{ display: "grid", gap: "10px" }}>
                          {cart.map((item) => (
                            <div key={item.id} style={{ border: "1px solid #e7e5e4", borderRadius: "12px", padding: "10px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px" }}>
                                <strong>{item.name}</strong>
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
                              <p style={{ margin: "4px 0", color: "#64748b", fontSize: "14px" }}>
                                {[item.color, item.size].filter(Boolean).join(" • ") || "No variant"}
                              </p>
                              <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "8px", alignItems: "end" }}>
                                <label style={{ display: "grid", gap: "5px", color: "#64748b", fontSize: "12px", fontWeight: 700 }}>
                                  Qty
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.qty}
                                    onChange={(event) => updateCartItem(item.id, "qty", event.target.value)}
                                    onKeyDown={handleCartEditKeyDown}
                                    style={compactFieldStyle}
                                  />
                                </label>
                                <label style={{ display: "grid", gap: "5px", color: "#64748b", fontSize: "12px", fontWeight: 700 }}>
                                  Unit Price
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={item.unit_price}
                                    onChange={(event) =>
                                      updateCartItem(item.id, "unit_price", event.target.value)
                                    }
                                    onKeyDown={handleCartEditKeyDown}
                                    style={compactFieldStyle}
                                  />
                                </label>
                              </div>
                              <p style={{ margin: "8px 0 0", color: "#292524" }}>
                                Line Total: <strong>{currency(item.line_total)}</strong>
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: "#64748b", marginTop: 0 }}>No items added yet.</p>
                      )}
                      <div style={{ borderTop: "1px solid #e2e8f0", marginTop: "16px", paddingTop: "14px", display: "grid", gap: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>Subtotal</span>
                          <strong>{currency(subtotal)}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>Tax (13%)</span>
                          <strong>{currency(taxTotal)}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "20px" }}>
                          <span>Total</span>
                          <strong>{currency(total)}</strong>
                        </div>
                      </div>
                    </aside>
                  </div>

                  <label style={labelStyle}>
                    Notes
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Optional sale note, counter note, or payment reference."
                      style={{ ...fieldStyle, minHeight: "86px", resize: "vertical" }}
                    />
                  </label>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => navigate("/admin")}
                      style={{
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        borderRadius: "12px",
                        padding: "13px 18px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!canCompleteSale}
                      style={{
                        background: canCompleteSale ? "#171717" : "#a8a29e",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "12px",
                        padding: "13px 18px",
                        cursor: canCompleteSale ? "pointer" : "not-allowed",
                        fontWeight: 700,
                      }}
                    >
                      Complete Quick Sale
                    </button>
                  </div>
                </section>
              </form>
            ) : null}
        </div>
    </div>
  );
}
