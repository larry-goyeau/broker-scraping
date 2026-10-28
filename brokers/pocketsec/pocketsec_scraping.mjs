// What Pocket Securities (口袋證券, Taiwan's online-only broker) sells in
// shares and exchange-traded funds, with no login.
//
// Taiwan. The 口袋台股 app trades the Taiwan Stock Exchange and the Taipei
// Exchange ("0050、0056、00919... 全市場熱門 ETF 完整支援", round and odd lots)
// at the list rate of 0.1425% with an online discount (FAQ: "電子下單享 2.8
// 折，單筆最低收取1元，(計算方式：成交金額 × 0.1425% × 0.28)"). No list and no
// limit, so Taiwan is the whole TWSE + TPEx book read by
// ../banktaiwan/twBook.mjs: shares, Taiwan Innovation Board, preferred
// shares, TDRs, REITs and ETFs. The foreign-currency lines of the dual-
// currency ETFs (00625K...) stay out (twBook's default: the domestic
// account settles in TWD). The emerging board (興櫃) is not named on any
// Pocket page and stays out.
//
// United States (複委託, sub-brokerage). No list. The home page states the
// offer: "口袋美股 複委託、美股標的8000+". Under the owner's stated-count rule
// the US catalogue is the 8,000 most traded titles of the US book
// (../wellstrade/usBook.mjs: every share, ADR, preferred, closed-end fund,
// ETF and ETN listed on a US exchange, less warrants, rights, units, notes
// and open halts), ranked by traded value (../daiwa/usPopular.mjs). No
// page names a US exchange, so none is dropped; the US is one NBBO market,
// one row per title, in dollars.
// Before the ranking, the exceptions of the FAQ "美股有什麼股票不能交易？"
// ("（1）OTC(場外交易股票)。 （2）PTP(公開交易合夥企業）。 （3）註冊於法國、義大利、
// 西班牙之股票。 （4）高風險微型股票") are applied where they can be read:
//   - OTC: not in the book;
//   - PTP: a line whose name says L.P., LP or Limited Partnership (MLPs,
//     the USCF funds such as BNO and UNG). A commodity pool whose name does
//     not say so (USO, DBC, ProShares Trust II) cannot be told from a
//     grantor trust with public data and stays;
//   - a company registered in France, Italy or Spain: an ISIN of FR, IT or
//     ES, or an SEC filer whose state of incorporation is France, Italy or
//     Spain, or, when the filer gives none (BBVA), whose business or
//     mailing address is there (data.sec.gov submissions, read for the ADRs
//     and the S.A., SE, S.p.A. and N.V. names; cached in
//     ./incorporation.json). A filer that gives neither (Grifols files a
//     New York address only) cannot be told and stays;
//   - high-risk micro caps: the firm flags them one by one and names none;
//     the ranking puts the least traded lines last anyway.
// Warrants are not sold ("目前口袋證券不支援美股權證交易") and are not in the
// book. broker-list.json says retail clients may buy leveraged and inverse
// ETFs only up to 2x / -1x (a Taiwan rule); no Pocket page says so, so no
// fund is removed for it.
//
// Fees: US online 0.08% with no minimum for new accounts until 2026-12-31
// (FAQ "台股及美股交易手續費率是多少？").
//
//   https://www.pocket.tw/
//   https://www.pocket.tw/main/faq/legacy-124
//   https://www.pocket.tw/main/faq/legacy-1439
//   https://www.pocket.tw/main/faq/legacy-1440
//   https://www.pocket.tw/main/faq/legacy-1441
//   https://www.pocket.tw/main/faq/legacy-1806
//   https://www.sec.gov/files/company_tickers_exchange.json
//
//   node brokers/pocketsec/pocketsec_scraping.mjs

import fs from "node:fs";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { getText, pageWords, writeTwBook } from "../banktaiwan/twBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topByPopularity, usPopularity } from "../daiwa/usPopular.mjs";

const SITE = "https://www.pocket.tw";
const OUT = new URL("pocketsec-parsed.json", import.meta.url);
const CACHE = new URL("incorporation.json", import.meta.url);
const SEC_TICKERS = "https://www.sec.gov/files/company_tickers_exchange.json";
const SEC_FILER = (cik) => `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`;
const SEC_UA = "broker-scraping catalogue builder";
const BARRED = new Set(["France", "Italy", "Spain"]);
const PTP_NAME = /\bL\.?P\.?(?=$|[\s,)])|Limited Partnership/i;
const FOREIGN_NAME = /American Depositary|Depositary|\bADS\b|\bADRs?\b|S\.A\.|\bSA\b|\bSE\b|S\.p\.A|\bSpA\b|Soci[eé]t[eé]|Sociedad|N\.V\./i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function secJson(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { "User-Agent": SEC_UA }, signal: AbortSignal.timeout(30_000) });
    if (response.ok) return response.json();
    if (response.status === 404) return null;
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(`${url} did not answer`);
}

// ticker -> incorporation country (SEC description), for the candidate rows.
async function incorporation(rows) {
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
  const ciks = new Map();
  const names = new Map();
  for (const [cik, name, ticker] of (await secJson(SEC_TICKERS)).data) {
    const key = ticker.replace(/-/g, ".");
    if (!ciks.has(key)) ciks.set(key, cik);
    names.set(key, name);
  }
  const stale = Date.now() - 180 * 86_400_000;
  const out = new Map();
  let asked = 0;
  for (const row of rows) {
    if (row.type !== "STOCK") continue;
    const cik = ciks.get(row.ticker) || ciks.get(row.ticker.replace(/\.PR.*$/, ""));
    if (!cik || !(FOREIGN_NAME.test(row.name) || FOREIGN_NAME.test(names.get(row.ticker) || ""))) continue;
    if (!cache[cik] || !("mailing" in cache[cik]) || Date.parse(cache[cik].at) < stale) {
      const filer = await secJson(SEC_FILER(cik));
      cache[cik] = {
        name: filer?.name || "",
        country: filer?.stateOfIncorporationDescription || "",
        address: filer?.addresses?.business?.stateOrCountryDescription || "",
        mailing: filer?.addresses?.mailing?.stateOrCountryDescription || "",
        at: new Date().toISOString().slice(0, 10),
      };
      asked += 1;
      await sleep(130);
    }
    const { country, address, mailing } = cache[cik];
    out.set(row.ticker, country || [address, mailing].find((place) => BARRED.has(place)) || address);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));
  out.asked = asked;
  return out;
}

const tw = await writeTwBook({
  broker: "Pocket Securities",
  out: OUT,
  evidence: [
    { url: `${SITE}/`, pattern: /口袋美股 複委託、美股標的8000\+/ },
    { url: `${SITE}/main/faq/legacy-124`, pattern: /成交金額 × 0\.1425% × 0\.28/ },
    { url: `${SITE}/main/faq/legacy-124`, pattern: /美股新開戶可享電子單手續費 0\.08% 無低消/ },
    { url: `${SITE}/main/faq/legacy-1439`, pattern: /（1）OTC\(場外交易股票\)。 （2）PTP\(公開交易合夥企業）。 （3）註冊於法國、義大利、西班牙之股票。 （4）高風險微型股票/ },
    { url: `${SITE}/main/faq/legacy-1806`, pattern: /目前口袋證券不支援美股權證交易/ },
  ],
});

const stated = Number(pageWords(await getText(`${SITE}/`)).match(/美股標的(\d[\d,]*)\+/)?.[1].replace(/,/g, "") || 0);
if (stated < 5000) throw new Error(`Pocket US count read as ${stated}`);

const book = await usBook();
const countries = await incorporation(book);
const left = { ptp: [], registered: [] };
const allowed = book.filter((row) => {
  if (row.type === "STOCK" || row.type === "ETF") {
    if (PTP_NAME.test(row.name)) return left.ptp.push(row.ticker), false;
  }
  const country = /^(FR|IT|ES)/.test(row.isin) ? row.isin.slice(0, 2) : BARRED.has(countries.get(row.ticker)) ? countries.get(row.ticker) : "";
  if (country) return left.registered.push(`${row.ticker} (${country})`), false;
  return true;
});
const scores = await usPopularity(allowed);
const us = topByPopularity(allowed, scores, stated);

const rows = stampRows(withoutObligations([...tw, ...us.kept]));
fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows: ${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")}`);
console.error(`US: top ${stated} of ${allowed.length} lines by traded value; last kept ${us.kept.at(-1).ticker}`);
console.error(`US left out as PTP (${left.ptp.length}): ${left.ptp.join(" ")}`);
console.error(`US left out as registered in France/Italy/Spain (${left.registered.length}): ${left.registered.join(" ")}; SEC filers read ${countries.asked}`);
