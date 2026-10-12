// A cash bond, gilt, note or debenture. A bond ETF stays. A preferred
// share stays: it is equity. "NTS" is the note abbreviation these files
// print. An exchange-traded note that says so is not this bond.

const TRACKER = /^(ETF|ETC|ETN|ETP)$/;
const DEBT_TYPE = /^(BOND|FIXED_INTEREST|CONVERTIBLE_NOTE|BND|GILT)$/;
const PREFERRED = /\b(preferred|preference shares|pfd|depositary shares|depository shares)\b/i;
const DEBT_NAME =
  /\b(?:notes?|debentures?)\s+due\b|\bsubordinated (?:notes?|debentures?)\b|\bmedium[- ]term notes?\b|\bNTS\b/i;
// "6 % Notes" and "Notes 2019-01.12.59" are a coupon and a maturity, not a share.
const COUPON_NOTE =
  /\b\d+(?:[.,]\d+)?\s*%\s*(?:(?:senior|junior|subordinated|guaranteed|unsecured|secured)\s+)*(?:notes?|bonds?|debentures?)\b/i;
const DATED_NOTE =
  /\b(?:notes?|bonds?|debentures?)\b[^a-z]{0,12}\d{4}[-/.]\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/i;

export function withoutObligations(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.filter((row) => !isObligation(row.name, row.type));
}

export function isObligation(name, type) {
  const label = String(name || "");
  const kind = String(type || "").toUpperCase();
  if (TRACKER.test(kind) || /\bETF\b/i.test(label) || /exchange traded/i.test(label)) return false;
  if (DEBT_TYPE.test(kind)) return true;
  if (PREFERRED.test(label)) return false;
  return DEBT_NAME.test(label) || COUPON_NOTE.test(label) || DATED_NOTE.test(label);
}
