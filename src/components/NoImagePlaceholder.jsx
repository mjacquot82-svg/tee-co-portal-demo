const DEFAULT_CONTAINER_STYLE = {
  width: "100%",
  height: "100%",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  padding: "16px",
  borderRadius: "inherit",
  border: "1px dashed #cbd5e1",
  background: "linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)",
  color: "#475569",
  textAlign: "center",
};

const DEFAULT_TITLE_STYLE = {
  margin: 0,
  color: "#0f172a",
  fontSize: "14px",
  fontWeight: 800,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  lineHeight: 1.1,
};

const DEFAULT_SUBTITLE_STYLE = {
  margin: 0,
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 700,
  lineHeight: 1.4,
};

export default function NoImagePlaceholder({
  className = "",
  title = "No Image",
  subtitle = "Awaiting upload",
  style,
  titleStyle,
  subtitleStyle,
  ...props
}) {
  return (
    <div
      className={className}
      style={{ ...DEFAULT_CONTAINER_STYLE, ...style }}
      aria-label="No image uploaded"
      {...props}
    >
      <p style={{ ...DEFAULT_TITLE_STYLE, ...titleStyle }}>{title}</p>
      {subtitle ? <p style={{ ...DEFAULT_SUBTITLE_STYLE, ...subtitleStyle }}>{subtitle}</p> : null}
    </div>
  );
}
