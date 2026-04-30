import { useEffect, useState } from "react";
import {
  createStoredProduct,
  deleteStoredProduct,
  getStoredProducts,
} from "../lib/productsStore";

const fieldStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "15px",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "grid",
  gap: "8px",
  fontWeight: 600,
  color: "#292524",
};

const emptyProduct = {
  name: "",
  category: "Hoodie / Sweater",
  brand_model: "",
  image: "",
  colors: "Black, Navy, Gray, White",
  sizes: "S, M, L, XL, 2XL, 3XL",
  placements: "Left Chest, Front Center, Back Center, Sleeve",
  decoration_types: "Embroidery, Screen Print, DTF Transfer",
  notes: "",
  status: "Active",
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyProduct);

  useEffect(() => {
    setProducts(getStoredProducts());
  }, []);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function updateImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const image = await fileToDataUrl(file);
    setForm((current) => ({ ...current, image }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim()) return;

    createStoredProduct(form);
    setProducts(getStoredProducts());
    setForm(emptyProduct);
  }

  function handleDelete(productId) {
    deleteStoredProduct(productId);
    setProducts(getStoredProducts());
  }

  return (
    <div
      style={{
        maxWidth: "1180px",
        margin: "0 auto",
        padding: "24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(320px, 420px) 1fr",
          gap: "22px",
          alignItems: "start",
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "22px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#78716c",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Product Catalog
          </p>
          <h1 style={{ margin: "6px 0 8px", fontSize: "28px" }}>Add Garment</h1>
          <p style={{ marginTop: 0, color: "#64748b" }}>
            Define the garment image, sizes, decoration methods, and allowed logo placements.
          </p>

          <div style={{ display: "grid", gap: "14px" }}>
            <label style={labelStyle}>
              Garment Name
              <input
                name="name"
                value={form.name}
                onChange={updateField}
                required
                placeholder="Heavy Blend Hoodie"
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Category
              <select name="category" value={form.category} onChange={updateField} style={fieldStyle}>
                <option>Hoodie / Sweater</option>
                <option>T-Shirt</option>
                <option>Hat</option>
                <option>Jacket</option>
                <option>Workwear</option>
                <option>Tool / Hard Good</option>
                <option>Other</option>
              </select>
            </label>

            <label style={labelStyle}>
              Brand / Model (optional)
              <input
                name="brand_model"
                value={form.brand_model}
                onChange={updateField}
                placeholder="Gildan 18500, Richardson 112, etc."
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Garment Image
              <input type="file" accept="image/*" onChange={updateImage} style={fieldStyle} />
            </label>

            {form.image && (
              <img
                src={form.image}
                alt="Selected garment preview"
                style={{
                  width: "100%",
                  maxHeight: "220px",
                  objectFit: "contain",
                  borderRadius: "16px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              />
            )}

            <label style={labelStyle}>
              Available Colors
              <input name="colors" value={form.colors} onChange={updateField} style={fieldStyle} />
            </label>

            <label style={labelStyle}>
              Available Sizes
              <input name="sizes" value={form.sizes} onChange={updateField} style={fieldStyle} />
            </label>

            <label style={labelStyle}>
              Allowed Logo Placements
              <textarea
                name="placements"
                value={form.placements}
                onChange={updateField}
                style={{ ...fieldStyle, minHeight: "74px" }}
              />
            </label>

            <label style={labelStyle}>
              Decoration Methods
              <input
                name="decoration_types"
                value={form.decoration_types}
                onChange={updateField}
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Notes / Restrictions
              <textarea
                name="notes"
                value={form.notes}
                onChange={updateField}
                placeholder="Example: embroidery only on left chest; large back print not recommended."
                style={{ ...fieldStyle, minHeight: "90px" }}
              />
            </label>

            <label style={labelStyle}>
              Status
              <select name="status" value={form.status} onChange={updateField} style={fieldStyle}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </label>

            <button
              type="submit"
              style={{
                background: "#171717",
                color: "#ffffff",
                border: "none",
                borderRadius: "12px",
                padding: "13px 18px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Save Product
            </button>
          </div>
        </form>

        <section
          style={{
            background: "#ffffff",
            borderRadius: "20px",
            padding: "22px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
              marginBottom: "18px",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: "28px" }}>Products</h1>
              <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                These garments will drive order-entry sizes, placements, and image previews.
              </p>
            </div>
            <strong>{products.length} products</strong>
          </div>

          <div style={{ display: "grid", gap: "14px" }}>
            {products.map((product) => (
              <article
                key={product.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr auto",
                  gap: "14px",
                  alignItems: "start",
                  border: "1px solid #e2e8f0",
                  borderRadius: "18px",
                  padding: "14px",
                  background: product.status === "Inactive" ? "#f5f5f4" : "#ffffff",
                }}
              >
                <div
                  style={{
                    height: "110px",
                    borderRadius: "14px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    color: "#94a3b8",
                    fontSize: "13px",
                    textAlign: "center",
                    padding: "8px",
                  }}
                >
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    "No image yet"
                  )}
                </div>

                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: "20px" }}>{product.name}</h2>
                  <p style={{ margin: "0 0 10px", color: "#64748b" }}>
                    {product.category}
                    {product.brand_model ? ` • ${product.brand_model}` : ""}
                  </p>

                  <div style={{ display: "grid", gap: "6px", color: "#334155", fontSize: "14px" }}>
                    <span><strong>Sizes:</strong> {product.sizes?.join(", ") || "—"}</span>
                    <span><strong>Colors:</strong> {product.colors?.join(", ") || "—"}</span>
                    <span><strong>Placements:</strong> {product.placements?.join(", ") || "—"}</span>
                    <span><strong>Decoration:</strong> {product.decoration_types?.join(", ") || "—"}</span>
                    {product.notes && <span><strong>Notes:</strong> {product.notes}</span>}
                  </div>
                </div>

                <div style={{ display: "grid", gap: "8px", justifyItems: "end" }}>
                  <span
                    style={{
                      borderRadius: "999px",
                      padding: "6px 10px",
                      background: product.status === "Active" ? "#dcfce7" : "#e7e5e4",
                      color: product.status === "Active" ? "#166534" : "#57534e",
                      fontWeight: 700,
                      fontSize: "12px",
                    }}
                  >
                    {product.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDelete(product.id)}
                    style={{
                      background: "#ffffff",
                      border: "1px solid #fecaca",
                      color: "#991b1b",
                      borderRadius: "10px",
                      padding: "8px 10px",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
