export default function SizeBreakdownEditor({ availableSizes = [], value = {}, onChange }) {
  const entries = Object.entries(value);
  const remainingSizes = availableSizes.filter((size) => !value[size]);

  function addSize() {
    const nextSize = remainingSizes[0];
    if (nextSize) onChange({ ...value, [nextSize]: 1 });
  }

  function changeSize(currentSize, nextSize, quantity) {
    if (!nextSize || (nextSize !== currentSize && value[nextSize])) return;
    const next = { ...value };
    delete next[currentSize];
    next[nextSize] = quantity;
    onChange(next);
  }

  function removeSize(size) {
    const next = { ...value };
    delete next[size];
    onChange(next);
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {entries.map(([size, quantity], index) => (
        <div key={size} data-testid="size-breakdown-row" style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 120px auto", gap: "10px", alignItems: "end", padding: "12px", border: "1px solid #e7e5e4", borderRadius: "12px", background: "#fafaf9" }}>
          <label style={{ display: "grid", gap: "6px", fontWeight: 700 }}>Size
            <select aria-label={`Size row ${index + 1}`} value={size} onChange={(event) => changeSize(size, event.target.value, quantity)} style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid #d6d3d1", background: "#ffffff" }}>
              {availableSizes.map((option) => <option key={option} value={option} disabled={option !== size && Boolean(value[option])}>{option}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: "6px", fontWeight: 700 }}>Quantity
            <input aria-label={`${size} quantity`} type="number" min="1" value={quantity} onChange={(event) => onChange({ ...value, [size]: event.target.value })} style={{ width: "100%", boxSizing: "border-box", padding: "10px", borderRadius: "10px", border: "1px solid #d6d3d1" }} />
          </label>
          <button type="button" onClick={() => removeSize(size)} style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #dc2626", color: "#b91c1c", background: "#ffffff", fontWeight: 700, cursor: "pointer" }}>Remove Size</button>
        </div>
      ))}

      <button type="button" onClick={addSize} disabled={!remainingSizes.length} style={{ justifySelf: "start", minWidth: "150px", padding: "11px 16px", borderRadius: "12px", border: "2px solid #171717", background: remainingSizes.length ? "#171717" : "#e7e5e4", color: remainingSizes.length ? "#ffffff" : "#78716c", fontWeight: 800, cursor: remainingSizes.length ? "pointer" : "not-allowed" }}>
        {remainingSizes.length ? "+ Add Size" : "All Sizes Added"}
      </button>
    </div>
  );
}
