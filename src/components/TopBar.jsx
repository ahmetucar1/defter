import { useEffect, useRef, useState } from "react";

export default function TopBar({ activeLedger, onSelectLedger }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (event) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">Defter</div>
        <span className="brand-subtitle">Bal ticareti kayıt sistemi</span>
      </div>
      <div className="topbar-actions" ref={menuRef}>
        {activeLedger === "beekeeper" ? (
          <>
            <button
              className="ghost"
              type="button"
              onClick={() => onSelectLedger("products")}
            >
              Yeni Ürün Ekle
            </button>
            <div className="menu-wrapper">
              <button
                className="ghost"
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                Diğer Defterler
              </button>
              {menuOpen ? (
                <div className="menu">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLedger("factory");
                      setMenuOpen(false);
                    }}
                  >
                    Fabrika Defteri
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLedger("supplier");
                      setMenuOpen(false);
                    }}
                  >
                    Malzemeci Defteri
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <button
            className="ghost"
            type="button"
            onClick={() => onSelectLedger("beekeeper")}
          >
            Arıcı Defterine Dön
          </button>
        )}
      </div>
    </header>
  );
}
