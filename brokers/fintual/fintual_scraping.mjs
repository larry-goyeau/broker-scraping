// What Fintual Acciones sells in shares and exchange-traded funds.
// The book is Alpaca's. Fintual opens the account in the client's name at
// Alpaca and routes the order there; since April 2026 that is the whole US
// equity offer, not the old filtered 3,000.
//
// Crypto stays on Alpaca's other book. A PTP without a qualified notice
// (usResidentsOnly) cannot be bought by a non-US account, and Fintual's
// clients are in Chile and Mexico. Mutual-fund units are a different product.
//
//   https://fintualist.com/chile/tecnologia/algunas-preguntas-y-respuestas-sobre-fintual-acciones/
//   https://fintualist.com/chile/educacion-financiera/fintual-acciones-unchained/
//
//   node brokers/fintual/fintual_scraping.mjs

import fs from "node:fs";

const SOURCE = new URL("../alpaca/alpaca-parsed.json", import.meta.url);
const OUTPUT = new URL("fintual-parsed.json", import.meta.url);

if (!fs.existsSync(SOURCE)) {
  throw new Error("le catalogue Alpaca n'existe pas encore : lancer `node brokers/alpaca/alpaca_scraping.mjs`");
}

const source = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
if (!Array.isArray(source) || !source.length) throw new Error("le catalogue Alpaca est vide");

const rows = source.filter(
  (row) => (row.type === "STOCK" || row.type === "ETF") && !row.usResidentsOnly
);

const apple = rows.find((row) => row.ticker === "AAPL");
const spy = rows.find((row) => row.ticker === "SPY");
if (!apple || apple.isin !== "US0378331005" || apple.exchange !== "NASDAQ" || apple.type !== "STOCK") {
  throw new Error("Apple was not stored as the Nasdaq share");
}
if (!spy || spy.isin !== "US78462F1030" || spy.exchange !== "AMEX" || spy.type !== "ETF") {
  throw new Error("SPY was not stored as the NYSE Arca ETF");
}
if (rows.some((row) => row.type === "CRYPTO" || row.exchange === "CRYPTO")) {
  throw new Error("a crypto pair was copied into the equity book");
}
if (rows.some((row) => row.usResidentsOnly || row.ticker === "AB")) {
  throw new Error("a US-residents-only PTP was copied");
}

const stocks = rows.filter((row) => row.type === "STOCK").length;
const etfs = rows.filter((row) => row.type === "ETF").length;
if (stocks < 6000 || etfs < 6000) {
  throw new Error(`the Alpaca equity book looks truncated (${stocks} shares, ${etfs} ETFs)`);
}

fs.writeFileSync(OUTPUT, JSON.stringify(rows, null, 2));
const dropped = source.length - rows.length;
console.error(
  `${rows.length} listings copied from Alpaca (${stocks} STOCK, ${etfs} ETF); ${dropped} left out`
);
