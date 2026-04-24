import { Link, Outlet, useLocation } from "react-router-dom";

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
      style={{
        width: "18px",
        height: "18px",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 1.8,
      }}
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function Layout() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");
  const isHome = location.pathname === "/";

  const customerLinks = [
    { to: "/", label: "Home" },
    { to: "/my-orders", label: "My Orders" },
    { to: "/login", label: "Login" },
  ];

  const adminLinks = [
    { to: "/admin", label: "Dashboard" },
    { to: "/admin/orders", label: "Orders" },
    { to: "/", label: "Customer View" },
  ];

  const links = isAdmin ? adminLinks : customerLinks;

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, #f8f5f1 0%, #f8fafc 160px, #f8fafc 100%)",
        color: "#171717",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* HEADER */}
      <header
        style={{
          background: "rgba(255,255,255,0.92)",
          borderBottom: "1px solid #e7e5e4",
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            maxWidth: "1100px",
            margin: "0 auto",
            padding: "10px 20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          {/* LOGO BLOCK */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "#171717",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                letterSpacing: "0.04em",
                fontSize: "14px",
              }}
            >
              T&C
            </div>

            <div>
              <p
                style={{
                  margin: 0,
                  fontWeight: 800,
                  fontSize: "17px",
                  letterSpacing: "-0.02em",
                }}
              >
                Tee & Co
              </p>

              <p
                style={{
                  margin: 0,
                  color: "#57534e",
                  fontSize: "12px",
                }}
              >
                Made Local. Worn Proud.
              </p>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "8px",
              marginLeft: "auto",
            }}
          >
            {isHome ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  width: "100%",
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
            ) : null}

            {/* NAV */}
            <nav
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {links.map((link) => {
                const active =
                  location.pathname === link.to ||
                  (link.to !== "/" && location.pathname.startsWith(link.to));

                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    style={{
                      textDecoration: "none",
                      padding: "8px 12px",
                      borderRadius: "999px",
                      border: active
                        ? "1px solid #171717"
                        : "1px solid #d6d3d1",
                      background: active ? "#171717" : "#ffffff",
                      color: active ? "#ffffff" : "#171717",
                      fontWeight: 600,
                      fontSize: "13px",
                    }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* BANNER */}
<div
  style={{
    maxWidth: "1360px",
    margin: "8px auto 0 auto",
    padding: "0 14px",
  }}
>
  <div
    style={{
      background: isAdmin ? "#1c1917" : "#292524",
      color: "#fafaf9",
      borderRadius: "14px",
      padding: "10px 14px",
      boxShadow: "0 6px 16px rgba(28,25,23,0.12)",
    }}
  >
    <p
      style={{
        margin: 0,
        fontSize: "10px",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "#d6d3d1",
      }}
    >
      {isAdmin ? "Shop Dashboard" : "Customer Portal"}
    </p>

    <h1
      style={{
        margin: "2px 0",
        fontSize: "16px",
        lineHeight: 1.2,
        letterSpacing: "-0.02em",
      }}
    >
      {isAdmin
        ? "Manage requests and production"
        : "Custom apparel ordering made simple"}
    </h1>
  </div>
</div>

      {/* PAGE CONTENT */}
      <main style={{ padding: "14px 0 26px 0" }}>
        <Outlet />
      </main>
    </div>
  );
}
