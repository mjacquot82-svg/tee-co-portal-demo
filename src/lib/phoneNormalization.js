function normalizeText(value) {
  return String(value ?? "").trim();
}

export function normalizeNorthAmericanPhoneE164(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.startsWith("+") && /^[1-9]\d{7,14}$/.test(digits)) {
    return `+${digits}`;
  }
  return "";
}
