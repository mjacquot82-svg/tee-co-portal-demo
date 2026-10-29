// SMS usage cap guard (optional add-on). Only used when the scheduled SMS
// dispatcher runs with SMS_USAGE_CAP_ENABLED=true.

export const SMS_USAGE_RPCS = Object.freeze({
  reserve: "sms_usage_reserve",
  release: "sms_usage_release",
});

export const SMS_CAP_FAILURE_CODE = "sms_monthly_cap_reached";

async function call(client, name, parameters) {
  if (!client?.rpc) throw new Error("SMS usage guard requires an RPC client.");
  const { data, error } = await client.rpc(name, parameters);
  if (error) throw error;
  return data;
}

export function reserveSmsUsage({ deliveryId, attemptId, now }, client) {
  return call(client, SMS_USAGE_RPCS.reserve, {
    p_delivery_id: deliveryId,
    p_attempt_id: attemptId,
    p_now: now,
  });
}

export function releaseSmsUsage({ attemptId }, client) {
  return call(client, SMS_USAGE_RPCS.release, { p_attempt_id: attemptId });
}

// A failed send is un-counted unless Twilio may still have accepted it.
export function shouldReleaseAfterResult(result) {
  return (
    result?.status === "failed" && result?.retryability !== "indeterminate"
  );
}

export function buildCapSkipResult(reservation) {
  const fallback =
    reservation?.email_fallback === "email_delivery_present"
      ? "Customer email for this notification is still sent."
      : "No email address/delivery available for this notification.";
  return {
    status: "failed",
    retryability: "terminal",
    providerMessageId: null,
    failureCode: SMS_CAP_FAILURE_CODE,
    failureReason: `Monthly SMS cap of ${reservation?.monthly_cap} reached for ${reservation?.month_key}; text not sent. ${fallback}`,
    providerMetadata: {
      provider: "twilio",
      skippedByUsageCap: true,
      monthKey: reservation?.month_key,
      sentCount: reservation?.sent_count,
      monthlyCap: reservation?.monthly_cap,
      emailFallback: reservation?.email_fallback || "",
    },
  };
}
