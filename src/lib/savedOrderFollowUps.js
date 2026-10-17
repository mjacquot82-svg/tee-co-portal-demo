// Runs post-save follow-ups for an order that already exists. A failing
// follow-up never un-saves the order: it is logged and returned as a
// customer-safe warning. Pure (no app imports) so it is node-testable.
export async function runSavedOrderFollowUps(orderNumber, actions = []) {
  const followUpWarnings = [];
  for (const { run, warning } of actions) {
    try {
      await run();
    } catch (error) {
      console.error("Saved order needs follow-up", { orderNumber, warning, error });
      if (warning && !followUpWarnings.includes(warning)) followUpWarnings.push(warning);
    }
  }
  return followUpWarnings;
}

export const FOLLOW_UP_WARNINGS = Object.freeze({
  processing: "Order processing needs staff follow-up.",
  timeline: "Your account activity could not be updated.",
  notification: "The order notification could not be confirmed.",
  accountSummary: "Your account summary could not be updated.",
});
