import { Link } from "react-router-dom";
import { categories, garments } from "../data/garments";

function FacebookIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      style={{ width: "18px", height: "18px", fill: "currentColor" }}
    >
      <path d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.56c0-.93.26-1.56 1.6-1.56H16.8V4.14c-.3-.04-1.34-.14-2.56-.14-2.54 0-4.28 1.55-4.28 4.4v2.2H7.08v3.2h2.88V22h3.54Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      style={{ width: "18px", height: "18px", fill: "none", stroke: "currentColor", strokeWidth: 1.8 }}
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function Home() {
  function getCategoryImage(categoryName) {
    const firstGarment = garments.find((g) => g.category === categoryName);
    return firstGarment?.image || "/garments/gildan-softstyle-tee.jpg";
  }

  return (
    <div
      style={{
        maxWidth: "680px",
        margin: "0 auto",
        padding: "12px 14px 26px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "10px",
          marginBottom: "14px",
        }}
      >
        <a
          href="https://www.facebook.com/login/"
          target="_blank"
          rel="noreferrer"
          aria-label="Open Facebook sign in"
          style={{
            width: "40px",
            height: "40px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "999px",
            background: "#ffffff",
            color: "#1877f2",
            border: "1px solid #e7e5e4",
            boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
          }}
        >
          <FacebookIcon />
        </a>

        <a
          href="https://www.instagram.com/accounts/login/"
          target="_blank"
          rel="noreferrer"
          aria-label="Open Instagram log in"
          style={{
            width: "40px",
            height: "40px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "999px",
            background: "#ffffff",
            color: "#e1306c",
            border: "1px solid #e7e5e4",
            boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
          }}
        >
          <InstagramIcon />
        </a>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "16px",
        }}
      >
        {categories.map((category) => (
          <Link
            key={category.id}
            to={`/category/${category.id}`}
            style={{
              textDecoration: "none",
              background: "#ffffff",
              borderRadius: "16px",
              padding: "14px",
              border: "1px solid #e7e5e4",
              boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
              color: "#171717",
              display: "block",
              transition: "transform 0.08s ease",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "120px",
                background: "#fafaf9",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "10px",
                padding: "10px",
              }}
            >
              <img
                src={getCategoryImage(category.name)}
                alt={category.name}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                }}
              />
            </div>

            <h3
              style={{
                margin: 0,
                fontSize: "15px",
                fontWeight: 700,
              }}
            >
              {category.name}
            </h3>

            <p
              style={{
                margin: "4px 0 0 0",
                fontSize: "13px",
                color: "#78716c",
                lineHeight: 1.35,
              }}
            >
              {category.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
