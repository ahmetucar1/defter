import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "./firebase";
import Login from "./components/Login";
import TopBar from "./components/TopBar";
import BeekeeperLedger from "./components/BeekeeperLedger";
import FactoryLedger from "./components/FactoryLedger";
import SupplierLedger from "./components/SupplierLedger";
import ProductsPage from "./components/ProductsPage";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeLedger, setActiveLedger] = useState("beekeeper");
  const [authError, setAuthError] = useState("");
  const [beekeeperFocusId, setBeekeeperFocusId] = useState(null);
  const [factoryFocusId, setFactoryFocusId] = useState(null);
  const [factoryFocusShipmentId, setFactoryFocusShipmentId] = useState(null);
  const allowedEmails = ["ucaraahmet@gmail.com", "siverekbub@gmail.com"];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const email = currentUser?.email?.toLowerCase() || "";

      if (currentUser && !allowedEmails.includes(email)) {
        setAuthError(
          `Bu uygulamaya sadece ${allowedEmails.join(" veya ")} ile giriş yapılabilir.`
        );
        setUser(null);
        setLoading(false);
        signOut(auth).catch(() => {});
        return;
      }

      setAuthError("");
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);


  if (loading) {
    return (
      <div className="loading">
        <p>Yükleniyor...</p>
      </div>
    );
  }

  if (!user) {
    return (
        <Login
          auth={auth}
          authError={authError}
          onClearError={() => setAuthError("")}
        />
    );
  }

  return (
    <div className="app">
      <TopBar
        activeLedger={activeLedger}
        onSelectLedger={setActiveLedger}
      />
      <main className="main">
        {activeLedger === "beekeeper" ? (
          <BeekeeperLedger
            db={db}
            focusBeekeeperId={beekeeperFocusId}
            onClearFocus={() => setBeekeeperFocusId(null)}
            onOpenShipment={(factoryId, shipmentId) => {
              if (!factoryId || !shipmentId) return;
              setFactoryFocusId(factoryId);
              setFactoryFocusShipmentId(shipmentId);
              setActiveLedger("factory");
            }}
          />
        ) : null}
        {activeLedger === "factory" ? (
          <FactoryLedger
            db={db}
            onOpenBeekeeper={(beekeeperId) => {
              if (!beekeeperId) return;
              setBeekeeperFocusId(beekeeperId);
              setActiveLedger("beekeeper");
            }}
            focusFactoryId={factoryFocusId}
            focusShipmentId={factoryFocusShipmentId}
            onClearFocus={() => {
              setFactoryFocusId(null);
              setFactoryFocusShipmentId(null);
            }}
          />
        ) : null}
        {activeLedger === "supplier" ? <SupplierLedger db={db} /> : null}
        {activeLedger === "products" ? <ProductsPage db={db} /> : null}
      </main>
    </div>
  );
}
