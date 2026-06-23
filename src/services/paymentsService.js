import {
  backfillOrderPaymentsToPayments,
  createPaymentRequest,
  getPaymentRequestById,
  getPaymentEventsByOrder,
  getPaymentRequestsByCustomer,
  getPaymentRequestsByOrder,
  getPaymentsByCustomer,
  getPaymentsByOrder,
  listPaymentEvents,
  listPaymentRequests,
  listPayments,
  recordPayment,
  recordPaymentEvent,
  updatePaymentRequest,
} from "../lib/paymentsStore";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

async function runPaymentOperation(operation, fallbackOperation) {
  if (!isSupabaseConfigured || !supabase) {
    return fallbackOperation();
  }

  try {
    const result = await operation();
    if (result?.error) throw result.error;
    return result?.data ?? result;
  } catch (error) {
    console.error("Payments service fallback triggered", error);
    return fallbackOperation();
  }
}

const paymentsService = {
  createPaymentRequest(input = {}) {
    return runPaymentOperation(
      async () => supabase.from("payment_requests").insert(input).select("*").single(),
      () => createPaymentRequest(input)
    );
  },

  updatePaymentRequest(identifier, updates = {}) {
    return runPaymentOperation(
      async () =>
        supabase
          .from("payment_requests")
          .update(updates)
          .or(`id.eq.${identifier},request_number.eq.${identifier}`)
          .select("*")
          .single(),
      () => updatePaymentRequest(identifier, updates)
    );
  },

  getPaymentRequestById(identifier) {
    return runPaymentOperation(
      async () =>
        supabase
          .from("payment_requests")
          .select("*")
          .or(`id.eq.${identifier},request_number.eq.${identifier}`)
          .single(),
      () => getPaymentRequestById(identifier)
    );
  },

  listPaymentRequests() {
    return runPaymentOperation(
      async () => supabase.from("payment_requests").select("*").order("created_at", { ascending: false }),
      () => listPaymentRequests()
    );
  },

  listPayments() {
    return runPaymentOperation(
      async () => supabase.from("payments").select("*").order("created_at", { ascending: false }),
      () => listPayments()
    );
  },

  listPaymentEvents() {
    return runPaymentOperation(
      async () => supabase.from("payment_events").select("*").order("created_at", { ascending: false }),
      () => listPaymentEvents()
    );
  },

  recordPayment(input = {}) {
    return runPaymentOperation(
      async () => supabase.from("payments").insert(input).select("*").single(),
      () => recordPayment(input)
    );
  },

  recordPaymentEvent(input = {}) {
    return runPaymentOperation(
      async () => supabase.from("payment_events").insert(input).select("*").single(),
      () => recordPaymentEvent(input)
    );
  },

  getPaymentsByOrder(orderNumber) {
    return runPaymentOperation(
      async () => supabase.from("payments").select("*").eq("order_number", orderNumber).order("created_at", { ascending: false }),
      () => getPaymentsByOrder(orderNumber)
    );
  },

  getPaymentRequestsByOrder(orderNumber) {
    return runPaymentOperation(
      async () => supabase.from("payment_requests").select("*").eq("order_number", orderNumber).order("created_at", { ascending: false }),
      () => getPaymentRequestsByOrder(orderNumber)
    );
  },

  getPaymentEventsByOrder(orderNumber) {
    return runPaymentOperation(
      async () => supabase.from("payment_events").select("*").eq("order_number", orderNumber).order("created_at", { ascending: false }),
      () => getPaymentEventsByOrder(orderNumber)
    );
  },

  getPaymentsByCustomer(customerId) {
    return runPaymentOperation(
      async () => supabase.from("payments").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }),
      () => getPaymentsByCustomer(customerId)
    );
  },

  getPaymentRequestsByCustomer(customerId) {
    return runPaymentOperation(
      async () => supabase.from("payment_requests").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }),
      () => getPaymentRequestsByCustomer(customerId)
    );
  },

  backfillOrderPaymentsToPayments(order = {}) {
    return backfillOrderPaymentsToPayments(order);
  },
};

export default paymentsService;
export {
  backfillOrderPaymentsToPayments,
  createPaymentRequest,
  getPaymentRequestById,
  getPaymentEventsByOrder,
  getPaymentRequestsByCustomer,
  getPaymentRequestsByOrder,
  getPaymentsByCustomer,
  getPaymentsByOrder,
  listPaymentEvents,
  listPaymentRequests,
  listPayments,
  recordPayment,
  recordPaymentEvent,
  updatePaymentRequest,
};
