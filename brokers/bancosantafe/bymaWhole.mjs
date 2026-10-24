// The whole of BYMA's share and CEDEAR board, for the Argentine banks of
// Grupo Petersen (brokers/bancosantafe, brokers/bancoentrerios) whose
// capital-markets page says the bank is a BYMA member and that clients can
// trade every product listed on the market. Neither bank publishes a list
// of its own, so the catalogue is BYMA's own: every symbol on its leader,
// general and CEDEAR panels (open.bymadata.com.ar get-market-data), read
// through ../comafi/byma.mjs (shared with brokers/comafi, gio, hipotecario
// and others), which gives each line its currency (ARS, or USD for the MEP
// dollar line), type and ISIN, and leaves out block lines (GGALB), closed-end
// funds (ALAAF, MELIF, REIT), kinds that are not a share, a CEDEAR or an
// ADR, and lines BYMA shows no trade on in two years.
//
// Then, as brokers/acuantoesta and brokers/hipotecario do:
// - Cable lines (C, contado con liquidación: dollars settled abroad) are
//   not written: neither bank's fee schedule has a cable or CCL line, and
//   the only foreign-currency settlement either names is the MEP dollar
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
//
//   https://open.bymadata.com.ar/

import { bymaBoard, bymaRows, expectLine, pause, summary, UA } from "../comafi/byma.mjs";
import { isBondCedear, withoutDormant } from "../acuantoesta/bymaActivity.mjs";

const MARKET = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/get-market-data";
const PANELS = ["btnLideres", "btnGeneral", "btnCedears"];

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

// Rows (with a panel field: local or cedear) and the lines left out.
export async function wholeByma(label) {
  const board = await bymaBoard();
  const entries = [...board.entries()].map(([symbol, line]) => ({
    symbol,
    live: false,
    raw: ["BYMA", line.panel === "cedear" ? "CEDEARs" : "acciones", symbol, line.denomination].join(" | "),
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
  dropped.push(...active.dropped);
  const rows = active.rows;
  console.error(
    `${label}: ${board.size} symbols on BYMA's panels, ${traded.size} traded today, ${active.checked} others checked on BYMA's history; left out ` +
      `${active.counts.never} with no trade in two years, ${active.counts.stale} last traded over 180 days ago, ` +
      `${active.counts.few} with under 5 trade days and none in 30, ${lone.size} cable lines with no D line, ${bonds.size} bond CEDEARs`
  );

  expectLine(rows, "GGAL", "ARS", "STOCK", "ARP495251018");
  expectLine(rows, "GGALD", "USD", "STOCK", "ARP495251018");
  expectLine(rows, "YPFD", "ARS", "STOCK", "ARP9897X1319");
  expectLine(rows, "AAPL", "ARS", "STOCK", "ARDEUT116183");
  expectLine(rows, "AAPLD", "USD", "STOCK", "ARDEUT116183");
  expectLine(rows, "SPY", "ARS", "ETF", "ARCAVA460131");
  for (const left of ["AAPLC", "GGALC", "GGALB", "AAPLB", "REIT"]) {
    if (rows.some((row) => row.ticker === left)) throw new Error(`${left} was kept`);
  }
  const local = rows.filter((row) => row.panel === "local");
  const cedears = rows.filter((row) => row.panel === "cedear");
  if (local.length < 90) throw new Error(`Buenos Aires shares were short: ${local.length}`);
  if (cedears.length < 600) throw new Error(`CEDEARs were short: ${cedears.length}`);
  if (cedears.filter((row) => row.type === "ETF").length < 100) throw new Error("CEDEAR ETFs were short");

  summary(label, rows, dropped);
  return { rows: rows.map(({ panel, ...row }) => row), dropped };
}
