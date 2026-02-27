export const normalizeSpaces = (value) =>
  String(value || "").trim().replace(/\s+/g, " ");

export const normalizeTextTr = (value) =>
  normalizeSpaces(value).toLocaleLowerCase("tr-TR");

export const toTitleCaseTr = (value) => {
  const cleaned = normalizeSpaces(value);
  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) =>
          part
            .split("'")
            .map((segment) => {
              const lower = segment.toLocaleLowerCase("tr-TR");
              if (!lower) return "";
              return lower[0].toLocaleUpperCase("tr-TR") + lower.slice(1);
            })
            .join("'")
        )
        .join("-")
    )
    .join(" ");
};

export const normalizeUnitTr = (value) => {
  const normalized = normalizeTextTr(value);
  if (!normalized) return "";
  if (["kg", "kilo", "kılo", "kilogram"].includes(normalized)) return "Kg";
  if (normalized === "tl") return "TL";
  return toTitleCaseTr(value);
};
