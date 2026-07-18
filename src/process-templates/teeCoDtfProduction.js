export const teeCoDtfProductionTemplate = Object.freeze({
  key: "tee-co-dtf-production",
  name: "DTF Production",
  active: true,
  currentVersion: Object.freeze({
    version: 1,
    status: "published",
    tasks: Object.freeze([
      { key: "order-transfers", name: "Order Transfers", required: true, position: 1 },
      { key: "receive-transfers", name: "Receive Transfers", required: true, position: 2 },
      { key: "prepare-garments", name: "Prepare Garments", required: true, position: 3 },
      { key: "heat-press", name: "Heat Press", required: true, position: 4 },
      { key: "quality-check", name: "Quality Check", required: true, position: 5 },
      { key: "package-order", name: "Package Order", required: true, position: 6 },
      { key: "release-for-pickup", name: "Release for Pickup", required: true, position: 7 },
    ]),
    dependencies: Object.freeze([
      { prerequisiteTaskKey: "order-transfers", dependentTaskKey: "receive-transfers" },
      { prerequisiteTaskKey: "receive-transfers", dependentTaskKey: "prepare-garments" },
      { prerequisiteTaskKey: "prepare-garments", dependentTaskKey: "heat-press" },
      { prerequisiteTaskKey: "heat-press", dependentTaskKey: "quality-check" },
      { prerequisiteTaskKey: "quality-check", dependentTaskKey: "package-order" },
      { prerequisiteTaskKey: "package-order", dependentTaskKey: "release-for-pickup" },
    ]),
  }),
});
