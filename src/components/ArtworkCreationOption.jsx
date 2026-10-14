export default function ArtworkCreationOption({ checked, description, onChange, onDescriptionChange }) {
  return (
    <div style={{ display: "grid", gap: "8px", marginTop: "12px" }}>
      <label style={{ fontWeight: 700 }}>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        {" "}I need Tee &amp; Co to create my artwork
      </label>
      {checked && <>
        <label style={{ display: "grid", gap: "8px", fontWeight: 700 }}>
          Wording and design wanted (required)
          <textarea value={description} onChange={(event) => onDescriptionChange(event.target.value)} rows={3} required
            style={{ width: "100%", boxSizing: "border-box", padding: "12px", border: "1px solid #dbe4ee", borderRadius: "12px", font: "inherit" }} />
        </label>
        <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>Describe the wording, style, colours, and placement you want. Tee &amp; Co will confirm design work and any cost during review. Artwork approval is still required before production.</p>
      </>}
    </div>
  );
}
