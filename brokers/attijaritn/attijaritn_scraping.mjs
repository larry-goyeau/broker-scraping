// What Attijari Intermédiation sells in shares, with no login. The
// broker is the market arm of Attijari Bank Tunisie and its book is the
// Bourse de Tunis. Its public site prints the market board from the
// same service the Attijari Bourse app uses: one POST per board group,
// with the fixed client header written in the site's script. Group 1 is
// the share market (continuous 11, fixing 12, special group 99) and
// group 3 holds the hors-cote shares (13). Both are read. Bond group 2,
// the secondary lines of group 32 (allotment and subscription rights,
// odd lots and temporary new-share lines) and the empty alternative
// market (52) stay out. The Bourse de Tunis
// lists no ETF. Every row is quoted in dinars. The board must hold the
// same ISINs as the exchange's own share board, groups 11, 12, 13 and 99.
// The site keeps suspended shares and never marks them (etatValeur is
// always empty), so the exchange board's status is used: shares with
// status "S" (quotation suspended by the exchange or the CMF) are
// dropped; "R" (reserved: price limit hit) is intraday only and stays.
// Any other status code stops the run.
// Fees: brokerage 0.6% a contract, custody 0.2% a year (article 9 of
// the account agreements on the documents page).
//
//   https://ati.attijaribourse.com.tn/AttijariBourse/marche
//   https://ati.attijaribourse.com.tn/Ebourse/WsMarche/getValeursByGroupe
//   https://ati.attijaribourse.com.tn/AttijariBourse/documents-utiles
//   https://ati.attijaribourse.com.tn/AttijariBourse/assets/documents/CONVENTION_ORDINAIRE_LIBRE.pdf
//   https://www.bvmt.com.tn/rest_api/rest/market/groups/11,12,13,99
//
//   node brokers/attijaritn/attijaritn_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const exec = promisify(execFile);
const BOARD = "https://ati.attijaribourse.com.tn/Ebourse/WsMarche/getValeursByGroupe";
const EXCHANGE = "https://www.bvmt.com.tn/rest_api/rest/market/groups/11,12,13,99";
// Site group code, then the exchange groups it may hold.
const GROUPS = { 1: new Set(["11", "12", "99"]), 3: new Set(["13"]) };
// Board statuses: blank trading, R reserved, S suspended.
const STATUSES = new Set(["", "R", "S"]);
const CLIENT = "bourseClient:bourseClientSecret";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";

async function curl(args) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await exec("curl", ["-fsSL", "--max-time", "60", "-A", UA, ...args], { maxBuffer: 32_000_000, encoding: "utf8" });
      return stdout;
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last || args.at(-1));
}

async function boardGroup(code) {
  const body = JSON.parse(
    await curl(["-X", "POST", "-u", CLIENT, "-H", "Content-Type: application/x-www-form-urlencoded", "--data", `codeGroupe=${code}`, BOARD])
  );
  if (body?.header?.resultCode !== 200 || !Array.isArray(body.content)) {
    throw new Error(`Attijari board group ${code} answered ${JSON.stringify(body?.header)}`);
  }
  return body.content;
}

function attijariShares(groups) {
  const listings = [];
  const seen = new Set();
  for (const [code, rows] of groups) {
    for (const row of rows) {
      const group = String(row.gpeR || "").trim();
      if (!GROUPS[code].has(group)) throw new Error(`${row.mneR} is in group ${group || "unmarked"}, not a share group of ${code}`);
      const ticker = String(row.mneR || "").trim().toUpperCase();
      const isin = String(row.isinR || "").trim().toUpperCase();
      const name = String(row.libelle || row.denSociale || "").replace(/\s+/g, " ").trim();
      if (!ticker || !name) throw new Error(`unreadable listing ${JSON.stringify(row.mneR)}`);
      if (!/^TN[A-Z0-9]{10}$/.test(isin)) throw new Error(`no ISIN for ${ticker}`);
      if (seen.has(ticker) || seen.has(isin)) throw new Error(`repeated ${ticker} ${isin}`);
      seen.add(ticker);
      seen.add(isin);
      listings.push({
        query: ticker,
        ticker,
        name,
        exchange: "Tunis",
        currency: "TND",
        type: "STOCK",
        isin,
        mic: "XTUN",
        raw: [ticker, name, "Tunis", isin, `group ${group}`, "STOCK"].join(" "),
      });
    }
  }
  if (listings.length < 60) throw new Error(`Attijari board printed ${listings.length} shares`);
  listings.sort((left, right) => left.ticker.localeCompare(right.ticker));
  return listings;
}

// The site is a copy of the exchange board, so both must hold the same
// ISINs. Returns the ISINs whose quotation the exchange has suspended.
async function checkAgainstExchange(listings) {
  const rows = JSON.parse(await curl([EXCHANGE]))?.markets;
  if (!Array.isArray(rows) || rows.length < 60) throw new Error(`BVMT printed ${rows?.length ?? 0} shares`);
  const exchange = new Set(rows.map((row) => String(row.referentiel?.isin || row.isin || "").trim().toUpperCase()));
  const broker = new Set(listings.map((row) => row.isin));
  const missing = [...exchange].filter((isin) => !broker.has(isin));
  const extra = [...broker].filter((isin) => !exchange.has(isin));
  if (missing.length || extra.length) {
    throw new Error(`Attijari board and BVMT differ: missing ${missing.join(", ") || "none"}, extra ${extra.join(", ") || "none"}`);
  }
  const suspended = new Set();
  for (const row of rows) {
    const status = String(row.status ?? "").trim().toUpperCase();
    const ticker = String(row.referentiel?.ticker || "").trim().toUpperCase();
    if (!STATUSES.has(status)) throw new Error(`BVMT board gives ${ticker} status ${JSON.stringify(row.status)}, unknown to this scraper`);
    if (status === "S") suspended.add(String(row.referentiel?.isin || row.isin || "").trim().toUpperCase());
  }
  return suspended;
}

const groups = [];
for (const code of Object.keys(GROUPS)) groups.push([code, await boardGroup(code)]);
const all = attijariShares(groups);
const suspended = await checkAgainstExchange(all);
const dropped = all.filter((row) => suspended.has(row.isin)).map((row) => row.ticker);
const listings = all.filter((row) => !suspended.has(row.isin));
fs.writeFileSync(new URL("attijaritn-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(listings)), null, 2));
console.error(
  `${listings.length} listings (${listings.length} STOCK, Tunis ${listings.length}; BVMT board matches); ` +
    `dropped ${dropped.length} suspended (BVMT status S: ${dropped.join(",") || "-"})`
);
