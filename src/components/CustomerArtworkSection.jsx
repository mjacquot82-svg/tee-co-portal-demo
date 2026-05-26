import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import {
  getArtworkUploadAcceptValue,
  isSupportedArtworkFile,
  listCustomerArtwork,
  uploadCustomerArtwork,
} from "../services/customerArtworkService";

const sectionCardStyle = {
  background: "#ffffff",
  borderRadius: "20px",
  padding: "22px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

function formatDateTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildFileTypeLabel(fileName) {
  const normalizedName = String(fileName || "").trim();
  const segments = normalizedName.split(".");
  const extension = segments.length > 1 ? segments.pop() : "";
  return extension ? extension.toUpperCase() : "FILE";
}

export default function CustomerArtworkSection({ customerId, customerName = "" }) {
  const fileInputRef = useRef(null);
  const [artwork, setArtwork] = useState([]);
  const [loadState, setLoadState] = useState("idle");
  const [uploadState, setUploadState] = useState("idle");
  const [loadError, setLoadError] = useState("");
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadArtwork() {
      if (!customerId) {
        if (isActive) {
          setArtwork([]);
          setLoadState("idle");
          setLoadError("");
        }
        return;
      }

      if (!isSupabaseConfigured) {
        if (isActive) {
          setArtwork([]);
          setLoadState("idle");
          setLoadError("Supabase is not configured for artwork uploads in this workspace.");
        }
        return;
      }

      if (isActive) {
        setLoadState("loading");
        setLoadError("");
      }

      try {
        const loadedArtwork = await listCustomerArtwork(customerId);
        if (!isActive) return;
        setArtwork(loadedArtwork);
        setLoadState("loaded");
      } catch (error) {
        if (!isActive) return;
        console.error("Unable to load customer artwork", error);
        setArtwork([]);
        setLoadState("error");
        setLoadError(error?.message || "Unable to load artwork right now.");
      }
    }

    loadArtwork();

    return () => {
      isActive = false;
    };
  }, [customerId]);

  async function handleFileSelection(event) {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";

    if (!selectedFile || uploadState === "uploading") return;

    if (!isSupportedArtworkFile(selectedFile)) {
      setUploadError("Supported artwork formats are PNG, JPG, PDF, SVG, and AI.");
      return;
    }

    setUploadState("uploading");
    setUploadError("");

    try {
      const uploadedArtwork = await uploadCustomerArtwork(customerId, selectedFile);
      setArtwork((currentArtwork) => [uploadedArtwork, ...currentArtwork]);
    } catch (error) {
      console.error("Unable to upload customer artwork", error);
      setUploadError(error?.message || "Unable to upload artwork right now.");
    } finally {
      setUploadState("idle");
    }
  }

  return (
    <section style={sectionCardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "14px",
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Artwork</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b" }}>
            Upload and reuse customer art files from one operational record.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <strong>{artwork.length} file{artwork.length === 1 ? "" : "s"}</strong>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isSupabaseConfigured || uploadState === "uploading"}
            style={{
              border: "none",
              background: "#171717",
              color: "#ffffff",
              borderRadius: "12px",
              padding: "11px 14px",
              fontWeight: 700,
              cursor:
                !isSupabaseConfigured || uploadState === "uploading"
                  ? "not-allowed"
                  : "pointer",
              opacity: !isSupabaseConfigured || uploadState === "uploading" ? 0.7 : 1,
            }}
          >
            {uploadState === "uploading" ? "Uploading..." : "Upload Artwork"}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={getArtworkUploadAcceptValue()}
        onChange={handleFileSelection}
        style={{ display: "none" }}
      />

      <div
        style={{
          marginBottom: "14px",
          borderRadius: "14px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          padding: "12px 14px",
          color: "#475569",
          fontSize: "13px",
        }}
      >
        Supported formats: PNG, JPG, PDF, SVG, and AI. Files are stored under this customer record
        {customerName ? ` for ${customerName}` : ""}.
      </div>

      {uploadError ? (
        <div
          style={{
            marginBottom: "14px",
            border: "1px solid #fecaca",
            background: "#fff1f2",
            color: "#9f1239",
            borderRadius: "14px",
            padding: "12px 14px",
            fontWeight: 600,
          }}
        >
          {uploadError}
        </div>
      ) : null}

      {loadError ? (
        <div
          style={{
            border: "1px solid #fecaca",
            background: "#fff1f2",
            color: "#9f1239",
            borderRadius: "14px",
            padding: "12px 14px",
            fontWeight: 600,
          }}
        >
          {loadError}
        </div>
      ) : loadState === "loading" ? (
        <p style={{ margin: 0, color: "#64748b" }}>Loading artwork library...</p>
      ) : artwork.length ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "14px",
          }}
        >
          {artwork.map((file) => (
            <article
              key={file.id}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "16px",
                padding: "12px",
                background: "#f8fafc",
              }}
            >
              <div
                style={{
                  height: "140px",
                  borderRadius: "12px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  color: "#64748b",
                  marginBottom: "10px",
                }}
              >
                {file.is_previewable_image && file.preview_url ? (
                  <img
                    src={file.preview_url}
                    alt={file.file_name}
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gap: "6px",
                      justifyItems: "center",
                      textAlign: "center",
                      padding: "14px",
                    }}
                  >
                    <strong style={{ fontSize: "18px", color: "#0f172a" }}>
                      {buildFileTypeLabel(file.file_name)}
                    </strong>
                    <span style={{ fontSize: "12px" }}>Preview not available</span>
                  </div>
                )}
              </div>

              <strong
                style={{
                  display: "block",
                  fontSize: "14px",
                  overflowWrap: "anywhere",
                }}
              >
                {file.file_name}
              </strong>

              <span style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                Uploaded {formatDateTime(file.uploaded_at) || "—"}
              </span>

              {file.uploaded_by ? (
                <span
                  style={{ display: "block", color: "#64748b", fontSize: "12px", marginTop: "4px" }}
                >
                  By {file.uploaded_by}
                </span>
              ) : null}

              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "10px" }}>
                {file.open_url ? (
                  <a
                    href={file.open_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a" }}
                  >
                    Open
                  </a>
                ) : null}
                {file.download_url ? (
                  <a
                    href={file.download_url}
                    download={file.file_name}
                    style={{ fontSize: "12px", fontWeight: 800, color: "#0f172a" }}
                  >
                    Download
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, color: "#94a3b8" }}>
          No artwork has been uploaded for this customer yet.
        </p>
      )}
    </section>
  );
}
