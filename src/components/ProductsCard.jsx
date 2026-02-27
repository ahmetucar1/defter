import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import useProducts from "../hooks/useProducts";
import { firebaseErrorMessage } from "../utils/firebaseError";
import { normalizeUnitTr } from "../utils/textFormat";

const DEFAULT_PRODUCTS = [
  { name: "BÜYÜK KÖRÜK", price: 700, unit: "ADET" },
  { name: "ORTA BOY KÖRÜK", price: 650, unit: "ADET" },
  { name: "KÜÇÜK KÖRÜK", price: 450, unit: "ADET" },
  { name: "ORDU KÖRÜK", price: 700, unit: "ADET" },
  { name: "VAROSET", price: 90, unit: "KUTU" },
  { name: "RULAMIT", price: 90, unit: "KUTU" },
  { name: "VİTAMİN", price: 60, unit: "KUTU" },
  { name: "NOSEMİT", price: 50, unit: "ADET" },
  { name: "ESMOLİN", price: 100, unit: "ADET" },
  { name: "ÇUBUK", price: 130, unit: "ADET" },
  { name: "MASKE", price: 250, unit: "ADET" },
  { name: "ÇOCUK MASKESİ", price: 200, unit: "ADET" },
  { name: "AKÜ", price: 750, unit: "ADET" },
  { name: "MAHFUZ", price: 150, unit: "ADET" },
  { name: "EL DEMİRİ", price: 150, unit: "ADET" },
  { name: "SİR TARAĞI", price: 150, unit: "ADET" },
  { name: "FIRÇA", price: 150, unit: "ADET" },
  { name: "ÇAKMAK", price: 100, unit: "ADET" },
  { name: "ELDİVEN", price: 150, unit: "ADET" },
  { name: "ÇORAP", price: 150, unit: "ADET" },
  { name: "İBRİK", price: 200, unit: "ADET" },
  { name: "TEL", price: 250, unit: "KİLO" },
  { name: "YEMLİK", price: 60, unit: "ADET" },
  { name: "İNVERT ŞURUBU", price: 950, unit: "TENEKE" },
  { name: "FONDAN", price: 55, unit: "KİLO" },
  { name: "SAĞIM MAKİNESİ", price: 2500, unit: "ADET" },
  { name: "ÇADIR", price: 800, unit: "ADET" },
  { name: "KOVAN", price: 1150, unit: "ADET" },
  { name: "PETEK TAHTASI", price: 200, unit: "ADET" },
  { name: "ÇADIR 4X4", price: 8000, unit: "ADET" },
  { name: "ÇADIR 3X4", price: 7000, unit: "ADET" },
  { name: "ÇITA", price: 25, unit: "ADET" },
  { name: "ŞEKER", price: 1750, unit: "TORBA" }
];

const numberFormatter = new Intl.NumberFormat("tr-TR");

export default function ProductsCard({ db }) {
  const { products, error: productsError, loading: productsLoading } = useProducts(db);
  const [form, setForm] = useState({ name: "", price: "", unit: "", barcode: "" });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const isNormalizingRef = useRef(false);

  const editingProduct = useMemo(
    () => products.find((product) => product.id === editingId),
    [products, editingId]
  );

  useEffect(() => {
    if (!products.length || isNormalizingRef.current) return;
    const updates = products
      .map((product) => {
        const normalizedUnit = normalizeUnitTr(product.unit);
        if (normalizedUnit && normalizedUnit !== product.unit) {
          return { id: product.id, unit: normalizedUnit };
        }
        return null;
      })
      .filter(Boolean);
    if (updates.length === 0) return;
    isNormalizingRef.current = true;
    const run = async () => {
      try {
        let batch = writeBatch(db);
        let count = 0;
        for (const update of updates) {
          batch.update(doc(db, "products", update.id), {
            unit: update.unit,
            updatedAt: serverTimestamp()
          });
          count += 1;
          if (count >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) {
          await batch.commit();
        }
      } catch (err) {
        console.error(err);
        setError(firebaseErrorMessage(err, "Ürünler güncellenemedi."));
      } finally {
        isNormalizingRef.current = false;
      }
    };
    run();
  }, [products, db]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;

    try {
      setError("");
      setSaving(true);
      const priceValue = form.price === "" ? null : Number(form.price);
      const unitValue = normalizeUnitTr(form.unit);
      const barcodeValue = form.barcode ? form.barcode.trim() : "";

      if (barcodeValue) {
        const duplicate = products.some(
          (product) =>
            product.id !== editingId &&
            (product.barcode || "").trim() === barcodeValue
        );
        if (duplicate) {
          setError("Bu barkod başka bir üründe kayıtlı.");
          setSaving(false);
          return;
        }
      }

      if (editingId) {
        await updateDoc(doc(db, "products", editingId), {
          name: form.name.trim(),
          price: priceValue,
          unit: unitValue,
          barcode: barcodeValue || null,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, "products"), {
          name: form.name.trim(),
          price: priceValue,
          unit: unitValue,
          barcode: barcodeValue || null,
          active: true,
          createdAt: serverTimestamp()
        });
      }
      setForm({ name: "", price: "", unit: "", barcode: "" });
      setEditingId(null);
      setShowForm(false);
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Ürün kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (event, product) => {
    event.stopPropagation();
    setEditingId(product.id);
    setForm({
      name: product.name || "",
      price: product.price ?? "",
      unit: product.unit || "",
      barcode: product.barcode || ""
    });
    setShowForm(true);
  };

  const handleDelete = async (event, product) => {
    event.stopPropagation();
    if (!window.confirm(`"${product.name}" ürününü silmek istiyor musunuz?`)) return;
    try {
      setError("");
      await deleteDoc(doc(db, "products", product.id));
      if (editingId === product.id) {
        setEditingId(null);
        setForm({ name: "", price: "", unit: "", barcode: "" });
      }
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Ürün silinemedi."));
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: "", price: "", unit: "", barcode: "" });
    setShowForm(false);
  };

  const handleBulkImport = async () => {
    try {
      setError("");
      setImporting(true);
      const snapshot = await getDocs(collection(db, "products"));
      const existingNames = new Set(
        snapshot.docs.map((docItem) => (docItem.data().name || "").toLowerCase())
      );
      const toInsert = DEFAULT_PRODUCTS.filter(
        (product) => !existingNames.has(product.name.toLowerCase())
      );
      if (toInsert.length === 0) return;

      const batch = writeBatch(db);
      toInsert.forEach((product) => {
        const ref = doc(collection(db, "products"));
        batch.set(ref, {
          name: product.name,
          price: product.price,
          unit: normalizeUnitTr(product.unit),
          active: true,
          createdAt: serverTimestamp()
        });
      });
      await batch.commit();
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Toplu ürün yüklenemedi."));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="form-card">
      <div className="card-header">
        <div>
          <h3>Ürünler</h3>
          <p className="muted">Malzeme seçimleri bu listedeki ürünlerden yapılır.</p>
        </div>
        <div className="card-actions">
          <button type="button" className="ghost" onClick={handleBulkImport} disabled={importing}>
            {importing ? "Yükleniyor..." : "Toplu Ürün Yükle"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() =>
              setShowForm((prev) => {
                if (prev) {
                  setEditingId(null);
                  setForm({ name: "", price: "", unit: "", barcode: "" });
                }
                return !prev;
              })
            }
          >
            {showForm ? "Formu Kapat" : "Ürün Ekle"}
          </button>
        </div>
      </div>
      {productsError ? <div className="error">{productsError}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {showForm ? (
        <form className="form form-inline" onSubmit={handleSubmit}>
          <label>
            Ürün Adı
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Örn: Teneke, Kapak"
              required
            />
          </label>
          <label>
            Fiyat
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
              placeholder="Örn: 150"
            />
          </label>
          <label>
            Cinsi
            <input
              type="text"
              value={form.unit}
              onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}
              placeholder="ADET, KUTU, KİLO"
            />
          </label>
          <label>
            Barkod
            <input
              type="text"
              value={form.barcode}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, barcode: event.target.value }))
              }
              placeholder="Barkod okut veya yaz"
            />
          </label>
          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {editingId ? "Güncelle" : "Kaydet"}
            </button>
            {editingId ? (
              <button type="button" className="ghost" onClick={cancelEdit}>
                İptal
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
      {showForm && editingProduct ? (
        <p className="muted">Düzenleniyor: {editingProduct.name}</p>
      ) : null}
      <div className="list">
        {productsLoading ? (
          <p className="muted">Ürünler yükleniyor...</p>
        ) : products.length === 0 ? (
          <p className="muted">Henüz ürün yok.</p>
        ) : (
          products.map((product) => (
            <div className="list-item static" key={product.id}>
              <span className="list-title">
                {product.name}
                {product.price != null ? (
                  <span className="list-meta">
                    {numberFormatter.format(product.price)} {product.unit || ""}
                  </span>
                ) : null}
                {product.barcode ? (
                  <span className="list-meta">Barkod: {product.barcode}</span>
                ) : null}
              </span>
              <span className="list-actions">
                <button
                  type="button"
                  className="link"
                  onClick={(event) => handleEdit(event, product)}
                >
                  Düzenle
                </button>
                <button
                  type="button"
                  className="link danger"
                  onClick={(event) => handleDelete(event, product)}
                >
                  Sil
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
