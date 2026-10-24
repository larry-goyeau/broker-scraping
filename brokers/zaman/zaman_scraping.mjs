// What Zaman (Bishkek) sells on the two Kyrgyz exchanges, with no login.
// The quotes page has a КФБ tab (Kyrgyz Stock Exchange) and an ФБК tab
// (FBK-BTS Stock Exchange). Both are filled from one public JSON snapshot,
// keys KFB and FBK; bonds are a third key (BON) and are not read. The
// page code says the snapshot is the app's own list ("тот же источник,
// что у дашборда и приложения") and that it shows every security, "как в
// приложении". The tariff says orders go by voice, paper or the web app.
//
//   https://zamaninvest.kg/kotirovki/
//   https://zaman-quotes.zaman-kg.workers.dev/kg-market
//   https://zamaninvest.kg/assets/docs/pravovaya/tarify-i-komissii.pdf
//
// Every line is in som (field ccy). Lines left out:
// - a line with no trading symbol (Ministry of Finance, a few issuers
//   whose shares have no code): there is no book to name;
// - a Kyrgyz Stock Exchange bond code, which ends in a lower-case b and an
//   optional issue number (RBSKb is Eldik Bank's ESG bond on kse.kg), and a
//   government paper code G..dddddddd (GBQ02280724, named only by a date);
// - a second line under a symbol already read on the same exchange (the
//   FBK key carries HMZ twice, for two issuers).
// Neither exchange publishes ISINs, and neither has ETFs. The FBK-BTS
// exchange has no ISO MIC.
//
//   node brokers/zaman/zaman_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FEED = "https://zaman-quotes.zaman-kg.workers.dev/kg-market";
const PLACES = {
  KFB: { exchange: "Kyrgyz Stock Exchange", mic: "XKSE", floor: 30 },
  FBK: { exchange: "FBK-BTS Stock Exchange", mic: "", floor: 60 },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return await response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message}`;
    }
    await sleep(1_000 * (attempt + 1));
  }
  throw new Error(last);
}

const shortName = (name) => String(name || "").replace(/\s+/g, " ").replace(/^(ОАО|ЗАО|ОсОО|АООТ)\s+/, "").replace(/,\s*акция прост\S*$/i, "").replace(/^"(.*)"$/, "$1").trim();

const feed = await getJson(FEED);
const rows = [];
const left = { noSymbol: 0, bond: 0, duplicate: 0 };
for (const [key, place] of Object.entries(PLACES)) {
  const list = feed[key];
  if (!Array.isArray(list) || list.length < place.floor) throw new Error(`${key}: ${Array.isArray(list) ? list.length : "no"} lines in the snapshot`);
  const seen = new Set();
  let kept = 0;
  for (const line of list) {
    const symbol = String(line.t || "").trim();
    if (!symbol || !line.n) { left.noSymbol += 1; continue; }
    if (/b\d*$/.test(symbol) || /^G[A-Z]{2}\d{8}$/.test(symbol) || line.kind === "bond") { left.bond += 1; continue; }
    if (seen.has(symbol.toUpperCase())) { left.duplicate += 1; continue; }
    seen.add(symbol.toUpperCase());
    if (line.ccy && line.ccy !== "KGS") throw new Error(`${key} ${symbol} in ${line.ccy}`);
    rows.push({
      query: symbol,
      ticker: symbol,
      name: shortName(line.n),
      exchange: place.exchange,
      mic: place.mic,
      currency: "KGS",
      type: "STOCK",
      isin: "",
      raw: [key, symbol, String(line.n).replace(/\s+/g, " ").trim(), line.p == null ? "" : `${line.p} KGS`].filter(Boolean).join(" | "),
    });
    kept += 1;
  }
  if (kept < place.floor * 0.8) throw new Error(`${key}: only ${kept} shares kept`);
}

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
const kept = withoutObligations(rows);
fs.writeFileSync(new URL("zaman-parsed.json", import.meta.url), JSON.stringify(stampRows(kept), null, 2));
const counts = {};
for (const row of kept) counts[row.exchange] = (counts[row.exchange] || 0) + 1;
console.error(counts);
console.error(`${kept.length} shares; left out ${left.noSymbol} without a symbol, ${left.bond} bond codes, ${left.duplicate} repeated symbols; snapshot KFB ${feed.liveKfbAt}, FBK ${feed.liveFbkAt}`);
