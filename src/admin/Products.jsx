import { useEffect, useMemo, useState } from "react";
import {
  createStoredProduct,
  deleteStoredProduct,
  getStoredProducts,
} from "../lib/productsStore";

const brandModelOptions = [
  "Gildan 5000",
  "Gildan 64000",
  "Gildan 18500",
  "Gildan 18000",
  "ATC Everyday Tee",
  "ATC Pro Team Hoodie",
  "Bella + Canvas 3001",
  "Independent Trading Co. SS4500",
  "Richardson 112",
  "Flexfit 6277",
  "Yupoong 6606",
  "Carhartt Workwear",
  "Other / Custom",
];

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
  product_type: "",
  brand_model: "Gildan 18500",
  custom_brand_model: "",
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

  const [categoryFilter, setCategoryFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [brandFilter, setBrandFilter] = useState("All");
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => {
    setProducts(getStoredProducts());
  }, []);

  const categories = useMemo(() => {
    const unique = new Set(products.map((p) => p.category));
    return ["All", ...Array.from(unique)];
  }, [products]);

  const productTypes = useMemo(() => {
    const filtered = categoryFilter === "All"
      ? products
      : products.filter((p) => p.category === categoryFilter);

    const unique = new Set(filtered.map((p) => p.product_type));
    return ["All", ...Array.from(unique)];
  }, [products, categoryFilter]);

  const brands = useMemo(() => {
    const filtered = products.filter((product) => {
      const matchesCategory = categoryFilter === "All" || product.category === categoryFilter;
      const matchesType = typeFilter === "All" || product.product_type === typeFilter;
      return matchesCategory && matchesType;
    });

    const unique = new Set(filtered.map((p) => p.brand_model).filter(Boolean));
    return ["All", ...Array.from(unique)];
  }, [products, categoryFilter, typeFilter]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory = categoryFilter === "All" || product.category === categoryFilter;
      const matchesType = typeFilter === "All" || product.product_type === typeFilter;
      const matchesBrand = brandFilter === "All" || product.brand_model === brandFilter;

      const matchesSearch =
        !searchFilter ||
        product.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        product.brand_model?.toLowerCase().includes(searchFilter.toLowerCase());

      return matchesCategory && matchesType && matchesBrand && matchesSearch;
    });
  }, [products, categoryFilter, typeFilter, brandFilter, searchFilter]);

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

    const productInput = {
      ...form,
      brand_model:
        form.brand_model === "Other / Custom"
          ? form.custom_brand_model.trim()
          : form.brand_model,
    };

    createStoredProduct(productInput);
    const updated = getStoredProducts();
    setProducts(updated);
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
              Product Type
              <input
                name="product_type"
                value={form.product_type}
                onChange={updateField}
                placeholder="Pullover Hoodie / Snapback / Safety Vest"
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Brand / Model
              <select name="brand_model" value={form.brand_model} onChange={updateField} style={fieldStyle}>
                {brandModelOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>

            {form.brand_model === "Other / Custom" && (
              <label style={labelStyle}>
                Custom Brand / Model
                <input
                  name="custom_brand_model"
                  value={form.custom_brand_model}
                  onChange={updateField}
                  placeholder="Enter custom brand/model"
                  style={fieldStyle}
                />
              </label>
            )}

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
              marginBottom: "12px",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: "28px" }}>Products</h1>
              <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                Filter by category, type, brand, or search.
              </p>
            </div>
            <strong>{filteredProducts.length} shown</strong>
          </div>

          <div style={{ display: "flex", gap: "10px", marginBottom: "18px", flexWrap: "wrap" }}>
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setTypeFilter("All");
                setBrandFilter("All");
              }}
              style={{ ...fieldStyle, maxWidth: "220px" }}
            >
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setBrandFilter("All");
              }}
              style={{ ...fieldStyle, maxWidth: "220px" }}
            >
              {productTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>

            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              style={{ ...fieldStyle, maxWidth: "220px" }}
            >
              {brands.map((brand) => (
                <option key={brand}>{brand}</option>
              ))}
            </select>

            <input
              placeholder="Search product name or model…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{ ...fieldStyle, maxWidth: "280px" }}
            />
          </div>

          <div style={{ display: "grid", gap: "14px" }}>
            {filteredProducts.map((product) => (
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
                    {product.category} • {product.product_type}
                    {product.brand_model ? ` • ${product.brand_model}` : ""}
                  </p>
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
