// Whether a retail client of an EU firm may buy a fund line (ETF, ETC,
// ETN): PRIIPs needs a KID. The AGORA direct reading
// (../agoradirect/agoradirect_scraping.mjs) made a function. A fund has a
// KID or not whatever the place, so it is read from IBIE's own order-ticket
// notice ("does not have a KID"), stored in ./interactivebrokersie-parsed.json
// as the remark "Professional clients only." (older files: nonEuResident).
// A line IBIE's walk never settled (no currency, no notice) is not read as
// a KID. A fund IBIE was not asked about passes when its ISIN is from the
// EEA or the European ETP domiciles (XS, GB, CH, JE, GG), where IBIE shows
// a KID for almost every fund; any other domicile or no ISIN fails.
//
//   import { kidRule } from "../interactivebrokersie/kidRule.mjs";
//   const kid = kidRule();
//   kid.noKid(row.type, row.isin)   // "" when the line may be bought, else the reason
//   kid.source                      // { ibie, domicile } lines decided each way

import fs from "node:fs";

const IBIE_FILE = new URL("./interactivebrokersie-parsed.json", import.meta.url);
const IBIE_NO_KID = "Professional clients only.";
const KID_DOMICILES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK",
  "XS", "GB", "CH", "JE", "GG",
]);
const validIsin = (value) => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(value || "");

export function kidRule() {
  const ibieKid = new Map();
  let unsettled = 0;
  for (const row of JSON.parse(fs.readFileSync(IBIE_FILE, "utf8"))) {
    if (!["ETF", "ETC", "ETN"].includes(row.type) || !validIsin(row.isin)) continue;
    const noKid = row.remark === IBIE_NO_KID || row.nonEuResident === true;
    if (!noKid && row.currency == null) {
      unsettled += 1;
      continue;
    }
    ibieKid.set(row.isin, (ibieKid.get(row.isin) ?? false) || noKid);
  }
  if (ibieKid.size < 10_000) throw new Error(`only ${ibieKid.size} fund ISINs in ${IBIE_FILE.pathname}`);
  const flagged = [...ibieKid.values()].filter(Boolean).length;
  if (flagged < 2_000) throw new Error(`only ${flagged} no-KID fund ISINs in ${IBIE_FILE.pathname}`);

  const source = { ibie: 0, domicile: 0, unsettled };
  function noKid(type, isin) {
    if (type === "STOCK") return "";
    if (!validIsin(isin)) return `${type} without ISIN (KID unknown)`;
    if (ibieKid.has(isin)) {
      source.ibie += 1;
      return ibieKid.get(isin) ? `${type} without KID (IBIE notice)` : "";
    }
    source.domicile += 1;
    return KID_DOMICILES.has(isin.slice(0, 2)) ? "" : `${type} domiciled ${isin.slice(0, 2)} (no KID)`;
  }
  return { noKid, source };
}
