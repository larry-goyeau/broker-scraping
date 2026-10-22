// What GEK Capital sells in shares, with no login. GEK Capital is an
// Abidjan SGI (approved by the AMF-UMOA on 2 December 2024), a member of
// the BRVM, the regional exchange of the eight UEMOA states; its clients
// trade only that exchange. The BRVM ticker on its home page and on its
// "Bourse" page reads one public call of the site's own WordPress back end,
// which returns every share of the BRVM board of the day: code, name,
// prices and the trading status ("Trading" or "Suspended"). A suspended
// share is left out (SEMC, Eviosys Packaging Siem CI, and SICC, Sicor CI,
// on 2026-10-21) and comes back by itself when it resumes. The BRVM lists
// no ETF, and the call carries no bond. Every line is quoted in francs CFA
// (XOF). It gives no ISIN; the shared lists (stocks.csv, BRVM) fill it.
//
// The trading tariff is not on the SGI's site as a grid; it is the
// regulator's approval of its "conditions générales de tarification"
// (Décision PAMF-UMOA/2025/036 of 14 January 2025), on the BRVM site, and
// the site's own order simulator.
//
// The host's TLS certificate is sent without its intermediate. This
// fetches that intermediate from the address the certificate itself names
// (Sectigo), checks it is that CA, and adds it to the trusted set; the
// chain is still verified, as in brokers/invictus.
//
//   https://gekcapital.com/fr/bourse/
//   https://gekcapital.com/wp-admin/admin-ajax.php?action=brvm_fetch_stock_data
//   https://www.brvm.org/fr/decision-pamf-umoa-homologation-des-tarifs-de-la-sgi-gek-capital
//   http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt
//
//   node brokers/gekcapital/gekcapital_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import tls from "node:tls";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const FEED = "https://gekcapital.com/wp-admin/admin-ajax.php?action=brvm_fetch_stock_data";
const PAGE = "https://gekcapital.com/fr/bourse/";
const FLOOR = { feed: 44, book: 42 };
const MAX_SUSPENDED = 6;
const MAX_AGE_DAYS = 10;
const KNOWN = ["SNTS", "ORAC", "SGBC"];
const INTERMEDIATE = "http://crt.sectigo.com/SectigoPublicServerAuthenticationCADVR36.crt";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", Referer: PAGE, "X-Requested-With": "XMLHttpRequest" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

async function trustIntermediate() {
  const response = await fetch(INTERMEDIATE, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${response.status} ${INTERMEDIATE}`);
  const intermediate = new crypto.X509Certificate(Buffer.from(await response.arrayBuffer()));
  if (!/CN=Sectigo Public Server Authentication CA DV R36/.test(intermediate.subject)) {
    throw new Error(`${INTERMEDIATE} is ${intermediate.subject.replace(/\n/g, ", ")}`);
  }
  tls.setDefaultCACertificates([...tls.getCACertificates("default"), intermediate.toString()]);
}

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

await trustIntermediate();
const body = await getJson(FEED);
const lines = Array.isArray(body) ? body : body?.data;
if (!Array.isArray(lines) || lines.length < FLOOR.feed) throw new Error(`the BRVM call returned ${lines?.length ?? 0} lines`);
for (const field of ["CODE_SYMBOLE", "Description_Titre", "Statut_Titre", "TradingDate"]) {
  if (!(field in lines[0])) throw new Error(`the BRVM call has no ${field} field`);
}
const day = lines.map((line) => String(line.TradingDate || "").slice(0, 10)).sort().at(-1);
if (!((Date.now() - Date.parse(`${day}T00:00:00Z`)) / 86_400_000 < MAX_AGE_DAYS)) throw new Error(`the BRVM call is dated ${day}`);

const rows = [];
const suspended = [];
const seen = new Set();
for (const line of lines) {
  const ticker = clean(line.CODE_SYMBOLE).toUpperCase();
  const name = clean(line.Description_Titre);
  const status = clean(line.Statut_Titre);
  if (!/^[A-Z]{3,6}$/.test(ticker) || !name) throw new Error(`unreadable line ${JSON.stringify(line).slice(0, 160)}`);
  if (seen.has(ticker)) throw new Error(`${ticker} repeats`);
  seen.add(ticker);
  if (status === "Suspended") {
    suspended.push(ticker);
    continue;
  }
  if (status !== "Trading") throw new Error(`${ticker} has an unknown status ${status}`);
  rows.push({
    query: ticker,
    ticker,
    name,
    exchange: "BRVM",
    mic: "XBRV",
    currency: "XOF",
    type: "STOCK",
    raw: [ticker, name, status, line.Cours_Cloture].join(" | "),
  });
}

if (suspended.length > MAX_SUSPENDED) throw new Error(`${suspended.length} shares suspended: the board is not filled`);
if (rows.length < FLOOR.book) throw new Error(`only ${rows.length} BRVM shares trading`);
for (const ticker of KNOWN) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("gekcapital-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));
const withIsin = stamped.filter((row) => row.isin).length;
console.error(
  `${stamped.length} listings (${day}): BRVM STOCK ${stamped.length}; ${withIsin} ISINs. Suspended, left out: ${suspended.join(", ") || "none"}.`
);
