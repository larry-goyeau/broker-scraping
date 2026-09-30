// The four Gulf order books that publish themselves for nothing, read once and handed
// to whoever asks. A fact about exchanges rather than about any broker, so it sits at
// the root beside `venues.mjs`, and two scripts read it: `spread.mjs` takes the touch,
// `prices.mjs` takes the last price. One request returns the whole board either way,
// so asking twice for two different fields would be a waste of the same call.
//
//   Abu Dhabi   apigateway.adx.ae     ISIN, bid, ask, last          clé de passerelle
//   Dubaï       api2.dfm.ae           symbole, bid, offer, last     libre
//   Mascate     msx.om                symbole, bid, ask, last       POST, libre
//   Manama      webapi.bahrainbourse  symbole, devise, bid, ask     jeton + Cloudflare
//
// Only Manama needs a browser, and not for its token — that one is printed in the page's
// own HTML — but because its API host answers a plain request with a Cloudflare
// challenge whatever headers it carries. The other three answer anybody.
//
// Tadawul is missing on purpose: the Saudi Exchange publishes last price and volume and
// sells the book, so there is nothing here to read.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

// Abu Dhabi's gateway answers 403 without this and 200 with it. It is published in the
// page's own JavaScript, not a secret, and if it is rotated the symptom is unmistakable.
const ADX_HEADERS = {
  "User-Agent": UA,
  accept: "application/json",
  "channel-id": "OSS WEB",
  "x-correlation-id": "uuid",
  "x-uuid": "",
  "adx-gateway-apikey": "1863a94c-582b-46f9-b4f0-0d02c0cc5307",
  Referer: "https://www.adx.ae/",
  Origin: "https://www.adx.ae",
};

export const GULF_BOARDS = {
  adx: { mic: "XADS", name: "Abu Dhabi Securities Exchange", browser: false, page: "https://www.adx.ae/all-equities" },
  dfm: { mic: "XDFM", name: "Dubai Financial Market", browser: false, page: "https://www.dfm.ae/the-exchange/market-information/market-watch" },
  msx: { mic: "XMUS", name: "Muscat Stock Exchange", browser: false, page: "https://www.msx.om/market-watch-custom.aspx" },
  bhb: { mic: "XBAH", name: "Bahrain Bourse", browser: true, page: "https://bahrainbourse.com/en/Quotes%20and%20Market/Stocks/Pages/Quotes.aspx" },
};

/** The exchange spells it GFH, the catalogues GFH.BI or GFH.AD. */
export const gulfSymbol = (s) =>
  String(s || "")
    .trim()
    .toUpperCase()
    .replace(/\.[A-Z]{1,4}$/, "")
    .replace(/[^A-Z0-9]/g, "");

const num = (x) => {
  const v = Number(String(x ?? "").replace(/,/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
};

async function json(url, init = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...(init.headers || {}) }, ...init, signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function adx() {
  const body = await json("https://apigateway.adx.ae/adx/marketwatch-delayed/1.1/securityBoard/marketwatch", {
    headers: ADX_HEADERS,
  });
  if (!body.response) throw new Error(String(body.errorMessages?.[0] || body.resultMessage || "réponse sans résultats"));
  return (body.response.results || []).map((r) => ({
    symbol: gulfSymbol(r.companySymbol),
    isin: String(r.companyISIN || "").toUpperCase() || null,
    bid: num(r.bid),
    ask: num(r.ask),
    last: num(r.last) ?? num(r.previousClose),
    currency: "AED",
  }));
}

async function dfm() {
  const rows = await json("https://api2.dfm.ae/mw/v1/stocks");
  return rows.map((r) => ({
    symbol: gulfSymbol(r.id),
    isin: null,
    bid: num(r.bidprice),
    ask: num(r.offerprice),
    last: num(r.lastradeprice) ?? num(r.closingprice) ?? num(r.previousclosingprice),
    currency: "AED",
  }));
}

async function msx() {
  const wrapped = await json("https://www.msx.om/APIPage.aspx/GetPageData", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Referer: GULF_BOARDS.msx.page },
    body: JSON.stringify({ sHiddens: "0|0|false||0|SectorMarket|0" }),
  });
  const d = typeof wrapped.d === "string" ? wrapped.d : JSON.stringify(wrapped.d);
  // The payload is a JSON document with the grid's sort order glued to the end of it
  // ("…}]}|asc|0"), so the string is cut at the close of the first complete object.
  let depth = 0;
  let end = d.length;
  for (let i = 0; i < d.length; i++) {
    if (d[i] === "{") depth++;
    else if (d[i] === "}" && --depth === 0) {
      end = i + 1;
      break;
    }
  }
  const out = [];
  for (const sector of JSON.parse(d.slice(0, end)).Data || []) {
    for (const r of sector.MarketList || []) {
      out.push({
        symbol: gulfSymbol(r.Symbol),
        isin: null,
        bid: num(r.BidPrice),
        ask: num(r.AskPrice),
        last: num(r.LTP) ?? num(r.ClosePrice) ?? num(r.PrevClose),
        currency: "OMR",
      });
    }
  }
  return out;
}

// Manama's bearer changes every visit and its API host screens plain requests, so the
// page is allowed to load and its own first call is overheard: headers and token
// together, valid by construction and never pinned here.
const FETCH_WONT_SEND = /^(host|connection|content-length|cookie|date|origin|referer|user-agent|sec-|accept-encoding|accept-charset|te|trailer|upgrade|via)/i;

async function bhb(page) {
  if (!page) throw new Error("Manama demande un onglet : passer `page`");
  const host = "webapi.bahrainbourse.com";
  let borrowed = null;
  const listen = (req) => {
    if (!borrowed && req.url().includes(host)) borrowed = req.headers();
  };
  page.on("request", listen);
  try {
    await page.goto("https://bahrainbourse.com/en", { waitUntil: "networkidle2", timeout: 90000 });
    for (let i = 0; i < 20 && !borrowed; i++) await new Promise((r) => setTimeout(r, 500));
  } finally {
    page.off("request", listen);
  }
  if (!borrowed) throw new Error(`la page n'a pas appelé ${host}`);
  const headers = Object.fromEntries(Object.entries(borrowed).filter(([k]) => !FETCH_WONT_SEND.test(k)));
  const text = await page.evaluate(
    async (u, h) => (await fetch(u, { headers: h })).text(),
    `https://${host}/api/data/GetTabularData?storedProcdure=Quotes`,
    headers
  );
  if (!text) throw new Error("réponse vide");
  return (JSON.parse(text).data || []).map((r) => ({
    symbol: gulfSymbol(r.symbol),
    isin: null,
    bid: num(r.Bid),
    ask: num(r.Ask),
    // Manama quotes a handful of its lines in dollars and the rest in dinars, and says
    // which on every row, so the currency travels with the quote.
    last: num(r["Last Price"]),
    currency: String(r.currency || "").trim().toUpperCase() || "BHD",
  }));
}

const READERS = { adx, dfm, msx, bhb };

/**
 * One board, normalised. `page` is a puppeteer tab, needed by Manama alone.
 * Rows with no symbol are dropped: there is nothing to match them on.
 */
export async function readGulfBoard(key, { page } = {}) {
  const read = READERS[key];
  if (!read) throw new Error(`carnet inconnu : ${key}`);
  const rows = await read(page);
  return rows.filter((r) => r.symbol);
}
