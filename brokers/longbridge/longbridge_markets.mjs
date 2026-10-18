// Shared Longbridge reader for the HK, SG and NZ entities. All three use
// one quote platform; each scraper passes the markets its entity sells.
//
// The market pages list every counter of a market through the public rank
// API (key=all), 300 per page, with a total to page against. The quote
// detail of each counter adds the exchange, the currency, the trading
// status and, for A-shares, the Stock Connect flag. No ISIN is published.
//
//   https://longbridge.com/en/markets/stock?market=us&type=custom_top_gainers
//   https://mr.lbkrs.com/api/forward/newmarket/revision/rank/pc/list?key=all&market=US
//   https://mr.lbkrs.com/api/forward/v3/quote/stock/detail?counter_id=ST/US/AAPL
//
// Kept: ST (stocks, REITs, trusts, SDRs, preferreds) and ETF counters.
// Skipped: SG structured and company warrants (WT counters, and 4-letter
// codes ending in W) and rights (4-letter codes ending in R); HKEX debt
// codes (4000-6029, 40000-49999, 84000-86999); SGX bond lines; US
// warrants, rights, when-issued lines, test symbols and OTC names;
// counters whose detail reports
// trading status 1004 (suspended or delisted) or 1006 (not yet trading).
// A-shares are kept only when the detail says Stock Connect (cnconnect=1):
// the rank list "cn_connect" leaves out every 300xxx ChiNext name, so it is
// not used.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const RANK = "https://mr.lbkrs.com/api/forward/newmarket/revision/rank/pc/list";
const DETAIL = "https://mr.lbkrs.com/api/forward/v3/quote/stock/detail";
const PAGE = 300;
const WORKERS = 6;
const CLOSED = new Set([1004, 1006]);

// Longbridge files NYSE American and NYSE Arca both as "AMEX", so that
// venue gets no MIC.
const US_VENUE = {
  NASD: ["NASDAQ", "XNAS"],
  XNAS: ["NASDAQ", "XNAS"],
  NYSE: ["NYSE", "XNYS"],
  XNYS: ["NYSE", "XNYS"],
  AMEX: ["AMEX", ""],
  XASE: ["NYSE American", "XASE"],
  BATS: ["Cboe BZX", "BATS"],
};

// SG ETFs that Longbridge files as ST counters, by fund family in the name.
const SG_FUND = /\bETF\b|\bSPDR\b|\bGLD\b|^(Lion-|LionGlobal|A Lion|Amova|NikkoAM|NIKKOAM|CSOP|ICBC CSOP|UOBAM|UOB AP|XT |Xtrackers|IS |ISHARES|P-Nova|PHIL|Phillip|SingIndexFund|SS SPDR|CGS FG|CGS Fullgoal|CGS-ICBC|Amundi|Lyxor|CF VN|UETF)/;
// SGX bond lines read "<issuer code> <yymmdd>".
const SG_BOND = /^[A-Z0-9]{6,10} \d{6}$/;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "en" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const body = await response.json();
        if (body.code === 0 && body.data) return body.data;
        last = `code ${body.code} ${body.message} ${url}`;
      } else {
        last = `${response.status} ${url}`;
      }
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(500 * 2 ** attempt);
  }
  throw new Error(last);
}

// One full pass of the "all" list. The order is by price, so a counter can
// move between pages during a pass; passes are merged until the total is met.
async function rankList(market) {
  const seen = new Map();
  let total = 0;
  for (let pass = 0; pass < 4; pass += 1) {
    let announced = Infinity;
    for (let offset = 0; offset < announced; offset += PAGE) {
      const query = `key=all&market=${market}&indicators[]=last_done&sort_indicator=last_done&order=desc&offset=${offset}&limit=${PAGE}`;
      const data = await getJson(`${RANK}?${query}`);
      announced = Number(data.total);
      if (!Number.isInteger(announced) || announced < 1) throw new Error(`${market} rank total ${data.total}`);
      if (!data.list?.length) throw new Error(`${market} rank page at ${offset} is empty`);
      for (const item of data.list) seen.set(item.counter_id, item);
      await sleep(100);
    }
    total = announced;
    if (seen.size >= total) break;
  }
  if (seen.size < total) throw new Error(`${market} rank list: ${seen.size} of ${total}`);
  return [...seen.values()];
}

async function details(counters) {
  const out = new Map();
  let next = 0;
  async function worker() {
    while (next < counters.length) {
      const id = counters[next++];
      out.set(id, await getJson(`${DETAIL}?counter_id=${encodeURIComponent(id)}`));
      await sleep(30);
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  return out;
}

function hkDebt(code) {
  const n = Number(code);
  return (n >= 4000 && n <= 6029) || (n >= 40000 && n <= 49999) || (n >= 84000 && n <= 86999);
}

function row(ticker, name, exchange, mic, currency, type, item) {
  const out = { query: ticker, ticker, name, exchange };
  if (mic) out.mic = mic;
  out.currency = currency;
  out.type = type;
  out.isin = "";
  out.raw = [item.counter_id, name, exchange, currency].join(" ");
  return out;
}

export async function longbridgeRows(markets) {
  const rows = [];
  const skipped = {};
  const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };

  for (const market of markets) {
    const list = await rankList(market);
    console.error(`${market}: ${list.length} counters on the rank list`);
    const wanted = list.filter((item) => {
      const [kind, , code] = item.counter_id.split("/");
      if (kind !== "ST" && kind !== "ETF") return skip(`${market} ${kind} counter`), false;
      if (market === "SG" && code.length === 4 && /[WR]$/.test(code)) return skip("SG warrant or right"), false;
      if (market === "HK" && kind === "ST" && hkDebt(code)) return skip("HK debt"), false;
      return true;
    });
    const info = await details(wanted.map((item) => item.counter_id));

    for (const item of wanted) {
      const [kind, venue, code] = item.counter_id.split("/");
      const detail = info.get(item.counter_id) || {};
      if (CLOSED.has(Number(detail.trade_status))) { skip(`${market} status ${detail.trade_status}`); continue; }
      const name = String(item.name || detail.stock_name || "").replace(/\s+/g, " ").trim();
      if (!name) { skip(`${market} no name`); continue; }
      let type = kind === "ETF" ? "ETF" : "STOCK";

      if (market === "US") {
        const ticker = code;
        if (/\.(WS|WSA|WT|RT|WI|X)$/.test(ticker) || /^PTEST/.test(ticker) || !/^[A-Z]/.test(ticker)) { skip("US warrant, right or test line"); continue; }
        if (/\bSUBS?\s*\/\s*RIGHTS?\b|\s-\sRights$/i.test(name)) { skip("US warrant, right or test line"); continue; }
        const place = US_VENUE[detail.exchange];
        if (!place) { skip(`US venue ${detail.exchange || "none"}`); continue; }
        rows.push(row(ticker, name, place[0], place[1], detail.currency || "USD", type, item));
      } else if (market === "HK") {
        rows.push(row(item.code || code, name, "HKEX", "XHKG", detail.currency || "HKD", type, item));
      } else if (market === "SG") {
        if (SG_BOND.test(name)) { skip("SG bond"); continue; }
        if (type === "STOCK" && SG_FUND.test(name)) type = "ETF";
        rows.push(row(code, name, "SGX", "XSES", detail.currency || "SGD", type, item));
      } else if (market === "CN") {
        if (Number(detail.cnconnect) !== 1) { skip("CN not on Stock Connect"); continue; }
        const [exchange, mic] = venue === "SH" ? ["SSE", "XSHG"] : ["SZSE", "XSHE"];
        rows.push(row(code, name, exchange, mic, "CNY", type, item));
      }
    }
  }

  const unique = new Map();
  for (const entry of rows) unique.set(`${entry.exchange}|${entry.ticker}|${entry.currency}`, entry);
  const sorted = [...unique.values()].sort((a, b) =>
    a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker) || a.currency.localeCompare(b.currency));
  console.error("skipped", skipped);
  return sorted;
}

export function logCounts(rows) {
  const counts = {};
  for (const entry of rows) {
    const key = `${entry.exchange} ${entry.type}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
  console.error(`${rows.length} rows`);
}
