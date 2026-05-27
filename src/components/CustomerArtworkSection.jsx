import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import {
  getArtworkUploadAcceptValue,
  isSupportedArtworkFile,
  listCustomerArtwork,
  uploadCustomerArtwork,
} from "../services/customerArtworkService";
import "./CustomerArtworkSection.css";

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

function buildFileTypeGlyph(extension) {
  switch (String(extension || "").toLowerCase()) {
    case "pdf":
      return "PDF";
    case "svg":
      return "SVG";
    case "ai":
      return "AI";
    case "png":
    case "jpg":
    case "jpeg":
      return "IMG";
    default:
      return "FILE";
  }
}

function ArtworkPreview({ file }) {
  if (file.is_previewable_image && file.preview_url) {
    return <img src={file.preview_url} alt={file.file_name} className="customer-artwork-preview-image" />;
  }

  return (
    <div className="customer-artwork-preview-placeholder" aria-hidden="true">
      <span className="customer-artwork-preview-glyph">
        {buildFileTypeGlyph(file.file_extension)}
      </span>
      <span className="customer-artwork-preview-label">
        {buildFileTypeLabel(file.file_name)}
      </span>
    </div>
  );
}

function ArtworkSkeletonCard() {
  return (
    <article className="customer-artwork-card customer-artwork-card-skeleton" aria-hidden="true">
      <div className="customer-artwork-preview-shell customer-artwork-skeleton-block" />
      <div className="customer-artwork-card-body">
        <div className="customer-artwork-skeleton-line customer-artwork-skeleton-line-title" />
        <div className="customer-artwork-skeleton-line customer-artwork-skeleton-line-date" />
        <div className="customer-artwork-card-actions">
          <div className="customer-artwork-skeleton-pill" />
          <div className="customer-artwork-skeleton-pill" />
        </div>
      </div>
    </article>
  );
}

function ArtworkLibrary({ artwork, uploading }) {
  return (
    <div className="customer-artwork-library-scroll">
      <div className="customer-artwork-grid">
        {uploading ? <ArtworkSkeletonCard /> : null}
        {artwork.map((file) => (
          <article key={file.id} className="customer-artwork-card">
            <div className="customer-artwork-preview-shell">
              <ArtworkPreview file={file} />
            </div>

            <div className="customer-artwork-card-body">
              <div className="customer-artwork-card-copy">
                <strong className="customer-artwork-file-name" title={file.file_name}>
                  {file.file_name}
                </strong>
                <span className="customer-artwork-file-date">
                  {formatDateTime(file.uploaded_at) || "Upload date unavailable"}
                </span>
              </div>

              <div className="customer-artwork-card-actions">
                <a
                  href={file.open_url || file.download_url || "#"}
                  target="_blank"
                  rel="noreferrer"
                  className={`customer-artwork-action-link ${
                    file.open_url || file.download_url ? "" : "is-disabled"
                  }`}
                  aria-disabled={!file.open_url && !file.download_url}
                  onClick={(event) => {
                    if (!file.open_url && !file.download_url) event.preventDefault();
                  }}
                >
                  Open
                </a>
                <a
                  href={file.download_url || file.open_url || "#"}
                  download={file.file_name}
                  className={`customer-artwork-action-link ${
                    file.download_url || file.open_url ? "" : "is-disabled"
                  }`}
                  aria-disabled={!file.download_url && !file.open_url}
                  onClick={(event) => {
                    if (!file.download_url && !file.open_url) event.preventDefault();
                  }}
                >
                  Download
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
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

  const isLoading = loadState === "loading";
  const isUploading = uploadState === "uploading";

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
            Compact customer artwork library for quick file lookup and reuse.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <strong>{artwork.length} file{artwork.length === 1 ? "" : "s"}</strong>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!isSupabaseConfigured || isUploading}
            style={{
              border: "none",
              background: "#171717",
              color: "#ffffff",
              borderRadius: "12px",
              padding: "11px 14px",
              fontWeight: 700,
              cursor: !isSupabaseConfigured || isUploading ? "not-allowed" : "pointer",
              opacity: !isSupabaseConfigured || isUploading ? 0.7 : 1,
            }}
          >
            {isUploading ? "Uploading..." : "Upload Artwork"}
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

      <div className="customer-artwork-toolbar">
        <span>
          Supported formats: PNG, JPG, PDF, SVG, and AI. Files are stored under this customer
          record{customerName ? ` for ${customerName}` : ""}.
        </span>
        <span>
          Newest first{artwork.length > 8 ? " • Scroll to browse full history" : ""}.
        </span>
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
      ) : isLoading ? (
        <div className="customer-artwork-grid" aria-label="Loading artwork library">
          <ArtworkSkeletonCard />
          <ArtworkSkeletonCard />
          <ArtworkSkeletonCard />
          <ArtworkSkeletonCard />
        </div>
      ) : artwork.length ? (
        <ArtworkLibrary artwork={artwork} uploading={isUploading} />
      ) : isUploading ? (
        <ArtworkLibrary artwork={artwork} uploading={isUploading} />
      ) : (
        <div className="customer-artwork-empty-state">
          <strong>No artwork uploaded yet.</strong>
          <span>Upload the first customer file to start a reusable artwork library.</span>
        </div>
      )}
    </section>
  );
}
