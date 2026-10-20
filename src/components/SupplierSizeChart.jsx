import { useState } from "react";

// Size chart from S&S (measurements in inches). Hidden when S&S has no chart for the garment.
export default function SupplierSizeChart({ chart, title = "Size chart" }) {
  const [open, setOpen] = useState(false);
  const sizes = Array.isArray(chart?.sizes) ? chart.sizes : [];
  const measurements = Array.isArray(chart?.measurements) ? chart.measurements : [];
  if (!sizes.length || !measurements.length) return null;
  const cell = { padding: "6px 8px", borderBottom: "1px solid #e7e5e4", textAlign: "center", whiteSpace: "nowrap" };
  return (
    <div data-testid="garment-size-chart" style={{ width: "100%", border: "1px solid #e7e5e4", borderRadius: "14px", background: "#ffffff" }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "14px", color: "#171717" }}
      >
        <span>{title}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div style={{ overflowX: "auto", padding: "0 14px 12px" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "13px", color: "#292524", minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={{ ...cell, textAlign: "left" }}>Measurement ({chart.unit || "in"})</th>
                {sizes.map((size) => (
                  <th key={size} style={cell}>{size}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {measurements.map((row) => (
                <tr key={row.name}>
                  <th scope="row" style={{ ...cell, textAlign: "left", fontWeight: 500 }}>{row.name}</th>
                  {sizes.map((size) => (
                    <td key={size} style={cell}>{row.values?.[size] || "–"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: "8px 0 0", fontSize: "11px", color: "#78716c" }}>Measurements from S&amp;S Activewear, in inches, garment laid flat where noted.</p>
        </div>
      ) : null}
    </div>
  );
}
