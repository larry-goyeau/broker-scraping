// East Money Securities (东方财富证券) runs the East Money quote centre. Its
// grid lists every board the account trades, with no login, from one JSON
// endpoint that pages 100 lines at a time and announces each list's total.
//
//   https://quote.eastmoney.com/center/gridlist.html
//   https://push2.eastmoney.com/api/qt/clist/get?fs=...  (one call per page)
//
// Lists, with the filter the grid page itself sends:
//   hs_a_board   Shanghai (main board and STAR), Shenzhen (main board and
//                ChiNext) and Beijing A-shares, delisting-arrangement lines out
//   fund_etf     ETFs listed in Shanghai and Shenzhen
//   fund_lof     listed open-ended funds (LOF), kept as FUND
//   fund_reits   listed infrastructure REITs, kept as FUND
//   hk_sh_stocks, hk_sz_stocks, hk_sh_board_fund, hk_sz_board_fund
//                Southbound Stock Connect shares and ETFs (Hong Kong book)
//
// B-shares, bonds, convertibles, options and NEEQ (新三板) stay out: NEEQ is
// a separate qualified-investor service, not an online A-share line. A line
// with no price and no previous close has not started trading (a new issue)
// and stays out; a line with a previous close but no price today is a
// suspension and stays out too. Southbound shares are quoted in Hong Kong
// dollars on HKEX; a share on both Connect lists is one HKEX row. STAR and
// ChiNext are Shanghai and Shenzhen books. The grid shows no ISINs.
//
//   node brokers/eastmoney/eastmoney_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HOSTS = ["82.push2.eastmoney.com", "push2.eastmoney.com", "17.push2.eastmoney.com", "48.push2.eastmoney.com"];
const PAGE = 100;
const FIELDS = "f2,f12,f13,f14,f18";

const LISTS = [
  { id: "hs_a_board", fs: "m:0+t:6+f:!2,m:0+t:80+f:!2,m:1+t:2+f:!2,m:1+t:23+f:!2,m:0+t:81+s:262144+f:!2", type: "STOCK", floor: 5000 },
  { id: "fund_etf", fs: "b:MK0021,b:MK0022,b:MK0023,b:MK0024,b:MK0827", type: "ETF", floor: 800 },
  { id: "fund_lof", fs: "b:MK0404,b:MK0405,b:MK0406,b:MK0407", type: "FUND", floor: 100 },
  { id: "fund_reits", fs: "m:1+t:9+e:97,m:0+t:10+e:97", type: "FUND", floor: 30 },
  { id: "hk_sh_stocks", fs: "b:MK0144", type: "STOCK", floor: 300, hk: true },
  { id: "hk_sz_stocks", fs: "b:MK0146", type: "STOCK", floor: 300, hk: true },
  { id: "hk_sh_board_fund", fs: "b:MK0838", type: "ETF", floor: 1, hk: true },
  { id: "hk_sz_board_fund", fs: "b:MK0837", type: "ETF", floor: 1, hk: true },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function page(fsFilter, number) {
  let last = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const host = HOSTS[attempt % HOSTS.length];
    const url = `https://${host}/api/qt/clist/get?pn=${number}&pz=${PAGE}&po=0&np=1&fltt=2&invt=2&fid=f12&fs=${fsFilter}&fields=${FIELDS}`;
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://quote.eastmoney.com/center/gridlist.html" },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) {
        const body = await response.json();
        if (body?.rc === 0) return body.data || { total: 0, diff: [] };
        last = `rc ${body?.rc} ${url}`;
      } else {
        last = `${response.status} ${url}`;
      }
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

async function list(spec) {
  const lines = [];
  let total = Infinity;
  for (let number = 1; lines.length < total; number += 1) {
    const data = await page(spec.fs, number);
    total = Number(data.total) || 0;
    const diff = Array.isArray(data.diff) ? data.diff : Object.values(data.diff || {});
    if (!diff.length) break;
    lines.push(...diff);
    await sleep(1200);
  }
  if (lines.length !== total) throw new Error(`${spec.id} announced ${total}, read ${lines.length}`);
  if (total < spec.floor) throw new Error(`${spec.id} has ${total} lines`);
  return lines;
}

function place(line, spec) {
  if (spec.hk) return { exchange: "HKEX", mic: "XHKG", currency: "HKD" };
  if (line.f13 === 1) return { exchange: "Shanghai Stock Exchange", mic: "XSHG", currency: "CNY" };
  if (/^(4|8|92)/.test(line.f12)) return { exchange: "Beijing Stock Exchange", mic: "BJSE", currency: "CNY" };
  return { exchange: "Shenzhen Stock Exchange", mic: "XSHE", currency: "CNY" };
}

const rows = [];
const seen = new Set();
const dropped = { notTrading: 0, suspended: 0 };
const listed = {};
for (const spec of LISTS) {
  const lines = await list(spec);
  listed[spec.id] = lines.length;
  for (const line of lines) {
    const code = String(line.f12 || "").trim();
    if (!code) continue;
    const priced = typeof line.f2 === "number";
    const previous = typeof line.f18 === "number";
    if (!priced && !previous) {
      dropped.notTrading += 1;
      continue;
    }
    if (!priced) {
      dropped.suspended += 1;
      continue;
    }
    const where = place(line, spec);
    const key = `${where.mic}|${code}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      query: code,
      ticker: code,
      name: String(line.f14 || "").trim(),
      ...where,
      type: spec.type,
      isin: "",
      raw: [spec.id, `${line.f13}.${code}`, line.f14, line.f2, line.f18].join(" | "),
    });
  }
  await sleep(1500);
}

const expect = (ticker, mic, type) => {
  if (!rows.some((row) => row.ticker === ticker && row.mic === mic && row.type === type)) throw new Error(`${ticker} ${mic} ${type} missing`);
};
expect("600519", "XSHG", "STOCK"); // Kweichow Moutai
expect("688981", "XSHG", "STOCK"); // SMIC (STAR)
expect("000001", "XSHE", "STOCK"); // Ping An Bank
expect("300750", "XSHE", "STOCK"); // CATL (ChiNext)
if (rows.filter((row) => row.mic === "BJSE").length < 200) throw new Error("Beijing lines were short");
if (rows.filter((row) => row.mic === "XHKG").length < 400) throw new Error("Southbound lines were short");
expect("510300", "XSHG", "ETF"); // CSI 300 ETF
expect("159919", "XSHE", "ETF");
expect("00700", "XHKG", "STOCK"); // Tencent, Southbound
if (rows.length < 7000) throw new Error(`only ${rows.length} rows`);

rows.sort((left, right) => left.mic.localeCompare(right.mic) || left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("eastmoney-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const counts = {};
for (const row of rows) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error({ listed, dropped, written: counts });
