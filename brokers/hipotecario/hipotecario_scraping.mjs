// What Banco Hipotecario sells in Buenos Aires shares and CEDEARs, with no
// login. The bank trades for its clients as its own ALyC (agent no. 40)
// through the "Cuenta Inversor" of Búho Inversor. Its FAQ lists "Acciones
// locales, Cedears de compañías del exterior, Cedears de ETFs (Índices y
// sectores)" next to bonds, ONs, MEP dollars and funds. The bank's quote
// page (Búho One, Cotizaciones) loads BYMA's delayed panels from the
// bank's own API, one panel per id: 0 the leader shares, 2 the general
// panel, 5 the CEDEARs (ETF certificates such as SPY and QQQ included).
// Those three panels are the catalogue, with the quiet lines below. Each
// line is one BYMA symbol and one settlement term (CI, 24hs); the peso,
// MEP and cable lines of a title are separate symbols (GGAL, GGALD,
// GGALC). Panel 1, "Acciones Pymes" on the page, returns SME bonds
// (OBLIG. NEG. PYMES) and no share; a share line there would be read, any
// other line is left out. Options (4), bonds (7), letters (9), ONs (11)
// and futures (3) are other products.
//
// The panels name the symbol and its settlement currency, not the type or
// the ISIN. Those come from BYMA's open data (../comafi/byma.mjs, shared
// with brokers/comafi and brokers/gio), which also drops block lines
// (GGALB), a kind that is not a share, a CEDEAR or an ADR, closed-end
// funds, symbols BYMA no longer quotes, and lines BYMA shows no trade on
// in two years (see below for the lines with only a stale price). The currency BYMA gives each line is checked against the
// bank's own "tipoLiquidacion".
//
// The bank's feed leaves out most lines with no price at the moment it is
// read (of 1,240 CEDEAR symbols only 4 had none) and BYMA's closed-end
// funds (ALAAF, MELIF, REIT). So a quiet line drops off the board on a day
// it does not trade, though the bank, a BYMA agent, can still order it.
// Every symbol BYMA quotes on the same three panels that the board lacks
// is read too and goes through the same checks (a trade in two years, a
// share, a CEDEAR or an ADR). It is written only when the board carries
// another line of the same title (same ISIN), as CTIOD next to CTIO: a
// line BYMA quotes today that the feed still lacks (the ADR ATGS, INAG,
// the funds' dollar lines ALAAD, ALLFD) is not one the bank shows. Its raw
// says "BYMA panel, not on the bank's board".
//
// A price on the board is not a market: the feed and BYMA carry frozen
// previous closes (0.01 on YZCAC and ADS, an adjusted close on lines that
// have not traded for years), so byma.mjs, which counts any price, keeps
// them. Every line with no trade today on the bank's board (cantidadOperada,
// cantidadOperaciones and volumenNominal zero on both terms), and every
// line added from BYMA's panels, is looked up again in BYMA's daily
// history (../acuantoesta/bymaActivity.mjs, shared with
// brokers/acuantoesta): it is not written with no trade in two years
// (ADPC, BSNC, HMC.C, CTIOD and the other quiet C lines), a last trade
// more than 180 days old, or under 5 trade days and none in the last 30
// (a new cable line such as CRWVC that traded last week stays). A CEDEAR of a bond (DJNJ3, DJN3C, DJN3D: "Johnson &
// Johnson 6,95 01/09/29", a Cedears kind on BYMA like a share) is not
// written either.
//
// Cable lines ("Dólar cable o transferencia", contado con liquidación:
// the line settled in dollars held abroad) are kept next to the MEP
// ("Dólar efectivo") lines, because the bank sends custody dollars abroad.
// Its Cuenta comitente tariff charges "Transferencia Emisora u$s
// Internacional 0.60%" and "Transferencia Emisora Especies Internacional
// 0.60%". Both dollar lines are USD rows; the ticker (AAPLC, AAPLD) tells
// them apart. The same tariff prices "Acciones - Operaciones de
// Compra/Venta" at 0.60% online, minimum $75, and market rights on
// "ACCIONES - TÍTULOS PRIVADOS - OBLIG. NEG. - CEDEAR: 0.08%".
//   https://www.hipotecario.com.ar/personas/comisiones-cargos-y-tasas/
//   https://www.hipotecario.com.ar/buhobank/buho-inversor/
//
//   https://www.hipotecario.com.ar/buho-one/inversiones/cotizaciones/
//   https://www.hipotecario.com.ar/wp-json/api/v1/panelesdelay?idpanel=0 (2, 5, 1)
//   https://open.bymadata.com.ar/
//
//   node brokers/hipotecario/hipotecario_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { bymaBoard, bymaRows, clean, expectLine, getText, pause, summary } from "../comafi/byma.mjs";
import { isBondCedear, withoutDormant } from "../acuantoesta/bymaActivity.mjs";

const API = "https://www.hipotecario.com.ar/wp-json/api/v1/panelesdelay?idpanel=";
const REFERER = "https://www.hipotecario.com.ar/buho-one/inversiones/cotizaciones/";
const PANELS = [
  { id: 0, label: "Acciones Líderes", kinds: /^ACCIONES PRIVADAS$/, floor: 15 },
  { id: 2, label: "Panel General", kinds: /^ACCIONES PRIVADAS$/, floor: 120 },
  { id: 5, label: "CEDEARs", kinds: /^CEDEARS$/, floor: 900 },
  // Shares only if the panel ever carries them; today it is SME bonds.
  { id: 1, label: "Acciones Pymes", kinds: /^ACCIONES/, aside: /^OBLIG/, floor: 0 },
];
const SETTLEMENT = { Pesos: "ARS", "Dólar efectivo": "USD", "Dólar cable o transferencia": "USD" };

// The API answers 200 with statusCode 500 when its BYMA feed fails.
async function panel(id) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const text = await getText(API + id, { Referer: REFERER, "X-Requested-With": "XMLHttpRequest" });
    try {
      const payload = JSON.parse(text);
      const lines = payload?.data?.cotizaciones;
      if (payload.statusCode === 200 && Array.isArray(lines)) return { lines, at: payload.hora_actual?.date || "" };
      last = `panel ${id}: status ${payload.statusCode} ${clean(payload.error).slice(0, 120)}`;
    } catch {
      last = `panel ${id} is not JSON: ${text.slice(0, 80)}`;
    }
    await pause(3000 * (attempt + 1));
  }
  throw new Error(last);
}

const bySymbol = new Map();
let asideLines = 0;
for (const { id, label, kinds, aside, floor } of PANELS) {
  const { lines, at } = await panel(id);
  let count = 0;
  for (const line of lines) {
    const symbol = clean(line.simbolo).toUpperCase();
    const kind = clean(line.denominacion).toUpperCase();
    const settlement = clean(line.tipoLiquidacion);
    if (!/^[A-Z0-9.]+$/.test(symbol)) throw new Error(`panel ${id} has symbol ${JSON.stringify(line.simbolo)}`);
    if (aside?.test(kind)) {
      asideLines += 1;
      continue;
    }
    if (!kinds.test(kind)) throw new Error(`panel ${id} ${symbol} is ${kind || "unmarked"}`);
    if (!SETTLEMENT[settlement]) throw new Error(`panel ${id} ${symbol} settles in ${settlement || "nothing"}`);
    // A price on the bank's board today: a trade, a bid or an offer, on
    // either term (not the previous close, often a frozen 0.01).
    const live = [line.ultimo, line.precioCompra, line.precioVenta].some((value) => Number(value) > 0);
    // A trade today on either term.
    const traded = [line.cantidadOperada, line.cantidadOperaciones, line.volumenNominal].some((value) => Number(value) > 0);
    const prev = bySymbol.get(symbol);
    if (prev) {
      if (prev.settlement !== settlement) throw new Error(`${symbol} settles in ${prev.settlement} and ${settlement}`);
      prev.live ||= live;
      prev.traded ||= traded;
      prev.terms.push(clean(line.vencimiento));
      continue;
    }
    bySymbol.set(symbol, { symbol, live, traded, settlement, panel: label, terms: [clean(line.vencimiento)] });
    count += 1;
  }
  console.error(`panel ${id} ${label}: ${count} symbols, ${lines.length} lines (${at})`);
  if (count < floor) throw new Error(`panel ${id} ${label} has only ${count} symbols`);
  await pause(500);
}

const entries = [...bySymbol.values()].map((entry) => ({
  symbol: entry.symbol,
  live: entry.live,
  raw: [entry.panel, entry.symbol, entry.settlement, entry.terms.filter(Boolean).join("/")].join(" | "),
}));

// BYMA's symbols on the three panels that the bank's board lacks today.
const missing = [...(await bymaBoard()).entries()].filter(([symbol]) => !bySymbol.has(symbol));
if (missing.length > 250) throw new Error(`${missing.length} BYMA symbols are not on the bank's board: ${missing.slice(0, 20).map(([symbol]) => symbol).join(" ")}`);
for (const [symbol, line] of missing) {
  entries.push({ symbol, live: false, raw: ["BYMA panel, not on the bank's board", symbol, line.panel, line.denomination].join(" | ") });
}

const added = new Set(missing.map(([symbol]) => symbol));
const read = await bymaRows(entries, "Banco Hipotecario", { cable: true });
const dropped = read.dropped;
const titles = new Set(read.rows.filter((row) => !added.has(row.ticker) && row.isin).map((row) => row.isin));
const onBoard = read.rows.filter((row) => {
  if (!added.has(row.ticker) || titles.has(row.isin)) return true;
  dropped.push(`${row.ticker} not on the bank's board`);
  return false;
});

// Bond CEDEARs, then the lines with no trade today against BYMA's history.
const bonds = onBoard.filter(isBondCedear);
for (const row of bonds) dropped.push(`${row.ticker} CEDEAR of a bond: ${row.name}`);
const traded = new Set([...bySymbol.values()].filter((entry) => entry.traded).map((entry) => entry.symbol));
const active = await withoutDormant(
  onBoard.filter((row) => !isBondCedear(row)),
  traded,
  "Banco Hipotecario"
);
dropped.push(...active.dropped);
const rows = active.rows;
console.error(
  `Banco Hipotecario: ${traded.size} lines traded today on the board, ${active.checked} others checked on BYMA's history; left out ` +
    `${active.counts.never} with no trade in two years, ${active.counts.stale} last traded over 180 days ago, ` +
    `${active.counts.few} with under 5 trade days and none in 30, ${bonds.length} bond CEDEARs`
);

// BYMA's currency of each line against the bank's own settlement label.
const differ = rows.filter((row) => bySymbol.has(row.ticker) && SETTLEMENT[bySymbol.get(row.ticker).settlement] !== row.currency);
if (differ.length > 5) throw new Error(`${differ.length} lines differ in currency from the bank's board: ${differ.slice(0, 10).map((row) => row.ticker).join(" ")}`);

expectLine(rows, "GGAL", "ARS", "STOCK", "ARP495251018");
expectLine(rows, "GGALD", "USD", "STOCK", "ARP495251018");
expectLine(rows, "YPFD", "ARS", "STOCK", "ARP9897X1319");
expectLine(rows, "AAPL", "ARS", "STOCK", "ARDEUT116183");
expectLine(rows, "AAPLD", "USD", "STOCK", "ARDEUT116183");
expectLine(rows, "SPY", "ARS", "ETF", "ARCAVA460131");
for (const gone of ["GGALB", "AAPLB"]) {
  if (rows.some((row) => row.ticker === gone)) throw new Error(`${gone} was kept`);
}
const local = rows.filter((row) => row.panel === "local");
const cedears = rows.filter((row) => row.panel === "cedear");
if (local.length < 120) throw new Error(`Buenos Aires shares were short: ${local.length}`);
if (cedears.length < 900) throw new Error(`CEDEARs were short: ${cedears.length}`);
if (cedears.filter((row) => row.type === "ETF").length < 100) throw new Error("CEDEAR ETFs were short");

if (differ.length) console.error(`currency differs from the bank's board: ${differ.map((row) => `${row.ticker} ${row.currency}`).join(" ")}`);
const extra = rows.filter((row) => added.has(row.ticker)).map((row) => row.ticker);
console.error(`${missing.length} BYMA symbols not on the bank's board, ${extra.length} written: ${extra.join(" ")}`);
console.error(`${asideLines} SME bond lines on panel 1 left out`);
summary("Banco Hipotecario", rows, dropped);
const kept = rows.map(({ panel, ...row }) => row);
fs.writeFileSync(new URL("hipotecario-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(kept)), null, 2));
