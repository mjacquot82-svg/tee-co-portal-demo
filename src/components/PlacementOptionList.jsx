function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

const shellStyles = {
  card: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
  },
  pill: {
    display: "flex",
    flexWrap: "wrap",
    gap: "10px",
  },
};

function buildButtonStyle({ active, variant }) {
  if (variant === "card") {
    return {
      padding: "14px",
      borderRadius: "16px",
      border: active ? "1px solid #171717" : "1px solid #d6d3d1",
      background: active ? "#eef4ff" : "#ffffff",
      color: "#171717",
      cursor: "pointer",
      textAlign: "left",
      display: "grid",
      gap: "6px",
      transition: "border-color 0.12s ease, background 0.12s ease, transform 0.12s ease",
      transform: active ? "translateY(-1px)" : "translateY(0)",
    };
  }

  return {
    padding: "10px 14px",
    borderRadius: "999px",
    border: active ? "2px solid #171717" : "1px solid #d6d3d1",
    background: active ? "#171717" : "#ffffff",
    color: active ? "#ffffff" : "#171717",
    cursor: "pointer",
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
  };
}

export default function PlacementOptionList({
  options = [],
  selectedPlacements = [],
  onToggle,
  variant = "card",
  showPricing = true,
}) {
  if (!options.length) return null;

  return (
    <div style={shellStyles[variant] || shellStyles.card}>
      {options.map((option) => {
        const active = selectedPlacements.includes(option.label);
        const priceLabel = option.isIncluded ? "Included" : `+${money(option.unitPrice)}`;

        return (
          <button
            key={option.id || option.label}
            type="button"
            onClick={() => onToggle(option.label)}
            style={buildButtonStyle({ active, variant })}
          >
            {variant === "card" ? (
              <>
                <span style={{ fontWeight: 700 }}>{option.label}</span>
                {showPricing ? (
                  <small style={{ color: "#64748b", fontSize: "12px" }}>{priceLabel}</small>
                ) : null}
              </>
            ) : (
              <>
                <span>{option.label}</span>
                {showPricing ? (
                  <span style={{ fontSize: "13px", opacity: active ? 0.88 : 0.7 }}>
                    ({priceLabel})
                  </span>
                ) : null}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
