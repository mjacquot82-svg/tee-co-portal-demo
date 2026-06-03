import { Link } from "react-router-dom";

const projectCategories = [
  {
    title: "Teamwear",
    description: "Coordinate rosters, sizes, decoration placements, and repeat orders with a project-based quote.",
  },
  {
    title: "Company Uniforms",
    description: "Set up consistent branded apparel for crews, office teams, events, and multi-role staff needs.",
  },
  {
    title: "Screen Printing",
    description: "Plan artwork-driven print runs with placement, quantity, and garment selection handled together.",
  },
  {
    title: "Embroidery",
    description: "Build stitched logo programs for hats, polos, jackets, and branded uniform pieces.",
  },
  {
    title: "Custom Apparel Projects",
    description: "Use the quote workflow when your order needs artwork review, approvals, deposit collection, and production planning.",
  },
];

const workflowSteps = [
  "Select a garment or project starting point",
  "Upload artwork and describe what you need",
  "Receive a quote from Tee & Co",
  "Review, approve, and move into deposit + production",
];

export default function StartProject() {
  return (
    <div
      style={{
        maxWidth: "1180px",
        margin: "0 auto",
        padding: "18px 20px 40px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ marginBottom: "16px" }}>
        <Link
          to="/"
          style={{
            color: "#475569",
            textDecoration: "none",
            fontSize: "13px",
            fontWeight: 700,
          }}
        >
          ← Back to Home
        </Link>
      </div>

      <section
        style={{
          borderRadius: "34px",
          padding: "32px",
          background:
            "radial-gradient(circle at top right, rgba(20,184,166,0.16), transparent 32%), linear-gradient(135deg, #0f172a 0%, #134e4a 100%)",
          color: "#ffffff",
          display: "grid",
          gap: "18px",
          boxShadow: "0 28px 56px rgba(15, 23, 42, 0.16)",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#99f6e4",
          }}
        >
          Start Custom Project
        </p>

        <div style={{ display: "grid", gap: "12px", maxWidth: "760px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "46px",
              lineHeight: 0.95,
              letterSpacing: "-0.04em",
            }}
          >
            Built for decorated apparel, uniforms, and bulk custom work
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "16px",
              lineHeight: 1.75,
              color: "rgba(255,255,255,0.86)",
            }}
          >
            Use this path when the order needs garment selection, artwork review, quote approval,
            deposit collection, and coordinated production. Tee &amp; Co will guide the project
            through the existing quote workflow.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link
            to="/portal/request-order"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "48px",
              borderRadius: "999px",
              padding: "0 20px",
              textDecoration: "none",
              background: "#99f6e4",
              color: "#0f172a",
              fontWeight: 800,
            }}
          >
            Begin Project Request
          </Link>
          <Link
            to="/portal/orders"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "48px",
              borderRadius: "999px",
              padding: "0 20px",
              textDecoration: "none",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.16)",
              color: "#ffffff",
              fontWeight: 800,
            }}
          >
            View Existing Requests
          </Link>
          <Link
            to="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "48px",
              borderRadius: "999px",
              padding: "0 20px",
              textDecoration: "none",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.16)",
              color: "#ffffff",
              fontWeight: 800,
            }}
          >
            Browse Ready-To-Buy Items
          </Link>
        </div>
      </section>

      <section
        style={{
          marginTop: "24px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.25fr) minmax(300px, 0.9fr)",
          gap: "22px",
          alignItems: "start",
        }}
      >
        <div
          style={{
            borderRadius: "28px",
            padding: "26px",
            background: "#ffffff",
            border: "1px solid #dbe4ee",
            boxShadow: "0 18px 38px rgba(15, 23, 42, 0.06)",
          }}
        >
          <div style={{ maxWidth: "720px" }}>
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#0f766e",
              }}
            >
              Best For
            </p>
            <h2
              style={{
                margin: "8px 0 10px",
                color: "#0f172a",
                fontSize: "30px",
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
              }}
            >
              Projects that need planning, artwork, and production coordination
            </h2>
            <p
              style={{
                margin: 0,
                color: "#475569",
                lineHeight: 1.7,
                fontSize: "15px",
              }}
            >
              This is the right path when you are not simply buying fixed-price items off the shelf.
              If the job needs custom decoration or a scoped apparel program, start here.
            </p>
          </div>

          <div
            style={{
              marginTop: "20px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "14px",
            }}
          >
            {projectCategories.map((item) => (
              <article
                key={item.title}
                style={{
                  borderRadius: "22px",
                  border: "1px solid #dbe4ee",
                  background: "#f8fafc",
                  padding: "18px",
                  display: "grid",
                  gap: "8px",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    color: "#0f172a",
                    fontSize: "20px",
                    lineHeight: 1.1,
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    margin: 0,
                    color: "#475569",
                    lineHeight: 1.65,
                    fontSize: "14px",
                  }}
                >
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: "18px",
          }}
        >
          <section
            style={{
              borderRadius: "28px",
              padding: "24px",
              background: "#ffffff",
              border: "1px solid #dbe4ee",
              boxShadow: "0 18px 38px rgba(15, 23, 42, 0.06)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#0f766e",
              }}
            >
              Project Flow
            </p>
            <h2
              style={{
                margin: "8px 0 14px",
                color: "#0f172a",
                fontSize: "26px",
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
              }}
            >
              How the custom path works
            </h2>

            <div style={{ display: "grid", gap: "12px" }}>
              {workflowSteps.map((step, index) => (
                <div
                  key={step}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px minmax(0, 1fr)",
                    gap: "12px",
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "999px",
                      background: "#ccfbf1",
                      color: "#115e59",
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 900,
                    }}
                  >
                    {index + 1}
                  </div>
                  <p style={{ margin: "6px 0 0", color: "#334155", lineHeight: 1.6 }}>
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section
            style={{
              borderRadius: "28px",
              padding: "24px",
              background: "linear-gradient(180deg, #f8fafc 0%, #ecfeff 100%)",
              border: "1px solid #cfe8ea",
            }}
          >
            <h2
              style={{
                margin: "0 0 10px",
                color: "#0f172a",
                fontSize: "24px",
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
              }}
            >
              Ready to brief the project?
            </h2>
            <p
              style={{
                margin: 0,
              color: "#475569",
              lineHeight: 1.7,
              fontSize: "14px",
            }}
          >
              The next step uses Tee &amp; Co&apos;s existing quote-request intake. You can choose a
              product, set quantities, add notes, and send the project into review without changing
              any downstream workflow.
            </p>

            <div style={{ marginTop: "16px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Link
                to="/portal/request-order"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "46px",
                  borderRadius: "999px",
                  padding: "0 18px",
                  textDecoration: "none",
                  fontWeight: 800,
                  background: "#0f766e",
                  color: "#ffffff",
                  boxShadow: "0 16px 28px rgba(15, 118, 110, 0.16)",
                }}
              >
                Start Project Request
              </Link>
              <Link
                to="/portal/orders"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: "46px",
                  borderRadius: "999px",
                  padding: "0 18px",
                  textDecoration: "none",
                  fontWeight: 800,
                  background: "#ffffff",
                  color: "#0f172a",
                  border: "1px solid #cbd5e1",
                }}
              >
                Open My Requests
              </Link>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
