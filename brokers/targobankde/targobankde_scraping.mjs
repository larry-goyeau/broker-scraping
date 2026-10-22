// What TARGOBANK (Germany) sells as shares and ETFs, with no login. Its
// public market pages are FactSet widgets:
//
//   https://investments.targobank.de/fio/aktien   share screener (about 16,400)
//   https://investments.targobank.de/fio/etfs     ETF screener (about 4,800)
//
// The widgets do not call a REST URL. They open a FactSet "Frontgate"
// websocket: POST /fio/token returns a one-minute cookie (mdg2authtoken)
// and a second token factor in the header
// Frontgate-Split-Authentication-Token-Second-Factor; the socket is
// wss://factset-api.targobank.de/ws with the subprotocols
// "v2.ws-jsjson.mdgms.com" and "mdg2auth-<second factor>". After an
// AuthenticationByTokenRequest, each data call is a HighLevelRequest
// (path, method, JSON body) answered by a HighLevelResponse, as in the
// site's bundle (@fds/frontgate-js-sdk 7.2.2). This file speaks that
// protocol with Node's own WebSocket.
//
// Places. The site's bundle lists the markets TARGOBANK routes to, with
// the FactSet market ids (array "rs" in /fio/index.*.js): gettex (16, 453),
// LS Exchange (758, 1040), Quotrix (394), TradeREBEL (1114), Tradegate BSX
// (5), Berlin (17), Düsseldorf (14), Frankfurt (2, 3), Hannover (20),
// Hamburg (19), München (15), Stuttgart (9), Xetra (1), plus the fund
// companies (KVG), the issuers through cats-Direct MTF, Baader and Société
// Générale off exchange. The order-place table on
//   https://www.targobank.de/de/vermoegen/depot-modelle.html
// names gettex, LS Exchange, Tradegate BSX, TradeREBEL, Xetra, the floors
// Düsseldorf, Frankfurt, Hamburg, Hannover, München, Stuttgart, cats-Direct
// MTF and Société Générale. Those exchanges are the places here, named as
// broker-list.json names them. Left out:
//   - Quotrix: not in TARGOBANK's place table (the Düsseldorf floor is).
//   - Börse Berlin: its floor (XONTRO) closed on 1 January 2026; FactSet
//     shows 6 Berlin shares with no price in two weeks.
//   - KVG (a fund subscription, not a trade), the issuers on cats-Direct
//     MTF (certificates and warrants) and Société Générale / Baader off
//     exchange (no exchange book).
//
// Shares: the share screener (POST /api/v5/stock/notation/screener/search,
// 500 lines a page) is run once per place, its market restricted to that
// place's ids. It answers one line per title that has a notation there,
// with ISIN, WKN, the exchange symbol and the currency. As on the site,
// a line needs an active notation (validation.onlyActive) with a price in
// the last 14 days (validation.prices.latest) and, when it has a previous
// price, that one in the last 10 days (validation.prices.previous with
// availableOnly false). The previous-price rule drops some 35 titles with
// a recent last price but none before it: shares delisted after a
// takeover (Pinewood, Senior) or a lone trade after weeks without one.
// ETFs: the ETF screener is FactSet's fund screener (POST
// /api/v5/fund/notation/screener/search) with fund.etf "only", on the
// fund market 1050 in euro with a price in the last 5 days, as on the
// site. That screener knows only fund markets, so the places of each ETF
// come from the call its detail page makes, POST
// /api/v5/custom/notation/crossReference/listByISIN with the same market
// ids; a place with no price in 14 days is dropped. Those answers are
// cached in targobankde-etf-cache.jsonl (resumable; --fresh drops it).
//
// What the site's own counts hold (requests read from the bundle and from
// the page's websocket frames, 21 October 2026):
//   - /fio/aktien "16.404": the share screener over every market id of
//     "rs" (the 11 places plus Quotrix, Berlin, KVG, Baader, the issuers
//     and Société Générale off exchange), onlyActive, a price in 14 days
//     and the previous-price rule, counted once per title. On the 11
//     places alone it is 14,926.
//     The other 1,478 have no notation on any of the 11 places: 1,463 are
//     quoted only off exchange by Société Générale (market 1048, mostly
//     small US, Japanese and Australian shares), 13 are issuer
//     certificates (UBS, HypoVereinsbank, Vontobel) and 2 are funds priced
//     by WM Datenservice (1050, the site's "Kapitalverwaltungsges.").
//     Quotrix adds nothing the 11 places lack. Of the 14,926, 31 are
//     quoted in percent (bonds, Genussscheine) and 3 are US exchange-traded
//     notes (withoutObligations): debt, not shares.
//   - /fio/etfs "4.846 Ergebnisse": exactly the ETF screener above (the
//     page sends the same request with pagination limit 1). 1,198 of those
//     share classes have no notation on the 11 places, only the WM
//     Datenservice fund price (1,162; 14 also Société Générale, 22 also
//     NYSE Arca): mostly hedged or institutional share classes and US
//     ETFs that no German exchange lists. They would be a KVG subscription,
//     not an exchange order, so they are left out with the places above.
//
// Restrictions: broker-list.json names none for TARGOBANK. The product
// pages say these products "können nicht von US-Personen erworben werden"
// (Preisübersicht p. 19), a rule on the client, not on the title.
//
// No KID, no sale to an EEA resident (PRIIPs Regulation 1286/2014 art.
// 13: the KID is provided "in good time before that retail investor is
// bound by any contract"; TARGOBANK accepts residents of Germany only).
// These lines stay and carry `nonEuResident`, as boursedirect does:
//   - ETFs domiciled outside the EEA (ISIN country not in EEA) whose
//     share class FactSet does not register in Germany. The ETF
//     screener's shareClass.registrationCountry is the registration list
//     TARGOBANK's fund pages show; on 22 October 2026 it gives "World"
//     for the 16 plain US SPDR ETFs, "Switzerland, World" for SPY, DIA,
//     XLE, XLB and XLY, and "Switzerland" alone for 44 of the 45 Swiss
//     ETFs (iShares SMI (CH), UBS ETF (CH) Gold, Swisscanto (CH) Gold...).
//     iShares Core CHF Corporate Bond ETF (CH), CH0226976816, lists
//     "Switzerland, Germany" and stays open. A Swiss fund is not a UCITS
//     and has no EU passport; its German sale needs a § 320 KAGB
//     notification, which is what that registration list records.
//   - US closed-end funds on the share screener (a '40 Act closed-end
//     fund is an AIF to the EU, a packaged product without a KID). They
//     are typed FUND, as elana types the same lines. FactSet's share
//     screener marks them: instrument.stockType "other" (not "common",
//     "preferred" or "depositoryReceipt") with no RBICS industry, or RBICS
//     level 6 "Funds and Trusts" (Templeton Dragon, India Fund, PIMCO
//     Dynamic Income Strategy, Pershing Square USA, RoboStrategy, whose
//     SEC 424B3 reads "a non-diversified closed-end management investment
//     company"). A "common" line with no RBICS is a fund when its name
//     says so (FUND, FD, TRUST, TR, TERM, INCOME: Liberty All-Star Equity
//     Fund, Royce Global Trust); with no such word it is not (Honeywell's
//     new line, Retension Pharmaceuticals), except the four listed CEFs in
//     US_CEF below. Preferred shares of a fund (Gabelli 5.00% Ser K) are
//     not fund units and stay STOCK; BDCs (RBICS "Business Development
//     Companies") are operating companies and stay STOCK.
//
// Delisted lines still inside the 14-day price window: Deutsche Börse's
// own T7 instrument lists for Xetra and Börse Frankfurt
//   https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra
//   https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra/boersefrankfurt
// ("t7-xetr-allTradableInstruments.csv", "t7-xfra-BF-...") carry an
// "Instrument Status" per line (Active, Inactive, PendingDeletion). A
// title is dropped from every place when (a) FactSet still prices it on
// Xetra or Frankfurt but that exchange's list has no Active line for its
// ISIN, or (b) a list marks it PendingDeletion and neither list has it
// Active. Frankfurt's open market takes a foreign share off when its home
// listing ends: on 22 October 2026 Atkore, Beazer Homes and Clear Channel
// Outdoor were gone from Nasdaq Trader's otherlisted.txt and from the
// XFRA list while FactSet kept a fortnight of prices on gettex, LS
// Exchange and Tradegate; Datagroup SE read "PendingDeletion". A title
// that is on neither list (most regional-only lines) or only Inactive
// (a new ETF before its first Xetra day: DWS Strategic, LU3382696337)
// stays.
//
// Row: ticker is the exchange symbol (the WKN when FactSet gives none),
// type STOCK for the share screener (FUND for a US closed-end fund) and
// ETF for the ETF screener.
//
//   node brokers/targobankde/targobankde_scraping.mjs
//   node brokers/targobankde/targobankde_scraping.mjs --limit=200
//   node brokers/targobankde/targobankde_scraping.mjs --fresh

import { stampRows, EEA } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const ORIGIN = "https://investments.targobank.de";
const OUTPUT = new URL("targobankde-parsed.json", import.meta.url);
const ETF_CACHE = new URL("targobankde-etf-cache.jsonl", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const PAGE = 500;
const IN_FLIGHT = 4;
const FRESH_DAYS = 14;
const T7_PAGE = "https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra";
const T7_LISTS = [
  ["Börse Xetra", T7_PAGE, "t7-xetr-allTradableInstruments.csv"],
  ["Börse Frankfurt", `${T7_PAGE}/boersefrankfurt`, "t7-xfra-BF-allTradableInstruments.csv"],
];
// Listed US closed-end funds that FactSet gives as "common" with no RBICS
// and no fund word in the name. Each files N-2 with the SEC as a closed-end
// management investment company: ArrowMark Financial (BANX), Central
// Securities (CET), Destiny Tech100 (DXYZ), FS Credit Opportunities (FSCO).
const US_CEF = new Set(["US8617801043", "US1551231020", "US25063F1075", "US30290Y1010"]);
const FUND_WORD = /\b(FUNDS?|FDS?|TRUST|TRST|TR|TERM|INCOME|INCM|INCOM)\b/i;
const PREFERRED = /\b(PREF|PFD|PREFERRED)\b|%/i;

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const LIMIT = Number(arg("limit") || 0);
const FRESH = process.argv.includes("--fresh");

// Place as broker-list.json names it, its MIC, and TARGOBANK's FactSet ids.
const PLACES = [
  ["gettex", "XMUN", [16, 453]],
  ["LS Exchange", "LSEX", [758, 1040]],
  ["Tradegate", "XGAT", [5]],
  ["TradeREBEL", null, [1114]],
  ["Börse Xetra", "XETR", [1]],
  ["Börse Frankfurt", "XFRA", [2, 3]],
  ["Börse Stuttgart", "XSTU", [9]],
  ["Börse München", "XMUC", [15]],
  ["Börse Düsseldorf", "XDUS", [14]],
  ["Börse Hamburg", "XHAM", [19]],
  ["Börse Hannover", "XHAN", [20]],
];
const PLACE_OF_ID = new Map(PLACES.flatMap(([name, mic, ids]) => ids.map((id) => [id, { name, mic }])));
const ALL_IDS = PLACES.flatMap(([, , ids]) => ids);
// FactSet value-unit ids, read from /api/v5/basic/valueUnit/get as met.
const UNIT = { 63: "EUR" };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isinOf = (v) => (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(String(v || "").trim()) ? String(v).trim() : "");
const day = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

// One Frontgate session. request() returns the parsed JSON body.
async function connect() {
  const token = await fetch(`${ORIGIN}/fio/token`, {
    method: "POST",
    headers: { "content-type": "application/json", "User-Agent": UA, Origin: ORIGIN, Referer: `${ORIGIN}/fio/aktien` },
  });
  if (!token.ok) throw new Error(`token ${token.status}`);
  const host = token.headers.get("frontgate-host");
  const second = token.headers.get("frontgate-split-authentication-token-second-factor");
  const cookies = token.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  if (!host || !second) throw new Error("no Frontgate host or token in /fio/token");
  const ws = new WebSocket(`wss://${host}:443/ws`, {
    protocols: ["v2.ws-jsjson.mdgms.com", `mdg2auth-${second}`],
    headers: { Cookie: cookies, Origin: ORIGIN, "User-Agent": UA },
  });
  ws.binaryType = "arraybuffer";
  let job = 0;
  let closed = false;
  const waiting = new Map();
  const parts = new Map();
  let onAuth;
  const authed = new Promise((resolve, reject) => {
    onAuth = resolve;
    setTimeout(() => reject(new Error("no authentication answer")), 20000);
  });
  const failAll = (why) => {
    closed = true;
    for (const { reject } of waiting.values()) reject(new Error(why));
    waiting.clear();
  };
  ws.onclose = () => failAll("socket closed");
  ws.onmessage = (event) => {
    const text = typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8");
    const msg = JSON.parse(text);
    if (/Authentication.*Response/.test(msg.Message || "")) return onAuth(msg);
    if (/DisconnectionMessage/.test(msg.Message || "")) return failAll(`disconnected: ${msg.details}`);
    const id = msg.header?.id_job ?? msg.id_job;
    if (id == null || !waiting.has(Number(id))) return;
    const key = Number(id);
    const chunk = parts.get(key) || [];
    chunk.push(msg.body?.value ?? "");
    if (msg.header && (Number(msg.header.flags) & 8) === 8) return void parts.set(key, chunk);
    parts.delete(key);
    const { resolve, reject } = waiting.get(key);
    waiting.delete(key);
    if (!/HighLevelResponse$/.test(msg.Message || "")) return reject(new Error(String(msg.details || msg.Message).slice(0, 300)));
    try {
      resolve(JSON.parse(chunk.join("")));
    } catch (error) {
      reject(error);
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = () => reject(new Error("websocket error"));
  });
  ws.send(
    JSON.stringify({
      Message: "AuthenticationByTokenRequest",
      Version: 1,
      token: { value: { b64: "" } },
      software: JSON.stringify({ userAgent: UA, platform: "frontgate-js-sdk", version: "7.2.2", package: "@fds/frontgate-js-sdk", mobile: false }),
      os: "frontgate-js-sdk",
      feature_flags_wanted: { value: 0 },
      maximum_idle_interval: 60000000,
      maximum_receivable_message_size: 1048576,
      flags: 0,
      cache_authentication_salt: { value: { b64: "" } },
      cache_authentication_encrypted_secret: { encrypted_secret: { b64: "" } },
    }),
  );
  await authed;
  const keep = setInterval(() => !closed && ws.send(JSON.stringify({ Message: "KeepAliveMessage", Version: 2 })), 25000);
  function request(path, data, timeout = 30000, method = "POST") {
    if (closed) return Promise.reject(new Error("socket closed"));
    job += 1;
    const id = job;
    const msg = {
      Message: "HighLevelRequest",
      Version: 3,
      header: {
        dataset: { id_dataset: 0 },
        id_job: id,
        flags_r2: 128,
        resend_counter: 0,
        timeout,
        authentication_identifiers: { id_application: -2, id_user: -2 },
        cache_key: { value: [] },
        previous_response_hash: { value: [] },
        tracing: { value: { value: [] } },
      },
      accept: "application/json",
      content_type: "application/json",
      body: method === "POST" ? { value: JSON.stringify(data) } : { value: [] },
      query: method === "POST" ? "" : new URLSearchParams(data).toString(),
      path,
      method: { value: method === "POST" ? 2 : 1 },
    };
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      setTimeout(() => {
        if (!waiting.has(id)) return;
        waiting.delete(id);
        reject(new Error(`timeout ${path}`));
      }, timeout + 5000);
      ws.send(JSON.stringify(msg));
    });
  }
  return {
    request,
    get closed() {
      return closed;
    },
    close() {
      clearInterval(keep);
      closed = true;
      ws.close();
    },
  };
}

let session = null;
async function call(path, data, method = "POST") {
  let last;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      if (!session || session.closed) session = await connect();
      return await session.request(path, data, 30000, method);
    } catch (error) {
      last = error;
      // A refused request (bad field, unknown title) is not retried.
      if (/No instrument found/.test(error.message)) return { data: [] };
      if (/is not a valid|not an valid|missing|"code":4\d\d/.test(error.message)) throw error;
      if (session && /socket|disconnect|timeout/.test(error.message)) {
        session.close();
        session = null;
      }
      await sleep(1500 * (attempt + 1));
    }
  }
  throw last;
}

// Every line of one screener query, paged by name. A second pass in the
// other order fills lines that moved between pages.
async function screen(path, data, attributes) {
  const byId = new Map();
  let total = null;
  for (const sort of ["instrument.name", "-instrument.name"]) {
    for (let offset = 0; ; offset += PAGE) {
      const answer = await call(path, { data, meta: { attributes, sort: [sort], pagination: { offset, limit: PAGE } } });
      total = answer.meta?.pagination?.total ?? total;
      for (const line of answer.data || []) byId.set(String(line.id), line);
      if (!answer.data?.length || offset + PAGE >= total) break;
      if (LIMIT && byId.size >= LIMIT) break;
      await sleep(150);
    }
    if (total == null || byId.size >= total || LIMIT) break;
  }
  return { lines: [...byId.values()], total };
}

const rows = [];
// The site's own share-screener validation, as its page sends it.
const freshShare = {
  latest: { availableOnly: true, minimumDate: day(FRESH_DAYS) },
  previous: { availableOnly: false, minimumDate: day(10) },
};

// Shares, one screener run per place.
const shareIsins = new Set();
// ISIN -> FactSet stock type and RBICS level 6, for the closed-end rule.
const shareKind = new Map();
for (const [exchange, mic, ids] of PLACES) {
  const { lines, total } = await screen(
    "/api/v5/stock/notation/screener/search",
    { validation: { onlyActive: true, market: { selection: { restrict: { ids } } }, prices: freshShare } },
    [
      "id",
      "symbol",
      "valueUnit.code",
      "market.id",
      "instrument.isin",
      "instrument.name",
      "instrument.nsin.wkn",
      "instrument.stockType",
      "instrument.industryClassification.rbics.level6",
    ],
  );
  let kept = 0;
  for (const line of lines) {
    const isin = isinOf(line.instrument?.isin);
    if (isin && !shareKind.has(isin)) {
      shareKind.set(isin, {
        stockType: line.instrument?.stockType || null,
        rbics: line.instrument?.industryClassification?.rbics?.level6?.name || null,
      });
    }
    const currency = line.valueUnit?.code;
    // A line quoted in percent ("%": participation certificates and the
    // like) is not a share price.
    if (!isin || !/^[A-Z]{3}$/.test(currency || "")) continue;
    const wkn = clean(line.instrument?.nsin?.wkn);
    const ticker = clean(line.symbol) || wkn;
    const name = clean(line.instrument?.name);
    rows.push({
      query: ticker || isin,
      ticker: ticker || isin,
      name,
      exchange,
      ...(mic ? { mic } : {}),
      currency,
      type: "STOCK",
      isin,
      wkn: wkn || undefined,
      raw: `${name} ${isin} ${wkn} ${ticker} | ${exchange} ${currency}`,
    });
    shareIsins.add(isin);
    kept += 1;
  }
  console.error(`shares on ${exchange}: ${kept} of ${total}`);
}

// ETFs: the universe, then the places of each.
const etfScreen = await screen(
  "/api/v5/fund/notation/screener/search",
  {
    fund: { etf: "only" },
    validation: {
      onlyActive: true,
      prices: { latest: { minimumDate: day(5), availableOnly: true }, previous: { minimumDate: day(8), availableOnly: true } },
      market: { selection: { restrict: { ids: [1050] } } },
      currency: { restrict: { ids: [63] } },
    },
  },
  ["id", "instrument.isin", "instrument.name", "instrument.nsin.wkn", "shareClass.registrationCountry"],
);
const etfs = new Map();
for (const line of etfScreen.lines) {
  const isin = isinOf(line.instrument?.isin);
  if (!isin || etfs.has(isin)) continue;
  const registered = (line.shareClass?.registrationCountry || []).map((c) => clean(c?.name)).filter(Boolean);
  etfs.set(isin, { isin, name: clean(line.instrument?.name), wkn: clean(line.instrument?.nsin?.wkn), registered });
}
console.error(`${etfs.size} ETFs in the screener (total ${etfScreen.total})`);

if (FRESH && fs.existsSync(ETF_CACHE)) fs.unlinkSync(ETF_CACHE);
const cached = new Map();
if (fs.existsSync(ETF_CACHE)) {
  for (const line of fs.readFileSync(ETF_CACHE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    cached.set(entry.isin, entry);
  }
}
// A share class an earlier run's screener listed (it is in the cache) and
// today's leaves out stays when FactSet's instrument record still calls it
// an ETF (assetClass "etf") or its name a "UCITS ETF" share class (FactSet
// files Amundi MSCI Europe Climate Paris Aligned - UCITS ETF, LU2130768844,
// under "Mutual Fund"). On 22 October 2026 FactSet folded Amundi's
// LU "UCITS ETF" share classes into their index-fund umbrellas (Amundi
// Core Euro Government Bond LU1437018598 now sits beside its AE/IE/RE
// mutual-fund classes), so fund.etf "only" dropped them while Xetra
// still lists them Active. A mutual-fund class (DWS Strategic Balance LC)
// is assetClass "fund" and stays out.
if (!LIMIT) {
  const strays = [...cached.keys()].filter((isin) => !etfs.has(isin));
  let back = 0;
  for (let start = 0; start < strays.length; start += IN_FLIGHT) {
    const batch = strays.slice(start, start + IN_FLIGHT);
    const answers = await Promise.all(
      batch.map((isin) => call("/api/v5/instrument/get", { identifier: isin, identifierType: "isin" }, "GET").catch(() => null)),
    );
    for (let i = 0; i < batch.length; i += 1) {
      const data = answers[i]?.data;
      if (data?.assetClass?.code !== "etf" && !/\bUCITS ETF\b/i.test(data?.name || "")) continue;
      etfs.set(batch[i], { isin: batch[i], name: clean(data.name), wkn: clean(data.nsin?.wkn), registered: [] });
      back += 1;
    }
    await sleep(100);
  }
  console.error(`cached ETFs the screener left out: ${strays.length}, still ETFs at FactSet: ${back}`);
}
let todo = [...etfs.values()].filter((e) => !cached.has(e.isin));
if (LIMIT) todo = todo.slice(0, LIMIT);
for (let start = 0; start < todo.length; start += IN_FLIGHT) {
  const batch = todo.slice(start, start + IN_FLIGHT);
  const answers = await Promise.all(
    batch.map((etf) =>
      call("/api/v5/custom/notation/crossReference/listByISIN", {
        data: { isin: etf.isin, filter: { mountainView: false, markets: { ids: ALL_IDS } } },
        meta: { attributes: ["id", "time", "market", "valueUnit"] },
      }).catch((error) => ({ error: error.message })),
    ),
  );
  for (let i = 0; i < batch.length; i += 1) {
    if (answers[i].error) {
      console.error(`  ${batch[i].isin}: ${answers[i].error}`);
      continue;
    }
    const notations = (answers[i].data || []).map((n) => ({ market: n.market?.id, unit: n.valueUnit?.id, time: n.time }));
    const entry = { isin: batch[i].isin, notations };
    cached.set(entry.isin, entry);
    fs.appendFileSync(ETF_CACHE, `${JSON.stringify(entry)}\n`);
  }
  if ((start / IN_FLIGHT) % 50 === 0) console.error(`  ETF places ${Math.min(start + IN_FLIGHT, todo.length)}/${todo.length}`);
  await sleep(100);
}
const units = new Set([...cached.values()].flatMap((e) => e.notations.map((n) => n.unit)));
for (const id of units) {
  if (id == null || UNIT[id]) continue;
  const answer = await call("/api/v5/basic/valueUnit/get", { id }, "GET").catch(() => null);
  const unit = answer?.data;
  // GBp (pence) is written GBX; a unit with no ISO code stays unknown.
  if (unit?.code === "GBp") UNIT[id] = "GBX";
  else if (unit?.isoCode || /^[A-Z]{3}$/.test(unit?.code || "")) UNIT[id] = unit.isoCode || unit.code;
}
session?.close();

const oldest = day(FRESH_DAYS);
const unknownUnits = new Map();
// Domiciled outside the EEA and not registered in Germany: no KID.
const noKid = (etf) => !EEA.includes(etf.isin.slice(0, 2)) && !etf.registered.includes("Germany");
for (const etf of etfs.values()) {
  const entry = cached.get(etf.isin);
  if (!entry) continue;
  const blocked = noKid(etf);
  const seen = new Set();
  for (const n of entry.notations) {
    const place = PLACE_OF_ID.get(n.market);
    if (!place || !n.time || n.time.slice(0, 10) < oldest) continue;
    const currency = UNIT[n.unit];
    if (!currency) {
      unknownUnits.set(n.unit, (unknownUnits.get(n.unit) || 0) + 1);
      continue;
    }
    const key = `${place.name}|${currency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      query: etf.wkn || etf.isin,
      ticker: etf.wkn || etf.isin,
      name: etf.name,
      exchange: place.name,
      ...(place.mic ? { mic: place.mic } : {}),
      currency,
      type: "ETF",
      isin: etf.isin,
      wkn: etf.wkn || undefined,
      ...(blocked ? { nonEuResident: true } : {}),
      raw: `${etf.name} ${etf.isin} ${etf.wkn} | ${place.name} ${currency}`,
    });
  }
}
if (unknownUnits.size) console.error(`ETF lines in unknown value units skipped: ${JSON.stringify([...unknownUnits])}`);

// US closed-end funds on the share screener: FUND, no KID.
function closedEnd(isin, name) {
  if (!isin.startsWith("US")) return false;
  if (US_CEF.has(isin)) return true;
  const kind = shareKind.get(isin) || {};
  if (kind.stockType === "preferred" || kind.stockType === "depositoryReceipt" || PREFERRED.test(name)) return false;
  if (kind.rbics === "Funds and Trusts") return true;
  if (kind.rbics) return false;
  return kind.stockType === "other" || FUND_WORD.test(name);
}
const funds = new Set();
for (const row of rows) {
  if (row.type !== "STOCK" || !closedEnd(row.isin, row.name)) continue;
  row.type = "FUND";
  row.nonEuResident = true;
  funds.add(`${row.isin} ${row.name}`);
}
console.error(`US closed-end funds typed FUND: ${funds.size} titles\n  ${[...funds].sort().join("\n  ")}`);

// Deutsche Börse's T7 lists: ISIN -> statuses, per exchange.
async function t7Status() {
  const out = new Map();
  for (const [exchange, page, file] of T7_LISTS) {
    const html = await (await fetch(page, { headers: { "User-Agent": UA } })).text();
    const link = html.match(new RegExp(`href="([^"]*${file.replace(/\./g, "\\.")})"`))?.[1];
    if (!link) throw new Error(`${page} no longer links ${file}`);
    const lines = (await (await fetch(new URL(link, page).href, { headers: { "User-Agent": UA } })).text()).split(/\r?\n/);
    const at = lines.findIndex((line) => line.startsWith("Product Status;"));
    const header = (lines[at] || "").split(";");
    const [statusAt, isinAt] = ["Instrument Status", "ISIN"].map((c) => header.indexOf(c));
    if (at < 0 || statusAt < 0 || isinAt < 0) throw new Error(`${file}: header changed`);
    const map = new Map();
    for (const line of lines.slice(at + 1)) {
      const cells = line.split(";");
      const isin = isinOf(cells[isinAt]);
      if (!isin) continue;
      map.set(isin, [...(map.get(isin) || []), cells[statusAt]]);
    }
    if (map.size < 3000) throw new Error(`${file}: only ${map.size} ISINs`);
    out.set(exchange, map);
  }
  return out;
}
const t7 = await t7Status();
const t7Active = (exchange, isin) => (t7.get(exchange).get(isin) || []).includes("Active");
const gone = new Map();
for (const row of rows) {
  if (gone.has(row.isin)) continue;
  const statuses = [...t7.values()].flatMap((m) => m.get(row.isin) || []);
  if (t7.has(row.exchange) && !t7Active(row.exchange, row.isin)) {
    gone.set(row.isin, `${row.name}: ${(t7.get(row.exchange).get(row.isin) || ["absent"]).join("/")} on the ${row.exchange} T7 list`);
  } else if (statuses.includes("PendingDeletion") && !statuses.includes("Active")) {
    gone.set(row.isin, `${row.name}: PendingDeletion on the T7 lists`);
  }
}
if (!LIMIT && gone.size > 100) throw new Error(`${gone.size} titles not Active on T7: list format changed?`);
console.error(`not Active on Deutsche Börse T7, dropped: ${gone.size} titles\n  ${[...gone].map(([i, why]) => `${i} ${why}`).join("\n  ")}`);

// An ETF ISIN that is also in the share screener keeps its ETF rows only.
const etfIsins = new Set(rows.filter((r) => r.type === "ETF").map((r) => r.isin));
const kept = stampRows(
  withoutObligations(rows.filter((r) => !gone.has(r.isin) && !(r.type !== "ETF" && etfIsins.has(r.isin)))),
);

if (!LIMIT) {
  if (shareIsins.size < 14000) throw new Error(`only ${shareIsins.size} shares`);
  if (etfIsins.size < 3500) throw new Error(`only ${etfIsins.size} ETFs with a place`);
  const need = (isin, place) => {
    if (!kept.some((r) => r.isin === isin && r.exchange === place && r.currency === "EUR")) throw new Error(`${isin} is missing ${place}`);
  };
  for (const place of ["Börse Xetra", "Börse Frankfurt", "Tradegate", "gettex", "LS Exchange"]) need("DE000A1EWWW0", place);
  for (const place of ["Börse Xetra", "Tradegate", "gettex"]) need("IE00B4L5Y983", place);
  need("US0378331005", "Tradegate");
}
fs.writeFileSync(OUTPUT, JSON.stringify(kept, null, 2));

const byPlace = new Map();
for (const row of kept) byPlace.set(`${row.exchange} ${row.type}`, (byPlace.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${kept.length} lines, ${new Set(kept.map((r) => r.isin)).size} titles (${[...byPlace].map(([k, n]) => `${n} ${k}`).join(", ")})`,
);
const noKidRows = kept.filter((r) => r.nonEuResident);
console.error(`nonEuResident (no KID): ${noKidRows.length} lines, ${new Set(noKidRows.map((r) => r.isin)).size} titles`);
// The socket's timers would hold the process open.
process.exit(0);
