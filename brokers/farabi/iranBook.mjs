// The whole share and ETF book of the Tehran Stock Exchange (TSE, XTEH) and
// Iran Fara Bourse (IFB, IFBX), for the Iranian brokers whose places are
// those two exchanges (farabi, charisma, bankmellat, saman, danayan, ...).
// An Iranian broker's online account (Exir, Online Plus, Farabixo, Kaman,
// ...) trades every TSE and IFB symbol the market supervisor has open; the
// scraper calls iranBook() and removes only what the broker itself excludes
// on its own pages.
//
// Source. The exchanges' own sites (tsetmc.com, tse.ir, ifb.ir, codal.ir)
// do not answer outside Iran (connections time out). The list is read from
// Rahavard 365 (rahavard365.com, Tadbir Pardaz's market-data site, which
// mirrors the TSETMC feed and answers from abroad), with no login:
//
//   https://rahavard365.com/api/v2/market-data/stocks        shares, TSE (exchange_id 1) and IFB (2), with the
//                                                             supervisor's state: "مجاز" open, "ممنوع - متوقف ..." halted
//   https://rahavard365.com/api/v2/market-data/etf-funds     exchange-traded funds (TSE 1, IFB 2, energy 6, commodity 7)
//   https://rahavard365.com/api/v2/market-data/closed-assets symbols halted today, with the reason
//   https://rahavard365.com/api/v2/asset/<id>                 name, English name, sector (category)
//   https://rahavard365.com/api/v2/asset/<id>/specification   the TSETMC instrument: code, ISIN, market, board
//
// Kept: shares on the TSE main and secondary boards and on the IFB first,
// second, SME and base (پایه زرد / نارنجی / قرمز) markets, and the exchange-
// traded funds (صندوق سرمایه گذاری قابل معامله, sector 68) listed on the TSE
// or the IFB, in rials. The place is the exchange of the TSETMC instrument
// (the specification's instrument exchange, TSE or OTC = Fara Bourse),
// which agrees with the instrument's group (N1/N2 TSE; Z1, P1/C1/L1 IFB).
// The market-data lists' exchange_id is the company's and differs for some
// ninety symbols (October 2026): "بورس" (Tehran Stock Exchange Co.) and "کالا" trade on the
// IFB base market, "همراه" and "ذوب" on the IFB (group Z1), "خاور" and
// "ولیز" on the TSE (group N2), whatever the company record says.
// Left out:
//   - a symbol the supervisor has halted ("ممنوع - متوقف", the market-data
//     state "closed", or on the closed-assets list);
//   - a right (حق تقدم, "...ح" symbols), a bond or sukuk (اوراق), an option,
//     a future, a commodity deposit certificate, housing-facility rights
//     (تسه): not in the share list, and anything whose TSETMC instrument is
//     not a "share" / "etf" line is dropped as well;
//   - a fund outside TSETMC sector 68 "صندوق سرمایه گذاری قابل معامله"
//     (venture capital جسورانه, land and building زمین و ساختمان, private
//     equity خصوصی: not in the ETF list today) and market-making
//     (بازارگردانی) funds, which do not trade. Inside sector 68 everything is
//     kept, as the exchanges class it: equity, index, sector, leveraged,
//     mixed, fixed-income, fund-of-funds, real-estate (املاک و مستغلات) and
//     project (پروژه) funds;
//   - ETFs of the Iran Mercantile Exchange (IME, gold coins and certificate
//     funds such as "زر", "ناب") and of the Iran Energy Exchange: other
//     exchanges, not TSE or IFB;
//   - the odd-lot, block and compensation lines of a symbol (TSETMC codes
//     ending 2, 3, 4): one row per symbol, its main-market line.
// The base market (IFB پایه) is kept: a client signs the base-market risk
// statement (بیانیه ریسک بازار پایه) online and then trades it; raw carries
// the market, board and group ("بازار پایه زرد P1") so a scraper can add a
// remark.
//
// ISINs: the TSETMC instrument's ISIN from the specification ("IRO1FOLD0009"
// for فولاد, a valid ISIN; the 12-character instrument code IRO1FOLD0001 is
// not). `query` is the ISIN; `ticker` is the Persian trade symbol; `name` the
// English company name when Rahavard has one, else the Persian name; raw
// carries the Persian name, the Latin symbol and the TSETMC code.
//
// Asset details are cached next to this module (iran-assets.json) and only
// new asset ids are fetched; the three lists of the last good run are kept
// in iran-lists.json and used, with a warning, when Rahavard does not answer.
//
//   import { iranBook, iranBookSummary } from "../farabi/iranBook.mjs";
//   const rows = await iranBook();                       // both places
//   const rows = await iranBook({ places: ["TSE"] });    // Tehran Stock Exchange only
//
//   node brokers/farabi/iranBook.mjs    prints the counts, writes nothing but the caches
//
// iranPageSays(url, patterns) reads a broker page with curl (several Iranian
// broker sites send an incomplete certificate chain that Node's fetch
// refuses, and some answer only a browser user agent) and throws when a
// sentence the scraper rests on is gone. The text is tag-stripped, with
// Persian and Arabic digits, decimal and percent signs made ASCII, ي/ك made
// ی/ک and the zero-width non-joiner made a space.

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const TSE_PLACE = "Tehran Stock Exchange";
export const IFB_PLACE = "Iran Fara Bourse";
const PLACES = {
  1: { key: "TSE", exchange: TSE_PLACE, mic: "XTEH" },
  2: { key: "IFB", exchange: IFB_PLACE, mic: "IFBX" },
};
const API = "https://rahavard365.com/api/v2";
const ASSET_CACHE = new URL("iran-assets.json", import.meta.url);
const LIST_CACHE = new URL("iran-lists.json", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The ETF family: the asset's TSETMC sector is 68 "صندوق سرمایه گذاری قابل
// معامله" (or one of its children); closed-end funds carry other sectors.
const ETF_SECTOR = /صندوق سرمایه گذاری قابل معامله/;
const NOT_ETF = /جسورانه|زمین و ساختمان|خصوصی|بازارگردانی/;

async function getJson(path, { tries = 4 } = {}) {
  let last = "";
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const response = await fetch(`${API}/${path}`, {
        headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "fa-IR,fa;q=0.9" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return await response.json();
      last = `${response.status} ${API}/${path}`;
      if (response.status === 404) break;
    } catch (error) {
      last = `${API}/${path}: ${error.cause?.message || error.message || error}`;
    }
    await pause(1_500 * (attempt + 1));
  }
  throw new Error(last);
}

function readJson(url, fallback) {
  try {
    return JSON.parse(fs.readFileSync(url, "utf8"));
  } catch {
    return fallback;
  }
}

async function marketLists() {
  try {
    const [stocks, etfs, closed] = await Promise.all([
      getJson("market-data/stocks"),
      getJson("market-data/etf-funds"),
      getJson("market-data/closed-assets"),
    ]);
    const lists = { at: new Date().toISOString(), stocks: stocks.data, etfs: etfs.data, closed: closed.data.closed_asset_list };
    if (!Array.isArray(lists.stocks) || lists.stocks.length < 600) throw new Error(`Rahavard listed ${lists.stocks?.length} shares`);
    if (!Array.isArray(lists.etfs) || lists.etfs.length < 150) throw new Error(`Rahavard listed ${lists.etfs?.length} ETFs`);
    fs.writeFileSync(LIST_CACHE, JSON.stringify(lists));
    return { ...lists, source: `${API}/market-data/*` };
  } catch (error) {
    const cached = readJson(LIST_CACHE, null);
    if (!cached) throw new Error(`Rahavard 365 market lists unavailable (${error.message}) and no cached copy`);
    console.error(`Rahavard 365 did not answer (${error.message}); using ${fileURLToPath(LIST_CACHE)} of ${cached.at}`);
    return { ...cached, source: fileURLToPath(LIST_CACHE) };
  }
}

function trimAsset(asset) {
  const category = asset.category || {};
  return {
    symbol: asset.trade_symbol,
    latin: asset.english_trade_symbol || "",
    name: asset.name || "",
    englishName: asset.english_name || "",
    typeTitle: asset.type_title || "",
    exchange: asset.exchange?.code || "",
    sector: [category.name, category.parent?.name].filter(Boolean).join(" / "),
    categories: (asset.categories || []).map((c) => c.name).filter(Boolean),
  };
}

function mainInstrument(spec, symbol) {
  const list = spec?.instruments || [];
  return (
    list.find((i) => i.short_name === symbol && /اصلی/.test(i.market?.title || "")) ||
    list.find((i) => i.short_name === symbol) ||
    list.find((i) => /اصلی/.test(i.market?.title || "")) ||
    list[0] ||
    null
  );
}

async function assetDetails(ids) {
  const cache = readJson(ASSET_CACHE, {});
  const missing = ids.filter((id) => !cache[id] || cache[id].venue === undefined);
  let failed = 0;
  let index = 0;
  async function worker() {
    while (index < missing.length) {
      const id = missing[index++];
      try {
        const [asset, spec] = await Promise.all([getJson(`asset/${id}`), getJson(`asset/${id}/specification`)]);
        const a = trimAsset(asset.data.asset);
        const i = mainInstrument(spec.data, a.symbol);
        cache[id] = {
          ...a,
          code: i?.code || "",
          isin: i?.isin || "",
          instrument: i?.type || "",
          market: i?.market?.title || "",
          board: i?.board?.title || "",
          group: i?.group?.title || "",
          venue: i?.exchange?.code || "",
        };
      } catch (error) {
        failed += 1;
        console.error(`Rahavard asset ${id}: ${error.message}`);
      }
      await pause(150);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  if (missing.length) fs.writeFileSync(ASSET_CACHE, JSON.stringify(cache, null, 1));
  return { cache, fetched: missing.length - failed, failed };
}

const fa = (s) => String(s || "").replace(/\s+/g, " ").trim();

/** Plain text of a Persian page: tags out, digits and signs ASCII, letters normalised. */
export function persianText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&zwnj;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/٪/g, "%")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u00a0\u200c\u200f\u200e]/g, " ")
    .replace(/\s+/g, " ");
}

/** GET with curl: { status, type, body (Buffer) }. */
export function curlGet(url, { timeout = 90 } = {}) {
  const href = new URL(url).href;
  return new Promise((resolve) => {
    execFile(
      "curl",
      ["-s", "-L", "-m", String(timeout), "-A", UA, "-H", "Accept-Language: fa-IR,fa;q=0.9,en;q=0.8", "-w", "\n@@%{http_code}|%{content_type}", href],
      { encoding: "buffer", maxBuffer: 100e6 },
      (error, stdout) => {
        const out = stdout || Buffer.alloc(0);
        const at = out.lastIndexOf("\n@@");
        const [status, type] = (at >= 0 ? out.subarray(at + 3).toString() : "0|").split("|");
        resolve({ status: Number(status) || 0, type: type || "", body: at >= 0 ? out.subarray(0, at) : out, error: error?.message });
      },
    );
  });
}

/**
 * Reads a broker page and throws when one of the patterns is gone.
 * { raw: true } tests the HTML (or script) as served; { pdf: true } only
 * checks that a PDF is still served there. Returns the text tested.
 */
export async function iranPageSays(url, patterns = [], { raw = false, pdf = false } = {}) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const r = await curlGet(url);
    if (r.status === 200 && r.body.length) {
      if (pdf) {
        if (!r.body.subarray(0, 5).toString().startsWith("%PDF")) throw new Error(`${url} is no longer a PDF (${r.type})`);
        return "";
      }
      const text = raw ? r.body.toString("utf8") : persianText(r.body.toString("utf8"));
      for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
      return text;
    }
    last = `${url} answered ${r.status}${r.error ? ` (${r.error.split("\n")[0]})` : ""}`;
    await pause(2_000 * (attempt + 1));
  }
  throw new Error(last);
}

/**
 * Every share and ETF open for trading on the TSE and the IFB.
 * Rows: { query, ticker, name, exchange, mic, currency: "IRR", type: "STOCK" | "ETF", isin, raw },
 * sorted by place then ticker. rows.report (not serialised) holds the source and what was left out.
 */
export async function iranBook({ places = ["TSE", "IFB"] } = {}) {
  const lists = await marketLists();
  const closedIds = new Map(lists.closed.map((c) => [String(c.asset_id), c.reason_of_close]));
  const wanted = new Set(places);
  const VENUE = { TSE: PLACES[1], OTC: PLACES[2] };

  const candidates = [
    ...lists.stocks.map((x) => ({ ...x, kind: "STOCK" })),
    ...lists.etfs.map((x) => ({ ...x, kind: "ETF" })),
  ];
  const dropped = { otherExchange: [], halted: [], notShare: [], notEtf: [], noIsin: [], duplicate: [], debt: [] };
  const inPlace = [];
  for (const x of candidates) {
    if (!PLACES[x.exchange_id]) {
      dropped.otherExchange.push(x.name);
      continue;
    }
    if (x.instrument_state !== "open" || closedIds.has(String(x.asset_id))) {
      dropped.halted.push(`${x.name} (${fa(x.instrument_description) || closedIds.get(String(x.asset_id)) || x.instrument_state || "no state"})`);
      continue;
    }
    inPlace.push(x);
  }
  const { cache, fetched, failed } = await assetDetails([...new Set(inPlace.map((x) => String(x.asset_id)))]);
  if (failed > 20) throw new Error(`${failed} Rahavard asset pages failed`);

  const rows = [];
  const seen = new Set();
  for (const x of inPlace) {
    const d = cache[String(x.asset_id)];
    if (!d) continue;
    const place = VENUE[d.venue];
    if (!place) {
      dropped.otherExchange.push(`${x.name} (${d.venue || "no exchange"})`);
      continue;
    }
    if (!wanted.has(place.key)) continue;
    if (x.kind === "STOCK") {
      if (d.instrument !== "share" || d.typeTitle !== "سهام" || /حق تقدم/.test(`${d.name} ${d.group}`)) {
        dropped.notShare.push(`${x.name} (${d.typeTitle}/${d.instrument})`);
        continue;
      }
    } else {
      const sector = `${d.sector} ${d.categories.join(" ")}`;
      if (d.instrument !== "etf" || !ETF_SECTOR.test(sector) || NOT_ETF.test(sector)) {
        dropped.notEtf.push(`${x.name} (${d.sector || d.instrument})`);
        continue;
      }
    }
    if (!/^IR[A-Z0-9]{10}$/.test(d.isin)) {
      dropped.noIsin.push(x.name);
      continue;
    }
    const key = `${d.isin}|${place.mic}`;
    if (seen.has(key)) {
      dropped.duplicate.push(x.name);
      continue;
    }
    seen.add(key);
    const board = [d.market, d.board, d.group].filter(Boolean).join(" / ");
    rows.push({
      query: d.isin,
      ticker: fa(d.symbol || x.name),
      name: fa(d.englishName) || fa(d.name),
      exchange: place.exchange,
      mic: place.mic,
      currency: "IRR",
      type: x.kind,
      isin: d.isin,
      raw: [fa(d.symbol), fa(d.name), d.latin, d.code, place.key, board, "IRR", x.kind].filter(Boolean).join(" | "),
    });
  }

  const kept = withoutObligations(rows);
  const keptSet = new Set(kept);
  dropped.debt = rows.filter((row) => !keptSet.has(row)).map((row) => row.ticker);
  const stamped = stampRows(kept);
  stamped.sort((a, b) => a.mic.localeCompare(b.mic) || a.ticker.localeCompare(b.ticker, "fa"));

  const count = (mic, type) => stamped.filter((r) => r.mic === mic && r.type === type).length;
  const must = (ticker, mic) => {
    if (!stamped.some((r) => r.ticker === ticker && r.mic === mic) && !dropped.halted.some((h) => h.startsWith(`${ticker} (`)))
      throw new Error(`${ticker} is missing from the ${mic} book`);
  };
  if (wanted.has("TSE")) {
    must("فولاد", "XTEH");
    must("فملی", "XTEH");
    if (count("XTEH", "STOCK") < 250) throw new Error(`only ${count("XTEH", "STOCK")} TSE shares kept`);
    if (count("XTEH", "ETF") < 40) throw new Error(`only ${count("XTEH", "ETF")} TSE ETFs kept`);
  }
  if (wanted.has("IFB")) {
    must("مارون", "IFBX");
    must("زاگرس", "IFBX");
    if (count("IFBX", "STOCK") < 250) throw new Error(`only ${count("IFBX", "STOCK")} IFB shares kept`);
    if (count("IFBX", "ETF") < 60) throw new Error(`only ${count("IFBX", "ETF")} IFB ETFs kept`);
  }

  Object.defineProperty(stamped, "report", {
    enumerable: false,
    value: {
      source: lists.source,
      listedAt: lists.at,
      kept: stamped.length,
      tseShares: count("XTEH", "STOCK"),
      tseEtfs: count("XTEH", "ETF"),
      ifbShares: count("IFBX", "STOCK"),
      ifbEtfs: count("IFBX", "ETF"),
      baseMarket: stamped.filter((r) => /بازار پایه/.test(r.raw)).length,
      assetsFetched: fetched,
      dropped,
    },
  });
  return stamped;
}

/** One line for a scraper's console: what the book kept and left out. */
export function iranBookSummary(rows) {
  const r = rows.report || {};
  const d = r.dropped || {};
  const n = (k) => (d[k] || []).length;
  return [
    `${rows.length} rows`,
    `TSE ${r.tseShares} shares + ${r.tseEtfs} ETFs`,
    `IFB ${r.ifbShares} shares (${r.baseMarket} on the base market) + ${r.ifbEtfs} ETFs`,
    `left out: ${n("halted")} halted, ${n("notShare")} non-share, ${n("notEtf")} non-ETF funds, ${n("otherExchange")} IME/energy funds, ${n("noIsin")} without ISIN, ${n("debt")} debt`,
  ].join("; ");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const rows = await iranBook();
  console.log(iranBookSummary(rows));
  const d = rows.report.dropped;
  for (const [k, v] of Object.entries(d)) if (v.length) console.log(`${k}: ${v.slice(0, 40).join(", ")}${v.length > 40 ? ` ... (+${v.length - 40})` : ""}`);
}
