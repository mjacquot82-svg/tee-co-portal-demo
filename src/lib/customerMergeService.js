import { createOperationalEvent } from "./operationalEventsStore";
import {
  getAllCustomerArtwork,
  reassignStoredArtworkCustomer,
} from "./customerArtworkStore";
import { customerIdsEqual, normalizeCustomerId } from "./customerIds";
import { matchesCustomerRecord } from "./customerRecordMatching";
import {
  getStoredCustomers,
  saveStoredCustomers,
  updateStoredCustomer,
} from "./customersStore";
import { getStoredOrders, saveStoredOrders } from "./ordersStore";
import {
  listCustomerTimelineEvents,
  saveCustomerTimelineEvents,
} from "./customerTimelineStore";
import {
  getStoredQuickSales,
  saveStoredQuickSales,
} from "./salesStore";
import { reassignCustomerArtworkRecords } from "../services/customerArtworkService";

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function mergeNotes(primaryNotes, duplicateNotes, duplicateCustomerName) {
  const normalizedPrimaryNotes = String(primaryNotes || "").trim();
  const normalizedDuplicateNotes = String(duplicateNotes || "").trim();

  if (!normalizedDuplicateNotes) {
    return normalizedPrimaryNotes;
  }

  if (!normalizedPrimaryNotes) {
    return normalizedDuplicateNotes;
  }

  if (normalizedPrimaryNotes === normalizedDuplicateNotes) {
    return normalizedPrimaryNotes;
  }

  return `${normalizedPrimaryNotes}\n\nMerged duplicate notes from ${duplicateCustomerName || "duplicate customer"}:\n${normalizedDuplicateNotes}`;
}

function buildMergedCustomerRecord(primaryCustomer, duplicateCustomer, orderNumbers, mergedAt) {
  return {
    ...primaryCustomer,
    company: primaryCustomer.company || duplicateCustomer.company || "",
    phone: primaryCustomer.phone || duplicateCustomer.phone || "",
    email: primaryCustomer.email || duplicateCustomer.email || "",
    notes: mergeNotes(primaryCustomer.notes, duplicateCustomer.notes, duplicateCustomer.name),
    order_numbers: uniqueStrings([
      ...(primaryCustomer.order_numbers || []),
      ...(duplicateCustomer.order_numbers || []),
      ...orderNumbers,
    ]),
    merged_customer_ids: uniqueStrings([
      ...(primaryCustomer.merged_customer_ids || []),
      duplicateCustomer.id,
      ...(duplicateCustomer.merged_customer_ids || []),
    ]),
    updated_at: mergedAt,
  };
}

function buildArchivedDuplicateCustomer(primaryCustomer, duplicateCustomer, mergedAt) {
  return {
    ...duplicateCustomer,
    archived: true,
    archived_at: duplicateCustomer.archived_at || mergedAt,
    merged_into_customer_id: primaryCustomer.id,
    merged_at: mergedAt,
    order_numbers: [],
    updated_at: mergedAt,
  };
}

function recordNeedsCustomerMerge(record, duplicateCustomer, primaryCustomer) {
  if (!record || !duplicateCustomer || !primaryCustomer) {
    return false;
  }

  if (customerIdsEqual(record.customer_id, primaryCustomer.id)) {
    return false;
  }

  return matchesCustomerRecord(duplicateCustomer, record);
}

function buildCustomerMergeCounts(primaryCustomer, duplicateCustomer, context = {}) {
  const orders = Array.isArray(context.orders) ? context.orders : getStoredOrders();
  const sales = Array.isArray(context.sales) ? context.sales : getStoredQuickSales();
  const timelineEvents = Array.isArray(context.timelineEvents)
    ? context.timelineEvents
    : listCustomerTimelineEvents();
  const artwork = Array.isArray(context.artwork) ? context.artwork : getAllCustomerArtwork();

  const affectedOrders = orders.filter((order) =>
    recordNeedsCustomerMerge(order, duplicateCustomer, primaryCustomer)
  );
  const affectedSales = sales.filter((sale) =>
    recordNeedsCustomerMerge(sale, duplicateCustomer, primaryCustomer)
  );
  const affectedTimelineEvents = timelineEvents.filter((event) =>
    customerIdsEqual(event.customerId, duplicateCustomer.id)
  );
  const affectedArtwork = artwork.filter((item) =>
    customerIdsEqual(item.customer_id, duplicateCustomer.id)
  );

  return {
    orders: affectedOrders.filter((order) => order.operational_visible !== false).length,
    quotes: affectedOrders.filter((order) => order.operational_visible === false).length,
    sales: affectedSales.length,
    timelineEvents: affectedTimelineEvents.length,
    artwork: affectedArtwork.length,
    orderNumbers: uniqueStrings(affectedOrders.map((order) => order.order_number)),
    saleNumbers: uniqueStrings(affectedSales.map((sale) => sale.sale_number)),
  };
}

export function previewCustomerMerge(primaryCustomerId, duplicateCustomerId, context = {}) {
  const customers = Array.isArray(context.customers) ? context.customers : getStoredCustomers();
  const primaryCustomer = customers.find((customer) =>
    customerIdsEqual(customer.id, primaryCustomerId)
  );
  const duplicateCustomer = customers.find((customer) =>
    customerIdsEqual(customer.id, duplicateCustomerId)
  );

  if (!primaryCustomer || !duplicateCustomer) {
    return null;
  }

  return {
    primaryCustomer,
    duplicateCustomer,
    counts: buildCustomerMergeCounts(primaryCustomer, duplicateCustomer, context),
  };
}

export async function mergeCustomers({
  primaryCustomerId,
  duplicateCustomerId,
  actor = null,
  confirmationLabel = "",
} = {}) {
  const normalizedPrimaryCustomerId = normalizeCustomerId(primaryCustomerId);
  const normalizedDuplicateCustomerId = normalizeCustomerId(duplicateCustomerId);

  if (!normalizedPrimaryCustomerId || !normalizedDuplicateCustomerId) {
    throw new Error("Both primary and duplicate customer IDs are required.");
  }

  if (customerIdsEqual(normalizedPrimaryCustomerId, normalizedDuplicateCustomerId)) {
    throw new Error("Choose two different customer records before merging.");
  }

  const customers = getStoredCustomers();
  const primaryCustomer = customers.find((customer) =>
    customerIdsEqual(customer.id, normalizedPrimaryCustomerId)
  );
  const duplicateCustomer = customers.find((customer) =>
    customerIdsEqual(customer.id, normalizedDuplicateCustomerId)
  );

  if (!primaryCustomer || !duplicateCustomer) {
    throw new Error("One or both customer records could not be found.");
  }

  if (duplicateCustomer.merged_into_customer_id) {
    throw new Error("That duplicate customer has already been merged.");
  }

  const currentOrders = getStoredOrders();
  const currentSales = getStoredQuickSales();
  const currentTimelineEvents = listCustomerTimelineEvents();
  const currentArtwork = getAllCustomerArtwork();

  const mergedAt = new Date().toISOString();
  const mergePreview = buildCustomerMergeCounts(primaryCustomer, duplicateCustomer, {
    orders: currentOrders,
    sales: currentSales,
    timelineEvents: currentTimelineEvents,
    artwork: currentArtwork,
  });

  const nextOrders = currentOrders.map((order) => {
    if (!recordNeedsCustomerMerge(order, duplicateCustomer, primaryCustomer)) {
      return order;
    }

    return {
      ...order,
      customer_id: normalizedPrimaryCustomerId,
      updated_at: mergedAt,
    };
  });

  const nextSales = currentSales.map((sale) => {
    if (!recordNeedsCustomerMerge(sale, duplicateCustomer, primaryCustomer)) {
      return sale;
    }

    return {
      ...sale,
      customer_id: normalizedPrimaryCustomerId,
      updated_at: mergedAt,
    };
  });

  const nextTimelineEvents = currentTimelineEvents.map((event) =>
    customerIdsEqual(event.customerId, normalizedDuplicateCustomerId)
      ? {
          ...event,
          customerId: normalizedPrimaryCustomerId,
        }
      : event
  );

  const nextPrimaryCustomer = buildMergedCustomerRecord(
    primaryCustomer,
    duplicateCustomer,
    mergePreview.orderNumbers,
    mergedAt
  );
  const nextDuplicateCustomer = buildArchivedDuplicateCustomer(
    primaryCustomer,
    duplicateCustomer,
    mergedAt
  );

  const nextCustomers = customers.map((customer) => {
    if (customerIdsEqual(customer.id, normalizedPrimaryCustomerId)) {
      return nextPrimaryCustomer;
    }

    if (customerIdsEqual(customer.id, normalizedDuplicateCustomerId)) {
      return nextDuplicateCustomer;
    }

    return customer;
  });

  createOperationalEvent({
    event_type: "customer_merge_started",
    workflow_label: "Customer Records",
    reference_type: "customer",
    reference_id: normalizedPrimaryCustomerId,
    reference_label: primaryCustomer.name || normalizedPrimaryCustomerId,
    reference_path: `/admin/customers/${normalizedPrimaryCustomerId}`,
    summary: `Customer merge started: ${duplicateCustomer.name || normalizedDuplicateCustomerId} into ${primaryCustomer.name || normalizedPrimaryCustomerId}.`,
    staff_id: actor?.id || "",
    staff_name: actor?.name || "Unknown Staff",
    staff_role: actor?.role || "",
    created_at: mergedAt,
  });

  saveStoredOrders(nextOrders);
  saveStoredQuickSales(nextSales);
  saveCustomerTimelineEvents(nextTimelineEvents);
  reassignStoredArtworkCustomer(normalizedDuplicateCustomerId, normalizedPrimaryCustomerId);
  saveStoredCustomers(nextCustomers);

  saveCustomerTimelineEvents([
    {
      customerId: normalizedPrimaryCustomerId,
      eventType: "customer_merge_started",
      summary: `Merge started for duplicate customer ${duplicateCustomer.name || normalizedDuplicateCustomerId}.`,
      timestamp: mergedAt,
      actor,
      metadata: {
        primaryCustomerId: normalizedPrimaryCustomerId,
        duplicateCustomerId: normalizedDuplicateCustomerId,
        confirmationLabel,
      },
    },
    {
      customerId: normalizedPrimaryCustomerId,
      eventType: "customer_merged",
      summary: `Merged duplicate customer ${duplicateCustomer.name || normalizedDuplicateCustomerId} into ${primaryCustomer.name || normalizedPrimaryCustomerId}.`,
      timestamp: mergedAt,
      actor,
      metadata: {
        primaryCustomerId: normalizedPrimaryCustomerId,
        duplicateCustomerId: normalizedDuplicateCustomerId,
        migratedOrders: mergePreview.orders,
        migratedQuotes: mergePreview.quotes,
        migratedSales: mergePreview.sales,
        migratedArtwork: mergePreview.artwork,
        migratedTimelineEvents: mergePreview.timelineEvents,
      },
    },
    ...listCustomerTimelineEvents(),
  ]);

  createOperationalEvent({
    event_type: "customer_merged",
    workflow_label: "Customer Records",
    reference_type: "customer",
    reference_id: normalizedPrimaryCustomerId,
    reference_label: primaryCustomer.name || normalizedPrimaryCustomerId,
    reference_path: `/admin/customers/${normalizedPrimaryCustomerId}`,
    summary: `Customer merge completed. ${duplicateCustomer.name || normalizedDuplicateCustomerId} archived under ${primaryCustomer.name || normalizedPrimaryCustomerId}.`,
    staff_id: actor?.id || "",
    staff_name: actor?.name || "Unknown Staff",
    staff_role: actor?.role || "",
    created_at: mergedAt,
  });

  const persistenceResults = await Promise.allSettled([
    updateStoredCustomer(normalizedPrimaryCustomerId, nextPrimaryCustomer, {
      suppressTimelineEvent: true,
    }),
    updateStoredCustomer(normalizedDuplicateCustomerId, nextDuplicateCustomer, {
      suppressTimelineEvent: true,
    }),
    reassignCustomerArtworkRecords(
      normalizedDuplicateCustomerId,
      normalizedPrimaryCustomerId
    ),
  ]);

  const warnings = persistenceResults
    .filter((result) => result.status === "rejected")
    .map((result) => result.reason?.message || "Remote merge persistence failed.");

  return {
    primaryCustomerId: normalizedPrimaryCustomerId,
    duplicateCustomerId: normalizedDuplicateCustomerId,
    mergedAt,
    counts: mergePreview,
    warnings,
  };
}
