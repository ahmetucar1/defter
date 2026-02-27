export function firebaseErrorMessage(error, fallback = "İşlem başarısız.") {
  if (!error) return fallback;
  const code = error.code || "";

  switch (code) {
    case "permission-denied":
      return "İzin reddedildi. Firestore kurallarını kontrol edin.";
    case "unauthenticated":
      return "Oturum doğrulanamadı. Lütfen yeniden giriş yapın.";
    case "unavailable":
      return "Bağlantı hatası. İnternet bağlantısını kontrol edin.";
    default:
      return code ? `${fallback} (${code})` : fallback;
  }
}
