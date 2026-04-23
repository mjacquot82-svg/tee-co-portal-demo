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
  const previewBoxStyle = {
    width: "100%",
    aspectRatio: "1 / 1",
    background: "#fafaf9",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "10px",
    padding: "10px",
    overflow: "hidden",
  };

  const previewImageStyle = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  };

  const popularGarments = [
    {
      title: "Gildan Softstyle T-Shirt",
      subtitle: "Best for everyday team, brand, and event orders.",
      image: "/garments/gildan-softstyle-tee.jpg",
      to: "/category/tshirts",
    },
    {
      title: "Heavy Blend Hoodie",
      subtitle: "A reliable fleece option for staff, schools, and merch drops.",
      image: "/garments/hoodies.PNG",
      to: "/category/hoodies",
    },
    {
      title: "Richardson 112 Hat",
      subtitle: "Structured trucker style that works well for embroidery.",
      image: "/garments/hat.PNG",
      to: "/category/hats",
    },
  ];

  const orderingSteps = [
    "Upload your artwork",
    "Approve your mockup",
    "Production begins",
    "Pickup or delivery",
  ];

  const reassuranceItems = [
    "No minimums available",
    "Bulk discounts offered",
    "Local production turnaround",
    "Mockups included before printing",
  ];

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
          background: "#ffffff",
          borderRadius: "16px",
          padding: "18px",
          border: "1px solid #e7e5e4",
          boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
          marginBottom: "18px",
        }}
      >
        <p
          style={{
            margin: "0 0 6px 0",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "#78716c",
            textTransform: "uppercase",
          }}
        >
          Custom Apparel Made Simple
        </p>

        <h2
          style={{
            margin: "0 0 6px 0",
            fontSize: "24px",
            letterSpacing: "-0.02em",
          }}
        >
          Start Your Custom Order
        </h2>

        <p
          style={{
            margin: "0 0 14px 0",
            fontSize: "14px",
            color: "#78716c",
            lineHeight: 1.45,
          }}
        >
          Upload artwork, choose garments, and request a quote in minutes.
        </p>

        <Link
          to="/category/tshirts"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "42px",
            padding: "0 16px",
            borderRadius: "12px",
            background: "#171717",
            color: "#ffffff",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          Start Order
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "16px",
          marginBottom: "22px",
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
            <div style={previewBoxStyle}>
              <img
                src={getCategoryImage(category.name)}
                alt={category.name}
                style={previewImageStyle}
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

      <div style={{ marginBottom: "22px" }}>
        <div style={{ marginBottom: "12px" }}>
          <h2
            style={{
              margin: "0 0 4px 0",
              fontSize: "20px",
              letterSpacing: "-0.02em",
            }}
          >
            Popular Garments
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: "#78716c",
            }}
          >
            Common picks for schools, teams, events, and business merch.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "16px",
          }}
        >
          {popularGarments.map((item) => (
            <Link
              key={item.title}
              to={item.to}
              style={{
                textDecoration: "none",
                background: "#ffffff",
                borderRadius: "16px",
                padding: "14px",
                border: "1px solid #e7e5e4",
                boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
                color: "#171717",
                display: "block",
              }}
            >
              <div style={previewBoxStyle}>
                <img src={item.image} alt={item.title} style={previewImageStyle} />
              </div>

              <h3
                style={{
                  margin: 0,
                  fontSize: "15px",
                  fontWeight: 700,
                  lineHeight: 1.3,
                }}
              >
                {item.title}
              </h3>

              <p
                style={{
                  margin: "4px 0 0 0",
                  fontSize: "13px",
                  color: "#78716c",
                  lineHeight: 1.4,
                }}
              >
                {item.subtitle}
              </p>
            </Link>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: "22px" }}>
        <div style={{ marginBottom: "12px" }}>
          <h2
            style={{
              margin: "0 0 4px 0",
              fontSize: "20px",
              letterSpacing: "-0.02em",
            }}
          >
            How Ordering Works
          </h2>

          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: "#78716c",
            }}
          >
            A straightforward process from artwork to finished apparel.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "12px",
          }}
        >
          {orderingSteps.map((step, index) => (
            <div
              key={step}
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                padding: "14px",
                border: "1px solid #e7e5e4",
                boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "999px",
                  background: "#f5f5f4",
                  color: "#57534e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "13px",
                  fontWeight: 700,
                  marginBottom: "10px",
                }}
              >
                {index + 1}
              </div>

              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#171717",
                  lineHeight: 1.4,
                }}
              >
                {step}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginBottom: "22px",
          padding: "14px",
          background: "#fafaf9",
          borderRadius: "16px",
          border: "1px solid #e7e5e4",
        }}
      >
        {reassuranceItems.map((item) => (
          <div
            key={item}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 10px",
              borderRadius: "999px",
              background: "#ffffff",
              border: "1px solid #e7e5e4",
              color: "#57534e",
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "999px",
                background: "#a8a29e",
                display: "inline-block",
              }}
            />
            {item}
          </div>
        ))}
      </div>

      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          padding: "18px",
          border: "1px solid #e7e5e4",
          boxShadow: "0 8px 18px rgba(0,0,0,0.05)",
        }}
      >
        <h2
          style={{
            margin: "0 0 6px 0",
            fontSize: "20px",
            letterSpacing: "-0.02em",
          }}
        >
          Need help choosing garments?
        </h2>

        <p
          style={{
            margin: "0 0 14px 0",
            fontSize: "14px",
            color: "#78716c",
            lineHeight: 1.45,
          }}
        >
          Contact us and we&apos;ll help you select the best option for your
          order.
        </p>

        <Link
          to="/login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "42px",
            padding: "0 16px",
            borderRadius: "12px",
            background: "#ffffff",
            color: "#171717",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 700,
            border: "1px solid #d6d3d1",
          }}
        >
          Contact Us
        </Link>
      </div>
    </div>
  );
}
