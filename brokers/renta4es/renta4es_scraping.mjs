// Renta 4 Banco runs its public site search on its own instrument API.
// The site hands out an anonymous read token, and the search endpoint takes
// a SQL-style pattern and a result limit, so "%" with a large limit returns
// the whole cash-equity book (CONTADO) and the whole ETF book (ETF), with
// ISIN, Renta 4 market code, ticker, currency and the MiFID product family.
//
// Kept: shares (normTipo 1 and the one "cuotas participativas" line), ETFs
// and listed funds (normTipo 17), ETCs and ETNs (normTipo 4). Left out:
// rights, preferred and perpetual debt, convertible bonds, warrants and
// leveraged certificates, rows the API flags "excluido", and the Spanish
// SICAV / SIL / FCR shares on the BME MTF, which the site's own stock
// search hides too.
//
//   https://www.r4.com/content/rentabanco/servlet.token.BACK.json
//   https://www.r4.com/internal-api/v1/apificacion/buscador/valores
//   https://www.r4.com/productos-inversion/acciones/fichas/US0378331005/MMO
//
//   node brokers/renta4es/renta4es_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const TOKEN = "https://www.r4.com/content/rentabanco/servlet.token.BACK.json";
const SEARCH = "https://www.r4.com/internal-api/v1/apificacion/buscador/valores";
const LIMIT = 1_000_000;

// Keyed by the trading-market code (mercadoContratacionCod). The Spanish
// book splits by segment: O continuous market, OA ETFs, OF BME Growth / MTF,
// OL Latibex.
const VENUES = {
  O: ["Bolsa de Madrid", "XMAD"],
  OA: ["Bolsa de Madrid", "XMAD"],
  OF: ["BME Growth", ""],
  OL: ["Latibex", ""],
  "038": ["Euronext Amsterdam", "XAMS"],
  "011": ["Euronext Brussels", "XBRU"],
  "051": ["Euronext Lisbon", "XLIS"],
  "025": ["Euronext Paris", "XPAR"],
  "041": ["Euronext Milan", "XMIL"],
  "046": ["Euronext Milan", "XMIL"],
  "022": ["Xetra", "XETR"],
  "227": ["Xetra", "XETR"],
  "040": ["Nasdaq Helsinki", "XHEL"],
  "053": ["Nasdaq Stockholm", "XSTO"],
  "036": ["London Stock Exchange", "XLON"],
  "236": ["London Stock Exchange", "XLON"],
  "237": ["London Stock Exchange", "XLON"],
  "361": ["London Stock Exchange", "XLON"],
  "004": ["SIX Swiss Exchange", "XSWX"],
  "349": ["SIX Swiss Exchange", "XSWX"],
  "351": ["SIX Swiss Exchange", "XSWX"],
  "065": ["NYSE", "XNYS"],
  "067": ["Nasdaq", "XNAS"],
  "066": ["NYSE American", "XASE"],
  "365": ["OTC Markets", ""],
};

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(url, options = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "User-Agent": UA, Accept: "application/json", ...options.headers },
        signal: AbortSignal.timeout(180_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

async function book(kind) {
  const { token } = await request(`${TOKEN}?_=${Date.now()}`);
  if (!token) throw new Error("no read token");
  const body = await request(SEARCH, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ listadoTipoProducto: [kind], patron: "%", aproximacion: false, limite: LIMIT }),
  });
  const rows = body.infoValores;
  if (!Array.isArray(rows)) throw new Error(`${kind} returned no list`);
  if (rows.length >= LIMIT) throw new Error(`${kind} hit the limit`);
  return rows;
}

const SICAV = /\b(SICAV|S\.?I\.?L\.?|FCR)\b/i;

function kindOf(row) {
  const tipo = Number(row.normTipo);
  const name = normalize(row.nombLargo);
  if (tipo === 1 || tipo === 3) return "STOCK";
  if (tipo === 4) {
    if (normalize(row.tipoEtf).toUpperCase() === "ETN" || /\bETN\b/i.test(name) || /^ETN/i.test(row.familia || "")) return "ETN";
    return "ETC";
  }
  if (tipo === 17) {
    if (normalize(row.mercadoContratacionCod) === "OF" || SICAV.test(name)) return "";
    // Subtype 9 is the closed-end funds and investment trusts on the cash book.
    if (Number(row.normSubtipo) === 9 && row.tipoProducto !== "ETF") return "FUND";
    return "ETF";
  }
  return "";
}

const raw = [...(await book("CONTADO")), ...(await book("ETF"))];
if (raw.length < 11000) throw new Error(`only ${raw.length} instruments`);

const rows = [];
const seen = new Set();
const withheld = new Map();
const unknown = new Map();
function withhold(reason) {
  withheld.set(reason, (withheld.get(reason) || 0) + 1);
}

for (const row of raw) {
  if (Number(row.excluido) > 0) {
    withhold("excluded");
    continue;
  }
  const type = kindOf(row);
  if (!type) {
    withhold(normalize(row.familia) || `normTipo ${row.normTipo}`);
    continue;
  }
  const code = normalize(row.mercadoContratacionCod);
  const venue = VENUES[code];
  if (!venue) {
    const label = `${code} ${normalize(row.mercadoDesc)}`;
    unknown.set(label, (unknown.get(label) || 0) + 1);
    continue;
  }
  const ticker = normalize(row.cats);
  const name = normalize(row.nombLargo || row.nombCorto);
  const currency = normalize(row.divisa).toUpperCase();
  const isin = normalize(row.isin).toUpperCase();
  if (!ticker || !name) throw new Error(`${isin} has no ticker or name`);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`${ticker} is quoted ${currency || "nowhere"}`);
  const key = `${isin}|${normalize(row.mercadoR4)}|${code}|${ticker}`;
  if (seen.has(key)) continue;
  seen.add(key);
  // A US-listed fund on "AMEX" usually trades on NYSE Arca; Renta 4 does not say which.
  const mic = venue[1] === "XASE" && type !== "STOCK" ? "" : venue[1];
  const entry = {
    query: ticker,
    ticker,
    name,
    exchange: venue[0],
    currency,
    type,
    isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "",
    raw: [ticker, name, normalize(row.mercadoDesc), currency, isin, normalize(row.familia)].filter(Boolean).join(" "),
  };
  if (mic) entry.mic = mic;
  rows.push(entry);
}
if (unknown.size) throw new Error(`unmapped markets: ${[...unknown].map(([label, count]) => `${label} (${count})`).join(", ")}`);

rows.sort((left, right) =>
  left.exchange.localeCompare(right.exchange) || left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker),
);

const apple = rows.find((row) => row.isin === "US0378331005" && row.exchange === "Nasdaq");
if (!apple) throw new Error("Apple is not on Nasdaq");
const santander = rows.find((row) => row.isin === "ES0113900J37" && row.exchange === "Bolsa de Madrid");
if (!santander) throw new Error("Santander is not on Madrid");
const etfs = rows.filter((row) => row.type === "ETF").length;
if (etfs < 3000) throw new Error(`only ${etfs} ETFs`);

const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("renta4es-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = new Map();
for (const row of kept) {
  const key = `${row.exchange} ${row.type}`;
  counts.set(key, (counts.get(key) || 0) + 1);
}
console.error(`${kept.length} listings (${[...counts].map(([key, count]) => `${count} ${key}`).join(", ")})`);
if (withheld.size) console.error(`left out ${[...withheld].map(([reason, count]) => `${count} ${reason}`).join(", ")}`);
if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
