import { Link, Outlet, useLocation } from "react-router-dom";

export default function Layout() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");

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

          {/* NAV */}
          <nav style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
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
      </header>

      {/* BANNER */}
<div
  style={{
    maxWidth: "1100px",
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