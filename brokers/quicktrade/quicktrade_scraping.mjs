// What Quicktrade sells in Buenos Aires shares and CEDEARs, with no login.
// Quicktrade is the online platform of SBS Trading S.A. (ALyC integral
// n° 53 CNV), an agent of BYMA. Its FAQ says a client can invest in "todos
// los instrumentos del mercado de capitales": bonds, shares, CEDEARs, ONs
// and funds. Its menu has a "CEDEARs de ETFs" page (SPY, QQQ, DIA, EWZ).
//
// The site runs the Ingematica quote board, the BYMA board delayed 20
// minutes. Its share tab holds four lists of shares: Acciones (the local
// shares), Acciones-Pyme, Adrs (an ADR listed in Buenos Aires) and Cedears
// (every CEDEAR, ETF certificates included). Each symbol is one line: the
// peso, MEP and cable lines are separate symbols (GGAL, GGALD, GGALC). The
// other two lists, Cupones privados and FCI-BYMA, are coupons and funds and
// stay out. Bonds, options, futures and cauciones are other tabs.
//
// The board keeps the last line of a symbol BYMA no longer quotes
// (Petrobras' old APBR, last dated 11/11/2019, now PBR; the block line
// AUSOB, 9/4/2025). A symbol the board last dated more than two weeks
// before its own date stays out. The board names the symbol only; its
// currency, type and ISIN come from BYMA's open data (../comafi/byma.mjs,
// shared with brokers/comafi and brokers/gio): a symbol not on BYMA's
// panels today, a block line (GGALB, AAPDB), a kind that is not a share,
// a CEDEAR or an ADR, and a line with no trade on BYMA in two years are
// not written. A symbol byma.mjs calls a block only because its stem has
// no BYMA card (Gerdau's GGB, stem GG) is checked on Quicktrade's species
// page, and kept when that page says it is not a block.
//
// BYMA's panels list some symbols the share lists of the board do not
// show: new CEDEAR programmes that never traded, closed-end funds and
// coupons (on the board's FCI-BYMA and Cupones privados lists: MELIF, REIT,
// HSIM, the Simón real-estate fund, INVJX) and a few shares and CEDEARs
// (DESP, GOLD, JBSS3, EA, DGCE). Quicktrade says a client can trade every
// instrument of the market and names no list of its own, so a title BYMA
// trades is kept even when the board lacks it: an uncertain title stays
// (owner's rule, 2026-10-28). Each BYMA symbol that is not a live line of
// the share lists nor on the fund or coupon list, with a trade on BYMA in
// two years, goes through ../comafi/byma.mjs like a board symbol (blocks,
// closed-end funds, kinds that are not a share, a CEDEAR or an ADR, a
// symbol with no species card and no name stay out), then through the
// recency rule of ../bancosantafe/bymaWhole.mjs
// (../acuantoesta/bymaActivity.mjs): with no trade today it is not written
// when its last trade on BYMA is more than 180 days old, or when it traded
// on fewer than 5 days and not in the last 30 (DESP, last trade 2025-05-14;
// GOLD, one day in 2025). A CEDEAR of a bond stays out. What is left is
// read on Quicktrade's species page and kept only as an active share,
// CEDEAR or ADR (EA, DGCE and MIRGD: "Estado: Detenido"; IRCPC: IRSA's
// dollar bond). Its raw says "added from BYMA" and why: not on the board,
// or last dated on it more than two weeks back. More than 60 such titles
// means the board lost a list, and the run stops. Read 2026-10-28, none
// passed: the board held every title BYMA trades.
//
// Cable lines (C, settled in dollars held abroad) are kept next to the MEP
// (D) lines. The CEDEAR page says CEDEARs trade "tanto en pesos como en
// dólares", and the fee table charges "Transferencia en moneda extranjera
// en cuentas del exterior" up to USD 50 and lists transfers to
// "depositarios internacionales": client dollars move to and from abroad.
//   https://quicktrade.com.ar/cedears/
//   https://quicktrade.com.ar/preguntas-frecuentes-quicktrade/
//
// Mercado Argentino de Valores is named only as a market SBS Trading is a
// member of, and in the market-fee footnote. No MAV share is on the board
// or sold online, so it is left out.
//
// broker-list.json names one place, BYMA, with no restriction.
//
//   https://quicktrade.com.ar/Bursatil/Cotizacion/Acciones/
//   https://quicktrade.com.ar/Financial/ListCotizacion (POST grupo=ACCIONES&especieTipo=…)
//   https://quicktrade.com.ar/Bursatil/Especie/<symbol>/MERVAL/24hs.
//   https://open.bymadata.com.ar/
//
//   node brokers/quicktrade/quicktrade_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import { UA, bymaBoard, bymaRows, clean, expectLine, getText, isinOf, neverTraded, pause, summary } from "../comafi/byma.mjs";
import { isBondCedear, withoutDormant } from "../acuantoesta/bymaActivity.mjs";

const ORIGIN = "https://quicktrade.com.ar";
const LIST = `${ORIGIN}/Financial/ListCotizacion`;
// The share lists kept, with the fewest symbols each should hold.
const KEPT = { ACCIONES: 200, ACCIONESPYME: 0, ADRS: 0, ACEDEARS: 1000 };
// The coupon and fund lists of the tab, with the fewest symbols each should
// hold: not shares, but their symbols are on the board all the same.
const ASIDE = { CUPONESPRIV: 0, FONDOSINVERS: 10 };
// A symbol BYMA stopped quoting keeps its last line on the board. Every
// live line is restamped each session, so one older than this is gone.
const STALE_DAYS = 14;

async function list(tipo) {
  const body = new URLSearchParams({ grupo: "ACCIONES", especieTipo: tipo, campoOrden: "SIMBOLO", sentidoOrden: "ASC" });
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(LIST, {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${ORIGIN}/Bursatil/Cotizacion/Acciones/`,
        },
        body: body.toString(),
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) {
        const payload = JSON.parse(await response.text());
        if (!Array.isArray(payload.CotizacionList)) throw new Error(`${tipo} had no list`);
        return payload;
      }
      last = `${response.status} ${LIST} ${tipo}`;
    } catch (error) {
      last = `${error.message || error} ${LIST} ${tipo}`;
    }
    await pause(1000 * (attempt + 1));
  }
  throw new Error(last);
}

// The labelled fields of Quicktrade's species page of a symbol (Grupo,
// Tipo, Estado, Instrumento de bloque, Código ISIN, …).
async function speciesFields(symbol, term) {
  const html = await getText(`${ORIGIN}/Bursatil/Especie/${encodeURIComponent(symbol)}/MERVAL/${term}`);
  const decode = (text) => String(text).replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&amp;/g, "&");
  const fields = new Map();
  for (const [, label, value] of html.matchAll(/<span[^>]*>([^<]*):<\/span><span>([^<]*)<\/span>/g)) {
    fields.set(clean(decode(label)), clean(decode(value)));
  }
  return fields;
}

function dayOf(text) {
  const hit = String(text || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return hit ? Date.UTC(Number(hit[3]), Number(hit[2]) - 1, Number(hit[1])) : NaN;
}

const first = await list("ACCIONES");
const offered = (first.EspecieTipoList || []).map((item) => String(item.Codigo || "").toUpperCase());
for (const code of offered) {
  if (!(code in KEPT) && !(code in ASIDE)) throw new Error(`the share tab has a new list: ${code}`);
}
for (const code of [...Object.keys(KEPT), ...Object.keys(ASIDE)]) {
  if (!offered.includes(code)) throw new Error(`the share tab has no ${code} list`);
}
const today = dayOf(first.Fecha);
if (!Number.isFinite(today)) throw new Error(`the board has no date: ${first.Fecha}`);

// One entry per symbol, dated by its newest line.
const board = new Map();
for (const [code, floor] of Object.entries(KEPT)) {
  const payload = code === "ACCIONES" ? first : await list(code);
  const symbols = new Set();
  for (const line of payload.CotizacionList) {
    const [head, ...rest] = String(line.Simbolo || "").split(" - ");
    const symbol = head.trim().toUpperCase();
    if (!/^[A-Z0-9.]+$/.test(symbol)) throw new Error(`${code} has an unreadable symbol: ${line.Simbolo}`);
    if (String(line.Mercado || "").toUpperCase() !== "MERVAL") throw new Error(`${symbol} is on ${line.Mercado}`);
    const day = dayOf(line.Fecha);
    if (!Number.isFinite(day)) throw new Error(`${symbol} has no date: ${line.Fecha}`);
    const prev = board.get(symbol);
    if (prev && prev.list !== code) throw new Error(`${symbol} is on ${prev.list} and ${code}`);
    symbols.add(symbol);
    if (prev) {
      prev.day = Math.max(prev.day, day);
      prev.terms.add(line.CodigoVencimiento);
      continue;
    }
    board.set(symbol, {
      symbol,
      list: code,
      day,
      terms: new Set([line.CodigoVencimiento]),
      raw: [code, symbol, clean(rest.join(" - ")), clean(line.Denominacion)].filter(Boolean).join(" | "),
    });
  }
  console.error(`Quicktrade ${code}: ${payload.CotizacionList.length} lines, ${symbols.size} symbols`);
  if (symbols.size < floor) throw new Error(`${code} was short: ${symbols.size} symbols`);
  await pause(500);
}
const aside = new Set();
for (const [code, floor] of Object.entries(ASIDE)) {
  const payload = await list(code);
  const symbols = new Set(payload.CotizacionList.map((line) => String(line.Simbolo || "").split(" - ")[0].trim().toUpperCase()));
  console.error(`Quicktrade ${code}: ${payload.CotizacionList.length} lines, ${symbols.size} symbols (not shares)`);
  if (symbols.size < floor) throw new Error(`${code} was short: ${symbols.size} symbols`);
  for (const symbol of symbols) aside.add(symbol);
  await pause(500);
}

const stale = [];
const entries = [];
for (const entry of board.values()) {
  if (today - entry.day > STALE_DAYS * 86_400_000) stale.push(`${entry.symbol} last dated ${new Date(entry.day).toISOString().slice(0, 10)}`);
  else entries.push(entry);
}

// BYMA symbols that are not a live line of the board. Those with no trade
// on BYMA in two years (nearly all new CEDEAR programmes) are not looked
// at; the rest are read with the board's symbols, so a duplicate line or a
// block is judged across both.
const panels = await bymaBoard();
const live = new Set(entries.map((entry) => entry.symbol));
const absent = [...panels.keys()].filter((symbol) => !live.has(symbol) && !aside.has(symbol));
const asleep = await neverTraded(absent.filter((symbol) => !panels.get(symbol).traded), "Quicktrade (BYMA symbols not on the board)");
const extras = absent
  .filter((symbol) => !asleep.has(symbol))
  .map((symbol) => {
    const line = panels.get(symbol);
    const why = board.has(symbol)
      ? `last dated on Quicktrade's board ${new Date(board.get(symbol).day).toISOString().slice(0, 10)}`
      : "not on Quicktrade's board";
    return { symbol, raw: ["BYMA", line.panel === "cedear" ? "CEDEARs" : "acciones", symbol, line.denomination, `${why}, added from BYMA`].join(" | ") };
  });
const extraSymbols = new Set(extras.map((entry) => entry.symbol));

const read = await bymaRows([...entries, ...extras], "Quicktrade", { cable: true });
const { dropped, board: byma } = read;
const extraDropped = dropped.filter((line) => extraSymbols.has(line.split(" ")[0]));

// An added title is kept only when BYMA traded it recently: today, or in
// its history within 180 days and on 5 days or more, or once in the last
// 30 days. A CEDEAR of a bond is not a share.
const bonds = read.rows.filter((row) => extraSymbols.has(row.ticker) && isBondCedear(row)).map((row) => row.ticker);
for (const ticker of bonds) extraDropped.push(`${ticker} CEDEAR of a bond`);
const tradedToday = new Set([...byma].filter(([, line]) => line.traded).map(([symbol]) => symbol));
const recent = await withoutDormant(
  read.rows.filter((row) => extraSymbols.has(row.ticker) && !bonds.includes(row.ticker)),
  tradedToday,
  "Quicktrade (added from BYMA)"
);
extraDropped.push(...recent.dropped);
if (recent.rows.length > 60) {
  throw new Error(`${recent.rows.length} traded BYMA titles are not on the board: ${recent.rows.slice(0, 20).map((row) => row.ticker).join(" ")}`);
}

// Each title left is read on Quicktrade's species page. It is written only
// when the page files it under Acciones as a share, a CEDEAR or an ADR,
// says "Estado: Activo" and not a block. BYMA's panels keep halted lines
// (EA, Electronic Arts, delisted from Nasdaq on 2026-08-04: "Estado:
// Detenido"; read 2026-10-28), and BYMA files IRSA's dollar bond under the
// old share symbols IRCPC and IRCPD (the page: "Grupo: Bonos", ISIN
// USP58809BU07). A page with no state, group, type or block flag, or
// another ISIN than BYMA's card, stops the run.
const added = [];
for (const row of recent.rows) {
  const fields = await speciesFields(row.ticker, "24hs.");
  const [group, kind, state, block] = ["Grupo", "Tipo", "Estado", "Instrumento de bloque"].map((label) => fields.get(label));
  if (!group || !kind || !state || !block) throw new Error(`the species page of ${row.ticker} lacks its group, type, state or block flag`);
  const isin = isinOf(fields.get("Código ISIN"));
  if (group !== "Acciones" || !/^(acciones|cedears|adrs?)$/i.test(kind)) extraDropped.push(`${row.ticker} ${group} ${kind} on Quicktrade's species page`);
  else if (state !== "Activo") extraDropped.push(`${row.ticker} ${state} on Quicktrade's species page`);
  else if (!/^no$/i.test(block)) extraDropped.push(`${row.ticker} block on Quicktrade's species page`);
  else if (row.isin && isin && row.isin !== isin) throw new Error(`${row.ticker} is ${row.isin} on BYMA's card and ${isin} on Quicktrade's species page`);
  else added.push(row.isin ? row : { ...row, isin });
  await pause(300);
}
const rows = [...read.rows.filter((row) => !extraSymbols.has(row.ticker)), ...added];

// byma.mjs calls a symbol ending in B a block line when its stem is on
// BYMA's panels and the stem has no species card. Gerdau's CEDEAR GGB is
// not a block: its stem GG (Goldcorp, gone) has no card (read 2026-10-28).
// A "block" whose stem is not kept is checked on Quicktrade's species page.
// When the page says "Instrumento de bloque: No", the line is kept, with
// the name, type and ISIN of its MEP or cable line (GGBD) and its own
// currency. With no such line, or another ISIN, the run stops.
const keptTickers = new Set(rows.map((row) => row.ticker));
const doubtful = dropped
  .filter((line) => / block$/.test(line))
  .map((line) => line.split(" ")[0])
  .filter((symbol) => live.has(symbol))
  .filter((symbol) => !keptTickers.has(symbol.replace(/B$/, "").replace(/\.+$/, "")));
const rescued = [];
for (const symbol of doubtful) {
  const entry = board.get(symbol);
  const term = entry.terms.has("Vto_24") ? "24hs." : "CI";
  const html = await getText(`${ORIGIN}/Bursatil/Especie/${encodeURIComponent(symbol)}/MERVAL/${term}`);
  const flag = html.match(/Instrumento de bloque:<\/span><span>([^<]*)<\/span>/)?.[1];
  if (!flag) throw new Error(`the species page of ${symbol} has no block flag`);
  if (/^s/i.test(flag)) continue;
  const isin = isinOf(html.match(/digo ISIN:<\/span><span>([^<]*)<\/span>/)?.[1]);
  const twin = rows.find((row) => /[CD]$/.test(row.ticker) && row.ticker.slice(0, -1) === symbol && row.isin === isin);
  if (!isin || !twin) throw new Error(`${symbol} is not a block on its species page, and no dollar line shares its ISIN ${isin}`);
  rows.push({ ...twin, query: symbol, ticker: symbol, currency: byma.get(symbol).currency, raw: entry.raw });
  dropped.splice(dropped.indexOf(`${symbol} block`), 1);
  rescued.push(symbol);
  await pause(300);
}
rows.sort((left, right) => left.ticker.localeCompare(right.ticker));

expectLine(rows, "GGAL", "ARS", "STOCK", "ARP495251018");
expectLine(rows, "GGALD", "USD", "STOCK", "ARP495251018");
expectLine(rows, "YPFD", "ARS", "STOCK", "ARP9897X1319");
expectLine(rows, "AAPL", "ARS", "STOCK", "ARDEUT116183");
expectLine(rows, "AAPLC", "USD", "STOCK", "ARDEUT116183");
expectLine(rows, "AAPLD", "USD", "STOCK", "ARDEUT116183");
expectLine(rows, "SPY", "ARS", "ETF", "ARCAVA460131");
expectLine(rows, "SPYD", "USD", "ETF", "ARCAVA460131");
expectLine(rows, "QQQ", "ARS", "ETF");
expectLine(rows, "GGB", "ARS", "STOCK", "ARBCOM460200");
for (const gone of ["GGALB", "AAPLB", "AAPDB", "AUSOB", "APBR", "MELIF", "REIT"]) {
  if (rows.some((row) => row.ticker === gone)) throw new Error(`${gone} was kept`);
}
const local = rows.filter((row) => row.panel === "local");
const cedears = rows.filter((row) => row.panel === "cedear");
if (local.length < 120) throw new Error(`Buenos Aires shares were short: ${local.length}`);
if (cedears.length < 950) throw new Error(`CEDEARs were short: ${cedears.length}`);
if (cedears.filter((row) => row.type === "ETF").length < 100) throw new Error("CEDEAR ETFs were short");

summary("Quicktrade", rows, dropped);
console.error(`${stale.length} symbols the board last dated more than ${STALE_DAYS} days back left out: ${stale.slice(0, 12).join(", ")}, …`);
if (rescued.length) console.error(`not blocks on Quicktrade's species page, kept: ${rescued.join(" ")} (of ${doubtful.length} checked)`);
console.error(
  `${extras.length} traded BYMA symbols not live on Quicktrade's board; added ${added.length}: ${added.map((row) => `${row.ticker} ${row.currency} ${row.type}`).join(", ") || "none"}`
);
if (extraDropped.length) console.error(`not added: ${extraDropped.join("; ")}`);
const kept = rows.map(({ panel, ...row }) => row);
fs.writeFileSync(new URL("quicktrade-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(kept)), null, 2));
