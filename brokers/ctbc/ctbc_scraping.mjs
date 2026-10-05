// CTBC Bank publishes the shelf without a login. One search returns
// every ETF and foreign share. A row is sold only when `purchase` is
// true, which is the live buy button. A suspended button stays out.
// The quote itself is not stored. None of these rows prints an ISIN.
// One is filled from the shared lists when a
// single code on the allowed places matches. Several matches stay
// blank.
//
//   https://www.ctbcbank.com/twrbo/zh_tw/inv_index/inv_etf/inv_etf_search.html
//   https://www.ctbcbank.com/twrbo/zh_tw/inv_index/inv_etf/inv_ETF_int_transaction_notice.html

import { spawn } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { createServer } from "net";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { setTimeout as delay } from "timers/promises";
import { fileURLToPath } from "url";
import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";

const PAGE = "https://www.ctbcbank.com/twrbo/zh_tw/inv_index/inv_etf/inv_etf_search.html";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "ctbc-parsed.json");
const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
].find((path) => existsSync(path));
const US_PLACES = ["NYSE", "NASDAQ", "AMEX", "CBOE"];

const MARKETS = [
  ["台灣證券交易所", "TWSE"],
  ["美國紐約證券交易所", "NYSE"],
  ["美國那斯達克交易所", "NASDAQ"],
  ["香港交易所", "Hong Kong"],
  ["上海交易所", "Shanghai"],
  ["倫敦交易所", "London"],
  ["日本東京交易所", "Tokyo"],
];

function textOf(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shownName(name) {
  const text = textOf(name).replace(/^<[^>]+>\s*/, "");
  const professional = /限專業投資人/.test(text);
  const clean = text
    .replace(/\s*[（(]\s*限專業投資人(?:自主交易服務)?\s*[)）]\s*/g, " ")
    .replace(/限專業投資人(?:自主交易服務)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { name: clean, professional };
}

function tickerOf(printed) {
  return textOf(printed).toUpperCase().replaceAll("/", ".").replaceAll(" ", "");
}

function listingType(name, prodType) {
  const label = String(name || "");
  if (/(?<![A-Za-z])ETN(?![A-Za-z])/i.test(label)) return "ETN";
  if (/(?<![A-Za-z])ETC(?![A-Za-z])/i.test(label)) return "ETC";
  if (/(?<![A-Za-z])ETF(?![A-Za-z])/i.test(label)) return "ETF";
  if (String(prodType) === "1") return "ETF";
  if (String(prodType) === "2") return "STOCK";
  throw new Error(`unreadable type ${prodType} on ${label}`);
}

function marketOf(printed) {
  const label = textOf(printed);
  const hit = MARKETS.find(([name]) => label.includes(name));
  if (!hit) throw new Error(`unnamed market ${label}`);
  return hit[1];
}

function coinOf(printed) {
  const code = textOf(printed).toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error(`unreadable currency ${printed}`);
  return code;
}

function rowOf(item) {
  const market = marketOf(item.corpDesc);
  const shown = shownName(item.prodName);
  const ticker = tickerOf(item.stockCode);
  if (!/^[A-Z0-9][A-Z0-9.-]*$/.test(ticker) || !shown.name) {
    throw new Error(`unreadable row ${item.prodNo} ${item.stockCode}`);
  }
  if (item.purchase !== true && item.purchase !== false) {
    throw new Error(`${ticker} has no buy flag`);
  }
  return {
    ticker,
    name: shown.name,
    exchange: market,
    currency: coinOf(item.currency),
    type: listingType(shown.name, item.prodType),
    professional: shown.professional,
    buy: item.purchase === true,
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function devtools(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message || "devtools"));
    else waiter.resolve(message.result);
  });
  return {
    opened,
    send(method, params = {}) {
      const next = ++id;
      return new Promise((resolve, reject) => {
        pending.set(next, { resolve, reject });
        ws.send(JSON.stringify({ id: next, method, params }));
      });
    },
    close() {
      ws.close();
    },
  };
}

// A request that does not come from the page is answered with a script
// check, so the search runs inside Chrome.
async function shelf() {
  if (!CHROME) throw new Error("Chrome is required to read the search");
  const port = await freePort();
  const profile = mkdtempSync(join(tmpdir(), "ctbc-"));
  const chrome = spawn(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore", detached: true });
  try {
    let version;
    for (let attempt = 0; attempt < 50 && !version?.ok; attempt += 1) {
      try {
        version = await fetch(`http://127.0.0.1:${port}/json/version`);
      } catch {
        version = null;
      }
      if (!version?.ok) await delay(100);
    }
    if (!version?.ok) throw new Error("Chrome did not start");
    await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(PAGE)}`, { method: "PUT" });
    await delay(8000);
    let payload;
    for (let attempt = 0; attempt < 8 && !payload?.list; attempt += 1) {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = pages.find((item) => item.type === "page" && String(item.url).includes("ctbcbank.com"));
      if (!page?.webSocketDebuggerUrl) {
        await delay(1000);
        continue;
      }
      const session = devtools(page.webSocketDebuggerUrl);
      try {
        await session.opened;
        const call = await session.send("Runtime.evaluate", {
          expression: `(async () => {
            const body = {
              deviceIxd: "none", trackingIxd: crypto.randomUUID(), txnIxd: crypto.randomUUID(),
              model: "chrome", platform: "macos", version: "10_15_7", runtime: "chrome", runtimeVer: 148,
              network: "unknown", appVer: "5.01.18", clientNo: String(Date.now()), clientTime: Date.now(),
              token: "mfpInit", locale: "zh_TW", fromSys: "1",
              seed: crypto.randomUUID().replaceAll("-", ""), deviceToken: "none",
              resource: "/twrbo-invest/qu034/011",
              rqData: { keyword: "", prodType: "", prodKind: "", corpDesc: "", currency: "", riskAttr: "", etfType: "", investArea: "", div: "" },
            };
            const response = await fetch("/IB/api/adapters/IB_Adapter/resource/preLogin", {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "*/*", "X-Channel-Id": "EBMW_WEB_O", "X-Requested-With": "MFPInit" },
              body: JSON.stringify(body),
            });
            const text = await response.text();
            if (text.startsWith("<")) return { refused: true };
            const json = JSON.parse(text);
            if (json.code !== "0000") return { code: json.code, desc: json.desc };
            const list = json.rsData && json.rsData.resultList;
            return {
              count: json.rsData && json.rsData.resultCount,
              list: (list || []).map((row) => ({
                corpDesc: row.corpDesc, prodName: row.prodName, stockCode: row.stockCode,
                purchase: row.purchase, currency: row.currency, prodType: row.prodType, prodNo: row.prodNo,
              })),
            };
          })()`,
          awaitPromise: true,
          returnByValue: true,
        });
        if (!call.exceptionDetails) payload = call.result?.value;
      } catch {
        payload = null;
      } finally {
        session.close();
      }
      if (payload?.refused || (payload?.code && payload.code !== "0000")) break;
      if (!payload?.list) await delay(1000);
    }
    if (!payload?.list) throw new Error(payload?.desc || payload?.code || "the bank refused the request");
    const count = Number(payload.count);
    if (payload.list.length !== count || count < 1) {
      throw new Error(`the search printed ${payload.list.length} of ${count}`);
    }
    return payload.list.map(rowOf);
  } finally {
    try {
      process.kill(-chrome.pid, "SIGKILL");
    } catch {
      chrome.kill("SIGKILL");
    }
    rmSync(profile, { recursive: true, force: true });
  }
}

function loadIsinIndex() {
  const index = new Map();
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  for (const file of ["stocks.csv", "etfs.csv"]) {
    const lines = readFileSync(join(root, "assets", file), "utf8").split(/\r?\n/).filter(Boolean);
    const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
    if (header[0] !== "ticker" || header[1] !== "exchange" || header[2] !== "isin") {
      throw new Error(`${file} header is ${header.join(",")}`);
    }
    for (const line of lines.slice(1)) {
      const cells = [];
      let field = "";
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted) {
          if (char === '"') {
            if (line[i + 1] === '"') {
              field += '"';
              i += 1;
            } else quoted = false;
          } else field += char;
        } else if (char === '"') quoted = true;
        else if (char === ",") {
          cells.push(field);
          field = "";
        } else field += char;
      }
      cells.push(field);
      const code = String(cells[0] || "").trim().toUpperCase().split(":").pop();
      const exchange = String(cells[1] || "").trim().toUpperCase();
      const isin = String(cells[2] || "").trim().toUpperCase();
      if (!code || !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) continue;
      if (!index.has(code)) index.set(code, new Map());
      const book = index.get(code);
      if (!book.has(exchange)) book.set(exchange, new Set());
      book.get(exchange).add(isin);
    }
  }
  return index;
}

function codesOf(row) {
  if (row.exchange !== "Hong Kong") return [row.ticker];
  const digits = row.ticker.replace(/^0+/, "") || "0";
  return [...new Set([row.ticker, digits, digits.padStart(4, "0"), digits.padStart(5, "0")])];
}

function placesOf(row) {
  if (row.exchange === "NYSE" || row.exchange === "NASDAQ") return US_PLACES;
  if (row.exchange === "Hong Kong") return ["HKEX"];
  if (row.exchange === "Shanghai") return ["XSHG", "XSHE"];
  if (row.exchange === "London") return ["LSE"];
  if (row.exchange === "Tokyo") return ["TSE"];
  if (row.exchange === "TWSE") return ["TWSE"];
  return [];
}

function attachIsins(rows, index) {
  let one = 0;
  let none = 0;
  let several = 0;
  for (const row of rows) {
    const groups = new Map();
    for (const code of codesOf(row)) {
      const book = index.get(code);
      for (const place of placesOf(row)) {
        const ids = book?.get(place);
        if (!ids?.size) continue;
        if (!groups.has(place)) groups.set(place, new Set());
        for (const isin of ids) groups.get(place).add(isin);
      }
    }
    const found = new Set();
    for (const ids of groups.values()) for (const isin of ids) found.add(isin);
    if (found.size === 1) {
      row.isin = [...found][0];
      one += 1;
    } else if (found.size === 0) none += 1;
    else {
      several += 1;
      stampIsinMatches(row, groups, row.ticker);
    }
  }
  return { one, none, several };
}

function pushRow(rows, seen, row) {
  const key = `${row.exchange}|${row.ticker}`;
  if (seen.has(key)) throw new Error(`repeated ${key}`);
  seen.add(key);
  rows.push({
    query: row.ticker,
    ticker: row.ticker,
    name: row.name,
    exchange: row.exchange,
    currency: row.currency,
    type: row.type,
    isin: "",
    raw: [row.ticker, row.name, row.exchange, row.currency, row.type, row.professional ? "professional" : ""]
      .filter(Boolean)
      .join(" "),
  });
}

const list = await shelf();
const sold = list.filter((row) => row.buy);
const leftOut = list.length - sold.length;
const professional = sold.filter((row) => row.professional).length;
console.error(
  `${sold.length} sold${professional ? `, ${professional} professional` : ""}${leftOut ? `, ${leftOut} without a buy button` : ""}`,
);

const rows = [];
const seen = new Set();
for (const exchange of ["NYSE", "NASDAQ", "Hong Kong", "Shanghai", "London", "Tokyo", "TWSE"]) {
  const batch = sold.filter((row) => row.exchange === exchange);
  if (!batch.length) continue;
  console.error(`${batch.length} on ${exchange}`);
  for (const row of batch) pushRow(rows, seen, row);
}

const tally = attachIsins(rows, loadIsinIndex());
const kept = stampRows(withoutObligations(rows));
kept.sort((left, right) => {
  const byType = left.type.localeCompare(right.type);
  if (byType !== 0) return byType;
  const byExchange = left.exchange.localeCompare(right.exchange);
  if (byExchange !== 0) return byExchange;
  return left.ticker.localeCompare(right.ticker);
});
writeFileSync(OUT, `${JSON.stringify(kept, null, 2)}\n`);
console.error(
  `${kept.length} listings, ${tally.one} with one ISIN, ${tally.several} with several, ${tally.none} with none`,
);
