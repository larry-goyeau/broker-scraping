// What Aizawa Securities (アイザワ証券) sells through Blue Trade, its online
// account.
//
// Japan. The domestic-market page names the Tokyo, Nagoya, Fukuoka and
// Sapporo exchanges and says Blue Trade does not handle some listed names,
// linking an exclusion list ("ブルートレード口座につきましては、国内金融商品
// 取引所に上場していても取扱いしていない銘柄がございます"). That list (FAQ 2802,
// updated 2026-04-30) names only the Bank of Japan (8301), a JASDEC
// not-handled name. So the four exchanges are the whole exchange lists (see
// ./shelf.mjs), less JASDEC's table and 8301. The ETF page points to the
// exchange ETF lists.
//   https://www.aizawa.co.jp/products/domestic/stock/
//   https://aizawa-faq.jp/concierge/aizawa-user/ai-result?sid=investorFAQ&qano=2802
//
// Abroad. The Blue Trade page says the online foreign order screen shows
// and takes orders for the markets the firm handles: Hong Kong, Shanghai,
// Shenzhen, Korea, Taiwan, Singapore, Thailand, Malaysia, Indonesia, the
// Philippines and Vietnam ("当社が取扱いしている市場（香港・上海・深圳・韓国・
// 台湾・シンガポール・タイ・マレーシア・インドネシア・フィリピン・ベトナム）の
// 銘柄情報を表示し、注文ができます"). Each market page links the firm's
// tab-separated file of handled names (code, Aizawa code, Japanese name,
// English name), dated 2026-08-07, and says it includes suspended and
// sell-only names. The files print no ISIN, no board and no currency:
//   Hong Kong      HONGKONG.txt, main board and GEM. HKEX's List of
//                  Securities gives the ISIN and trading currency; a code
//                  HKEX no longer lists stays out. A title HKEX also quotes
//                  in another currency the account holds gets a row for that
//                  counter too (USD, and RMB as CNH).
//   Shanghai B     SHANGHAI-B.txt, in dollars; Shenzhen B SHENZHEN-B.txt, in
//                  Hong Kong dollars (the China page's 売買通貨 line).
//   Stock Connect  SHANGHAI-A.txt and SHENZHEN-A.txt, A shares in offshore
//                  yuan (CNH, as the other Connect catalogues). The China
//                  page's market-rules box ends "上海・香港ストックコネクト
//                  （上海A株）、深セン・香港ストックコネクト（深センA株）について
//                  はお取引店舗までお問合せください", but the online channel
//                  takes A-share orders: the product list (/service/list/)
//                  marks 中国（上海、深圳） ○ for the ブルートレード口座 with no
//                  "not on the internet" note (Israel, US and foreign ETFs
//                  carry one); FAQ 2804 (Blue Trade order rules, 2026-06-05)
//                  gives the online order window for "上海A/Ｂ株・深センA/Ｂ株"
//                  and limit-only selling for "上海（Ａ株/Ｂ株）・深セン（Ａ株/Ｂ株）";
//                  FAQ 2807 sends only odd lots of 上海A/Ｂ株・深センA/Ｂ株 to
//                  the call centre ("インターネットでのご注文ができません").
//                  So the A-share rows stay. The lists hold no STAR (688) or
//                  ChiNext (300) code, so the professional-investor limit on
//                  those boards is moot.
//                  https://aizawa-faq.jp/concierge/aizawa-user/ai-result?sid=investorFAQ&qano=2804
//                  https://aizawa-faq.jp/concierge/aizawa-user/ai-result?sid=investorFAQ&qano=2807
//   Taiwan         TAIWAN.txt, TWSE and TPEx mixed: the board is the one the
//                  asset lists file the code under.
//   Korea          KOREA.txt, KOSPI and KOSDAQ mixed: the board is KRX's
//                  KIND company list (a preferred code goes with its common
//                  code); the ISIN is the asset lists'.
//   Singapore      SINGAPORE.txt and Malaysia MALAYSIA.txt use Bloomberg-like
//                  codes (SIA, GENT), not exchange codes: the English name is
//                  matched to the asset lists (a few by hand, below), and a
//                  Singapore code must still be on SGX's securities list,
//                  which gives its currency.
//   Thailand       THAI.txt: a code ending f is the foreign board (BBL-F, no
//                  ISIN in our lists), n an NVDR (BBL-R); others are
//                  local lines (the TDEX ETF; STECON, whose name says NVDR).
//                  Matches the broker-list remark "Foreign-board shares and
//                  NVDRs only" apart from TDEX.
//   Indonesia      INDNESIA.txt, Philippines PHILIPPINES.txt: exchange codes.
//   Vietnam        VIETNAM.txt, HOSE and HNX mixed: the board is the asset
//                  lists'.
// A code no exchange list carries (delisted since) stays out and is
// printed. REITs, business trusts and infrastructure funds on these lists
// are listed shares and stay STOCK; a name the asset lists file as a fund,
// or that says ETF, TRACKER FUND or INDEX FUND, is an ETF.
//
// Not online, not written: US shares (the counter list US.txt; agency names
// at the branch only) and Israel (sell only, "インターネットではお取引できま
// せん"). The US/Europe rules page says "欧米株は、インターネットではお取引
// できません" and that US orders (agency and counter) are taken by the call
// centre or the branch; FAQ 2858 repeats "米国市場は、インターネットではお取
// 引いただけません".
//   https://www.aizawa.co.jp/products/foreignstock/notes/
//   https://www.aizawa.co.jp/service/list/
//
//   https://www.aizawa.co.jp/service/tool/bluetrade/
//   https://www.aizawa.co.jp/products/asia/china/  (and /taiwan/, /korea/, …)
//   https://www.aizawa.co.jp/products/asia/notes/
//   https://www.aizawa.co.jp/documents/meigara/<MARKET>.txt
//   https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&marketType=stockMkt (kosdaqMkt)
//   https://api.sgx.com/securities/v1.1?excludetypes=bonds&params=nc,n,cur,type
//
//   node brokers/aizawa/aizawa_scraping.mjs

import {
  fetchBytes,
  fetchText,
  fold,
  hkexCounters,
  hkOtherCounters,
  normalize,
  parseCsv,
  textOf,
  writeCatalogue,
} from "../mitsubishiufjesmart/japan.mjs";
import { droppedText, japanShelf } from "./shelf.mjs";
import { catalogueFiles } from "../../catalogues.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";

const FILES = "https://www.aizawa.co.jp/documents/meigara/";
const BLUETRADE = "https://www.aizawa.co.jp/service/tool/bluetrade/";
const KIND = "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&marketType=";
const SGX = "https://api.sgx.com/securities/v1.1?excludetypes=bonds&params=nc,n,cur,type";

// Foreign-currency settlement service: every currency of the service page,
// and CNH for the offshore yuan Connect and HKEX RMB counters settle in.
// https://www.aizawa.co.jp/service/convenience/f_exchange/
const HOLDS = new Set(["JPY", "USD", "GBP", "EUR", "AUD", "CAD", "CHF", "NZD", "ZAR", "TRY", "RUB", "MXN", "CNY", "CNH", "HKD", "KRW", "TWD", "SGD", "IDR", "THB", "PHP", "MYR", "ILS", "VND"]);

// Codes whose English name the asset lists do not match to one line
// (renamed, stale duplicate lines). Checked by hand on the exchange lists.
const BY_HAND = {
  SGX: { KEP: "BN4", THK: "AWI", PAC: "P15", HYF: "600", ST: "Z74", CICT: "C38U", STE: "S63" },
  MYX: {
    FNH: "F&N",
    KLCCSS: "KLCC",
    SPSB: "SPSETIA",
    EAST: "E&O",
    HEKT: "HEKTAR",
    AAGB: "CAPITALA",
    ZETRIX: "ZETRIX",
    MRDIY: "MRDIY",
    HAP: "HAPSENG",
    IGBREIT: "IGBREIT",
    OSK: "OSK",
    AEON: "AEON",
    CAB: "CARLSBG",
    CG: "COMFORT",
    MMHE: "MHB",
  },
};

const ETF_NAME = /\bETF\b|TRACKER FUND|INDEX FUND/;

// ---------------------------------------------------------------- sources

async function aizawaFile(name) {
  const text = new TextDecoder("shift_jis").decode(await fetchBytes(`${FILES}${name}.txt`));
  const lines = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split("\t").map((cell) => fold(cell));
    if (!cells[0]) continue;
    if (cells.length < 4) throw new Error(`${name}.txt line not read: ${line}`);
    lines.push({ code: cells[0], own: cells[1], jp: cells[2], en: cells[3] });
  }
  if (lines.length < 20) throw new Error(`${name}.txt has only ${lines.length} lines`);
  return lines;
}

async function checkBlueTrade() {
  const text = textOf(await fetchText(BLUETRADE));
  const phrase = "香港・上海・深圳・韓国・台湾・シンガポール・タイ・マレーシア・インドネシア・フィリピン・ベトナム";
  if (!text.includes(phrase)) throw new Error("Blue Trade page no longer lists the eleven markets");
}

// exchange → code → [{ isin, name, fund }]
function assetBook() {
  const book = new Map();
  for (const [file, fund] of [["stocks.csv", false], ["etfs.csv", true]]) {
    const table = parseCsv(fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8"));
    for (const line of table.slice(1)) {
      const exchange = normalize(line[1]).toUpperCase();
      const code = normalize(line[0]).split(":").pop().toUpperCase();
      const isin = normalize(line[2]).toUpperCase();
      if (!book.has(exchange)) book.set(exchange, new Map());
      const codes = book.get(exchange);
      if (!codes.has(code)) codes.set(code, []);
      codes.get(code).push({ code, isin: /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : "", name: normalize(line[3]), fund });
    }
  }
  return book;
}

// mic|ticker → ISINs, from every other catalogue on the venues read here.
const OTHER_MICS = new Set(["XIDX", "XPHS", "XSTC", "HSTC", "UPCM", "XBKK", "XTAI", "ROCO", "XSHG", "XSHE", "XKLS", "XSES"]);
function catalogueBook() {
  const found = new Map();
  for (const file of catalogueFiles()) {
    if (file.includes("/aizawa/")) continue;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    for (const line of Array.isArray(parsed) ? parsed : parsed.rows || []) {
      const mic = line.mic || resolveVenue(line).venue?.mic;
      if (!OTHER_MICS.has(mic)) continue;
      const isin = String(line.isin || "").toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      const key = `${mic}|${String(line.ticker || "").toUpperCase()}`;
      if (!found.has(key)) found.set(key, new Set());
      found.get(key).add(isin);
    }
  }
  return found;
}

async function kindBoards() {
  const boards = new Map();
  for (const [market, board] of [["stockMkt", "KOSPI"], ["kosdaqMkt", "KOSDAQ"]]) {
    const html = new TextDecoder("euc-kr").decode(await fetchBytes(`${KIND}${market}`));
    let count = 0;
    for (const match of html.matchAll(/<td style="mso-number-format:'@';text-align:center;">([0-9A-Z]{6})<\/td>/g)) {
      boards.set(match[1], board);
      count += 1;
    }
    if (count < 700) throw new Error(`KIND ${board} list has only ${count} codes`);
  }
  return boards;
}

async function sgxList() {
  const data = JSON.parse((await fetchBytes(SGX)).toString("utf8")).data?.prices || [];
  const byCode = new Map();
  for (const line of data) if (line.nc) byCode.set(String(line.nc).trim(), line);
  if (byCode.size < 500) throw new Error(`SGX list has only ${byCode.size} codes`);
  return byCode;
}

// ---------------------------------------------------------------- helpers

const STOP = new Set(["LTD", "LIMITED", "BHD", "BERHAD", "INC", "CORP", "CORPORATION", "CO", "COMPANY", "THE", "PLC", "PCL", "HOLDINGS", "HOLDING", "HLDGS", "GROUP", "GRP", "TBK", "PT", "OF", "AND", "REIT", "TRUST", "INTL", "INTERNATIONAL"]);
function words(value) {
  return fold(value)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !STOP.has(word))
    .join(" ");
}

// The asset line of a code, by English name when the broker's code is not
// the exchange's.
function byName(book, exchange, line) {
  const codes = book.get(exchange);
  const hand = BY_HAND[exchange]?.[line.code];
  if (hand) return codes.get(hand)?.[0] ? { ...codes.get(hand)[0], code: hand } : null;
  const want = words(line.en);
  if (!want) return null;
  const exact = [];
  const prefix = [];
  for (const [code, hits] of codes) {
    for (const hit of hits) {
      const have = words(hit.name);
      if (!have) continue;
      if (have === want) exact.push({ ...hit, code });
      else if (have.startsWith(`${want} `) || want.startsWith(`${have} `)) prefix.push({ ...hit, code });
    }
  }
  const pick = exact.length ? exact : prefix;
  const isins = new Set(pick.map((hit) => hit.isin));
  if (pick.length === 1 || (pick.length > 1 && isins.size === 1 && pick.some((hit) => hit.code === line.code))) {
    return pick.find((hit) => hit.code === line.code) || pick[0];
  }
  return null;
}

function row({ ticker, line, exchange, mic, currency, isin, type, note }) {
  return {
    query: isin || ticker,
    ticker,
    name: line.en || line.jp || ticker,
    exchange,
    mic,
    currency,
    type,
    isin: isin || "",
    raw: [ticker, line.own, line.jp, line.en, note, exchange, currency, type].filter(Boolean).join(" "),
  };
}

// A listed infrastructure fund or REIT the asset lists file with the funds
// (Macquarie Korea Infrastructure) is a listed share here.
function typeOf(line, hit) {
  const name = fold(line.en).toUpperCase();
  if (ETF_NAME.test(name)) return "ETF";
  return hit?.fund && !/INFRASTRUCTURE|REIT|REAL ESTATE/.test(name) ? "ETF" : "STOCK";
}

// ---------------------------------------------------------------- run

const [shelf, , counters, kind, sgx, ...files] = await Promise.all([
  japanShelf({ places: ["Tokyo", "Nagoya", "Fukuoka", "Sapporo"], refusedToo: ["8301"] }),
  checkBlueTrade(),
  hkexCounters(),
  kindBoards(),
  sgxList(),
  ...["HONGKONG", "SHANGHAI-B", "SHENZHEN-B", "SHANGHAI-A", "SHENZHEN-A", "TAIWAN", "KOREA", "SINGAPORE", "THAI", "MALAYSIA", "INDNESIA", "PHILIPPINES", "VIETNAM"].map(aizawaFile),
]);
const [hk, shB, szB, shA, szA, tw, kr, sg, th, my, id, ph, vn] = files;
const book = assetBook();
const others = catalogueBook();

// The asset line of an exchange code, or, when the asset lists lack it,
// the ISIN other catalogues agree on for that code and venue (the local
// brokers of Vietnam and Indonesia read their exchange's full list).
function listed(assets, mic, code, otherTicker = code) {
  const hit = book.get(assets)?.get(code)?.[0];
  if (hit) return hit;
  const isins = others.get(`${mic}|${otherTicker}`);
  if (!mic || !isins) return null;
  return { code, isin: isins.size === 1 ? [...isins][0] : "", fund: false, from: "catalogue" };
}
const rows = [];
const missing = {};
const miss = (market, line) => (missing[market] ||= []).push(`${line.code} ${line.en}`);

// Hong Kong
const hkRows = [];
for (const line of hk) {
  const ticker = String(Number(line.code));
  if (ticker === "NaN") throw new Error(`HONGKONG.txt code not read: ${line.code}`);
  if (!counters.has(ticker)) {
    miss("Hong Kong", line);
    continue;
  }
  const hit = book.get("HKEX")?.get(ticker)?.[0];
  hkRows.push(row({ ticker, line, exchange: "HKEX", mic: "XHKG", currency: "HKD", type: typeOf(line, hit) }));
}
const { added: hkAdded } = hkOtherCounters(hkRows, counters, (currency) => HOLDS.has(currency));
rows.push(...hkRows);

// Shanghai and Shenzhen
for (const [lines, assets, exchange, mic, currency, pattern] of [
  [shB, "SSE", "Shanghai Stock Exchange", "XSHG", "USD", /^900\d{3}$/],
  [szB, "SZSE", "Shenzhen Stock Exchange", "XSHE", "HKD", /^20\d{4}$/],
  [shA, "SSE", "Shanghai-Hong Kong Stock Connect", "XSHG", "CNH", /^60[0-35]\d{3}$/],
  [szA, "SZSE", "Shenzhen-Hong Kong Stock Connect", "XSHE", "CNH", /^00[0-3]\d{3}$/],
]) {
  for (const line of lines) {
    if (!pattern.test(line.code)) throw new Error(`${exchange} code out of its board: ${line.code} ${line.en}`);
    const hit = listed(assets, mic, line.code);
    if (!hit) {
      miss(exchange, line);
      continue;
    }
    rows.push(row({ ticker: line.code, line, exchange, mic, currency, isin: hit.isin, type: typeOf(line, hit) }));
  }
}

// Taiwan
for (const line of tw) {
  const twse = listed("TWSE", "XTAI", line.code);
  const tpex = twse ? null : listed("TPEX", "ROCO", line.code);
  const hit = twse || tpex;
  if (!hit) {
    miss("Taiwan", line);
    continue;
  }
  const [exchange, mic] = twse ? ["Taiwan Stock Exchange", "XTAI"] : ["Taipei Exchange", "ROCO"];
  rows.push(row({ ticker: line.code, line, exchange, mic, currency: "TWD", isin: hit.isin, type: typeOf(line, hit) }));
}

// Korea
for (const line of kr) {
  const hit = listed("KRX", "", line.code);
  const board = kind.get(line.code) || kind.get(line.code.replace(/.$/, "0")) || (hit?.fund ? "KOSPI" : "");
  if (!board) {
    miss("Korea", line);
    continue;
  }
  const [exchange, mic] = board === "KOSDAQ" ? ["KOSDAQ", "XKOS"] : ["Korea Exchange", "XKRX"];
  rows.push(row({ ticker: line.code, line, exchange, mic, currency: "KRW", isin: hit?.isin, type: typeOf(line, hit) }));
}

// Singapore
for (const line of sg) {
  const hit = byName(book, "SGX", line);
  const listed = hit && sgx.get(hit.code);
  if (!listed) {
    miss("Singapore", line);
    continue;
  }
  const currency = String(listed.cur || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`SGX ${hit.code} has no currency`);
  const type = listed.type === "etfs" ? "ETF" : typeOf(line, hit);
  rows.push(row({ ticker: hit.code, line, exchange: "Singapore Exchange", mic: "XSES", currency, isin: hit.isin, type, note: `Aizawa ${line.code}` }));
}

// Thailand
for (const line of th) {
  const suffix = line.code.slice(-1);
  // Lower-case f and n only: STECON ends in a capital N of its own.
  const base = /[fn]$/.test(line.code) ? line.code.slice(0, -1) : line.code;
  const nvdr = suffix === "n" || /NVDR/.test(line.en.toUpperCase());
  const foreign = suffix === "f";
  const ticker = foreign ? `${base}-F` : nvdr ? `${base}-R` : base;
  const hit = foreign ? null : listed("SET", "XBKK", nvdr ? `${base}.R` : base, ticker);
  // A foreign-board line, or an NVDR our lists lack, is kept while the
  // local share is listed; neither has an ISIN in our lists.
  if (!hit && !((foreign || nvdr) && listed("SET", "XBKK", base))) {
    miss("Thailand", line);
    continue;
  }
  const note = foreign ? "foreign board" : nvdr ? "NVDR" : "";
  rows.push(row({ ticker, line, exchange: "Stock Exchange of Thailand", mic: "XBKK", currency: "THB", isin: hit?.isin, type: typeOf(line, hit), note }));
}

// Malaysia
for (const line of my) {
  const hit = byName(book, "MYX", line);
  if (!hit) {
    miss("Malaysia", line);
    continue;
  }
  rows.push(row({ ticker: hit.code, line, exchange: "Bursa Malaysia", mic: "XKLS", currency: "MYR", isin: hit.isin, type: typeOf(line, hit), note: `Aizawa ${line.code}` }));
}

// Indonesia and the Philippines
for (const [lines, assets, exchange, mic, currency] of [
  [id, "IDX", "Indonesia Stock Exchange", "XIDX", "IDR"],
  [ph, "PSE", "Philippine Stock Exchange", "XPHS", "PHP"],
]) {
  for (const line of lines) {
    const hit = listed(assets, mic, line.code);
    if (!hit) {
      miss(exchange, line);
      continue;
    }
    rows.push(row({ ticker: line.code, line, exchange, mic, currency, isin: hit.isin, type: typeOf(line, hit) }));
  }
}

// Vietnam
for (const line of vn) {
  const boards = [["HOSE", "XSTC", "HOSE"], ["HNX", "HSTC", "Hanoi Stock Exchange"], ["UPCOM", "UPCM", "UPCOM"]];
  const found = boards.map(([assets, mic, exchange]) => ({ hit: listed(assets, mic, line.code), mic, exchange })).find((board) => board.hit);
  if (!found) {
    miss("Vietnam", line);
    continue;
  }
  const { hit, mic, exchange } = found;
  rows.push(row({ ticker: line.code, line, exchange, mic, currency: "VND", isin: hit.isin, type: typeOf(line, hit) }));
}

const foreignRead = files.reduce((sum, lines) => sum + lines.length, 0);
writeCatalogue(import.meta.url, "aizawa-parsed.json", [...shelf.rows, ...rows], {
  "Tokyo STOCK": 3500,
  "Tokyo ETF": 300,
  Nagoya: 150,
  Fukuoka: 50,
  Sapporo: 30,
  HKEX: 800,
  "Korea Exchange": 150,
  KOSDAQ: 20,
  "Stock Exchange of Thailand": 150,
});
console.error(`Foreign files: ${foreignRead} lines, ${rows.length} rows (${hkAdded.length} other HKEX counters)`);
for (const [market, lines] of Object.entries(missing)) console.error(`  not on any list, ${market}: ${lines.length} (${lines.join("; ")})`);
console.error(`Left out at home: ${droppedText(shelf.dropped)}`);
