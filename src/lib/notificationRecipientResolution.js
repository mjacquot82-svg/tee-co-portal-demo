import { getStoredCustomers } from "./customersStore";
import { resolveCustomerForRecord } from "./customerRecordMatching";
import {
  getStoredStaffUsers,
  isProtectedStaffUser,
} from "./staffUsersStore";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function activeStaff(user) {
  return normalizeText(user?.status).toLowerCase() !== "inactive";
}

function customerSnapshot(customer = {}, fallback = {}) {
  const id = normalizeText(customer.id || customer.customer_id || fallback.id);
  return {
    id,
    name: normalizeText(customer.name || fallback.name),
    company: normalizeText(customer.company || fallback.company),
    email: normalizeText(customer.email || fallback.email),
    phone: normalizeText(customer.phone || fallback.phone),
    archived: Boolean(customer.archived),
  };
}

function staffSnapshot(user = {}) {
  return {
    id: normalizeText(user.id),
    name: normalizeText(user.name),
    role: normalizeText(user.role),
    status: normalizeText(user.status) || "Active",
  };
}

function buildCustomerCandidate(context = {}, customers = []) {
  const order = context.order || {};
  const paymentRequest = context.paymentRequest || {};
  const directCustomer = context.customer || {};
  const matchingRecord = {
    ...order,
    customer_id:
      directCustomer.id ||
      directCustomer.customer_id ||
      paymentRequest.customer_id ||
      order.customer_id,
    customer_name:
      context.customerName ||
      directCustomer.name ||
      paymentRequest.metadata?.customer_name ||
      order.customer_name,
    customer_email:
      context.customerEmail || directCustomer.email || order.customer_email,
    phone:
      context.customerPhone || directCustomer.phone || order.customer_phone,
    order_number:
      context.orderNumber ||
      order.order_number ||
      paymentRequest.order_number,
  };
  const matched = resolveCustomerForRecord(matchingRecord, customers);
  const snapshot = customerSnapshot(matched || directCustomer, {
    id:
      matchingRecord.customer_id ||
      `subject:${context.businessEvent?.subjectId || matchingRecord.order_number || "unknown"}`,
    name: matchingRecord.customer_name,
    email: matchingRecord.customer_email,
    phone: matchingRecord.phone,
  });

  return {
    audience: "customer",
    recipientType: "customer",
    recipientKey: snapshot.id || `customer:${matchingRecord.order_number || "unknown"}`,
    snapshot,
    suppressedReason: snapshot.archived ? "customer_archived" : "",
  };
}

function resolveAssignedStaff(context = {}, staffUsers = []) {
  const directStaff = context.staff || {};
  const assignedId = normalizeText(
    context.staffId ||
      directStaff.id ||
      context.order?.assigned_to_staff_id
  );
  if (!assignedId) return [];

  const matched =
    staffUsers.find((user) => normalizeText(user.id) === assignedId) ||
    {
      id: assignedId,
      name:
        context.staffName ||
        directStaff.name ||
        context.order?.assigned_to_staff_name,
      role: directStaff.role || "Staff",
      status: directStaff.status || "Active",
    };
  return [matched];
}

function staffCandidate(user, audience) {
  const snapshot = staffSnapshot(user);
  return {
    audience,
    recipientType: audience === "owner" ? "owner" : "staff",
    recipientKey:
      snapshot.id || `${audience}:${snapshot.name || "unresolved"}`,
    snapshot,
    suppressedReason: activeStaff(user) ? "" : "staff_inactive",
  };
}

function missingAudienceCandidate(audience) {
  return {
    audience,
    recipientType: audience,
    recipientKey: `${audience}:unresolved`,
    snapshot: {
      id: "",
      name: "",
      role: audience === "owner" ? "Owner" : "Staff",
      status: "",
    },
    suppressedReason: "",
  };
}

function destinationFor(channel, candidate) {
  if (channel === "email") {
    const email = normalizeText(candidate.snapshot.email).toLowerCase();
    return {
      destinationKey: email || `missing:email:${candidate.recipientKey}`,
      destinationSnapshot: {
        channel,
        email,
        observationOnly: true,
      },
      deliverable: Boolean(email),
      notDeliverableReason: email ? "" : "missing_email",
    };
  }

  if (channel === "sms") {
    const phone = normalizeText(candidate.snapshot.phone);
    const normalizedPhone = phone.replace(/\D/g, "");
    return {
      destinationKey:
        normalizedPhone || `missing:phone:${candidate.recipientKey}`,
      destinationSnapshot: {
        channel,
        phone,
        normalizedPhone,
        observationOnly: true,
      },
      deliverable: Boolean(normalizedPhone),
      notDeliverableReason: normalizedPhone ? "" : "missing_phone",
    };
  }

  if (channel === "staff") {
    const staffId = normalizeText(candidate.snapshot.id);
    return {
      destinationKey:
        staffId
          ? `staff-inbox:${staffId}`
          : `missing:staff-inbox:${candidate.recipientKey}`,
      destinationSnapshot: {
        channel,
        staffUserId: staffId,
        observationOnly: true,
      },
      deliverable: Boolean(staffId),
      notDeliverableReason: staffId ? "" : "missing_staff_recipient",
    };
  }

  return {
    destinationKey: `missing:${channel}:${candidate.recipientKey}`,
    destinationSnapshot: { channel, observationOnly: true },
    deliverable: false,
    notDeliverableReason: "unsupported_shadow_channel",
  };
}

export async function resolveCanonicalNotificationRecipients({
  policy,
  templateSnapshots,
  context = {},
  customers,
  staffUsers,
}) {
  const resolvedCustomers = Array.isArray(customers)
    ? customers
    : getStoredCustomers();
  const resolvedStaffUsers = Array.isArray(staffUsers)
    ? staffUsers
    : await getStoredStaffUsers();
  const channels = Object.entries(templateSnapshots || {})
    .filter(([, snapshot]) => Boolean(snapshot))
    .map(([channel]) => channel);
  const collections = {};

  for (const channel of channels) {
    const candidates = [];

    if (
      policy.customer_audience_enabled &&
      (channel === "email" || channel === "sms")
    ) {
      candidates.push(buildCustomerCandidate(context, resolvedCustomers));
    }

    if (channel === "staff" && policy.staff_audience_enabled) {
      const assigned = resolveAssignedStaff(context, resolvedStaffUsers);
      const staffAudience = assigned.length
        ? assigned
        : resolvedStaffUsers.filter(
            (user) => activeStaff(user) && !isProtectedStaffUser(user)
          );
      candidates.push(
        ...(staffAudience.length
          ? staffAudience.map((user) => staffCandidate(user, "staff"))
          : [missingAudienceCandidate("staff")])
      );
    }

    if (channel === "staff" && policy.owner_audience_enabled) {
      const owners = resolvedStaffUsers.filter(
        (user) => activeStaff(user) && isProtectedStaffUser(user)
      );
      candidates.push(
        ...(owners.length
          ? owners.map((user) => staffCandidate(user, "owner"))
          : [missingAudienceCandidate("owner")])
      );
    }

    const uniqueCandidates = Array.from(
      new Map(
        candidates.map((candidate) => [
          `${candidate.recipientType}:${candidate.recipientKey}`,
          candidate,
        ])
      ).values()
    );

    collections[channel] = uniqueCandidates.map((candidate) => ({
      ...candidate,
      ...destinationFor(channel, candidate),
    }));
  }

  return collections;
}
