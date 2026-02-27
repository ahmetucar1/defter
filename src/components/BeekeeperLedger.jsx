import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { registerPdfFonts } from "../utils/pdfFonts";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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


const sortByOrder = (a, b) => {
  const hasOrderA = a.order != null;
  const hasOrderB = b.order != null;
  if (hasOrderA && hasOrderB) {
    if (a.order !== b.order) return a.order - b.order;
    return sortByDate(a, b);
  }
  return sortByDate(a, b);
};

function EntryLine({ entry, showPrice, onEdit, onDelete, formatDescription }) {
  const description = formatDescription ? formatDescription(entry) : entry.description;
  return (
    <div className="entry-line">
      <div>
        {entry.date ? <span className="entry-date">{entry.date}</span> : null}
        <span className="entry-desc">{description}</span>
        {entry.note ? <span className="entry-note">({entry.note})</span> : null}
      </div>
      <div className="entry-values">
        {entry.quantity != null ? (
          <span>
            {numberFormatter.format(entry.quantity)} {entry.unit || ""}
          </span>
        ) : null}
        {showPrice && entry.price != null ? (
          <span className="entry-price">
            {numberFormatter.format(entry.price)} TL
          </span>
        ) : null}
        {onEdit || onDelete ? (
          <div className="entry-actions">
            {onEdit ? (
              <button type="button" className="link" onClick={() => onEdit(entry)}>
                Düzenle
              </button>
            ) : null}
            {onDelete ? (
              <button type="button" className="link danger" onClick={() => onDelete(entry)}>
                Sil
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatDisplayDate(dateValue) {
  if (!dateValue) return "";
  const parts = dateValue.split("-");
  if (parts.length !== 3) return dateValue;
  const [year, month, day] = parts;
  return `${day}.${month}.${year}`;
}

function getTodayISO() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function LeftEntryLine({
  entry,
  onEdit,
  onDelete,
  onToggleHidden,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  onOpenShipment
}) {
  const displayDate = formatDisplayDate(entry.date);
  const quantityText =
    entry.quantity != null ? numberFormatter.format(entry.quantity) : "";
  const rawType = entry.itemType || entry.description || "";
  const normalizedType = rawType === "Bal mumu" ? "Mum" : rawType;
  let detail = entry.detail || "";
  if (!detail && entry.description?.startsWith("Bal - ")) {
    detail = entry.description.replace("Bal - ", "");
  }
  const detailText =
    normalizedType === "Bal"
      ? detail || "Bal"
      : normalizedType === "Mum"
        ? "Mum"
        : detail || normalizedType;
  const unitKey = normalizeTextTr(entry.unit);
  const unitText =
    unitKey === "teneke" || unitKey === "adet"
      ? "Adet"
      : unitKey === "kg" || unitKey === "kilo" || unitKey === "kılo" || unitKey === "kilogram"
        ? "Kg"
        : entry.unit || "";
  const unitPrice =
    entry.unitPrice != null
      ? entry.unitPrice
      : entry.price != null && entry.quantity && entry.quantity !== 1
        ? entry.price / entry.quantity
        : null;
  const priceText =
    unitPrice != null && !Number.isNaN(unitPrice)
      ? numberFormatter.format(unitPrice)
      : "-";
  const totalPrice =
    entry.price != null && !Number.isNaN(entry.price)
      ? numberFormatter.format(entry.price)
      : "-";

  const soldText = (() => {
    const soldDate = entry.soldShipmentDate
      ? formatDisplayDate(entry.soldShipmentDate)
      : "";
    const paymentText = entry.soldPaymentStatus ? entry.soldPaymentStatus : "";
    if (soldDate && paymentText) {
      return `(${soldDate}'nde ${paymentText} olarak satıldı)`;
    }
    if (soldDate) {
      return `(${soldDate}'nde satıldı)`;
    }
    if (paymentText) {
      return `(${paymentText} olarak satıldı)`;
    }
    return "(Satıldı)";
  })();

  const canOpenShipment = !!onOpenShipment && !!entry.soldShipmentId;

  return (
    <div
      className={`entry-line entry-line-compact draggable${entry.hidden ? " is-hidden" : ""}${
        entry.soldShipmentId || entry.soldShipmentTitle ? " is-sold" : ""
      }${isDragging ? " is-dragging" : ""}`}
      draggable
      onDragStart={(event) => onDragStart?.(event)}
      onDragOver={(event) => onDragOver?.(event)}
      onDrop={(event) => onDrop?.(event)}
      onDragEnd={onDragEnd}
    >
      <div className="entry-main">
        {displayDate ? <span className="entry-date">{displayDate}</span> : null}
        <div className="entry-text">
          <span className="entry-desc">
            {`${quantityText} ${unitText} ${detailText} x ${priceText}`}
          </span>
          {entry.note ? <span className="entry-note">({entry.note})</span> : null}
          {entry.soldShipmentId || entry.soldShipmentTitle ? (
            canOpenShipment ? (
              <button
                type="button"
                className="entry-sold entry-sold-link"
                onClick={() =>
                onOpenShipment(entry.soldFactoryId, entry.soldShipmentId)
                }
              >
                {soldText}
              </button>
            ) : (
              <span className="entry-sold">{soldText}</span>
            )
          ) : null}
        </div>
      </div>
      <div className="entry-values">
        <span className="entry-price">{totalPrice} TL</span>
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
            {onToggleHidden ? (
              <button
                type="button"
                className="icon-button"
                aria-label={entry.hidden ? "Gizliyi göster" : "Gizle"}
                onClick={() => onToggleHidden(entry)}
              >
                {entry.hidden ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 5c5.5 0 9.4 4.2 10 7-.6 2.8-4.5 7-10 7S2.6 14.8 2 12c.6-2.8 4.5-7 10-7zm0 3.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 5l16 14-1.4 1.4-3.2-2.8a10.8 10.8 0 0 1-2.4.4c-5.5 0-9.4-4.2-10-7a12 12 0 0 1 3.4-5.1L1.6 6.4 3 5zm9 2c-1 0-2 .3-2.8.7l1.8 1.6a2.5 2.5 0 0 1 3.4 3.4l1.7 1.5A5 5 0 0 0 12 7zm-7.4 5a9.7 9.7 0 0 0 6.9 4.5c.5 0 1-.1 1.4-.2l-1.7-1.5a5 5 0 0 1-6.6-4.1z" />
                  </svg>
                )}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RightEntryLine({
  entry,
  onEdit,
  onDelete,
  onToggleHidden,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging
}) {
  const displayDate = formatDisplayDate(entry.date);
  const quantityText =
    entry.quantity != null ? numberFormatter.format(entry.quantity) : "";
  const isCash =
    normalizeTextTr(entry.itemType) === "nakit" ||
    normalizeTextTr(entry.description) === "nakit" ||
    normalizeTextTr(entry.unit) === "tl";
  const detailText = entry.description || "";
  const unitKey = normalizeTextTr(entry.unit);
  const unitText =
    unitKey === "adet" || unitKey === "teneke"
      ? "Adet"
      : unitKey === "kg" || unitKey === "kilo" || unitKey === "kılo" || unitKey === "kilogram"
        ? "Kg"
        : entry.unit || "";
  const unitPrice =
    entry.unitPrice != null
      ? entry.unitPrice
      : entry.price != null && entry.quantity && entry.quantity !== 1
        ? entry.price / entry.quantity
        : null;
  const priceText =
    unitPrice != null && !Number.isNaN(unitPrice)
      ? numberFormatter.format(unitPrice)
      : "-";
  const totalPrice =
    entry.price != null && !Number.isNaN(entry.price)
      ? numberFormatter.format(entry.price)
      : "-";

  return (
    <div
      className={`entry-line entry-line-compact draggable${entry.hidden ? " is-hidden" : ""}${
        isDragging ? " is-dragging" : ""
      }`}
      draggable
      onDragStart={(event) => onDragStart?.(event)}
      onDragOver={(event) => onDragOver?.(event)}
      onDrop={(event) => onDrop?.(event)}
      onDragEnd={onDragEnd}
    >
      <div className="entry-main">
        {displayDate ? <span className="entry-date">{displayDate}</span> : null}
        <div className="entry-text">
          <span className="entry-desc">
            {isCash ? "Nakit" : `${quantityText} ${unitText} ${detailText} x ${priceText}`}
          </span>
          {entry.note ? <span className="entry-note">({entry.note})</span> : null}
        </div>
      </div>
      <div className="entry-values">
        <span className="entry-price">{totalPrice} TL</span>
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
            {onToggleHidden ? (
              <button
                type="button"
                className="icon-button"
                aria-label={entry.hidden ? "Gizliyi göster" : "Gizle"}
                onClick={() => onToggleHidden(entry)}
              >
                {entry.hidden ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 5c5.5 0 9.4 4.2 10 7-.6 2.8-4.5 7-10 7S2.6 14.8 2 12c.6-2.8 4.5-7 10-7zm0 3.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 5l16 14-1.4 1.4-3.2-2.8a10.8 10.8 0 0 1-2.4.4c-5.5 0-9.4-4.2-10-7a12 12 0 0 1 3.4-5.1L1.6 6.4 3 5zm9 2c-1 0-2 .3-2.8.7l1.8 1.6a2.5 2.5 0 0 1 3.4 3.4l1.7 1.5A5 5 0 0 0 12 7zm-7.4 5a9.7 9.7 0 0 0 6.9 4.5c.5 0 1-.1 1.4-.2l-1.7-1.5a5 5 0 0 1-6.6-4.1z" />
                  </svg>
                )}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BeekeeperBook({ db, beekeeper, onBack, onOpenShipment }) {
  const [entries, setEntries] = useState([]);
  const { products, error: productsError, loading: productsLoading } = useProducts(db);
  const [leftForm, setLeftForm] = useState(() => ({
    date: getTodayISO(),
    itemType: "Bal",
    detail: "",
    quantity: "",
    unitPrice: "",
    note: ""
  }));
  const [rightForm, setRightForm] = useState(() => ({
    date: getTodayISO(),
    itemType: "Malzeme",
    detail: "",
    quantity: "",
    unit: "adet",
    unitPrice: "",
    note: ""
  }));
  const [leftEditingId, setLeftEditingId] = useState(null);
  const [rightEditingId, setRightEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showLeftForm, setShowLeftForm] = useState(false);
  const [showRightForm, setShowRightForm] = useState(false);
  const [showHiddenLeft, setShowHiddenLeft] = useState(false);
  const [showHiddenRight, setShowHiddenRight] = useState(false);
  const [draggingEntry, setDraggingEntry] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [pendingBarcode, setPendingBarcode] = useState("");
  const [barcodeProductId, setBarcodeProductId] = useState("");
  const [barcodeError, setBarcodeError] = useState("");
  const barcodeInputRef = useRef(null);
  const rightQuantityRef = useRef(null);
  const [focusRightQty, setFocusRightQty] = useState(false);
  const isNormalizingEntriesRef = useRef(false);

  useEffect(() => {
    const focusId = requestAnimationFrame(() => {
      barcodeInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(focusId);
  }, [beekeeper.id]);

  useEffect(() => {
    if (!showRightForm || !focusRightQty) return;
    const focusId = requestAnimationFrame(() => {
      rightQuantityRef.current?.focus();
    });
    setFocusRightQty(false);
    return () => cancelAnimationFrame(focusId);
  }, [showRightForm, focusRightQty]);

  useEffect(() => {
    const q = query(
      collection(db, "entries"),
      where("ownerType", "==", "beekeeper"),
      where("ownerId", "==", beekeeper.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data()
      }));
      setEntries(rows);
    });

    return () => unsubscribe();
  }, [db, beekeeper.id]);

  useEffect(() => {
    if (!entries.length || isNormalizingEntriesRef.current) return;

    const updates = [];
    entries.forEach((entry) => {
      const changes = {};
      const description = entry.description || "";
      const normalizedDescription = toTitleCaseTr(description);
      const normalizedUnit = normalizeUnitTr(entry.unit);
      if (normalizedUnit && normalizedUnit !== entry.unit) {
        changes.unit = normalizedUnit;
      }
      if (entry.side === "left") {
        const lowerDesc = normalizeTextTr(description);
        let detail = entry.detail || "";
        if (!detail && lowerDesc.startsWith("bal -")) {
          detail = description.split("-").slice(1).join("-").trim();
        }
        const normalizedDetail = detail ? toTitleCaseTr(detail) : "";
        const finalDescription =
          lowerDesc.startsWith("bal -") && normalizedDetail
            ? `Bal - ${normalizedDetail}`
            : normalizedDescription;

        if (finalDescription && finalDescription !== description) {
          changes.description = finalDescription;
        }
        if (normalizedDetail && normalizedDetail !== entry.detail) {
          changes.detail = normalizedDetail;
        }
      } else if (entry.side === "right") {
        if (normalizedDescription && normalizedDescription !== description) {
          changes.description = normalizedDescription;
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

  const leftEntriesAll = useMemo(
    () => entries.filter((entry) => entry.side === "left"),
    [entries]
  );

  const rightEntriesAll = useMemo(
    () => entries.filter((entry) => entry.side === "right"),
    [entries]
  );

  const sortedLeftEntries = useMemo(
    () => leftEntriesAll.slice().sort(sortByOrder),
    [leftEntriesAll]
  );

  const sortedRightEntries = useMemo(
    () => rightEntriesAll.slice().sort(sortByOrder),
    [rightEntriesAll]
  );

  const visibleLeftEntries = useMemo(
    () =>
      showHiddenLeft
        ? sortedLeftEntries
        : sortedLeftEntries.filter((entry) => !entry.hidden),
    [sortedLeftEntries, showHiddenLeft]
  );

  const visibleRightEntries = useMemo(
    () =>
      showHiddenRight
        ? sortedRightEntries
        : sortedRightEntries.filter((entry) => !entry.hidden),
    [sortedRightEntries, showHiddenRight]
  );

  const leftTotal = useMemo(
    () =>
      sortedLeftEntries.reduce(
        (sum, entry) => sum + (entry.hidden ? 0 : entry.price != null ? entry.price : 0),
        0
      ),
    [sortedLeftEntries]
  );

  const rightTotal = useMemo(
    () =>
      sortedRightEntries.reduce(
        (sum, entry) => sum + (entry.hidden ? 0 : entry.price != null ? entry.price : 0),
        0
      ),
    [sortedRightEntries]
  );

  const balance = leftTotal - rightTotal;
  const formattedLeft = numberFormatter.format(leftTotal);
  const formattedRight = numberFormatter.format(rightTotal);
  const formattedDiff = numberFormatter.format(Math.abs(balance));
  const balanceLabel =
    balance > 0 ? "Arıcıya borç" : balance < 0 ? "Arıcının borcu" : "Hesap dengede";

  const formatLeftEntryText = (entry) => {
    const quantityText =
      entry.quantity != null ? numberFormatter.format(entry.quantity) : "";
    const rawType = entry.itemType || entry.description || "";
    const normalizedType = rawType === "Bal mumu" ? "Mum" : rawType;
    let detail = entry.detail || "";
    if (!detail && entry.description?.startsWith("Bal - ")) {
      detail = entry.description.replace("Bal - ", "");
    }
    const detailText =
      normalizedType === "Bal"
        ? detail || "Bal"
        : normalizedType === "Mum"
          ? "Mum"
          : detail || normalizedType;
    const unitKey = normalizeTextTr(entry.unit);
    const unitText =
      unitKey === "teneke" || unitKey === "adet"
        ? "Adet"
        : unitKey === "kg" ||
            unitKey === "kilo" ||
            unitKey === "kılo" ||
            unitKey === "kilogram"
          ? "Kg"
          : entry.unit || "";
    const unitPrice =
      entry.unitPrice != null
        ? entry.unitPrice
        : entry.price != null && entry.quantity && entry.quantity !== 1
          ? entry.price / entry.quantity
          : null;
    const priceText =
      unitPrice != null && !Number.isNaN(unitPrice)
        ? numberFormatter.format(unitPrice)
        : "-";
    return `${quantityText} ${unitText} ${detailText} x ${priceText}`;
  };

  const formatRightEntryText = (entry) => {
    const quantityText =
      entry.quantity != null ? numberFormatter.format(entry.quantity) : "";
    const isCash =
      normalizeTextTr(entry.itemType) === "nakit" ||
      normalizeTextTr(entry.description) === "nakit" ||
      normalizeTextTr(entry.unit) === "tl";
    if (isCash) return "Nakit";
    const detailText = entry.description || "";
    const unitKey = normalizeTextTr(entry.unit);
    const unitText =
      unitKey === "adet" || unitKey === "teneke"
        ? "Adet"
        : unitKey === "kg" ||
            unitKey === "kilo" ||
            unitKey === "kılo" ||
            unitKey === "kilogram"
          ? "Kg"
          : entry.unit || "";
    const unitPrice =
      entry.unitPrice != null
        ? entry.unitPrice
        : entry.price != null && entry.quantity && entry.quantity !== 1
          ? entry.price / entry.quantity
          : null;
    const priceText =
      unitPrice != null && !Number.isNaN(unitPrice)
        ? numberFormatter.format(unitPrice)
        : "-";
    return `${quantityText} ${unitText} ${detailText} x ${priceText}`;
  };

  const handleExportPdf = () => {
    const doc = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    registerPdfFonts(doc);
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 36;
    doc.setFontSize(16);
    doc.text("Arıcı Defteri", 40, y);
    y += 18;
    doc.setFontSize(12);
    doc.text(`${beekeeper.number} - ${beekeeper.name}`, 40, y);
    y += 14;
    if (beekeeper.note) {
      doc.setFontSize(10);
      doc.text(`Not: ${beekeeper.note}`, 40, y);
      y += 12;
    }
    doc.setFontSize(10);
    doc.text(`Tarih: ${formatDisplayDate(getTodayISO())}`, 40, y);
    y += 18;

    doc.setFontSize(12);
    doc.text("Arıcıdan Alınanlar", 40, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Tarih", "İşlem", "Tutar", "Not"]],
      body: visibleLeftEntries.map((entry) => [
        formatDisplayDate(entry.date),
        formatLeftEntryText(entry),
        entry.price != null ? `${numberFormatter.format(entry.price)} TL` : "-",
        entry.note || ""
      ]),
      styles: { font: "Verdana", fontSize: 9, cellPadding: 3 },
      headStyles: {
        font: "Verdana",
        fillColor: [185, 28, 28],
        textColor: [255, 255, 255]
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: pageWidth - 40 - 40 - 70 - 80 - 90 },
        2: { cellWidth: 80, halign: "right" },
        3: { cellWidth: 90 }
      },
      showHead: "everyPage"
    });

    y = doc.lastAutoTable.finalY + 16;
    doc.setFontSize(12);
    doc.text("Arıcıya Verilenler", 40, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [["Tarih", "İşlem", "Tutar", "Not"]],
      body: visibleRightEntries.map((entry) => [
        formatDisplayDate(entry.date),
        formatRightEntryText(entry),
        entry.price != null ? `${numberFormatter.format(entry.price)} TL` : "-",
        entry.note || ""
      ]),
      styles: { font: "Verdana", fontSize: 9, cellPadding: 3 },
      headStyles: {
        font: "Verdana",
        fillColor: [21, 128, 61],
        textColor: [255, 255, 255]
      },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: pageWidth - 40 - 40 - 70 - 80 - 90 },
        2: { cellWidth: 80, halign: "right" },
        3: { cellWidth: 90 }
      },
      showHead: "everyPage"
    });

    y = doc.lastAutoTable.finalY + 16;
    doc.setFontSize(11);
    doc.text(`Alınanlar: ${formattedLeft} TL`, 40, y);
    y += 14;
    doc.text(`Verilenler: - ${formattedRight} TL`, 40, y);
    y += 14;
    doc.text(`Sonuç: ${balanceLabel} ${formattedDiff} TL`, 40, y);

    const safeName = String(beekeeper.name || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^\w\-]/g, "");
    const safeNumber = String(beekeeper.number || "").trim();
    doc.save(`arici-${safeNumber || "defter"}-${safeName || "kayit"}.pdf`);
  };

  const nextLeftOrder = useMemo(() => {
    const maxOrder = sortedLeftEntries.reduce(
      (max, entry) => Math.max(max, entry.order ?? 0),
      0
    );
    return maxOrder + 1;
  }, [sortedLeftEntries]);

  const nextRightOrder = useMemo(() => {
    const maxOrder = sortedRightEntries.reduce(
      (max, entry) => Math.max(max, entry.order ?? 0),
      0
    );
    return maxOrder + 1;
  }, [sortedRightEntries]);

  const hasLeftOrder = useMemo(
    () => sortedLeftEntries.some((entry) => entry.order != null),
    [sortedLeftEntries]
  );

  const hasRightOrder = useMemo(
    () => sortedRightEntries.some((entry) => entry.order != null),
    [sortedRightEntries]
  );

  const productNames = useMemo(
    () => products.map((product) => product.name).filter(Boolean),
    [products]
  );
  const productPriceByName = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      if (product.name) map.set(product.name, product.price ?? null);
    });
    return map;
  }, [products]);

  const productUnitByName = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      if (product.name) map.set(product.name, normalizeUnitTr(product.unit));
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

  const normalizeBarcode = (value) => String(value || "").trim();

  const productByBarcode = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      const barcode = normalizeBarcode(product.barcode);
      if (barcode) {
        map.set(barcode, product);
      }
    });
    return map;
  }, [products]);

  const bulkDiscountProducts = useMemo(
    () => new Set(["RULAMIT", "VAROSET"]),
    []
  );

  const normalizeProductName = (value) =>
    String(value || "")
      .trim()
      .toUpperCase();

  const getAutoPrice = (productName, quantityValue) => {
    const unitPrice = productPriceByName.get(productName);
    if (unitPrice === undefined || unitPrice === null) return "";
    const qty = Number(quantityValue);
    if (!quantityValue || Number.isNaN(qty) || qty <= 0) {
      return String(unitPrice);
    }
    return String(unitPrice * qty);
  };

  const getLeftAutoTotal = (unitPriceValue, quantityValue) => {
    if (unitPriceValue === "" || unitPriceValue === null || unitPriceValue === undefined) {
      return "";
    }
    const unitPrice = Number(unitPriceValue);
    if (Number.isNaN(unitPrice)) return "";
    const qty = Number(quantityValue);
    if (!quantityValue || Number.isNaN(qty) || qty <= 0) {
      return String(unitPrice);
    }
    return String(unitPrice * qty);
  };

  const getRightAutoTotal = (unitPriceValue, quantityValue, productName) => {
    if (unitPriceValue === "" || unitPriceValue === null || unitPriceValue === undefined) {
      return "";
    }
    const unitPrice = Number(unitPriceValue);
    if (Number.isNaN(unitPrice)) return "";
    const qty = Number(quantityValue);
    if (!quantityValue || Number.isNaN(qty) || qty <= 0) {
      return String(unitPrice);
    }
    const normalizedName = normalizeProductName(productName);
    if (bulkDiscountProducts.has(normalizedName) && Number.isInteger(qty)) {
      const fullCases = Math.floor(qty / 12);
      const remainder = qty % 12;
      const total = fullCases * 1000 + remainder * unitPrice;
      return String(total);
    }
    return String(unitPrice * qty);
  };

  const applyProductToRightForm = (product) => {
    if (!product) return;
    setRightEditingId(null);
    setRightForm((prev) => ({
      ...prev,
      date: prev.date || getTodayISO(),
      itemType: "Malzeme",
      detail: product.name || "",
      unit: normalizeUnitTr(product.unit || "adet"),
      unitPrice:
        product.price === undefined || product.price === null
          ? ""
          : String(product.price),
      quantity: "1",
      note: ""
    }));
    setShowRightForm(true);
    setFocusRightQty(true);
  };

  const handleBarcodeLookup = () => {
    const code = normalizeBarcode(barcodeInput);
    if (!code) return;
    const found = productByBarcode.get(code);
    if (found) {
      setBarcodeError("");
      setPendingBarcode("");
      setBarcodeProductId("");
      applyProductToRightForm(found);
      setBarcodeInput("");
      return;
    } else {
      setBarcodeError("Barkod bulunamadı. Ürün seçip eşleştirin.");
      setPendingBarcode(code);
      setBarcodeProductId("");
    }
    setBarcodeInput("");
    requestAnimationFrame(() => {
      barcodeInputRef.current?.focus();
    });
  };

  const handleBarcodeLink = async () => {
    const code = normalizeBarcode(pendingBarcode);
    if (!code || !barcodeProductId) return;
    const product = products.find((item) => item.id === barcodeProductId);
    if (!product) return;
    const existing = productByBarcode.get(code);
    if (existing && existing.id !== product.id) {
      setBarcodeError("Bu barkod başka bir üründe kayıtlı.");
      return;
    }
    try {
      setBarcodeError("");
      await updateDoc(doc(db, "products", product.id), {
        barcode: code,
        updatedAt: serverTimestamp()
      });
      setPendingBarcode("");
      setBarcodeProductId("");
      applyProductToRightForm(product);
    } catch (err) {
      console.error(err);
      setBarcodeError(firebaseErrorMessage(err, "Barkod kaydedilemedi."));
    }
  };

  const toggleEntryHidden = async (entry) => {
    try {
      setError("");
      await updateDoc(doc(db, "entries", entry.id), {
        hidden: !entry.hidden,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Kayıt güncellenemedi."));
    }
  };

  const moveEntry = (list, fromIndex, toIndex) => {
    const updated = list.slice();
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    return updated;
  };

  const persistOrder = async (orderedEntries) => {
    let hasChanges = false;
    const batch = writeBatch(db);
    orderedEntries.forEach((entry, index) => {
      const nextOrder = index + 1;
      if (entry.order !== nextOrder) {
        hasChanges = true;
        batch.update(doc(db, "entries", entry.id), {
          order: nextOrder,
          updatedAt: serverTimestamp()
        });
      }
    });
    if (hasChanges) {
      await batch.commit();
    }
  };

  const handleReorder = async (side, draggedId, targetId) => {
    if (!draggedId || draggedId === targetId) return;
    const sourceList = side === "left" ? sortedLeftEntries : sortedRightEntries;
    const fromIndex = sourceList.findIndex((entry) => entry.id === draggedId);
    const toIndex = sourceList.findIndex((entry) => entry.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = moveEntry(sourceList, fromIndex, toIndex);
    try {
      await persistOrder(reordered);
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Sıralama kaydedilemedi."));
    }
  };

  const handleDragStart = (side, entry) => (event) => {
    setDraggingEntry({ id: entry.id, side });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", entry.id);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (side, entry) => async (event) => {
    event.preventDefault();
    if (!draggingEntry || draggingEntry.side !== side) return;
    await handleReorder(side, draggingEntry.id, entry.id);
    setDraggingEntry(null);
  };

  const handleDragEnd = () => {
    setDraggingEntry(null);
  };

  const formatRightDescription = (entry) => {
    if (entry.itemType === "Malzeme") {
      return `Malzeme - ${entry.description}`;
    }
    if (entry.description?.startsWith("Malzeme - ")) {
      return entry.description;
    }
    return entry.description;
  };

  const handleLeftSubmit = async (event) => {
    event.preventDefault();
    if (!leftForm.quantity) return;

    const unit = normalizeUnitTr(leftForm.itemType === "Bal" ? "teneke" : "kg");
    const normalizedDetail =
      leftForm.itemType === "Bal" ? toTitleCaseTr(leftForm.detail) : "";
    const description =
      leftForm.itemType === "Bal" && normalizedDetail
        ? `Bal - ${normalizedDetail}`
        : toTitleCaseTr(leftForm.itemType);
    const priceValue =
      leftForm.unitPrice === "" ? null : Number(leftForm.unitPrice);
    const totalPriceValue =
      priceValue == null || Number.isNaN(priceValue)
        ? null
        : Number(
            getLeftAutoTotal(priceValue, leftForm.quantity)
          );
    const unitPriceValue =
      leftForm.unitPrice === "" ? null : Number(leftForm.unitPrice);

    try {
      setError("");
      setSaving(true);
      const payload = {
        ownerType: "beekeeper",
        ownerId: beekeeper.id,
        side: "left",
        date: leftForm.date || getTodayISO(),
        description,
        quantity: Number(leftForm.quantity),
        unit,
        price: totalPriceValue == null || Number.isNaN(totalPriceValue)
          ? null
          : totalPriceValue,
        paymentStatus: null,
        dueDate: null,
        note: leftForm.note || "",
        itemType: leftForm.itemType,
        detail: normalizedDetail || "",
        unitPrice: Number.isNaN(unitPriceValue) ? null : unitPriceValue,
        updatedAt: serverTimestamp()
      };

      if (leftEditingId) {
        await updateDoc(doc(db, "entries", leftEditingId), payload);
      } else {
        await addDoc(collection(db, "entries"), {
          ...payload,
          hidden: false,
          ...(hasLeftOrder ? { order: nextLeftOrder } : {}),
          createdAt: serverTimestamp()
        });
      }
      setLeftForm({
        date: getTodayISO(),
        itemType: "Bal",
        detail: "",
        quantity: "",
        unitPrice: "",
        note: ""
      });
      setLeftEditingId(null);
      setShowLeftForm(false);
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Kayıt kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const handleRightSubmit = async (event) => {
    event.preventDefault();
    if (rightForm.itemType === "Malzeme" && !rightForm.detail) return;
    if (rightForm.itemType === "Nakit" && rightForm.unitPrice === "") return;
    if (rightForm.itemType !== "Nakit" && !rightForm.quantity) return;

    let unit = rightForm.unit;
    if (rightForm.itemType === "Boş teneke") unit = "adet";
    if (rightForm.itemType === "Nakit") unit = "TL";
    unit = normalizeUnitTr(unit);

    const descriptionRaw =
      rightForm.itemType === "Malzeme" ? rightForm.detail : rightForm.itemType;
    const description = toTitleCaseTr(descriptionRaw);

    const quantityValue =
      rightForm.itemType === "Nakit" ? 1 : Number(rightForm.quantity);
    const totalPriceValue =
      rightForm.unitPrice === ""
        ? null
        : Number(
            getRightAutoTotal(
              rightForm.unitPrice,
              quantityValue,
              rightForm.itemType === "Malzeme" ? rightForm.detail : rightForm.itemType
            )
          );

    try {
      setError("");
      setSaving(true);
      const payload = {
        ownerType: "beekeeper",
        ownerId: beekeeper.id,
        side: "right",
        date: rightForm.date || getTodayISO(),
        description,
        quantity: quantityValue,
        unit,
        price: totalPriceValue == null || Number.isNaN(totalPriceValue) ? null : totalPriceValue,
        paymentStatus: null,
        dueDate: null,
        note: rightForm.note || "",
        itemType: rightForm.itemType,
        unitPrice:
          rightForm.unitPrice === "" ? null : Number(rightForm.unitPrice),
        updatedAt: serverTimestamp()
      };

      if (rightEditingId) {
        await updateDoc(doc(db, "entries", rightEditingId), payload);
      } else {
        await addDoc(collection(db, "entries"), {
          ...payload,
          hidden: false,
          ...(hasRightOrder ? { order: nextRightOrder } : {}),
          createdAt: serverTimestamp()
        });
      }
      setRightForm({
        date: getTodayISO(),
        itemType: "Malzeme",
        detail: "",
        quantity: "",
        unit: "adet",
        unitPrice: "",
        note: ""
      });
      setRightEditingId(null);
      setShowRightForm(false);
      requestAnimationFrame(() => {
        barcodeInputRef.current?.focus();
      });
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Kayıt kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const unitLabelLeft = normalizeUnitTr(leftForm.itemType === "Bal" ? "teneke" : "kg");
  const rightUnitLabel =
    rightForm.itemType === "Nakit"
      ? "TL"
      : rightForm.itemType === "Boş teneke"
        ? "Adet"
        : normalizeUnitTr(rightForm.unit);

  const startLeftEdit = (entry) => {
    let itemType = entry.itemType || "Bal";
    if (itemType === "Bal mumu") itemType = "Mum";
    if (!entry.itemType) {
      if (entry.description?.startsWith("Bal")) {
        itemType = "Bal";
      } else if (entry.description) {
        itemType = "Mum";
      }
    }
    let detail = entry.detail || "";
    if (!detail && itemType === "Bal" && entry.description?.startsWith("Bal - ")) {
      detail = entry.description.replace("Bal - ", "");
    }
    const unitPriceValue =
      entry.unitPrice != null
        ? String(entry.unitPrice)
        : entry.price != null && entry.quantity
          ? String(entry.price / entry.quantity)
          : "";

    setLeftEditingId(entry.id);
    setLeftForm({
      date: entry.date || "",
      itemType,
      detail,
      quantity: entry.quantity ?? "",
      unitPrice: unitPriceValue,
      note: entry.note || ""
    });
    setShowLeftForm(true);
  };

  const startRightEdit = (entry) => {
    let itemType = entry.itemType;
    let detail = "";

    if (!itemType) {
      if (entry.description?.startsWith("Malzeme - ")) {
        itemType = "Malzeme";
        detail = entry.description.replace("Malzeme - ", "");
      } else if (
        normalizeTextTr(entry.description) === "nakit" ||
        normalizeTextTr(entry.unit) === "tl"
      ) {
        itemType = "Nakit";
      } else if (entry.description === "Boş teneke") {
        itemType = "Boş teneke";
      } else {
        itemType = "Malzeme";
        detail = entry.description || "";
      }
    } else if (itemType === "Malzeme") {
      const resolvedName =
        productNameByNormalized.get(normalizeTextTr(entry.description)) ||
        entry.description ||
        "";
      detail = resolvedName;
    }

    setRightEditingId(entry.id);
    setRightForm({
      date: entry.date || "",
      itemType: itemType || "Malzeme",
      detail,
      quantity: entry.quantity ?? "",
      unit: entry.unit || "adet",
      unitPrice:
        entry.unitPrice != null
          ? String(entry.unitPrice)
          : entry.price != null && entry.quantity
            ? String(entry.price / entry.quantity)
            : "",
      note: entry.note || ""
    });
    setShowRightForm(true);
  };

  const cancelLeftEdit = () => {
    setLeftEditingId(null);
    setLeftForm({
      date: "",
      itemType: "Bal",
      detail: "",
      quantity: "",
      unitPrice: "",
      note: ""
    });
    setShowLeftForm(false);
  };

  const cancelRightEdit = () => {
    setRightEditingId(null);
    setRightForm({
      date: "",
      itemType: "Malzeme",
      detail: "",
      quantity: "",
      unit: "adet",
      unitPrice: "",
      note: ""
    });
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
    if (!window.confirm("Bu kaydı silmek istiyor musunuz?")) return;
    try {
      setError("");
      await deleteDoc(doc(db, "entries", entry.id));
      if (rightEditingId === entry.id) cancelRightEdit();
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Kayıt silinemedi."));
    }
  };

  const handleOpenShipment = async (factoryId, shipmentId) => {
    if (!shipmentId || !onOpenShipment) return;
    if (factoryId) {
      onOpenShipment(factoryId, shipmentId);
      return;
    }
    try {
      const snapshot = await getDoc(doc(db, "entries", shipmentId));
      if (!snapshot.exists()) return;
      const ownerId = snapshot.data()?.ownerId;
      if (ownerId) {
        onOpenShipment(ownerId, shipmentId);
      }
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Sevkiyat açılamadı."));
    }
  };

  return (
    <section className="ledger-detail ledger-detail-modern beekeeper-detail">
      <div className="detail-header">
        <button className="ghost" type="button" onClick={onBack}>
          Arıcı listesine dön
        </button>
        <div>
          <h2>{beekeeper.number} - {beekeeper.name}</h2>
          {beekeeper.note ? (
            <p className="muted">Not: {beekeeper.note}</p>
          ) : null}
          <p className="muted">Arıcı Defteri</p>
        </div>
        <div className="detail-actions">
          <button type="button" className="ghost" onClick={handleExportPdf}>
            PDF İndir
          </button>
        </div>
      </div>
      {productsError ? <div className="error">{productsError}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="book-spread">
        <div className="entry-panel panel-incoming">
          <div className="page-header">
            <h3>Arıcıdan Alınanlar</h3>
            <div className="page-actions">
              <details className="panel-settings">
                <summary className="icon-button" aria-label="Ayarlar">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7zm8.7 2.6l-1.7-.3a6.9 6.9 0 0 0-.7-1.6l1-1.4a1 1 0 0 0-.1-1.2l-1.4-1.4a1 1 0 0 0-1.2-.1l-1.4 1a6.9 6.9 0 0 0-1.6-.7l-.3-1.7a1 1 0 0 0-1-.8h-2a1 1 0 0 0-1 .8l-.3 1.7a6.9 6.9 0 0 0-1.6.7l-1.4-1a1 1 0 0 0-1.2.1L3.2 6.2a1 1 0 0 0-.1 1.2l1 1.4a6.9 6.9 0 0 0-.7 1.6l-1.7.3a1 1 0 0 0-.8 1v2c0 .5.3.9.8 1l1.7.3c.2.6.4 1.1.7 1.6l-1 1.4a1 1 0 0 0 .1 1.2l1.4 1.4a1 1 0 0 0 1.2.1l1.4-1c.5.3 1 .5 1.6.7l.3 1.7a1 1 0 0 0 1 .8h2a1 1 0 0 0 1-.8l.3-1.7c.6-.2 1.1-.4 1.6-.7l1.4 1a1 1 0 0 0 1.2-.1l1.4-1.4a1 1 0 0 0 .1-1.2l-1-1.4c.3-.5.5-1 .7-1.6l1.7-.3a1 1 0 0 0 .8-1v-2a1 1 0 0 0-.8-1z" />
                  </svg>
                </summary>
                <div className="panel-settings-menu">
                  <label className="toggle-inline">
                    <span>Gizlenenleri göster</span>
                    <input
                      type="checkbox"
                      checked={showHiddenLeft}
                      onChange={(event) => setShowHiddenLeft(event.target.checked)}
                    />
                  </label>
                </div>
              </details>
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
                    date: prev.date || getTodayISO()
                  }));
                  setShowLeftForm(true);
                }}
              >
                {showLeftForm ? "Kapat" : "Ekle"}
              </button>
            </div>
          </div>
          {showLeftForm ? (
          <form
            className="form form-inline form-modern"
            onSubmit={handleLeftSubmit}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
                event.preventDefault();
                event.currentTarget.requestSubmit();
              }
            }}
          >
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
            <label>
              Ürün
              <select
                value={leftForm.itemType}
                onChange={(event) =>
                  setLeftForm((prev) => ({
                    ...prev,
                    itemType: event.target.value,
                    detail: event.target.value === "Bal" ? prev.detail : ""
                  }))
                }
              >
                <option value="Bal">Bal</option>
                <option value="Mum">Mum</option>
              </select>
            </label>
            {leftForm.itemType === "Bal" ? (
              <label>
                Bal Türü
                <input
                  type="text"
                  value={leftForm.detail}
                  onChange={(event) =>
                    setLeftForm((prev) => ({ ...prev, detail: event.target.value }))
                  }
                  placeholder="Örn: Çiçek, Çam"
                />
              </label>
            ) : null}
            <label>
              Miktar ({unitLabelLeft})
              <input
                type="number"
                step="0.01"
                min="0"
                value={leftForm.quantity}
                onChange={(event) =>
                  setLeftForm((prev) => ({
                    ...prev,
                    quantity: event.target.value
                  }))
                }
                required
              />
            </label>
            <label>
              Birim Fiyat
              <input
                type="number"
                step="0.01"
                min="0"
                value={leftForm.unitPrice}
                onChange={(event) =>
                  setLeftForm((prev) => ({
                    ...prev,
                    unitPrice: event.target.value
                  }))
                }
                placeholder="Adet fiyatı"
              />
            </label>
            {leftForm.unitPrice !== "" ? (
              <div className="inline-info">
                Toplam: {numberFormatter.format(
                  Number(getLeftAutoTotal(leftForm.unitPrice, leftForm.quantity) || 0)
                )} TL
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
                placeholder="Opsiyonel"
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
            {visibleLeftEntries.length === 0 ? (
              <p className="muted">Henüz kayıt yok.</p>
            ) : (
              visibleLeftEntries.map((entry) => (
                <LeftEntryLine
                  key={entry.id}
                  entry={entry}
                  onEdit={startLeftEdit}
                  onDelete={handleLeftDelete}
                  onToggleHidden={toggleEntryHidden}
                  onDragStart={handleDragStart("left", entry)}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop("left", entry)}
                  onDragEnd={handleDragEnd}
                  isDragging={draggingEntry?.id === entry.id}
                  onOpenShipment={handleOpenShipment}
                />
              ))
            )}
          </div>
          <div className="total-bar">
            Toplam: {numberFormatter.format(leftTotal)} TL
          </div>
        </div>

        <div className="entry-panel panel-outgoing">
          <div className="page-header">
            <h3>Arıcıya Verilenler</h3>
            <div className="page-actions">
              <details className="panel-settings">
                <summary className="icon-button" aria-label="Ayarlar">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7zm8.7 2.6l-1.7-.3a6.9 6.9 0 0 0-.7-1.6l1-1.4a1 1 0 0 0-.1-1.2l-1.4-1.4a1 1 0 0 0-1.2-.1l-1.4 1a6.9 6.9 0 0 0-1.6-.7l-.3-1.7a1 1 0 0 0-1-.8h-2a1 1 0 0 0-1 .8l-.3 1.7a6.9 6.9 0 0 0-1.6.7l-1.4-1a1 1 0 0 0-1.2.1L3.2 6.2a1 1 0 0 0-.1 1.2l1 1.4a6.9 6.9 0 0 0-.7 1.6l-1.7.3a1 1 0 0 0-.8 1v2c0 .5.3.9.8 1l1.7.3c.2.6.4 1.1.7 1.6l-1 1.4a1 1 0 0 0 .1 1.2l1.4 1.4a1 1 0 0 0 1.2.1l1.4-1c.5.3 1 .5 1.6.7l.3 1.7a1 1 0 0 0 1 .8h2a1 1 0 0 0 1-.8l.3-1.7c.6-.2 1.1-.4 1.6-.7l1.4 1a1 1 0 0 0 1.2-.1l1.4-1.4a1 1 0 0 0 .1-1.2l-1-1.4c.3-.5.5-1 .7-1.6l1.7-.3a1 1 0 0 0 .8-1v-2a1 1 0 0 0-.8-1z" />
                  </svg>
                </summary>
                <div className="panel-settings-menu">
                  <label className="toggle-inline">
                    <span>Gizlenenleri göster</span>
                    <input
                      type="checkbox"
                      checked={showHiddenRight}
                      onChange={(event) => setShowHiddenRight(event.target.checked)}
                    />
                  </label>
                </div>
              </details>
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
          <div className="barcode-panel">
            <label>
              Barkod
              <input
                type="text"
                value={barcodeInput}
                onChange={(event) => setBarcodeInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleBarcodeLookup();
                  }
                }}
                placeholder="Barkod okut"
                ref={barcodeInputRef}
              />
            </label>
            <button type="button" className="ghost" onClick={handleBarcodeLookup}>
              Barkod Oku
            </button>
          </div>
          {barcodeError ? <div className="error">{barcodeError}</div> : null}
          {pendingBarcode ? (
            <div className="barcode-linker">
              <p className="muted">Barkod kayıtlı değil: {pendingBarcode}</p>
              <label>
                Ürün
                <select
                  value={barcodeProductId}
                  onChange={(event) => setBarcodeProductId(event.target.value)}
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
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button type="button" onClick={handleBarcodeLink} disabled={!barcodeProductId}>
                  Barkodu Kaydet
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setPendingBarcode("");
                    setBarcodeProductId("");
                    setBarcodeError("");
                  }}
                >
                  Kapat
                </button>
              </div>
            </div>
          ) : null}
          {showRightForm ? (
          <form
            className="form form-inline form-modern"
            onSubmit={handleRightSubmit}
            onKeyDown={(event) => {
              if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
                event.preventDefault();
                event.currentTarget.requestSubmit();
              }
            }}
          >
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
            {rightForm.itemType === "Malzeme" ? (
              <label>
                Ürün
                <select
                  value={rightForm.detail}
                  onChange={(event) => {
                    const selected = event.target.value;
                    const suggestedPrice = productPriceByName.get(selected);
                    const suggestedUnit = productUnitByName.get(selected);
                    setRightForm((prev) => ({
                      ...prev,
                      detail: selected,
                      unitPrice:
                        suggestedPrice === undefined || suggestedPrice === null
                          ? ""
                          : String(suggestedPrice),
                      unit: suggestedUnit ?? ""
                    }));
                  }}
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
                  {rightForm.detail && !productNames.includes(rightForm.detail) ? (
                    <option value={rightForm.detail}>
                      {rightForm.detail} (listede yok)
                    </option>
                  ) : null}
                  {productNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {rightForm.itemType !== "Nakit" ? (
              <label>
                Miktar ({rightUnitLabel})
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rightForm.quantity}
                  ref={rightQuantityRef}
                  onChange={(event) =>
                    setRightForm((prev) => ({
                      ...prev,
                      quantity: event.target.value
                    }))
                  }
                  required
                />
              </label>
            ) : null}
            <label>
              {rightForm.itemType === "Nakit" ? "Tutar" : "Birim Fiyat"}
              <input
                type="number"
                step="0.01"
                min="0"
                value={rightForm.unitPrice}
                onChange={(event) =>
                  setRightForm((prev) => ({
                    ...prev,
                    unitPrice: event.target.value
                  }))
                }
                placeholder={rightForm.itemType === "Nakit" ? "Tutar" : "Adet fiyatı"}
                required={rightForm.itemType === "Nakit"}
              />
            </label>
            {rightForm.itemType !== "Nakit" && rightForm.unitPrice !== "" ? (
              <div className="inline-info">
                Toplam: {numberFormatter.format(
                  Number(
                    getRightAutoTotal(
                      rightForm.unitPrice,
                      rightForm.quantity,
                      rightForm.itemType === "Malzeme" ? rightForm.detail : rightForm.itemType
                    ) || 0
                  )
                )} TL
              </div>
            ) : null}
            <label>
              Not
              <input
                type="text"
                value={rightForm.note}
                onChange={(event) =>
                  setRightForm((prev) => ({ ...prev, note: event.target.value }))
                }
                placeholder="Opsiyonel"
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
            {visibleRightEntries.length === 0 ? (
              <p className="muted">Henüz kayıt yok.</p>
            ) : (
              visibleRightEntries.map((entry) => (
                <RightEntryLine
                  key={entry.id}
                  entry={entry}
                  onEdit={startRightEdit}
                  onDelete={handleRightDelete}
                  onToggleHidden={toggleEntryHidden}
                  onDragStart={handleDragStart("right", entry)}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop("right", entry)}
                  onDragEnd={handleDragEnd}
                  isDragging={draggingEntry?.id === entry.id}
                />
              ))
            )}
          </div>
          <div className="total-bar">
            Toplam: {numberFormatter.format(rightTotal)} TL
          </div>
        </div>
      </div>
      <div className="summary-bar">
        <div className="summary-row summary-row-incoming">
          <span className="summary-label">Alınanlar</span>
          <span className="summary-amount">{formattedLeft} TL</span>
        </div>
        <div className="summary-row summary-row-outgoing">
          <span className="summary-label">Verilenler</span>
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

export default function BeekeeperLedger({
  db,
  focusBeekeeperId,
  onClearFocus,
  onOpenShipment
}) {
  const [beekeepers, setBeekeepers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ number: "", name: "", note: "" });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "beekeepers"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data()
      }));
      rows.sort((a, b) => (a.number || 0) - (b.number || 0));
      setBeekeepers(rows);
    });

    return () => unsubscribe();
  }, [db]);

  useEffect(() => {
    if (!focusBeekeeperId || beekeepers.length === 0) return;
    const found = beekeepers.find((beekeeper) => beekeeper.id === focusBeekeeperId);
    if (found) {
      setSelected(found);
    }
    onClearFocus?.();
  }, [focusBeekeeperId, beekeepers, onClearFocus]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.number || !form.name) return;

    try {
      setError("");
      setSaving(true);
      const normalizedName = toTitleCaseTr(form.name);
      if (editingId) {
        await updateDoc(doc(db, "beekeepers", editingId), {
          number: Number(form.number),
          name: normalizedName,
          note: form.note ? form.note.trim() : "",
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, "beekeepers"), {
          number: Number(form.number),
          name: normalizedName,
          note: form.note ? form.note.trim() : "",
          active: true,
          createdAt: serverTimestamp()
        });
      }
      setForm({ number: "", name: "", note: "" });
      setEditingId(null);
      setShowForm(false);
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Arıcı kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (event, beekeeper) => {
    event.stopPropagation();
    setEditingId(beekeeper.id);
    setForm({
      number: beekeeper.number ?? "",
      name: beekeeper.name ?? "",
      note: beekeeper.note ?? ""
    });
    setShowForm(true);
  };

  const deleteEntriesForOwner = async (ownerId) => {
    const entriesQuery = query(
      collection(db, "entries"),
      where("ownerType", "==", "beekeeper"),
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

  const handleDelete = async (event, beekeeper) => {
    event.stopPropagation();
    if (!window.confirm("Bu arıcı ve tüm kayıtları silinsin mi?")) return;
    try {
      setError("");
      await deleteEntriesForOwner(beekeeper.id);
      await deleteDoc(doc(db, "beekeepers", beekeeper.id));
      if (editingId === beekeeper.id) {
        setEditingId(null);
        setForm({ number: "", name: "", note: "" });
      }
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Arıcı silinemedi."));
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ number: "", name: "", note: "" });
    setShowForm(false);
  };

  const filteredBeekeepers = useMemo(() => {
    const queryText = search.trim().toLowerCase();
    if (!queryText) return beekeepers;
    return beekeepers.filter((beekeeper) => {
      const numberText = String(beekeeper.number ?? "");
      const nameText = (beekeeper.name || "").toLowerCase();
      const noteText = (beekeeper.note || "").toLowerCase();
      return (
        numberText.includes(queryText) ||
        nameText.includes(queryText) ||
        noteText.includes(queryText)
      );
    });
  }, [beekeepers, search]);

  if (selected) {
    return (
      <BeekeeperBook
        db={db}
        beekeeper={selected}
        onBack={() => setSelected(null)}
        onOpenShipment={onOpenShipment}
      />
    );
  }

  return (
    <section className="ledger">
      <h2>Arıcı Defteri</h2>
      <p className="muted">Arıcı numarasına göre sıralanır.</p>
      {error ? <div className="error">{error}</div> : null}
      <div className="ledger-grid">
        <div className="list-card">
          <div className="list-header">
            <h3>Arıcı Listesi</h3>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (showForm && !editingId) {
                  setShowForm(false);
                  setForm({ number: "", name: "", note: "" });
                  return;
                }
                setEditingId(null);
                setForm({ number: "", name: "", note: "" });
                setShowForm(true);
              }}
            >
              {showForm && !editingId ? "Kapat" : "Ekle"}
            </button>
          </div>
          <label className="search">
            Arama
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Arıcı no, isim veya not"
            />
          </label>
          <div className="list">
            {filteredBeekeepers.length === 0 ? (
              <p className="muted">
                {search.trim() ? "Sonuç bulunamadı." : "Henüz arıcı yok."}
              </p>
            ) : (
              filteredBeekeepers.map((beekeeper) => (
                <div
                  role="button"
                  tabIndex={0}
                  className="list-item"
                  key={beekeeper.id}
                  onClick={() => setSelected(beekeeper)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(beekeeper);
                    }
                  }}
                >
                  <span className="list-title">
                    {beekeeper.number} - {beekeeper.name}
                  </span>
                  <span className="list-actions">
                    <button
                      type="button"
                      className="link"
                      onClick={(event) => handleEdit(event, beekeeper)}
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      className="link danger"
                      onClick={(event) => handleDelete(event, beekeeper)}
                    >
                      Sil
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {showForm ? (
          <div className="form-card">
            <h3>{editingId ? "Arıcıyı Düzenle" : "Yeni Arıcı"}</h3>
            <form className="form form-inline" onSubmit={handleSubmit}>
              <label>
                Arıcı No
                <input
                  type="number"
                  value={form.number}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, number: event.target.value }))
                  }
                  placeholder="Örn: 12"
                  required
                />
              </label>
              <label>
                Ad Soyad
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Örn: Mehmet Kaya"
                  required
                />
              </label>
            <label>
              Not
                <input
                  type="text"
                  value={form.note}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                  placeholder="Örn: Kovan sayısı, özel not"
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
                ) : (
                  <button type="button" className="ghost" onClick={cancelEdit}>
                    Kapat
                  </button>
                )}
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </section>
  );
}
