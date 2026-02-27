import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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
import { firebaseErrorMessage } from "../utils/firebaseError";
import { normalizeTextTr, normalizeUnitTr, toTitleCaseTr } from "../utils/textFormat";
import { registerPdfFonts } from "../utils/pdfFonts";

const numberFormatter = new Intl.NumberFormat("tr-TR");

const sortByDate = (a, b) => {
  const first = a.date || "";
  const second = b.date || "";
  if (first === second) {
    return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
  }
  return first.localeCompare(second);
};

const ENTRY_TYPE_SHIPMENT = "shipment";
const ENTRY_TYPE_LINE = "shipmentLine";
const ENTRY_TYPE_PAYMENT = "payment";

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

function EntryRow({ entry, onEdit, onDelete }) {
  const total =
    entry.price != null && entry.quantity != null
      ? entry.price * entry.quantity
      : null;

  return (
    <div className="entry-line">
      <div>
        <span className="entry-date">{formatDisplayDate(entry.date)}</span>
        <span className="entry-desc">{entry.description}</span>
        {entry.note ? <span className="entry-note">({entry.note})</span> : null}
      </div>
      <div className="entry-values">
        <span>
          {numberFormatter.format(entry.quantity)} {entry.unit}
        </span>
        {entry.price != null ? (
          <span className="entry-price">
            {numberFormatter.format(entry.price)} TL
          </span>
        ) : null}
        {total != null ? (
          <span className="entry-total">
            {numberFormatter.format(total)} TL
          </span>
        ) : null}
        <span className="entry-status">{entry.paymentStatus}</span>
        {entry.dueDate ? (
          <span className="entry-date">Vade: {entry.dueDate}</span>
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

function FactoryBook({
  db,
  factory,
  onBack,
  onOpenBeekeeper,
  focusShipmentId,
  onClearFocus
}) {
  const [entries, setEntries] = useState([]);
  const [beekeepers, setBeekeepers] = useState([]);
  const [beekeeperEntries, setBeekeeperEntries] = useState([]);
  const [shipmentForm, setShipmentForm] = useState({
    date: getTodayISO(),
    title: ""
  });
  const [lineForm, setLineForm] = useState({
    lineNo: "",
    personName: "",
    quantity: "",
    type: "",
    paymentStatus: "",
    unitPrice: "",
    sourceEntryId: ""
  });
  const [editingShipmentId, setEditingShipmentId] = useState(null);
  const [editingLineId, setEditingLineId] = useState(null);
  const [editingLineSourceId, setEditingLineSourceId] = useState(null);
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [openShipmentId, setOpenShipmentId] = useState(null);
  const [lineFormShipmentId, setLineFormShipmentId] = useState(null);
  const [showShipmentForm, setShowShipmentForm] = useState(false);
  const [fullScreenShipmentId, setFullScreenShipmentId] = useState(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    date: getTodayISO(),
    amount: "",
    note: ""
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isNormalizingEntriesRef = useRef(false);
  const isBackfillingSoldRef = useRef(false);

  useEffect(() => {
    const q = query(
      collection(db, "entries"),
      where("ownerType", "==", "factory"),
      where("ownerId", "==", factory.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data()
      }));
      setEntries(rows);
    });

    return () => unsubscribe();
  }, [db, factory.id]);

  useEffect(() => {
    const q = query(collection(db, "beekeepers"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data()
      }));
      setBeekeepers(rows);
    });

    return () => unsubscribe();
  }, [db]);

  useEffect(() => {
    if (!entries.length || isNormalizingEntriesRef.current) return;
    const updates = [];
    entries.forEach((entry) => {
      const changes = {};
      if (entry.entryType === ENTRY_TYPE_SHIPMENT) {
        const normalizedTitle = toTitleCaseTr(entry.title);
        if (normalizedTitle && normalizedTitle !== entry.title) {
          changes.title = normalizedTitle;
        }
  } else if (entry.entryType === ENTRY_TYPE_LINE) {
        const normalizedName = toTitleCaseTr(entry.personName);
        const normalizedType = entry.type ? toTitleCaseTr(entry.type) : "";
        const normalizedPayment = entry.paymentStatus
          ? toTitleCaseTr(entry.paymentStatus)
          : "";
        const normalizedUnit = normalizeUnitTr(entry.unit);
        if (normalizedName && normalizedName !== entry.personName) {
          changes.personName = normalizedName;
        }
        if ((entry.type || "") !== normalizedType) {
          changes.type = normalizedType;
        }
        if ((entry.paymentStatus || "") !== normalizedPayment) {
          changes.paymentStatus = normalizedPayment;
        }
        if (normalizedUnit && normalizedUnit !== entry.unit) {
          changes.unit = normalizedUnit;
        }
      } else if (entry.entryType === ENTRY_TYPE_PAYMENT) {
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

  const shipments = useMemo(
    () =>
      entries
        .filter((entry) => entry.entryType === ENTRY_TYPE_SHIPMENT)
        .slice()
        .sort(sortByDate),
    [entries]
  );

  useEffect(() => {
    if (!focusShipmentId) return;
    setOpenShipmentId(focusShipmentId);
    setLineFormShipmentId(null);
    setEditingLineId(null);
    onClearFocus?.();
  }, [focusShipmentId, onClearFocus]);

  const matchedBeekeeper = useMemo(() => {
    const key = normalizeTextTr(lineForm.personName);
    if (!key) return null;
    return beekeepers.find(
      (beekeeper) => normalizeTextTr(beekeeper.name) === key
    ) || null;
  }, [lineForm.personName, beekeepers]);

  const findBeekeeperByName = (name) => {
    const key = normalizeTextTr(name);
    if (!key) return null;
    return beekeepers.find(
      (beekeeper) => normalizeTextTr(beekeeper.name) === key
    ) || null;
  };

  useEffect(() => {
    if (!matchedBeekeeper) {
      setBeekeeperEntries([]);
      return;
    }
    const q = query(
      collection(db, "entries"),
      where("ownerType", "==", "beekeeper"),
      where("ownerId", "==", matchedBeekeeper.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data()
      }));
      setBeekeeperEntries(rows);
    });
    return () => unsubscribe();
  }, [db, matchedBeekeeper?.id]);

  const availableBalEntries = useMemo(() => {
    const isBalEntry = (entry) =>
      entry.side === "left" &&
      !entry.hidden &&
      (entry.itemType === "Bal" || entry.description?.startsWith("Bal")) &&
      !entry.soldShipmentId &&
      !entry.soldShipmentTitle;
    return beekeeperEntries.filter(isBalEntry).sort(sortByDate);
  }, [beekeeperEntries]);

  const shipmentLines = useMemo(
    () => entries.filter((entry) => entry.entryType === ENTRY_TYPE_LINE),
    [entries]
  );

  useEffect(() => {
    if (!entries.length || isBackfillingSoldRef.current) return;
    const linesWithSource = shipmentLines.filter((line) => line.sourceEntryId);
    if (linesWithSource.length === 0) return;
    const shipmentMap = new Map(shipments.map((shipment) => [shipment.id, shipment]));
    const updates = linesWithSource
      .map((line) => {
        const shipment = shipmentMap.get(line.shipmentId);
        if (!shipment) return null;
        return {
          id: line.sourceEntryId,
          changes: {
            soldShipmentId: line.shipmentId,
            soldShipmentTitle: shipment.title || "",
            soldShipmentDate: shipment.date || null,
            soldPaymentStatus: line.paymentStatus ? toTitleCaseTr(line.paymentStatus) : null,
            soldFactoryId: factory.id
          }
        };
      })
      .filter(Boolean);
    if (updates.length === 0) return;
    isBackfillingSoldRef.current = true;
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
      } finally {
        isBackfillingSoldRef.current = false;
      }
    };
    run();
  }, [entries, shipmentLines, shipments, db]);

  const payments = useMemo(
    () =>
      entries
        .filter((entry) => entry.entryType === ENTRY_TYPE_PAYMENT)
        .slice()
        .sort(sortByDate),
    [entries]
  );

  const legacyEntries = useMemo(
    () => entries.filter((entry) => !entry.entryType),
    [entries]
  );

  const linesByShipment = useMemo(() => {
    const map = new Map();
    shipmentLines.forEach((line) => {
      if (!line.shipmentId) return;
      const list = map.get(line.shipmentId) || [];
      list.push(line);
      map.set(line.shipmentId, list);
    });
    map.forEach((list) => {
      list.sort((a, b) => {
        const lineA = a.lineNo ?? 0;
        const lineB = b.lineNo ?? 0;
        if (lineA !== lineB) return lineA - lineB;
        return sortByDate(a, b);
      });
    });
    return map;
  }, [shipmentLines]);

  const fullScreenShipment = useMemo(
    () => shipments.find((shipment) => shipment.id === fullScreenShipmentId) || null,
    [shipments, fullScreenShipmentId]
  );

  const fullScreenLines = useMemo(
    () => (fullScreenShipmentId ? linesByShipment.get(fullScreenShipmentId) || [] : []),
    [linesByShipment, fullScreenShipmentId]
  );

  const fullScreenTitle = fullScreenShipment
    ? fullScreenShipment.title
      ? `${formatDisplayDate(fullScreenShipment.date)} tarihinde ${fullScreenShipment.title}`
      : formatDisplayDate(fullScreenShipment.date)
    : "Sevkiyat Detayı";

  const getLineTotal = (line) => {
    const totalValue =
      line.total != null && !Number.isNaN(line.total)
        ? line.total
        : line.quantity != null && line.unitPrice != null
          ? line.quantity * line.unitPrice
          : 0;
    return Number.isNaN(totalValue) ? 0 : totalValue;
  };

  const shipmentsTotal = useMemo(() => {
    const linesTotal = shipmentLines.reduce((sum, line) => sum + getLineTotal(line), 0);
    const legacyTotal = legacyEntries.reduce((sum, entry) => {
      if (entry.price != null && entry.quantity != null) {
        return sum + entry.price * entry.quantity;
      }
      return sum;
    }, 0);
    return linesTotal + legacyTotal;
  }, [shipmentLines, legacyEntries]);

  const paymentsTotal = useMemo(
    () =>
      payments.reduce((sum, payment) => {
        const amountValue = Number(payment.amount);
        return sum + (Number.isNaN(amountValue) ? 0 : amountValue);
      }, 0),
    [payments]
  );

  const remainingTotal = shipmentsTotal - paymentsTotal;

  const getNextLineNo = (shipmentId) => {
    const list = linesByShipment.get(shipmentId) || [];
    const maxLine = list.reduce(
      (max, line) => Math.max(max, line.lineNo ?? 0),
      0
    );
    return String(maxLine + 1);
  };

  const getBalDetail = (entry) => {
    let detail = entry.detail || "";
    if (!detail && entry.description?.startsWith("Bal - ")) {
      detail = entry.description.replace("Bal - ", "").trim();
    }
    return detail;
  };

  const getBalUnitPrice = (entry) => {
    if (entry.unitPrice != null && !Number.isNaN(entry.unitPrice)) {
      return Number(entry.unitPrice);
    }
    if (entry.price != null && entry.quantity) {
      const calculated = Number(entry.price) / Number(entry.quantity);
      return Number.isNaN(calculated) ? null : calculated;
    }
    return null;
  };

  const handleShipmentSubmit = async (event) => {
    event.preventDefault();
    if (!shipmentForm.date || !shipmentForm.title.trim()) return;
    try {
      setError("");
      setSaving(true);
      const payload = {
        ownerType: "factory",
        ownerId: factory.id,
        entryType: ENTRY_TYPE_SHIPMENT,
        date: shipmentForm.date,
        title: toTitleCaseTr(shipmentForm.title),
        updatedAt: serverTimestamp()
      };

      if (editingShipmentId) {
        await updateDoc(doc(db, "entries", editingShipmentId), payload);
      } else {
        await addDoc(collection(db, "entries"), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }
      setShipmentForm({ date: getTodayISO(), title: "" });
      setEditingShipmentId(null);
      setShowShipmentForm(false);
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Başlık kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const startShipmentEdit = (shipment) => {
    setEditingShipmentId(shipment.id);
    setShipmentForm({
      date: shipment.date || getTodayISO(),
      title: shipment.title || ""
    });
    setShowShipmentForm(true);
  };

  const cancelShipmentEdit = () => {
    setEditingShipmentId(null);
    setShipmentForm({ date: getTodayISO(), title: "" });
    setShowShipmentForm(false);
  };

  const handleDeleteShipment = async (shipment) => {
    if (!window.confirm("Bu sevkiyatı silmek istiyor musunuz?")) return;
    try {
      setError("");
      const linesQuery = query(
        collection(db, "entries"),
        where("ownerType", "==", "factory"),
        where("ownerId", "==", factory.id),
        where("entryType", "==", ENTRY_TYPE_LINE),
        where("shipmentId", "==", shipment.id)
      );
      const snapshot = await getDocs(linesQuery);
      const sourceEntryIds = new Set();
      snapshot.forEach((docItem) => {
        const data = docItem.data();
        if (data?.sourceEntryId) {
          sourceEntryIds.add(data.sourceEntryId);
        }
      });
      let batch = writeBatch(db);
      let count = 0;
      const commits = [];
      sourceEntryIds.forEach((sourceEntryId) => {
        batch.update(doc(db, "entries", sourceEntryId), {
          soldShipmentId: null,
          soldShipmentTitle: null,
          soldShipmentDate: null,
          soldPaymentStatus: null,
          soldFactoryId: null,
          updatedAt: serverTimestamp()
        });
        count += 1;
        if (count >= 450) {
          commits.push(batch.commit());
          batch = writeBatch(db);
          count = 0;
        }
      });
      snapshot.forEach((docItem) => {
        batch.delete(docItem.ref);
        count += 1;
        if (count >= 450) {
          commits.push(batch.commit());
          batch = writeBatch(db);
          count = 0;
        }
      });
      batch.delete(doc(db, "entries", shipment.id));
      commits.push(batch.commit());
      await Promise.all(commits);
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Sevkiyat silinemedi."));
    }
  };

  const startAddLine = (shipmentId) => {
    setOpenShipmentId(shipmentId);
    setLineFormShipmentId(shipmentId);
    setEditingLineId(null);
    setEditingLineSourceId(null);
    setLineForm({
      lineNo: getNextLineNo(shipmentId),
      personName: "",
      quantity: "",
      type: "",
      paymentStatus: "",
      unitPrice: "",
      sourceEntryId: ""
    });
  };

  const toggleShipment = (shipmentId) => {
    if (openShipmentId === shipmentId) {
      setOpenShipmentId(null);
      setLineFormShipmentId(null);
      setEditingLineId(null);
      return;
    }
    setOpenShipmentId(shipmentId);
  };

  const startEditLine = (line) => {
    setOpenShipmentId(line.shipmentId);
    setLineFormShipmentId(line.shipmentId);
    setEditingLineId(line.id);
    setEditingLineSourceId(line.sourceEntryId || null);
    setLineForm({
      lineNo: line.lineNo ?? "",
      personName: line.personName || "",
      quantity: line.quantity ?? "",
      type: line.type || "",
      paymentStatus: line.paymentStatus || "",
      unitPrice: line.unitPrice ?? "",
      sourceEntryId: line.sourceEntryId || ""
    });
  };

  const cancelLineEdit = () => {
    setEditingLineId(null);
    setEditingLineSourceId(null);
    setLineFormShipmentId(null);
    setLineForm({
      lineNo: "",
      personName: "",
      quantity: "",
      type: "",
      paymentStatus: "",
      unitPrice: "",
      sourceEntryId: ""
    });
  };

  const saveLine = async ({
    shipmentId,
    lineNo,
    personName,
    quantity,
    type,
    paymentStatus,
    unitPrice,
    sourceEntryId
  }) => {
    if (!shipmentId) return false;
    if (!lineNo || !personName || !quantity || unitPrice === "" || unitPrice == null) {
      return false;
    }
    try {
      setError("");
      setSaving(true);
      const quantityValue = Number(quantity);
      const unitPriceValue = Number(unitPrice);
      const payload = {
        ownerType: "factory",
        ownerId: factory.id,
        entryType: ENTRY_TYPE_LINE,
        shipmentId,
        lineNo: Number(lineNo),
        personName: toTitleCaseTr(personName),
        quantity: quantityValue,
        unit: normalizeUnitTr("adet"),
        type: type ? toTitleCaseTr(type) : "",
        paymentStatus: paymentStatus ? toTitleCaseTr(paymentStatus) : "",
        unitPrice: unitPriceValue,
        sourceEntryId: sourceEntryId || null,
        total:
          Number.isNaN(quantityValue) || Number.isNaN(unitPriceValue)
            ? null
            : quantityValue * unitPriceValue,
        updatedAt: serverTimestamp()
      };

      if (editingLineId) {
        await updateDoc(doc(db, "entries", editingLineId), payload);
      } else {
        await addDoc(collection(db, "entries"), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }

      const currentShipment = shipments.find(
        (shipment) => shipment.id === shipmentId
      );
      const soldTitle = currentShipment?.title || "";

      if (editingLineSourceId && editingLineSourceId !== sourceEntryId) {
        await updateDoc(doc(db, "entries", editingLineSourceId), {
          soldShipmentId: null,
          soldShipmentTitle: null,
          soldShipmentDate: null,
          soldPaymentStatus: null,
          soldFactoryId: null,
          updatedAt: serverTimestamp()
        });
      }

      if (sourceEntryId) {
        await updateDoc(doc(db, "entries", sourceEntryId), {
          soldShipmentId: shipmentId,
          soldShipmentTitle: soldTitle,
          soldShipmentDate: currentShipment?.date || null,
          soldPaymentStatus: paymentStatus ? toTitleCaseTr(paymentStatus) : null,
          soldFactoryId: factory.id,
          updatedAt: serverTimestamp()
        });
      }

      setLineForm((prev) => ({
        ...prev,
        lineNo: getNextLineNo(shipmentId),
        personName: "",
        quantity: "",
        type: "",
        paymentStatus: "",
        unitPrice: "",
        sourceEntryId: ""
      }));
      setEditingLineId(null);
      setEditingLineSourceId(null);
      return true;
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Satır kaydedilemedi."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleLineSubmit = async (event) => {
    event.preventDefault();
    await saveLine({
      shipmentId: lineFormShipmentId,
      lineNo: lineForm.lineNo,
      personName: lineForm.personName,
      quantity: lineForm.quantity,
      type: lineForm.type,
      paymentStatus: lineForm.paymentStatus,
      unitPrice: lineForm.unitPrice,
      sourceEntryId: lineForm.sourceEntryId
    });
  };

  const handleDeleteLine = async (line) => {
    if (!window.confirm("Bu satırı silmek istiyor musunuz?")) return;
    try {
      setError("");
      await deleteDoc(doc(db, "entries", line.id));
      if (line.sourceEntryId) {
        await updateDoc(doc(db, "entries", line.sourceEntryId), {
          soldShipmentId: null,
          soldShipmentTitle: null,
          soldShipmentDate: null,
          soldPaymentStatus: null,
          soldFactoryId: null,
          updatedAt: serverTimestamp()
        });
      }
      if (editingLineId === line.id) cancelLineEdit();
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Satır silinemedi."));
    }
  };

  const handleSuggestionSelect = async (entry) => {
    if (!lineFormShipmentId) return;
    const detail = getBalDetail(entry);
    const unitPriceValue = getBalUnitPrice(entry);
    const personNameValue = matchedBeekeeper?.name || lineForm.personName;
    const lineNoValue = lineForm.lineNo || getNextLineNo(lineFormShipmentId);
    const quantityValue = entry.quantity != null ? String(entry.quantity) : "";

    if (editingLineId || unitPriceValue == null) {
      if (unitPriceValue == null) {
        setError("Seçilen balda fiyat yok. Lütfen birim fiyat girin.");
      }
      setLineForm((prev) => ({
        ...prev,
        lineNo: lineNoValue,
        personName: personNameValue,
        quantity: quantityValue,
        type: detail ? toTitleCaseTr(detail) : "",
        unitPrice: unitPriceValue == null ? "" : String(unitPriceValue),
        sourceEntryId: entry.id
      }));
      return;
    }

    await saveLine({
      shipmentId: lineFormShipmentId,
      lineNo: lineNoValue,
      personName: personNameValue,
      quantity: quantityValue,
      type: detail ? toTitleCaseTr(detail) : "",
      paymentStatus: lineForm.paymentStatus,
      unitPrice: unitPriceValue,
      sourceEntryId: entry.id
    });
  };

  const renderShipmentTable = (lines, options = {}) => {
    const { fullscreen = false } = options;
    return (
      <div className={`shipment-table-wrap${fullscreen ? " fullscreen" : ""}`}>
        <div className={`shipment-table${fullscreen ? " fullscreen" : ""}`}>
          <div className="shipment-row shipment-row-header">
            <div className="shipment-cell shipment-cell-no">No</div>
            <div className="shipment-cell">İsim</div>
            <div className="shipment-cell">Tür</div>
            <div className="shipment-cell shipment-cell-qty">Miktar</div>
            <div className="shipment-cell">Ödeme Şekli</div>
            <div className="shipment-cell shipment-cell-price">Birim Fiyat</div>
            <div className="shipment-cell shipment-cell-total">Toplam Tutar</div>
          </div>
          {lines.map((line) => {
            const quantityText =
              line.quantity != null ? numberFormatter.format(line.quantity) : "-";
            const unitPriceText =
              line.unitPrice != null ? numberFormatter.format(line.unitPrice) : "-";
            const totalValue =
              line.total != null && !Number.isNaN(line.total)
                ? line.total
                : line.quantity != null && line.unitPrice != null
                  ? line.quantity * line.unitPrice
                  : null;
            const totalText = totalValue != null ? numberFormatter.format(totalValue) : "-";
            const typeText = line.type || "-";
            const paymentText = line.paymentStatus || "-";
            const unitLabel = line.unit || "Adet";

            return (
              <div className="shipment-row" key={line.id}>
                <div className="shipment-cell shipment-cell-no">{line.lineNo ?? "-"}</div>
                <div className="shipment-cell">
                  {(() => {
                    const beekeeper = findBeekeeperByName(line.personName);
                    if (beekeeper && onOpenBeekeeper) {
                      return (
                        <button
                          type="button"
                          className="link shipment-name-link"
                          onClick={() => onOpenBeekeeper(beekeeper.id)}
                        >
                          {line.personName}
                        </button>
                      );
                    }
                    return line.personName || "-";
                  })()}
                </div>
                <div className="shipment-cell">{typeText}</div>
                <div className="shipment-cell shipment-cell-qty">
                  {quantityText} {unitLabel}
                </div>
                <div className="shipment-cell">{paymentText}</div>
                <div className="shipment-cell shipment-cell-price">{unitPriceText} TL</div>
                <div className="shipment-cell shipment-cell-total">
                  <span className="shipment-total">{totalText} TL</span>
                  <div className="entry-actions inline-icons">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Düzenle"
                      onClick={() => startEditLine(line)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 17.5V20h2.5L17.8 8.7l-2.5-2.5L4 17.5zm15.7-9.2c.4-.4.4-1 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0l-1.8 1.8 4 4 1.8-1.8z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      aria-label="Sil"
                      onClick={() => handleDeleteLine(line)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const handleExportShipmentPdf = (shipment) => {
    if (!shipment) return;
    const lines = linesByShipment.get(shipment.id) || [];
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    registerPdfFonts(doc);
    let y = 36;
    doc.setFontSize(16);
    doc.text("Fabrika Sevkiyatı", 40, y);
    y += 18;
    doc.setFontSize(12);
    doc.text(factory.name || "", 40, y);
    y += 14;
    doc.setFontSize(10);
    doc.text(`Tarih: ${formatDisplayDate(getTodayISO())}`, 40, y);
    y += 18;

    const shipmentTitle = shipment.title
      ? `${formatDisplayDate(shipment.date)} tarihinde ${shipment.title}`
      : formatDisplayDate(shipment.date);
    doc.setFontSize(11);
    doc.text(shipmentTitle, 40, y);
    y += 6;

    if (lines.length === 0) {
      doc.setFontSize(10);
      doc.text("Satır yok.", 40, y + 8);
    } else {
      autoTable(doc, {
        startY: y,
        head: [[
          "No",
          "İsim",
          "Tür",
          "Miktar",
          "Ödeme Şekli",
          "Birim Fiyat",
          "Toplam Tutar"
        ]],
        body: lines.map((line) => {
          const quantityText =
            line.quantity != null ? numberFormatter.format(line.quantity) : "-";
          const unitLabel = line.unit || "Adet";
          const unitPriceText =
            line.unitPrice != null ? numberFormatter.format(line.unitPrice) : "-";
          const totalValue =
            line.total != null && !Number.isNaN(line.total)
              ? line.total
              : line.quantity != null && line.unitPrice != null
                ? line.quantity * line.unitPrice
                : null;
          const totalText =
            totalValue != null ? numberFormatter.format(totalValue) : "-";

          return [
            line.lineNo ?? "-",
            line.personName || "-",
            line.type || "-",
            `${quantityText} ${unitLabel}`,
            line.paymentStatus || "-",
            unitPriceText === "-" ? "-" : `${unitPriceText} TL`,
            totalText === "-" ? "-" : `${totalText} TL`
          ];
        }),
        styles: { font: "Verdana", fontSize: 8, cellPadding: 3 },
        headStyles: { font: "Verdana", fillColor: [21, 128, 61], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 28, halign: "center" },
          1: { cellWidth: 140 },
          2: { cellWidth: 90 },
          3: { cellWidth: 90 },
          4: { cellWidth: 110 },
          5: { cellWidth: 90, halign: "right" },
          6: { cellWidth: 100, halign: "right" }
        },
        showHead: "everyPage",
        margin: { left: 40, right: 40 }
      });

      const shipmentTotal = lines.reduce((sum, line) => {
        const totalValue =
          line.total != null && !Number.isNaN(line.total)
            ? line.total
            : line.quantity != null && line.unitPrice != null
              ? line.quantity * line.unitPrice
              : 0;
        return sum + (Number.isNaN(totalValue) ? 0 : totalValue);
      }, 0);

      y = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(10);
      doc.text(`Sevkiyat Toplamı: ${numberFormatter.format(shipmentTotal)} TL`, 40, y);
    }

    const safeName = String(factory.name || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^\w\-]/g, "");
    const safeDate = String(shipment.date || "").replaceAll("-", "");
    doc.save(`sevkiyat-${safeName || "fabrika"}-${safeDate || "detay"}.pdf`);
  };

  const handlePaymentSubmit = async (event) => {
    event.preventDefault();
    if (!paymentForm.date || !paymentForm.amount) return;
    try {
      setError("");
      setSaving(true);
      const amountValue = Number(paymentForm.amount);
      const payload = {
        ownerType: "factory",
        ownerId: factory.id,
        entryType: ENTRY_TYPE_PAYMENT,
        date: paymentForm.date,
        amount: Number.isNaN(amountValue) ? 0 : amountValue,
        note: paymentForm.note ? toTitleCaseTr(paymentForm.note) : "",
        updatedAt: serverTimestamp()
      };

      if (editingPaymentId) {
        await updateDoc(doc(db, "entries", editingPaymentId), payload);
      } else {
        await addDoc(collection(db, "entries"), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }
      setPaymentForm({ date: getTodayISO(), amount: "", note: "" });
      setEditingPaymentId(null);
      setShowPaymentForm(false);
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Ödeme kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const startEditPayment = (payment) => {
    setEditingPaymentId(payment.id);
    setPaymentForm({
      date: payment.date || getTodayISO(),
      amount: payment.amount ?? "",
      note: payment.note || ""
    });
    setShowPaymentForm(true);
  };

  const cancelPaymentEdit = () => {
    setEditingPaymentId(null);
    setPaymentForm({ date: getTodayISO(), amount: "", note: "" });
    setShowPaymentForm(false);
  };

  const handleDeletePayment = async (payment) => {
    if (!window.confirm("Bu ödemeyi silmek istiyor musunuz?")) return;
    try {
      setError("");
      await deleteDoc(doc(db, "entries", payment.id));
      if (editingPaymentId === payment.id) cancelPaymentEdit();
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Ödeme silinemedi."));
    }
  };

  return (
    <section className="ledger-detail factory-detail">
      <div className="detail-header">
        <button className="ghost" type="button" onClick={onBack}>
          Fabrika listesine dön
        </button>
        <div>
          <h2>{factory.name}</h2>
          <p className="muted">Fabrika Defteri</p>
        </div>
        <div className="detail-actions" />
      </div>
      {error ? <div className="error">{error}</div> : null}

      <div className="book-spread">
        <div className="entry-panel panel-incoming">
          <div className="page-header">
            <h3>Ödemeler</h3>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                setShowPaymentForm((prev) => {
                  if (prev) {
                    cancelPaymentEdit();
                  }
                  return !prev;
                })
              }
            >
              {showPaymentForm ? "Formu Kapat" : "Ödeme Ekle"}
            </button>
          </div>

          {showPaymentForm ? (
            <form className="form form-inline" onSubmit={handlePaymentSubmit}>
              <label>
                Tarih
                <input
                  type="date"
                  value={paymentForm.date}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({ ...prev, date: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Tutar
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentForm.amount}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Not
                <input
                  type="text"
                  value={paymentForm.note}
                  onChange={(event) =>
                    setPaymentForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                  placeholder="Örn: 1. taksit"
                />
              </label>
              <div className="form-actions">
                <button type="submit" disabled={saving}>
                  {editingPaymentId ? "Güncelle" : "Kaydet"}
                </button>
                {editingPaymentId ? (
                  <button type="button" className="ghost" onClick={cancelPaymentEdit}>
                    İptal
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          {payments.length === 0 ? (
            <p className="muted">Henüz ödeme yok.</p>
          ) : (
            <div className="payment-table-wrap">
              <div className="payment-table">
                <div className="payment-row payment-row-header">
                  <div className="payment-cell">Tarih</div>
                  <div className="payment-cell">Not</div>
                  <div className="payment-cell payment-cell-amount">Tutar</div>
                </div>
                {payments.map((payment) => {
                  const amountValue = Number(payment.amount);
                  const amountText = Number.isNaN(amountValue)
                    ? "0"
                    : numberFormatter.format(amountValue);

                  return (
                    <div className="payment-row" key={payment.id}>
                      <div className="payment-cell">
                        {formatDisplayDate(payment.date)}
                      </div>
                      <div className="payment-cell">{payment.note || "-"}</div>
                      <div className="payment-cell payment-cell-amount">
                        <span className="payment-total">{amountText} TL</span>
                        <div className="entry-actions inline-icons">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Düzenle"
                            onClick={() => startEditPayment(payment)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M4 17.5V20h2.5L17.8 8.7l-2.5-2.5L4 17.5zm15.7-9.2c.4-.4.4-1 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0l-1.8 1.8 4 4 1.8-1.8z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="icon-button danger"
                            aria-label="Sil"
                            onClick={() => handleDeletePayment(payment)}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="total-bar">
            Toplam Ödeme: {numberFormatter.format(paymentsTotal)} TL
          </div>
        </div>

        <div className="entry-panel panel-outgoing">
          <div className="page-header">
            <h3>Sevkiyatlar</h3>
            <button
              type="button"
              className="ghost"
              onClick={() =>
                setShowShipmentForm((prev) => {
                  if (prev) {
                    cancelShipmentEdit();
                  }
                  return !prev;
                })
              }
            >
              {showShipmentForm ? "Formu Kapat" : "Yeni Sevkiyat"}
            </button>
          </div>

          {showShipmentForm ? (
            <form className="form form-inline" onSubmit={handleShipmentSubmit}>
              <label>
                Tarih
                <input
                  type="date"
                  value={shipmentForm.date}
                  onChange={(event) =>
                    setShipmentForm((prev) => ({ ...prev, date: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Başlık
                <input
                  type="text"
                  value={shipmentForm.title}
                  onChange={(event) =>
                    setShipmentForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                  placeholder="Örn: Balbarmak'a giden ballar"
                  required
                />
              </label>
              <div className="form-actions">
                <button type="submit" disabled={saving}>
                  {editingShipmentId ? "Güncelle" : "Kaydet"}
                </button>
                {editingShipmentId ? (
                  <button type="button" className="ghost" onClick={cancelShipmentEdit}>
                    İptal
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          {shipments.length === 0 ? (
            <p className="muted">Henüz sevkiyat yok.</p>
          ) : (
            shipments.map((shipment) => {
              const lines = linesByShipment.get(shipment.id) || [];
              const shipmentTitle = shipment.title
                ? `${formatDisplayDate(shipment.date)} tarihinde ${shipment.title}`
                : formatDisplayDate(shipment.date);
              const isOpen = openShipmentId === shipment.id;
              return (
                <div className="shipment-card" key={shipment.id}>
                  <div className="shipment-header">
                    <button
                      type="button"
                      className="shipment-toggle"
                      onClick={() => toggleShipment(shipment.id)}
                    >
                      <span>{shipmentTitle}</span>
                      <span className="shipment-toggle-icon">{isOpen ? "−" : "+"}</span>
                    </button>
                  </div>

                  {isOpen ? (
                    <>
                      <div className="shipment-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => startAddLine(shipment.id)}
                        >
                          Ekle
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setFullScreenShipmentId(shipment.id)}
                        >
                          Tam Ekran
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => handleExportShipmentPdf(shipment)}
                        >
                          PDF İndir
                        </button>
                        <button
                          type="button"
                          className="link"
                          onClick={() => startShipmentEdit(shipment)}
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          className="link danger"
                          onClick={() => handleDeleteShipment(shipment)}
                        >
                          Sil
                        </button>
                      </div>

                      {lineFormShipmentId === shipment.id ? (
                        <form className="form form-inline" onSubmit={handleLineSubmit}>
                          <label>
                            No
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={lineForm.lineNo}
                              onChange={(event) =>
                                setLineForm((prev) => ({
                                  ...prev,
                                  lineNo: event.target.value
                                }))
                              }
                              required
                            />
                          </label>
                          <label>
                            İsim Soyisim
                            <input
                              type="text"
                              value={lineForm.personName}
                              onChange={(event) =>
                                setLineForm((prev) => ({
                                  ...prev,
                                  personName: event.target.value,
                                  sourceEntryId: ""
                                }))
                              }
                              required
                            />
                          </label>
                          {lineForm.personName.trim() ? (
                            <div className="suggestion-panel">
                              <div className="suggestion-header">
                                {matchedBeekeeper
                                  ? `Satılmamış Bal Önerileri (${matchedBeekeeper.name})`
                                  : "Arıcı bulunamadı"}
                              </div>
                              {matchedBeekeeper ? (
                                availableBalEntries.length === 0 ? (
                                  <p className="muted">
                                    Satılmamış bal kaydı bulunamadı.
                                  </p>
                                ) : (
                                  <div className="suggestion-list">
                                    {availableBalEntries.map((entry) => {
                                      const quantityText =
                                        entry.quantity != null
                                          ? numberFormatter.format(entry.quantity)
                                          : "-";
                                      const unitKey = normalizeTextTr(entry.unit || "");
                                      const unitLabel =
                                        unitKey === "teneke" || unitKey === "adet"
                                          ? "Adet"
                                          : unitKey === "kg" ||
                                              unitKey === "kilo" ||
                                              unitKey === "kılo" ||
                                              unitKey === "kilogram"
                                            ? "Kg"
                                            : entry.unit || "Adet";
                                      const detail = getBalDetail(entry);
                                      const detailText = detail ? toTitleCaseTr(detail) : "Bal";
                                      const unitPriceValue = getBalUnitPrice(entry);
                                      const unitPriceText =
                                        unitPriceValue != null
                                          ? numberFormatter.format(unitPriceValue)
                                          : "-";
                                      const totalValue =
                                        entry.price != null
                                          ? entry.price
                                          : unitPriceValue != null && entry.quantity != null
                                            ? unitPriceValue * entry.quantity
                                            : null;
                                      const totalText =
                                        totalValue != null
                                          ? numberFormatter.format(totalValue)
                                          : "-";
                                      const isSelected = lineForm.sourceEntryId === entry.id;

                                      return (
                                        <button
                                          key={entry.id}
                                          type="button"
                                          className={`suggestion-item${
                                            isSelected ? " is-selected" : ""
                                          }`}
                                          onClick={() => handleSuggestionSelect(entry)}
                                        >
                                          <div className="suggestion-main">
                                            <span className="suggestion-date">
                                              {formatDisplayDate(entry.date)}
                                            </span>
                                            <span className="suggestion-desc">
                                              {quantityText} {unitLabel} {detailText} x{" "}
                                              {unitPriceText}
                                            </span>
                                          </div>
                                          <span className="suggestion-total">
                                            {totalText} TL
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )
                              ) : (
                                <p className="muted">
                                  Bu isimle kayıtlı arıcı bulunamadı.
                                </p>
                              )}
                            </div>
                          ) : null}
                          <label>
                            Miktar
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={lineForm.quantity}
                              onChange={(event) =>
                                setLineForm((prev) => ({
                                  ...prev,
                                  quantity: event.target.value
                                }))
                              }
                              required
                            />
                          </label>
                          <label>
                            Tür
                            <input
                              type="text"
                              value={lineForm.type}
                              onChange={(event) =>
                                setLineForm((prev) => ({
                                  ...prev,
                                  type: event.target.value
                                }))
                              }
                              placeholder="Örn: Yayla"
                            />
                          </label>
                          <label>
                            Ödeme Şekli
                            <select
                              value={lineForm.paymentStatus}
                              onChange={(event) =>
                                setLineForm((prev) => ({
                                  ...prev,
                                  paymentStatus: event.target.value
                                }))
                              }
                            >
                              <option value="">Seçiniz</option>
                              <option value="Peşin">Peşin</option>
                              <option value="1 Ay Vadeli">1 Ay Vadeli</option>
                              <option value="45 Gün Vadeli">45 Gün Vadeli</option>
                              <option value="2 Ay Vadeli">2 Ay Vadeli</option>
                              <option value="3 Ay Vadeli">3 Ay Vadeli</option>
                              <option value="3/1'i Peşin 3 Ay Vade">
                                3/1'i Peşin 3 Ay Vade
                              </option>
                              <option value="4 Ay Vade">4 Ay Vade</option>
                              <option value="5 Ay Vade">5 Ay Vade</option>
                              <option value="6 Ay Vade">6 Ay Vade</option>
                            </select>
                          </label>
                          <label>
                            Birim Fiyat
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={lineForm.unitPrice}
                              onChange={(event) =>
                                setLineForm((prev) => ({
                                  ...prev,
                                  unitPrice: event.target.value
                                }))
                              }
                              required
                            />
                          </label>
                          {lineForm.quantity && lineForm.unitPrice ? (
                            <div className="inline-info">
                              Toplam:{" "}
                              {numberFormatter.format(
                                Number(lineForm.quantity) * Number(lineForm.unitPrice)
                              )}{" "}
                              TL
                            </div>
                          ) : null}
                          <div className="form-actions">
                            <button type="submit" disabled={saving}>
                              {editingLineId ? "Güncelle" : "Kaydet"}
                            </button>
                            <button type="button" className="ghost" onClick={cancelLineEdit}>
                              Kapat
                            </button>
                          </div>
                        </form>
                      ) : null}

                      {lines.length === 0 ? (
                        <p className="muted">Henüz satır yok.</p>
                      ) : (
                        renderShipmentTable(lines)
                      )}
                      <div className="total-bar">
                        Toplam:{" "}
                        {numberFormatter.format(
                          lines.reduce((sum, line) => {
                            const totalValue =
                              line.total != null && !Number.isNaN(line.total)
                                ? line.total
                                : line.quantity != null && line.unitPrice != null
                                  ? line.quantity * line.unitPrice
                                  : 0;
                            return sum + (Number.isNaN(totalValue) ? 0 : totalValue);
                          }, 0)
                        )}{" "}
                        TL
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })
          )}

          {legacyEntries.length > 0 ? (
            <div className="legacy-block">
              <h4>Eski Kayıtlar</h4>
              <div className="entry-list">
                {legacyEntries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    onEdit={null}
                    onDelete={handleDeleteLine}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="total-bar">
            Sevkiyat Toplamı: {numberFormatter.format(shipmentsTotal)} TL
          </div>
        </div>
      </div>

      {fullScreenShipmentId ? (
        <div
          className="modal-backdrop"
          onClick={() => setFullScreenShipmentId(null)}
        >
          <div
            className="modal-sheet modal-wide"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{fullScreenTitle}</h3>
              <button
                type="button"
                className="ghost"
                onClick={() => setFullScreenShipmentId(null)}
              >
                Kapat
              </button>
            </div>
            {fullScreenLines.length === 0 ? (
              <p className="muted">Henüz satır yok.</p>
            ) : (
              renderShipmentTable(fullScreenLines, { fullscreen: true })
            )}
          </div>
        </div>
      ) : null}

      <div className="factory-summary">
        <div className="summary-row summary-row-outgoing">
          <span className="summary-label">Toplam Sevkiyat</span>
          <span className="summary-amount">
            {numberFormatter.format(shipmentsTotal)} TL
          </span>
        </div>
        <div className="summary-row summary-row-incoming">
          <span className="summary-label">Toplam Ödeme</span>
          <span className="summary-amount">
            {numberFormatter.format(paymentsTotal)} TL
          </span>
        </div>
        <div className="summary-rule" />
        <div className="summary-row summary-result">
          <span className="summary-label">
            {remainingTotal >= 0 ? "Kalan" : "Fazla Ödeme"}
          </span>
          <span className="summary-amount">
            {numberFormatter.format(Math.abs(remainingTotal))} TL
          </span>
        </div>
      </div>
    </section>
  );
}

export default function FactoryLedger({
  db,
  onOpenBeekeeper,
  focusFactoryId,
  focusShipmentId,
  onClearFocus
}) {
  const [factories, setFactories] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: "" });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const q = query(collection(db, "factories"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data()
      }));
      rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setFactories(rows);
    });

    return () => unsubscribe();
  }, [db]);

  useEffect(() => {
    if (!focusFactoryId || factories.length === 0) return;
    const found = factories.find((factory) => factory.id === focusFactoryId);
    if (found) {
      setSelected(found);
    }
  }, [focusFactoryId, factories]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name) return;

    try {
      setError("");
      setSaving(true);
      if (editingId) {
        await updateDoc(doc(db, "factories", editingId), {
          name: form.name.trim(),
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, "factories"), {
          name: form.name.trim(),
          active: true,
          createdAt: serverTimestamp()
        });
      }
      setForm({ name: "" });
      setEditingId(null);
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Fabrika kaydedilemedi."));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (event, factory) => {
    event.stopPropagation();
    setEditingId(factory.id);
    setForm({ name: factory.name || "" });
  };

  const deleteEntriesForOwner = async (ownerId) => {
    const entriesQuery = query(
      collection(db, "entries"),
      where("ownerType", "==", "factory"),
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

  const handleDelete = async (event, factory) => {
    event.stopPropagation();
    if (!window.confirm("Bu fabrika ve tüm kayıtları silinsin mi?")) return;
    try {
      setError("");
      await deleteEntriesForOwner(factory.id);
      await deleteDoc(doc(db, "factories", factory.id));
      if (editingId === factory.id) {
        setEditingId(null);
        setForm({ name: "" });
      }
    } catch (err) {
      console.error(err);
      setError(firebaseErrorMessage(err, "Fabrika silinemedi."));
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: "" });
  };

  if (selected) {
    return (
      <FactoryBook
        db={db}
        factory={selected}
        onBack={() => setSelected(null)}
        onOpenBeekeeper={onOpenBeekeeper}
        focusShipmentId={focusShipmentId}
        onClearFocus={onClearFocus}
      />
    );
  }

  return (
    <section className="ledger">
      <h2>Fabrika Defteri</h2>
      <p className="muted">Alfabetik sıralanır.</p>
      {error ? <div className="error">{error}</div> : null}
      <div className="ledger-grid">
        <div className="list-card">
          <h3>Fabrika Listesi</h3>
          <div className="list">
            {factories.length === 0 ? (
              <p className="muted">Henüz fabrika yok.</p>
            ) : (
              factories.map((factory) => (
                <div
                  role="button"
                  tabIndex={0}
                  className="list-item"
                  key={factory.id}
                  onClick={() => setSelected(factory)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(factory);
                    }
                  }}
                >
                  <span className="list-title">{factory.name}</span>
                  <span className="list-actions">
                    <button
                      type="button"
                      className="link"
                      onClick={(event) => handleEdit(event, factory)}
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      className="link danger"
                      onClick={(event) => handleDelete(event, factory)}
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
          <h3>Yeni Fabrika</h3>
          <form className="form form-inline" onSubmit={handleSubmit}>
            <label>
              Fabrika Adı
              <input
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Örn: Ege Bal"
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
