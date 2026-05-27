import {
  getOperationalProgressStageIndex,
  isOnHoldOperationalStatus,
  OPERATIONAL_STATUS_PROGRESS_STAGES,
} from "../orders/orderWorkflow";

export default function ProductionProgressTracker({ order }) {
  const currentStage = Math.max(0, getOperationalProgressStageIndex(order.status));
  const isOnHold = isOnHoldOperationalStatus(order.status);

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "20px",
        padding: "18px",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Production Workflow</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "10px",
        }}
      >
        {OPERATIONAL_STATUS_PROGRESS_STAGES.map((stage, index) => {
          const complete = index < currentStage;
          const active = index === currentStage;

          return (
            <div
              key={stage}
              style={{
                border: active
                  ? isOnHold
                    ? "1px solid #b91c1c"
                    : "1px solid #171717"
                  : complete
                  ? "1px solid #86efac"
                  : "1px solid #e2e8f0",
                background: active
                  ? isOnHold
                    ? "#b91c1c"
                    : "#171717"
                  : complete
                  ? "#ecfdf5"
                  : "#f8fafc",
                color: active
                  ? "#ffffff"
                  : complete
                  ? "#166534"
                  : "#64748b",
                borderRadius: "14px",
                padding: "12px",
                textAlign: "center",
                fontWeight: 800,
              }}
            >
              {stage}
            </div>
          );
        })}
      </div>

      {isOnHold ? (
        <div
          style={{
            marginTop: "12px",
            borderRadius: "14px",
            border: "1px solid #fecaca",
            background: "#fef2f2",
            padding: "12px 14px",
            color: "#991b1b",
            fontWeight: 700,
          }}
        >
          This order is currently on hold. Resume it from the workflow actions when production can continue.
        </div>
      ) : null}
    </section>
  );
}
