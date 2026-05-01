import { useEffect, useState } from "react";
import logo from "../assets/icon-512.png";

export default function AppSplash({ children }) {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      {showSplash && (
        <div className="app-splash" role="status" aria-label="Loading Tee & Co Central Operations">
          <div className="app-splash-card">
            <img src={logo} alt="Tee & Co" className="app-splash-logo" />
            <div>
              <p className="app-splash-kicker">Tee & Co</p>
              <h1 className="app-splash-title">Central Operations</h1>
              <p className="app-splash-copy">Preparing your workspace…</p>
            </div>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
