import { useEffect, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { firebaseErrorMessage } from "../utils/firebaseError";

export default function useProducts(db) {
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "products"));
    setLoading(true);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rows = snapshot.docs.map((docItem) => ({
          id: docItem.id,
          ...docItem.data()
        }));
        rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setProducts(rows);
        setError("");
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError(firebaseErrorMessage(err, "Ürün listesi okunamadı."));
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [db]);

  return { products, error, loading };
}
