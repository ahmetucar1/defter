import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import useProducts from "../hooks/useProducts";
import { firebaseErrorMessage } from "../utils/firebaseError";
import { normalizeTextTr, normalizeUnitTr, toTitleCaseTr } from "../utils/textFormat";

const numberFormatter = new Intl.NumberFormat("tr-TR");

const sortByDate = (a, b) => {
  const first = a.date || "";
  const second = b.date || "";
  if (first === second) {
    return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
  }
  return first.localeCompare(second);
};

const ENTRY_TYPE_PAYMENT = "payment";
const ENTRY_TYPE_GIVE = "supplierGive";

const normalizeSupplierKey = (value) =>
  normalizeTextTr(value)
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");

const formatDisplayDate = (dateValue) => {
  if (!dateValue) return "";
  const parts = dateValue.split("-");
  if (parts.length !== 3) return dateValue;
  const [year, month, day] = parts;
  return `${day}.${month}.${year}`;
};

const getTodayISO = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

function PurchaseEntryLine({ entry, onEdit, onDelete }) {
  const displayDate = formatDisplayDate(entry.date);
  const quantityText =
    entry.quantity != null ? numberFormatter.format(entry.quantity) : "";
  const unitText = entry.unit || "Adet";
  const priceText =
    entry.price != null && !Number.isNaN(entry.price)
      ? numberFormatter.format(entry.price)
      : "-";
  const totalValue =
    entry.price != null && entry.quantity != null
      ? entry.price * entry.quantity
      : null;
  const totalText =
    totalValue != null && !Number.isNaN(totalValue)
      ? numberFormatter.format(totalValue)
      : "-";

  return (
    <div className="entry-line entry-line-compact">
      <div className="entry-main">
        {displayDate ? <span className="entry-date">{displayDate}</span> : null}
        <div className="entry-text">
          <span className="entry-desc">
            {`${quantityText} ${unitText} ${entry.description || ""} x ${priceText}`}
          </span>
          {entry.note ? <span className="entry-note">({entry.note})</span> : null}
        </div>
      </div>
      <div className="entry-values">
        <span className="entry-price">{totalText} TL</span>
        {entry.paymentStatus ? (
          <span className="entry-status">{entry.paymentStatus}</span>
        ) : null}
        {onEdit || onDelete ? (
          <div className="entry-actions inline-icons">
            {onEdit ? (
              <button
                type="button"
                className="icon-button"
                aria-label="Düzenle"
                onClick={() => onEdit(entry)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 17.5V20h2.5L17.8 8.7l-2.5-2.5L4 17.5zm15.7-9.2c.4-.4.4-1 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0l-1.8 1.8 4 4 1.8-1.8z" />
                </svg>
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="icon-button danger"
                aria-label="Sil"
                onClick={() => onDelete(entry)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PaymentEntryLine({ entry, onEdit, onDelete }) {
  const displayDate = formatDisplayDate(entry.date);
  const amountValue = Number(entry.amount);
  const amountText =
    !Number.isNaN(amountValue) ? numberFormatter.format(amountValue) : "-";

  return (
    <div className="entry-line entry-line-compact">
      <div className="entry-main">
        {displayDate ? <span className="entry-date">{displayDate}</span> : null}
        <div className="entry-text">
          <span className="entry-desc">{entry.note || "Ödeme"}</span>
        </div>
      </div>
      <div className="entry-values">
        <span className="entry-price">{amountText} TL</span>
        {onEdit || onDelete ? (
          <div className="entry-actions inline-icons">
            {onEdit ? (
              <button
                type="button"
                className="icon-button"
                aria-label="Düzenle"
                onClick={() => onEdit(entry)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 17.5V20h2.5L17.8 8.7l-2.5-2.5L4 17.5zm15.7-9.2c.4-.4.4-1 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0l-1.8 1.8 4 4 1.8-1.8z" />
                </svg>
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="icon-button danger"
                aria-label="Sil"
                onClick={() => onDelete(entry)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GiveEntryLine({ entry, onEdit, onDelete }) {
  const displayDate = formatDisplayDate(entry.date);
  const quantityText =
    entry.quantity != null ? numberFormatter.format(entry.quantity) : "-";
  const unitText = entry.unit || "Kg";
  const unitPrice =
    entry.price != null && !Number.isNaN(entry.price)
      ? numberFormatter.format(entry.price)
      : "-";
  const totalValue =
    entry.price != null && entry.quantity != null
      ? entry.price * entry.quantity
      : null;
  const totalText =
    totalValue != null && !Number.isNaN(totalValue)
      ? numberFormatter.format(totalValue)
      : "-";

  return (
    <div className="entry-line entry-line-compact">
      <div className="entry-main">
        {displayDate ? <span className="entry-date">{displayDate}</span> : null}
        <div className="entry-text">
          <span className="entry-desc">{`Mum x ${unitPrice}`}</span>
          {entry.note ? <span className="entry-note">({entry.note})</span> : null}
        </div>
      </div>
      <div className="entry-values">
        <span className="entry-price">{totalText} TL</span>
        <span className="entry-status">
          {quantityText} {unitText}
        </span>
        {onEdit || onDelete ? (
          <div className="entry-actions inline-icons">
            {onEdit ? (
              <button
                type="button"
                className="icon-button"
                aria-label="Düzenle"
                onClick={() => onEdit(entry)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 17.5V20h2.5L17.8 8.7l-2.5-2.5L4 17.5zm15.7-9.2c.4-.4.4-1 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0l-1.8 1.8 4 4 1.8-1.8z" />
                </svg>
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="icon-button danger"
                aria-label="Sil"
                onClick={() => onDelete(entry)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SupplierBook({ db, supplier, onBack }) {
  const [entries, setEntries] = useState([]);
  const { products, error: productsError, loading: productsLoading } = useProducts(db);
  const isBincagPetek = useMemo(
    () => normalizeSupplierKey(supplier.name || "") === "bincag petek",
    [supplier.name]
  );
  const [leftForm, setLeftForm] = useState({
    date: "",
    description: isBincagPetek ? "Petek" : "",
    quantity: "",
    unit: isBincagPetek ? "Kg" : "adet",
    price: "",
    note: ""
  });
  const [rightForm, setRightForm] = useState({
    date: "",
    amount: "",
    quantity: "",
    unitPrice: "",
    note: ""
  });
  const [leftEditingId, setLeftEditingId] = useState(null);
  const [rightEditingId, setRightEditingId] = useState(null);
  const [showLeftForm, setShowLeftForm] = useState(false);
  const [showRightForm, setShowRightForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isNormalizingEntriesRef = useRef(false);

  useEffect(() => {
    const q = query(
      collection(db, "entries"),
      where("ownerType", "==", "supplier"),
      where("ownerId", "==", supplier.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data()
      }));
      setEntries(rows);
    });

    return () => unsubscribe();
  }, [db, supplier.id]);

  useEffect(() => {
    if (!entries.length || isNormalizingEntriesRef.current) return;
    const updates = [];
    entries.forEach((entry) => {
      const changes = {};
      if (entry.entryType === ENTRY_TYPE_PAYMENT) {
        const normalizedNote = entry.note ? toTitleCaseTr(entry.note) : "";
        if ((entry.note || "") !== normalizedNote) {
          changes.note = normalizedNote;
        }
      } else {
        const description = entry.description || "";
        const normalized = toTitleCaseTr(description);
        const normalizedUnit = normalizeUnitTr(entry.unit);
        if (normalized && normalized !== description) {
          changes.description = normalized;
        }
        if (normalizedUnit && normalizedUnit !== entry.unit) {
          changes.unit = normalizedUnit;
        }
      }
      if (Object.keys(changes).length > 0) {
        updates.push({ id: entry.id, changes });
      }
    });
    if (updates.length === 0) return;
    isNormalizingEntriesRef.current = true;
    const run = async () => {
      try {
        let batch = writeBatch(db);
        let count = 0;
        for (const update of updates) {
          batch.update(doc(db, "entries", update.id), {
            ...update.changes,
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
        setError(firebaseErrorMessage(err, "Kayıtlar güncellenemedi."));
      } finally {
        isNormalizingEntriesRef.current = false;
      }
    };
    run();
  }, [entries, db]);

  const leftEntries = useMemo(
    () =>
      entries
        .filter(
          (entry) =>
            entry.entryType !== ENTRY_TYPE_PAYMENT &&
            entry.entryType !== ENTRY_TYPE_GIVE &&
            (entry.side === "left" || !entry.side)
        )
        .slice()
        .sort(sortByDate),
    [entries]
  );

  const giveEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.entryType === ENTRY_TYPE_GIVE)
        .slice()
        .sort(sortByDate),
    [entries]
  );

  const paymentEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.entryType === ENTRY_TYPE_PAYMENT)
        .slice()
        .sort(sortByDate),
    [entries]
  );

  const productNames = useMemo(
    () => products.map((product) => product.name).filter(Boolean),
    [products]
  );

  const productMetaByName = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      if (product.name) {
        map.set(product.name, {
          price: product.price ?? null,
          unit: product.unit || ""
        });
      }
    });
    return map;
  }, [products]);

  const productNameByNormalized = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      const key = normalizeTextTr(product.name);
      if (key) map.set(key, product.name);
    });
    return map;
  }, [products]);

  const handleLeftSubmit = async (event) => {
    event.preventDefault();
    const dateValue = leftForm.date || getTodayISO();
    const descriptionValue = isBincagPetek ? "Petek" : leftForm.description;
    const unitValue = isBincagPetek ? "Kg" : leftForm.unit;
    if (!descriptionValue || !leftForm.quantity) return;

    try {
      setError("");
      setSaving(true);
      const payload = {
        ownerType: "supplier",
        ownerId: supplier.id,
        side: "left",
        date: dateValue,
        description: toTitleCaseTr(descriptionValue),
        quantity: Number(leftForm.quantity),
        unit: normalizeUnitTr(unitValue || "adet"),
        price: leftForm.price ? Number(leftForm.price) : null,
        dueDate: null,
        note: leftForm.note || "",
        updatedAt: serverTimestamp()
      };

      if (leftEditingId) {
        await updateDoc(doc(db, "entries", leftEditingId), payload);
      } else {
        await addDoc(collection(db, "entries"), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }
      setLeftForm({
        date: "",
        description: isBincagPetek ? "Petek" : "",
        quantity: "",
        unit: isBincagPetek ? "Kg" : "adet",
        price: "",
        note: ""
      });
      setLeftEditingId(null);
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Kayıt kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const handleRightSubmit = async (event) => {
    event.preventDefault();
    const dateValue = rightForm.date || getTodayISO();
    if (isBincagPetek) {
      if (!rightForm.quantity) return;
    } else if (!rightForm.amount) {
      return;
    }

    try {
      setError("");
      setSaving(true);
      const payload = isBincagPetek
        ? {
            ownerType: "supplier",
            ownerId: supplier.id,
            entryType: ENTRY_TYPE_GIVE,
            side: "right",
            date: dateValue,
            description: "Mum",
            quantity: Number(rightForm.quantity),
            unit: normalizeUnitTr("Kg"),
            price: rightForm.unitPrice ? Number(rightForm.unitPrice) : null,
            note: rightForm.note ? toTitleCaseTr(rightForm.note) : "",
            updatedAt: serverTimestamp()
          }
        : {
            ownerType: "supplier",
            ownerId: supplier.id,
            entryType: ENTRY_TYPE_PAYMENT,
            side: "right",
            date: dateValue,
            amount: Number.isNaN(Number(rightForm.amount))
              ? 0
              : Number(rightForm.amount),
            note: rightForm.note ? toTitleCaseTr(rightForm.note) : "",
            updatedAt: serverTimestamp()
          };

      if (rightEditingId) {
        await updateDoc(doc(db, "entries", rightEditingId), payload);
      } else {
        await addDoc(collection(db, "entries"), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }
      setRightForm({
        date: "",
        amount: "",
        quantity: "",
        unitPrice: "",
        note: ""
      });
      setRightEditingId(null);
    } catch (err) {
      console.error(err);
      setError(
        firebaseErrorMessage(
          err,
          isBincagPetek ? "Kayıt kaydedilemedi." : "Ödeme kaydedilemedi."
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const leftFormTotal =
    leftForm.price && leftForm.quantity
      ? Number(leftForm.price) * Number(leftForm.quantity)
      : null;

  const startLeftEdit = (entry) => {
    const resolvedDescription =
      productNameByNormalized.get(normalizeTextTr(entry.description)) ||
      entry.description ||
      "";
    setLeftEditingId(entry.id);
    setLeftForm({
      date: entry.date || "",
      description: isBincagPetek ? "Petek" : resolvedDescription,
      quantity: entry.quantity ?? "",
      unit: isBincagPetek ? "Kg" : entry.unit || "adet",
      price: entry.price ?? "",
      note: entry.note || ""
    });
    setShowLeftForm(true);
  };

  const startRightEdit = (entry) => {
    setRightEditingId(entry.id);
    if (isBincagPetek) {
      setRightForm({
        date: entry.date || "",
        amount: "",
        quantity: entry.quantity ?? "",
        unitPrice: entry.price ?? "",
        note: entry.note || ""
      });
    } else {
      setRightForm({
        date: entry.date || "",
        amount: entry.amount ?? "",
        quantity: "",
        unitPrice: "",
        note: entry.note || ""
      });
    }
    setShowRightForm(true);
  };

  const cancelLeftEdit = () => {
    setLeftEditingId(null);
    setLeftForm({
      date: "",
      description: isBincagPetek ? "Petek" : "",
      quantity: "",
      unit: isBincagPetek ? "Kg" : "adet",
      price: "",
      note: ""
    });
    setShowLeftForm(false);
  };

  const cancelRightEdit = () => {
    setRightEditingId(null);
    setRightForm({ date: "", amount: "", quantity: "", unitPrice: "", note: "" });
    setShowRightForm(false);
  };

  const handleLeftDelete = async (entry) => {
    if (!window.confirm("Bu kaydı silmek istiyor musunuz?")) return;
    try {
      setError("");
      await deleteDoc(doc(db, "entries", entry.id));
      if (leftEditingId === entry.id) cancelLeftEdit();
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Kayıt silinemedi."));
    }
  };

  const handleRightDelete = async (entry) => {
    if (
      !window.confirm(
        isBincagPetek ? "Bu kaydı silmek istiyor musunuz?" : "Bu ödemeyi silmek istiyor musunuz?"
      )
    )
      return;
    try {
      setError("");
      await deleteDoc(doc(db, "entries", entry.id));
      if (rightEditingId === entry.id) cancelRightEdit();
    } catch (err) {
      console.error(err);
      setError(
        firebaseErrorMessage(err, isBincagPetek ? "Kayıt silinemedi." : "Ödeme silinemedi.")
      );
    }
  };

  const purchasesTotal = useMemo(
    () =>
      leftEntries.reduce((sum, entry) => {
        if (entry.price != null && entry.quantity != null) {
          return sum + entry.price * entry.quantity;
        }
        return sum;
      }, 0),
    [leftEntries]
  );

  const paymentsTotal = useMemo(
    () =>
      paymentEntries.reduce((sum, entry) => {
        const amountValue = Number(entry.amount);
        return sum + (Number.isNaN(amountValue) ? 0 : amountValue);
      }, 0),
    [paymentEntries]
  );

  const giveTotal = useMemo(
    () =>
      giveEntries.reduce((sum, entry) => {
        const qty = Number(entry.quantity);
        return sum + (Number.isNaN(qty) ? 0 : qty);
      }, 0),
    [giveEntries]
  );

  const giveValueTotal = useMemo(
    () =>
      giveEntries.reduce((sum, entry) => {
        if (entry.price != null && entry.quantity != null) {
          return sum + entry.price * entry.quantity;
        }
        return sum;
      }, 0),
    [giveEntries]
  );

  const rightValueTotal = isBincagPetek ? giveValueTotal : paymentsTotal;
  const balance = purchasesTotal - rightValueTotal;
  const formattedLeft = numberFormatter.format(purchasesTotal);
  const formattedRight = numberFormatter.format(rightValueTotal);
  const formattedDiff = numberFormatter.format(Math.abs(balance));
  const balanceLabel =
    balance > 0 ? "Malzemeciye borç" : balance < 0 ? "Malzemecinin borcu" : "Hesap dengede";


  return (
    <section className="ledger-detail ledger-detail-modern">
      <div className="detail-header">
        <button className="ghost" type="button" onClick={onBack}>
          Malzemeci listesine dön
        </button>
        <div>
          <h2>{supplier.name}</h2>
          <p className="muted">Malzemeci Defteri</p>
        </div>
      </div>
      {productsError ? <div className="error">{productsError}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="book-spread">
        <div className="entry-panel panel-incoming">
          <div className="page-header">
            <h3>{isBincagPetek ? "Petek Alımları" : "Malzemeciden Alınanlar"}</h3>
            <div className="page-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  if (showLeftForm) {
                    cancelLeftEdit();
                    return;
                  }
                  setLeftForm((prev) => ({
                    ...prev,
                    date: prev.date || getTodayISO(),
                    description: isBincagPetek ? "Petek" : prev.description,
                    unit: isBincagPetek ? "Kg" : prev.unit
                  }));
                  setShowLeftForm(true);
                }}
              >
                {showLeftForm ? "Kapat" : "Ekle"}
              </button>
            </div>
          </div>

          {showLeftForm ? (
            <form className="form form-inline form-modern" onSubmit={handleLeftSubmit}>
              <label>
                Tarih
                <input
                  type="date"
                  value={leftForm.date}
                  onChange={(event) =>
                    setLeftForm((prev) => ({ ...prev, date: event.target.value }))
                  }
                />
              </label>
              {isBincagPetek ? (
                <label>
                  Ürün
                  <input type="text" value="Petek" disabled />
                </label>
              ) : (
                <label>
                  Ürün
                  <select
                    value={leftForm.description}
                    onChange={(event) =>
                      setLeftForm((prev) => {
                        const selected = event.target.value;
                        const meta = productMetaByName.get(selected);
                        return {
                          ...prev,
                          description: selected,
                          price: meta && meta.price != null ? String(meta.price) : "",
                          unit: meta && meta.unit ? meta.unit : ""
                        };
                      })
                    }
                    required
                  >
                    <option value="" disabled>
                      {productsLoading
                        ? "Ürünler yükleniyor..."
                        : productsError
                          ? "Ürün listesi okunamadı"
                          : productNames.length === 0
                            ? "Ürün listesi boş"
                            : "Ürün seçin"}
                    </option>
                    {leftForm.description && !productNames.includes(leftForm.description) ? (
                      <option value={leftForm.description}>
                        {leftForm.description} (listede yok)
                      </option>
                    ) : null}
                    {productNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Miktar{isBincagPetek ? " (Kg)" : ""}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={leftForm.quantity}
                  onChange={(event) =>
                    setLeftForm((prev) => ({ ...prev, quantity: event.target.value }))
                  }
                  required
                />
              </label>
              {isBincagPetek ? (
                <label>
                  Birim
                  <input type="text" value="Kg" disabled />
                </label>
              ) : (
                <label>
                  Birim
                  <input
                    type="text"
                    value={leftForm.unit}
                    onChange={(event) =>
                      setLeftForm((prev) => ({ ...prev, unit: event.target.value }))
                    }
                    placeholder="adet, kg, paket"
                  />
                </label>
              )}
              <label>
                Birim Fiyat
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={leftForm.price}
                  onChange={(event) =>
                    setLeftForm((prev) => ({ ...prev, price: event.target.value }))
                  }
                />
              </label>
              {leftFormTotal != null ? (
                <div className="inline-info">
                  Toplam: {numberFormatter.format(leftFormTotal)} TL
                </div>
              ) : null}
              <label>
                Not
                <input
                  type="text"
                  value={leftForm.note}
                  onChange={(event) =>
                    setLeftForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                />
              </label>
              <div className="form-actions">
                <button type="submit" disabled={saving}>
                  {leftEditingId ? "Güncelle" : "Kaydet"}
                </button>
                {leftEditingId ? (
                  <button type="button" className="ghost" onClick={cancelLeftEdit}>
                    İptal
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          <div className="entry-list">
            {leftEntries.length === 0 ? (
              <p className="muted">Henüz kayıt yok.</p>
            ) : (
              leftEntries.map((entry) => (
                <PurchaseEntryLine
                  key={entry.id}
                  entry={entry}
                  onEdit={startLeftEdit}
                  onDelete={handleLeftDelete}
                />
              ))
            )}
          </div>
          <div className="total-bar">
            Toplam: {numberFormatter.format(purchasesTotal)} TL
          </div>
        </div>

        <div className="entry-panel panel-outgoing">
          <div className="page-header">
            <h3>{isBincagPetek ? "Verilen Mum" : "Ödemeler"}</h3>
            <div className="page-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  if (showRightForm) {
                    cancelRightEdit();
                    return;
                  }
                  setRightForm((prev) => ({
                    ...prev,
                    date: prev.date || getTodayISO()
                  }));
                  setShowRightForm(true);
                }}
              >
                {showRightForm ? "Kapat" : "Ekle"}
              </button>
            </div>
          </div>

          {showRightForm ? (
            <form className="form form-inline form-modern" onSubmit={handleRightSubmit}>
              <label>
                Tarih
                <input
                  type="date"
                  value={rightForm.date}
                  onChange={(event) =>
                    setRightForm((prev) => ({ ...prev, date: event.target.value }))
                  }
                />
              </label>
              {isBincagPetek ? (
                <>
                  <label>
                    Miktar (Kg)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rightForm.quantity}
                      onChange={(event) =>
                        setRightForm((prev) => ({ ...prev, quantity: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Birim Fiyat
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={rightForm.unitPrice}
                      onChange={(event) =>
                        setRightForm((prev) => ({ ...prev, unitPrice: event.target.value }))
                      }
                    />
                  </label>
                </>
              ) : (
                <label>
                  Tutar
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rightForm.amount}
                    onChange={(event) =>
                      setRightForm((prev) => ({ ...prev, amount: event.target.value }))
                    }
                    required
                  />
                </label>
              )}
              <label>
                Not
                <input
                  type="text"
                  value={rightForm.note}
                  onChange={(event) =>
                    setRightForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                />
              </label>
              <div className="form-actions">
                <button type="submit" disabled={saving}>
                  {rightEditingId ? "Güncelle" : "Kaydet"}
                </button>
                {rightEditingId ? (
                  <button type="button" className="ghost" onClick={cancelRightEdit}>
                    İptal
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          <div className="entry-list">
            {isBincagPetek ? (
              giveEntries.length === 0 ? (
                <p className="muted">Henüz kayıt yok.</p>
              ) : (
                giveEntries.map((entry) => (
                  <GiveEntryLine
                    key={entry.id}
                    entry={entry}
                    onEdit={startRightEdit}
                    onDelete={handleRightDelete}
                  />
                ))
              )
            ) : paymentEntries.length === 0 ? (
              <p className="muted">Henüz ödeme yok.</p>
            ) : (
              paymentEntries.map((entry) => (
                <PaymentEntryLine
                  key={entry.id}
                  entry={entry}
                  onEdit={startRightEdit}
                  onDelete={handleRightDelete}
                />
              ))
            )}
          </div>
          <div className="total-bar">
            {isBincagPetek
              ? `Toplam: ${numberFormatter.format(giveTotal)} Kg${
                  giveValueTotal > 0
                    ? ` • Tutar: ${numberFormatter.format(giveValueTotal)} TL`
                    : ""
                }`
              : `Toplam Ödeme: ${numberFormatter.format(paymentsTotal)} TL`}
          </div>
        </div>
      </div>

      <div className="summary-bar">
        <div className="summary-row summary-row-incoming">
          <span className="summary-label">Alınanlar</span>
          <span className="summary-amount">{formattedLeft} TL</span>
        </div>
        <div className="summary-row summary-row-outgoing">
          <span className="summary-label">{isBincagPetek ? "Verilen Mum" : "Ödemeler"}</span>
          <span className="summary-amount">- {formattedRight} TL</span>
        </div>
        <div className="summary-rule" />
        <div className="summary-row summary-result">
          <span>Sonuç</span>
          <span className="summary-result-value">
            <span className="summary-result-note">{balanceLabel}</span>
            {formattedDiff} TL
          </span>
        </div>
      </div>
    </section>
  );
}

export default function SupplierLedger({ db }) {
  const [suppliers, setSuppliers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: "" });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query(collection(db, "suppliers"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data()
      }));
      rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setSuppliers(rows);
    });

    return () => unsubscribe();
  }, [db]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name) return;

    try {
      setError("");
      setSaving(true);
      if (editingId) {
        await updateDoc(doc(db, "suppliers", editingId), {
          name: form.name.trim(),
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, "suppliers"), {
          name: form.name.trim(),
          active: true,
          createdAt: serverTimestamp()
        });
      }
      setForm({ name: "" });
      setEditingId(null);
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Malzemeci kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (event, supplier) => {
    event.stopPropagation();
    setEditingId(supplier.id);
    setForm({ name: supplier.name || "" });
  };

  const deleteEntriesForOwner = async (ownerId) => {
    const entriesQuery = query(
      collection(db, "entries"),
      where("ownerType", "==", "supplier"),
      where("ownerId", "==", ownerId)
    );
    const snapshot = await getDocs(entriesQuery);
    let batch = writeBatch(db);
    let count = 0;
    const commits = [];

    snapshot.forEach((docItem) => {
      batch.delete(docItem.ref);
      count += 1;
      if (count >= 450) {
        commits.push(batch.commit());
        batch = writeBatch(db);
        count = 0;
      }
    });

    if (count > 0) {
      commits.push(batch.commit());
    }

    if (commits.length > 0) {
      await Promise.all(commits);
    }
  };

  const handleDelete = async (event, supplier) => {
    event.stopPropagation();
    if (!window.confirm("Bu malzemeci ve tüm kayıtları silinsin mi?")) return;
    try {
      setError("");
      await deleteEntriesForOwner(supplier.id);
      await deleteDoc(doc(db, "suppliers", supplier.id));
      if (editingId === supplier.id) {
        setEditingId(null);
        setForm({ name: "" });
      }
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Malzemeci silinemedi."));
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: "" });
  };

  if (selected) {
    return (
      <SupplierBook
        db={db}
        supplier={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <section className="ledger">
      <h2>Malzemeci Defteri</h2>
      <p className="muted">Alfabetik sıralanır.</p>
      {error ? <div className="error">{error}</div> : null}
      <div className="ledger-grid">
        <div className="list-card">
          <h3>Malzemeci Listesi</h3>
          <div className="list">
            {suppliers.length === 0 ? (
              <p className="muted">Henüz malzemeci yok.</p>
            ) : (
              suppliers.map((supplier) => (
                <div
                  role="button"
                  tabIndex={0}
                  className="list-item"
                  key={supplier.id}
                  onClick={() => setSelected(supplier)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(supplier);
                    }
                  }}
                >
                  <span className="list-title">{supplier.name}</span>
                  <span className="list-actions">
                    <button
                      type="button"
                      className="link"
                      onClick={(event) => handleEdit(event, supplier)}
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      className="link danger"
                      onClick={(event) => handleDelete(event, supplier)}
                    >
                      Sil
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="form-card">
          <h3>Yeni Malzemeci</h3>
          <form className="form form-inline" onSubmit={handleSubmit}>
            <label>
              Toptancı Adı
              <input
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Örn: Şehir Malzeme"
                required
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
        </div>

      </div>
    </section>
  );
}
