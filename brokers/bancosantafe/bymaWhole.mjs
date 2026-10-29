// The whole of BYMA's share and CEDEAR board, for the Argentine banks of
// Grupo Petersen (brokers/bancosantafe, bancoentrerios, bancosanjuan,
// bancosantacruz) whose capital-markets page says the bank is a BYMA member
// and that clients can trade every product listed on the market. No bank
// publishes a list of its own, so the catalogue is BYMA's own: every symbol
// on its leader, general and CEDEAR panels (open.bymadata.com.ar
// get-market-data), read through ../comafi/byma.mjs (shared with
// brokers/comafi, gio, hipotecario and others), which gives each line its
// currency (ARS, or USD for the MEP dollar line), type and ISIN, and leaves
// out block lines (GGALB), closed-end funds (ALAAF, MELIF, REIT), kinds
// that are not a share, a CEDEAR or an ADR, and lines BYMA shows no trade
// on in two years (a MEP line of a written peso line comes back, below).
//
// Then, as brokers/acuantoesta and brokers/hipotecario do:
// - Cable lines (C, contado con liquidación: dollars settled abroad) are
//   not written: no bank's fee schedule has a cable or CCL line, and the
//   only foreign-currency settlement any names is the MEP dollar
//   ("compra venta de títulos valores con liquidación en moneda extranjera
//   (dólar MEP)"). A USD line ending in C whose peso stem is the same
//   certificate but which has no D line next to it (EC, next to Eni's E) is
//   a cable line too and is not written. The peso and MEP (D) lines stay.
// - A CEDEAR of a bond (a maturity date or a coupon in its name: DJNJ3) is
//   not written.
// - Every line with no trade today on BYMA's panels is looked up in BYMA's
//   daily history (../acuantoesta/bymaActivity.mjs): it is not written with
//   no trade in two years, a last trade more than 180 days old, or under 5
//   trade days and none in the last 30. A price on a panel is not a market:
//   BYMA carries stub bids and frozen previous closes on lines that have not
//   traded for years.
// - Except the MEP dollar (D) line of a title whose peso line is written.
//   The banks hold pesos and dollars (deposits.mjs: ARS, USD) and give no
//   currency per title, so the owner's rule applies: one row per currency
//   the market quotes the title in, kept for the currencies of the cash
//   ("sauf si le broker indique la devise du titre"; these banks indicate
//   nothing), and when availability is uncertain the title stays ("il vaut
//   mieux avoir plus de titres que la réalité"). So every D line BYMA lists
//   for a written peso line is written too, in USD, however little it
//   traded (AAPD, INGD, SBSPD, YELPD, HMC.D: none or a few trades in two
//   years), when BYMA has a species card for it and it is the peso line's
//   certificate (same ISIN). BYMA lists more D lines than its panels show
//   on a given day: its search box (instruments-for-header-search) names
//   ABE3D, MIRGD, WEGED, EQNRD and CECOD with their 24hs, 48hs and CI terms
//   and each has a species card, though none was on the panels on
//   2026-10-28; a title with no D line on the panels takes the one the
//   search box names. Not written: a D line with no species card, or whose
//   card names another title; a line BYMA lists neither on its panels nor
//   in its search box (its open data has no suspension list and its card
//   no status, so that is the only mark of a delisted line it gives); the
//   older of two lines of one certificate; and cable (C) lines, as above. A dollar line alone,
//   with no written peso line, still needs trades.
// - Two USD lines of one ISIN are one too many: byma.mjs gave BBDCD (its
//   own card: Bradesco's B3 CEDEAR BBDC3) the card of BBDC, Bradesco's ADR
//   CEDEAR, whose MEP line is BBDD. Such a line takes the certificate its
//   own card names when that is another written peso line with no dollar
//   line; two left stop the run.
//
//   https://open.bymadata.com.ar/

import { bymaBoard, bymaRows, expectLine, pause, summary, UA } from "../comafi/byma.mjs";
import { isBondCedear, withoutDormant } from "../acuantoesta/bymaActivity.mjs";

const MARKET = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/get-market-data";
const SPECIES = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/bnown/fichatecnica/especies/general";
const SEARCH = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/instruments-for-header-search";
const PANELS = ["btnLideres", "btnGeneral", "btnCedears"];

const rawOf = (symbol, line) => ["BYMA", line.panel === "cedear" ? "CEDEARs" : "acciones", symbol, line.denomination].join(" | ");

// Symbols with a trade today on any settlement term of BYMA's panels.
async function tradedToday() {
  const traded = new Set();
  for (const flag of PANELS) {
    let lines = null;
    let last = "";
    for (let attempt = 0; attempt < 5 && !lines; attempt += 1) {
      try {
        const response = await fetch(MARKET, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": UA, Accept: "application/json" },
          body: JSON.stringify({ excludeZeroPxAndQty: false, T0: true, T1: true, T2: true, page_number: 1, page_size: 5000, [flag]: true }),
          signal: AbortSignal.timeout(40_000),
        });
        if (response.ok) {
          const payload = await response.json();
          const data = payload.data || payload;
          if (Array.isArray(data) && data.length) lines = data;
          else last = `BYMA ${flag} was empty`;
        } else {
          last = `${response.status} ${MARKET}`;
        }
      } catch (error) {
        last = String(error.message || error);
      }
      if (!lines) await pause(2000 * (attempt + 1));
    }
    if (!lines) throw new Error(last);
    for (const line of lines) {
      if (Number(line.volume) > 0 || Number(line.tradeVolume) > 0 || Number(line.volumeAmount) > 0) traded.add(String(line.symbol || "").trim().toUpperCase());
    }
    await pause(300);
  }
  return traded;
}

// BYMA's species card of a symbol ({ isin, home }), or null when
// BYMA has none. A card that does not answer stops the run.
async function speciesCard(symbol) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(SPECIES, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA, Accept: "application/json" },
        body: JSON.stringify({ symbol }),
        signal: AbortSignal.timeout(40_000),
      });
      if (response.ok) {
        const payload = await response.json();
        if (!Array.isArray(payload.data)) throw new Error(`BYMA's species card of ${symbol} changed shape: ${Object.keys(payload).join(",")}`);
        const card = payload.data[0];
        await pause(200);
        if (!card) return null;
        return {
          isin: String(card.codigoIsin || "").trim().toUpperCase(),
          home: String(card.simboloMercado || "").trim().toUpperCase(),
        };
      }
      last = `${response.status} ${SPECIES} ${symbol}`;
    } catch (error) {
      if (/changed shape/.test(error.message)) throw error;
      last = `${error.message || error} ${symbol}`;
    }
    await pause(1500 * (attempt + 1));
  }
  throw new Error(`BYMA's species card of ${symbol} did not answer: ${last}`);
}

// The symbols BYMA's search box (instruments-for-header-search) answers for
// a text, with their kind: it lists every instrument BYMA has, with its
// settlement terms, including lines absent from today's panels. It
// matches loosely and answers at most ten entries.
async function searched(text) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(SEARCH, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA, Accept: "application/json" },
        body: JSON.stringify({ value: text }),
        signal: AbortSignal.timeout(40_000),
      });
      if (response.ok) {
        const found = await response.json();
        if (!Array.isArray(found)) throw new Error(`BYMA's search box changed shape for ${text}: ${Object.keys(found).join(",")}`);
        await pause(200);
        return found.map((item) => ({ symbol: String(item.symbol || "").trim().toUpperCase(), type: String(item.type || "").trim() }));
      }
      last = `${response.status} ${SEARCH} ${text}`;
    } catch (error) {
      if (/changed shape/.test(error.message)) throw error;
      last = `${error.message || error} ${text}`;
    }
    await pause(1500 * (attempt + 1));
  }
  throw new Error(`BYMA's search box did not answer for ${text}: ${last}`);
}

// byma.mjs gives a dollar line the card of the peso line named like its
// stem when the two cards name different home symbols (CC, BA.CC). That
// misfires when the stem is another certificate of the same company:
// BBDCD's own card is Bradesco's B3 CEDEAR (BBDC3, ARCAVA4601M5), but
// BBDC, Bradesco's ADR CEDEAR, made it ARDEUT116001, the ISIN of BBDD
// (read 2026-10-28). Where two USD lines share an ISIN, each one's own
// card is read again, and a line whose own card is the certificate of
// another written peso line with no dollar line takes that line's ISIN,
// name and type. Two USD lines of one ISIN left stop the run (wholeByma).
async function ownDollarCards(rows, label) {
  const groups = new Map();
  for (const row of rows) {
    if (row.currency !== "USD" || !row.isin) continue;
    if (!groups.has(row.isin)) groups.set(row.isin, []);
    groups.get(row.isin).push(row);
  }
  const peso = new Map(rows.filter((row) => row.currency === "ARS" && row.isin).map((row) => [row.isin, row]));
  const dollar = new Set(groups.keys());
  for (const [isin, pair] of groups) {
    if (pair.length < 2) continue;
    for (const row of pair) {
      const card = await speciesCard(row.ticker);
      const base = card?.isin && card.isin !== isin ? peso.get(card.isin) : null;
      if (!base || dollar.has(base.isin)) continue;
      console.error(`${label}: ${row.ticker} was read as ${isin}, but its own card is ${card.home} (${card.isin}), the certificate of ${base.ticker}; that is used`);
      Object.assign(row, { isin: base.isin, name: base.name, type: base.type });
      dollar.add(base.isin);
    }
  }
  return rows;
}

// The MEP dollar (D) line of each written peso line whose title has no
// dollar line written. rows: the rows written; quiet: the rows byma.mjs
// built that bymaActivity.mjs left out as dormant; never: the symbols
// byma.mjs left out with no trade in two years; board: BYMA's panels.
// A candidate is a symbol ending in D that BYMA lists: a USD, non-cable
// line of today's panels, or, for a title still without one, a share
// ("Accion") BYMA's search box names, off today's panels, found by the
// peso ticker and its first four and three letters and starting with the
// same three letters (ABE3D for ABEV3, DGC2D for DGCU2, HMC.D for HMC).
// Its own species card must give the peso line's ISIN. A line byma.mjs
// built (it traded in two years) goes before one of today's panels that
// never traded, which goes before one off the panels; two left at one
// step for one title stop the run. Returns the rows to add.
async function mepLines(rows, quiet, never, board, label) {
  const peso = new Map();
  const dollar = new Set();
  for (const row of rows) {
    if (!row.isin) continue;
    if (row.currency === "ARS") peso.set(row.isin, row);
    else if (row.currency === "USD") dollar.add(row.isin);
  }
  const written = new Set(rows.map((row) => row.ticker));
  const built = new Map(quiet.map((row) => [row.ticker, row]));
  const cards = new Map();
  const added = [];

  // Candidates -> { isin: [symbols] } of written peso lines still wanting
  // a dollar line. A line byma.mjs built keeps the ISIN it gave it; any
  // other must carry the peso line's ISIN on its own card.
  async function match(symbols, why) {
    const byIsin = new Map();
    for (const symbol of symbols) {
      if (!cards.has(symbol)) cards.set(symbol, await speciesCard(symbol));
      const card = cards.get(symbol);
      const isin = built.get(symbol)?.isin || card?.isin || "";
      const stem = rows.find((row) => row.currency === "ARS" && row.ticker === symbol.slice(0, -1).replace(/\.$/, ""));
      const wanted = stem?.isin && !dollar.has(stem.isin);
      if (!card || !isin) {
        if (wanted) console.error(`${label}: ${symbol} (${why}), next to the written ${stem.ticker}, has ${card ? "a BYMA species card with no ISIN" : "no BYMA species card"}; not written`);
        continue;
      }
      if (!peso.has(isin) || dollar.has(isin)) {
        if (wanted) console.error(`${label}: BYMA's card for ${symbol} (${why}) names ${card.home} (${isin}), not ${stem.ticker} (${stem.isin}); not written`);
        continue;
      }
      if (!byIsin.has(isin)) byIsin.set(isin, []);
      byIsin.get(isin).push(symbol);
    }
    return byIsin;
  }
  function take(byIsin, row) {
    for (const [isin, symbols] of byIsin) {
      if (dollar.has(isin)) continue;
      if (symbols.length > 1) throw new Error(`${symbols.join(" ")} are all MEP dollar lines of ${peso.get(isin).ticker} (${isin})`);
      added.push(row(symbols[0], peso.get(isin), isin));
      dollar.add(isin);
    }
  }
  const fresh = (symbol, base, isin, line) => ({
    query: symbol,
    ticker: symbol,
    name: base.name,
    exchange: "BCBA",
    mic: "XBUE",
    currency: "USD",
    type: base.type,
    isin,
    raw: rawOf(symbol, line),
    panel: line.panel,
  });

  const onBoard = (symbol) => {
    const line = board.get(symbol);
    return symbol.endsWith("D") && line?.currency === "USD" && !line.cable && !written.has(symbol);
  };
  const traded = [...built.keys()].filter(onBoard).sort();
  take(await match(traded, "dormant on BYMA"), (symbol) => built.get(symbol));
  const untraded = never.filter((symbol) => onBoard(symbol) && !built.has(symbol)).sort();
  take(await match(untraded, "no trade in two years"), (symbol, base, isin) => fresh(symbol, base, isin, board.get(symbol)));

  // Off today's panels: asked of BYMA's search box for each title left.
  const left = [...peso.values()].filter((row) => !dollar.has(row.isin));
  const named = new Set();
  for (const row of left) {
    const texts = new Set([row.ticker, row.ticker.slice(0, 4), row.ticker.slice(0, 3)]);
    for (const text of texts) {
      for (const item of await searched(text)) {
        if (item.type !== "Accion" || !item.symbol.endsWith("D") || board.has(item.symbol) || written.has(item.symbol)) continue;
        if (item.symbol.slice(0, 3) !== row.ticker.slice(0, 3)) continue;
        named.add(item.symbol);
      }
    }
  }
  take(await match([...named].sort(), "off today's panels"), (symbol, base, isin) =>
    fresh(symbol, base, isin, { panel: base.panel, denomination: "USD" })
  );
  return added;
}

// Rows (with a panel field: local or cedear) and the lines left out.
export async function wholeByma(label) {
  const board = await bymaBoard();
  const entries = [...board.entries()].map(([symbol, line]) => ({
    symbol,
    live: false,
    raw: rawOf(symbol, line),
  }));
  const read = await bymaRows(entries, label, { cable: false });
  const dropped = [...read.dropped];

  const byTicker = new Map(read.rows.map((row) => [row.ticker, row]));
  const lone = new Set(
    read.rows
      .filter((row) => {
        if (!row.ticker.endsWith("C") || row.currency !== "USD" || !row.isin) return false;
        const stem = byTicker.get(row.ticker.slice(0, -1));
        return stem?.currency === "ARS" && stem.isin === row.isin && !read.board.has(`${row.ticker.slice(0, -1)}D`);
      })
      .map((row) => row.ticker)
  );
  const bonds = new Set(read.rows.filter(isBondCedear).map((row) => row.ticker));
  for (const ticker of lone) dropped.push(`${ticker} cable line with no D line`);
  for (const ticker of bonds) dropped.push(`${ticker} CEDEAR of a bond: ${byTicker.get(ticker).name}`);

  const traded = await tradedToday();
  if (traded.size < 300) throw new Error(`only ${traded.size} BYMA lines traded today`);
  const active = await withoutDormant(
    read.rows.filter((row) => !lone.has(row.ticker) && !bonds.has(row.ticker)),
    traded,
    label
  );
  const kept = new Set(active.rows.map((row) => row.ticker));
  const never = read.dropped.map((line) => /^(\S+) never quoted on BYMA$/.exec(line)?.[1]).filter(Boolean);
  const mep = await mepLines(
    await ownDollarCards(active.rows, label),
    read.rows.filter((row) => !kept.has(row.ticker) && !lone.has(row.ticker) && !bonds.has(row.ticker)),
    never,
    read.board,
    label
  );
  const back = new Set(mep.map((row) => row.ticker));
  dropped.push(...active.dropped);
  for (let index = dropped.length - 1; index >= 0; index -= 1) {
    if (back.has(dropped[index].split(" ")[0])) dropped.splice(index, 1);
  }
  const rows = [...active.rows, ...mep].sort((left, right) => left.ticker.localeCompare(right.ticker));
  console.error(
    `${label}: ${board.size} symbols on BYMA's panels, ${traded.size} traded today, ${active.checked} others checked on BYMA's history; left out ` +
      `${active.counts.never} with no trade in two years, ${active.counts.stale} last traded over 180 days ago, ` +
      `${active.counts.few} with under 5 trade days and none in 30, ${lone.size} cable lines with no D line, ${bonds.size} bond CEDEARs`
  );
  console.error(`${label}: ${mep.length} MEP dollar (D) lines of written peso lines kept although they traded little: ${[...back].sort().join(" ")}`);
  if (!mep.length) throw new Error("no MEP dollar line of a written peso line was kept back: the D-line reading broke");

  expectLine(rows, "GGAL", "ARS", "STOCK", "ARP495251018");
  expectLine(rows, "GGALD", "USD", "STOCK", "ARP495251018");
  expectLine(rows, "YPFD", "ARS", "STOCK", "ARP9897X1319");
  expectLine(rows, "AAPL", "ARS", "STOCK", "ARDEUT116183");
  expectLine(rows, "AAPLD", "USD", "STOCK", "ARDEUT116183");
  expectLine(rows, "SPY", "ARS", "ETF", "ARCAVA460131");
  for (const left of ["AAPLC", "GGALC", "GGALB", "AAPLB", "REIT"]) {
    if (rows.some((row) => row.ticker === left)) throw new Error(`${left} was kept`);
  }
  const lines = new Set();
  const dollars = new Map();
  for (const row of rows) {
    const key = `${row.exchange} ${row.ticker} ${row.currency}`;
    if (lines.has(key)) throw new Error(`${key} was written twice`);
    lines.add(key);
    if (row.currency !== "USD" || !row.isin) continue;
    if (dollars.has(row.isin)) throw new Error(`${dollars.get(row.isin)} and ${row.ticker} are both USD lines of ${row.isin}`);
    dollars.set(row.isin, row.ticker);
  }
  const local = rows.filter((row) => row.panel === "local");
  const cedears = rows.filter((row) => row.panel === "cedear");
  if (local.length < 90) throw new Error(`Buenos Aires shares were short: ${local.length}`);
  if (cedears.length < 600) throw new Error(`CEDEARs were short: ${cedears.length}`);
  if (cedears.filter((row) => row.type === "ETF").length < 100) throw new Error("CEDEAR ETFs were short");

  summary(label, rows, dropped);
  return { rows: rows.map(({ panel, ...row }) => row), dropped };
}
