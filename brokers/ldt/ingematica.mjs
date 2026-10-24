// The Ingematica quote board that LDT Brokers, Navarro Viola and Parakeet
// Capital each run on their own site, with no login. It is the BYMA board
// delayed 20 minutes, and an agent of BYMA trades every line on it, so the
// board is the catalogue. One reader serves all three; each scraper passes
// its own host.
//
// The share tab of the board is four lists: Acciones (the local shares),
// Acciones-Pyme, Adrs (an ADR listed in Buenos Aires) and Cedears. Each
// line is one symbol at one settlement. A symbol is one line here. The
// board names the currency: peso is pesos, dolar (MEP) and ext (cable) are
// dollars. The 48-hour line of a dollar symbol is sometimes labelled peso,
// so the currency is read from the spot and 24-hour lines first.
//
// The board keeps the last line of a symbol BYMA no longer quotes (a
// delisted company, a cancelled programme); every live line carries the
// board's date, so a symbol last dated more than two weeks earlier stays out.
// The date alone does not show a market: the board restamps lines that
// never trade every session (read 2026-10-22 on www.cohen.com.ar: CTIOC
// 24hs dated 21/10/2026 with no trade, HARGD CI dated 21/10/2026 with a
// 0.008 previous close). So, as ../comafi/byma.mjs does for its brokers,
// every symbol with no trade today on BYMA's own panels is looked up in
// BYMA's daily history (chart/historical-series, 24HS, about two years
// deep; the answers are cached in ../comafi/byma-history.json): with no
// day of volume in that time it is listed but never traded, and stays out
// (CTIOC, INGC, LYGC, TIIAC: no trade on BYMA in two years). A symbol that
// only did not trade today stays.
//
// Two lines of one certificate in one currency and one settlement (same
// ISIN, both MEP or both cable: Southern Copper's SCCOD and its legacy
// SCOOD) are one title quoted twice; only the line with the newer BYMA
// instrument id is kept (byma.mjs withoutDuplicateLines).
//
// A block line is the same certificate with B on the end (AAPLB, AAPDB,
// GGADB) and a 150-unit minimum. The broker's species page says
// "Instrumento de bloque"; a symbol ending in B is checked there, and a
// block line stays out. Cupones privados and FCI-BYMA are the other two
// lists on the tab and stay out. Bonds, options, futures and cauciones are
// other tabs.
//
// The board prints no ISIN. The BYMA species card prints it for a local
// share and for a CEDEAR (the certificate, shared by the peso, MEP and
// cable lines), with the kind, the issuer, and for a CEDEAR the company and
// its symbol on its home market. A symbol the card does not know takes the
// ISIN assets/stocks.csv holds for it. The card search matches loosely
// (asked for CC, Citigroup's cable line, it answers Bank of America's card,
// that of BA.CC; read 2026-10-22): a dollar line (C, D) whose card names
// another home symbol than the card of its peso line takes that card. A local share is named by its issuer,
// a CEDEAR by its company. The code is the BYMA symbol, since the peso, MEP
// and cable lines of one certificate share the ISIN. A card kind other than
// a share, a CEDEAR or an ADR stays out. A CEDEAR is an ETN or an ETC when
// its name says so (the iPath VIX note VXX, "iPath Series B S&P 500 VIX",
// is an ETN), as byma.mjs namedType reads it; an ETF when its home symbol
// is an American ETF in assets/etfs.csv, or its name says so.
//
//   https://<host>/Bursatil/Cotizacion/Acciones/
//   https://<host>/Financial/ListCotizacion (POST grupo=ACCIONES&especieTipo=…)
//   https://<host>/Bursatil/Especie/<symbol>/MERVAL/24hs.
//   https://open.bymadata.com.ar/ (species card, get-market-data,
//   chart/historical-series/history, instruments-for-header-search)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import { BYMA_ISINS, bymaBoard, namedType, neverTraded, withoutDuplicateLines } from "../comafi/byma.mjs";

const execFileAsync = promisify(execFile);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const SPECIES = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/bnown/fichatecnica/especies/general";
// The lists on the share tab. The ones kept, and the ones that are not shares.
const KEPT = { ACCIONES: "local", ACCIONESPYME: "local", ADRS: "local", ACEDEARS: "cedear" };
const ASIDE_LISTS = new Set(["CUPONESPRIV", "FONDOSINVERS"]);
const CASH = { peso: "ARS", dolar: "USD", dolares: "USD", ext: "USD" };
const US_BOARDS = new Set(["AMEX", "NASDAQ", "NYSE", "CBOE", "ARCA", "NYSEARCA", "BATS"]);
// A symbol BYMA stopped quoting keeps its last line on the board. Every
// live line is restamped each session, so one older than this is gone.
const STALE_DAYS = 14;
const ASIDE_KIND = /warrant|fondo|fci|derecho|cup[oó]n|obligaci|bono|letra|opci/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The boards serve a certificate chain that Node does not complete, so the
// requests go through curl, as brokers/iol does for the LDT species page.
async function curl(args, label) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await execFileAsync(
        "curl",
        ["-fsSL", "--compressed", "-A", UA, "--max-time", "60", ...args],
        { maxBuffer: 64_000_000 }
      );
      return stdout;
    } catch (error) {
      last = `${String(error.stderr || error.message || error).trim()} ${label}`;
    }
    await sleep(600 * (attempt + 1));
  }
  throw new Error(last);
}

async function bymaPost(url, body) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA, Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(40_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(400 * (attempt + 1));
  }
  throw new Error(last);
}

async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, run));
  return out;
}

function isinOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function decode(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

async function list(origin, tipo) {
  const body = new URLSearchParams({ grupo: "ACCIONES", especieTipo: tipo, campoOrden: "SIMBOLO", sentidoOrden: "ASC" });
  const text = await curl(
    [
      "-X", "POST",
      "-H", "Content-Type: application/x-www-form-urlencoded; charset=UTF-8",
      "-H", "X-Requested-With: XMLHttpRequest",
      "-H", `Referer: ${origin}/Bursatil/Cotizacion/Acciones/`,
      "--data", body.toString(),
      `${origin}/Financial/ListCotizacion`,
    ],
    `${origin} ${tipo}`
  );
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${origin} ${tipo} was not JSON`);
  }
  if (!Array.isArray(parsed.CotizacionList)) throw new Error(`${origin} ${tipo} had no list`);
  return parsed;
}

function dayOf(text) {
  const hit = String(text || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return hit ? Date.UTC(Number(hit[3]), Number(hit[2]) - 1, Number(hit[1])) : NaN;
}

// One line per symbol. The currency comes from the spot and 24-hour lines.
function symbolsOf(payload, tipo, panel) {
  const lines = new Map();
  for (const line of payload.CotizacionList) {
    const [head, ...rest] = String(line.Simbolo || "").split(" - ");
    const symbol = head.trim().toUpperCase();
    if (!symbol || /\s/.test(symbol)) throw new Error(`${tipo} had an unreadable symbol: ${line.Simbolo}`);
    if (String(line.Mercado || "").toUpperCase() !== "MERVAL") throw new Error(`${symbol} was on ${line.Mercado}`);
    // Cohen labels its 48-hour dollar lines "dolar." with a trailing dot.
    const code = String(line.CodigoMoneda || "").toLowerCase().replace(/\.$/, "");
    const cash = CASH[code];
    if (!cash) throw new Error(`${symbol} was priced in ${line.CodigoMoneda}`);
    if (!lines.has(symbol)) {
      lines.set(symbol, {
        symbol,
        panel,
        list: tipo,
        id: line.IdEspecie,
        name: clean(line.Denominacion),
        group: clean(rest.join(" - ")),
        terms: new Set(),
        near: new Set(),
        far: new Set(),
      });
    }
    const row = lines.get(symbol);
    const day = dayOf(line.Fecha);
    if (!Number.isFinite(day)) throw new Error(`${symbol} had no date: ${line.Fecha}`);
    row.day = Math.max(row.day || 0, day);
    row.terms.add(line.CodigoVencimiento);
    // ext is the cable dollar (contado con liquidación).
    if (/^Vto_(C|24)$/.test(line.CodigoVencimiento)) {
      row.near.add(cash);
      row.nearCable ||= code === "ext";
    } else {
      row.far.add(cash);
      row.farCable ||= code === "ext";
    }
  }
  for (const row of lines.values()) {
    const seen = row.near.size ? row.near : row.far;
    if (seen.size !== 1) throw new Error(`${row.symbol} was priced in ${[...seen].join(" and ")}`);
    row.currency = [...seen][0];
    row.cable = row.near.size ? Boolean(row.nearCable) : Boolean(row.farCable);
    delete row.nearCable;
    delete row.farCable;
    delete row.near;
    delete row.far;
  }
  return lines;
}

async function speciesCard(symbol) {
  const payload = await bymaPost(SPECIES, { symbol });
  const card = (payload.data || [])[0];
  if (!card) return null;
  return {
    kind: clean(card.tipoEspecie),
    isin: isinOf(card.codigoIsin),
    home: clean(card.simboloMercado).toUpperCase(),
    homeBoard: clean(card.mercadoOrigen).toUpperCase(),
    issuer: clean(card.emisor),
    title: clean(card.denominacion),
  };
}

// The species page answers at a settlement the symbol trades at; at any
// other it sends the reader home.
async function blockFlag(origin, line) {
  const terms = [];
  if (line.terms.has("Vto_24")) terms.push("24hs.");
  if (line.terms.has("Vto_C")) terms.push("CI");
  if (!terms.length) terms.push("24hs.", "CI");
  for (const term of terms) {
    const html = await curl(
      [`${origin}/Bursatil/Especie/${encodeURIComponent(line.symbol)}/MERVAL/${term}`],
      `${origin} ${line.symbol}`
    );
    const flag = html.match(/Instrumento de bloque:<\/span><span>([^<]*)<\/span>/);
    const isin = html.match(/digo ISIN:<\/span><span>([^<]*)<\/span>/);
    if (flag) return { block: /^s/i.test(decode(flag[1])), isin: isinOf(decode(isin?.[1] || "")) };
  }
  throw new Error(`the species page of ${line.symbol} had no block flag`);
}

function usEtfs() {
  const set = new Set();
  const text = fs.readFileSync(new URL("../../assets/etfs.csv", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [ticker, exchange] = line.split(",");
    if (!US_BOARDS.has(String(exchange || "").toUpperCase())) continue;
    const symbol = String(ticker || "").split(":").pop().toUpperCase();
    if (symbol) set.add(symbol);
  }
  if (set.size < 2000) throw new Error("assets/etfs.csv had few American ETFs");
  return set;
}

// The ISINs assets/stocks.csv already holds for Buenos Aires symbols, for a
// symbol the BYMA card does not know.
function listedIsins() {
  const book = new Map();
  const text = fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("BCBA:")) continue;
    const [ticker, , isin] = line.split(",");
    let symbol = ticker.slice(5).toUpperCase();
    if (symbol.endsWith(".CI")) symbol = symbol.slice(0, -3);
    const code = isinOf(isin);
    if (!symbol || !code) continue;
    const prev = book.get(symbol);
    if (prev === undefined) book.set(symbol, code);
    else if (prev && prev !== code) book.set(symbol, "");
  }
  return book;
}

export async function ingematicaCatalogue({ origin, folder, label }) {
  const first = await list(origin, "ACCIONES");
  const offered = (first.EspecieTipoList || []).map((item) => String(item.Codigo || "").toUpperCase());
  for (const code of offered) {
    if (!KEPT[code] && !ASIDE_LISTS.has(code)) throw new Error(`${label} share tab had a new list: ${code}`);
  }
  for (const code of Object.keys(KEPT)) {
    if (!offered.includes(code)) throw new Error(`${label} share tab had no ${code} list`);
  }

  const today = dayOf(first.Fecha);
  if (!Number.isFinite(today)) throw new Error(`${label} board had no date`);
  const board = new Map();
  for (const code of Object.keys(KEPT)) {
    const payload = code === "ACCIONES" ? first : await list(origin, code);
    const symbols = symbolsOf(payload, code, KEPT[code]);
    console.error(`${label} ${code}: ${payload.CotizacionList.length} lines, ${symbols.size} symbols`);
    for (const [symbol, row] of symbols) {
      const prev = board.get(symbol);
      if (prev) throw new Error(`${symbol} was on ${prev.list} and ${code}`);
      board.set(symbol, row);
    }
  }
  const symbols = [...board.keys()].sort();

  let looked = 0;
  const cards = new Map(
    await pool(symbols, 6, async (symbol) => {
      looked += 1;
      if (looked % 250 === 0) console.error(`${label} species cards ${looked}/${symbols.length}`);
      try {
        return [symbol, await speciesCard(symbol)];
      } catch (error) {
        console.error(`${symbol} species card failed: ${error.message || error}`);
        return [symbol, null];
      }
    })
  );

  // BYMA's card search matches loosely: asked for CC (Citigroup's cable
  // line) it answers the card of BA.CC, Bank of America (read 2026-10-22).
  // A dollar line (C or D) of a peso line on the board takes that line's
  // card when the two name different home symbols.
  for (const symbol of symbols) {
    if (board.get(symbol).currency !== "USD" || !/[CD]$/.test(symbol)) continue;
    const stem = symbol.slice(0, -1);
    const own = cards.get(symbol);
    const parent = cards.get(stem);
    if (!own?.home || !parent?.home || board.get(stem)?.currency !== "ARS" || own.home === parent.home) continue;
    console.error(`${label}: BYMA's card for ${symbol} names ${own.home} (${own.isin}); the card of its peso line ${stem}, ${parent.home} (${parent.isin}), is used`);
    cards.set(symbol, parent);
  }

  const candidates = symbols.filter((symbol) => symbol.endsWith("B"));
  console.error(`${label}: checking ${candidates.length} symbols ending in B on the species page`);
  const flags = new Map(
    await pool(candidates, 4, async (symbol) => [symbol, await blockFlag(origin, board.get(symbol))])
  );

  const etfs = usEtfs();
  const listed = listedIsins();
  const dropped = [];
  const rows = [];
  for (const symbol of symbols) {
    const line = board.get(symbol);
    const card = cards.get(symbol);
    const flag = flags.get(symbol);
    if (today - line.day > STALE_DAYS * 86_400_000) {
      dropped.push(`${symbol} last quoted ${new Date(line.day).toISOString().slice(0, 10)}`);
      continue;
    }
    if (flag?.block) {
      dropped.push(`${symbol} block`);
      continue;
    }
    if (card?.kind && ASIDE_KIND.test(card.kind)) {
      dropped.push(`${symbol} ${card.kind}`);
      continue;
    }
    if (card?.kind && !/^(acciones|cedears|adrs?|a\.d\.r\.s.*)$/i.test(card.kind)) {
      throw new Error(`${symbol} was a ${card.kind}`);
    }
    if (ASIDE_KIND.test(line.name) && !/^CEDEAR /i.test(line.name)) {
      dropped.push(`${symbol} ${line.name}`);
      continue;
    }
    const home = card?.home || "";
    const usHome = !card?.homeBoard || US_BOARDS.has(card.homeBoard) || /^NYSE|^NASDAQ/.test(card.homeBoard);
    const type =
      line.panel === "cedear"
        ? namedType(card?.title || "") || namedType(line.name) || (home && usHome && etfs.has(home) ? "ETF" : "STOCK")
        : "STOCK";
    // A line BYMA files with no ISIN, settled from official filings (byma.mjs).
    const isin = card?.isin || flag?.isin || listed.get(symbol) || BYMA_ISINS[symbol]?.[0] || "";
    rows.push({
      query: symbol,
      ticker: symbol,
      name: (line.panel === "cedear" ? card?.title : card?.issuer) || line.name || symbol,
      exchange: "BCBA",
      mic: "XBUE",
      currency: line.currency,
      type,
      ...(isin ? { isin } : {}),
      raw: [symbol, line.name, line.group, line.list, line.currency, type, isin].filter(Boolean).join(" "),
      panel: line.panel,
    });
  }

  // A symbol with no trade today on BYMA's panels is kept only when BYMA's
  // history shows a trade on it in two years; the board's date and its
  // prices are no proof (it restamps dead lines and copies placeholders).
  const byma = await bymaBoard();
  const quiet = rows.filter((row) => !byma.get(row.ticker)?.traded).map((row) => row.ticker);
  const unquoted = quiet.filter((symbol) => !byma.has(symbol));
  if (unquoted.length) console.error(`${label}: not on BYMA's panels today: ${unquoted.join(" ")}`);
  const never = await neverTraded(quiet, label);
  for (const symbol of never) dropped.push(`${symbol} never traded on BYMA in two years`);
  const once = await withoutDuplicateLines(
    rows.filter((row) => !never.has(row.ticker)),
    // BYMA's own flag, which also knows the C lines it labels USD (TGN4C);
    // the board's ext for a symbol BYMA does not quote today.
    (ticker) => (byma.has(ticker) ? byma.get(ticker).cable : Boolean(board.get(ticker)?.cable)),
    label
  );
  dropped.push(...once.dropped);
  rows.length = 0;
  rows.push(...once.rows);

  rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
  const tickers = rows.map((row) => row.ticker);
  if (new Set(tickers).size !== tickers.length) throw new Error(`${label} had duplicate symbols`);

  function expect(ticker, currency, type, isin) {
    const found = rows.filter((row) => row.ticker === ticker);
    if (found.length !== 1) throw new Error(`${ticker} was ${found.length} lines`);
    if (found[0].currency !== currency) throw new Error(`${ticker} was ${found[0].currency}`);
    if (found[0].type !== type) throw new Error(`${ticker} was ${found[0].type}`);
    if (isin && found[0].isin !== isin) throw new Error(`${ticker} was ${found[0].isin || "blank"}`);
  }
  expect("GGAL", "ARS", "STOCK", "ARP495251018");
  expect("GGALD", "USD", "STOCK", "ARP495251018");
  expect("YPFD", "ARS", "STOCK", "ARP9897X1319");
  expect("AAPL", "ARS", "STOCK", "ARDEUT116183");
  expect("AAPLC", "USD", "STOCK", "ARDEUT116183");
  expect("AAPLD", "USD", "STOCK", "ARDEUT116183");
  expect("ABNB", "ARS", "STOCK");
  expect("SPY", "ARS", "ETF", "ARCAVA460131");
  expect("SPYD", "USD", "ETF", "ARCAVA460131");
  for (const block of ["AAPLB", "AAPDB", "GGALB", "GGADB", "YPFDB"]) {
    if (tickers.includes(block)) throw new Error(`the block line ${block} was kept`);
  }

  const local = rows.filter((row) => row.panel === "local");
  const cedears = rows.filter((row) => row.panel === "cedear");
  if (local.length < 120) throw new Error(`${label} Buenos Aires shares were short: ${local.length}`);
  if (cedears.length < 950) throw new Error(`${label} CEDEARs were short: ${cedears.length}`);
  if (cedears.filter((row) => row.type === "ETF").length < 100) throw new Error(`${label} CEDEAR ETFs were short`);
  if (!local.some((row) => row.currency === "USD") || !cedears.some((row) => row.currency === "USD")) {
    throw new Error(`${label} had no dollar lines`);
  }
  for (const row of rows) delete row.panel;

  const kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL(`../${folder}/${folder}-parsed.json`, import.meta.url), JSON.stringify(kept, null, 2));

  const byType = new Map();
  const byCash = new Map();
  for (const row of kept) {
    byType.set(row.type, (byType.get(row.type) || 0) + 1);
    byCash.set(row.currency, (byCash.get(row.currency) || 0) + 1);
  }
  const withIsin = kept.filter((row) => row.isin).length;
  console.error(
    `${label}: ${kept.length} listings on BYMA (${local.length} local shares, ${cedears.length} CEDEARs; ` +
      `${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}; ` +
      `${[...byCash].map(([cash, count]) => `${count} ${cash}`).join(", ")}); ` +
      `${withIsin} with an ISIN; left out ${dropped.length}` +
      (kept.length < rows.length ? `; ${rows.length - kept.length} bonds left out` : "")
  );
  if (dropped.length) console.error(dropped.slice(0, 30).join(", ") + (dropped.length > 30 ? ", …" : ""));
  return kept;
}
