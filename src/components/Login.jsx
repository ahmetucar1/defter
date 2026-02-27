import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from "firebase/auth";

export default function Login({ auth, authError, onClearError }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError("");
    if (onClearError) onClearError();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      setLoading(true);
      await signInWithPopup(auth, provider);
    } catch (err) {
      if (err?.code === "auth/popup-blocked" || err?.code === "auth/cancelled-popup-request") {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectError) {
          setError("Giriş başarısız. Tekrar deneyin.");
        }
      } else {
        setError("Giriş başarısız. Tekrar deneyin.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <h1>Defter Girişi</h1>
        <p className="muted">
          Bu uygulamaya sadece <strong>ucaraahmet@gmail.com</strong> hesabı ile giriş yapılır.
        </p>
        <div className="form">
          {authError ? <div className="error">{authError}</div> : null}
          {error ? <div className="error">{error}</div> : null}
          <button type="button" onClick={handleGoogleSignIn} disabled={loading}>
            {loading ? "Giriş yapılıyor..." : "Google ile giriş yap"}
          </button>
        </div>
      </div>
    </div>
  );
}
