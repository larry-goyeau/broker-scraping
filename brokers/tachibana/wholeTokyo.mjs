// Shared build for the Japanese brokers whose online book is "every
// listing" of the Tokyo Stock Exchange, and for some also of the Nagoya
// Stock Exchange, with exclusions named by category: tachibana,
// sbineotrade, okasanbt, mito and marusan. Each scraper checks its own
// page for the scope sentence and says which categories it keeps; the
// sources are read by ../mitsubishiufjesmart/japan.mjs.
//
// Tokyo is the JPX month-end file (data_j.xlsx), one line per code with
// its 市場・商品区分:
//   Prime, Standard and Growth domestic shares, and 出資証券 → STOCK
//   Prime, Standard and Growth foreign shares → STOCK when the broker keeps them
//   ETF・ETN → ETN when the name says ETN, else ETF; a fund whose manager
//     on the JPX ETF list is a foreign company (WisdomTree Management
//     Jersey, State Street, World Gold Trust) is a foreign-domiciled ETF,
//     kept or dropped per broker
//   PRO Market → out (professional investors only)
//   REIT・ベンチャーファンド・カントリーファンド・インフラファンド → out: a
//     REIT or a closed fund is none of STOCK/ETF/ETC/ETN
// A code on JASDEC's non-handled list (8301, the Bank of Japan) cannot be
// held in a book-entry account and is out everywhere.
//
// Nagoya is the exchange's search over Premier, Main and Next, sole and
// dual listings, and its ETF board (1319, also a Tokyo fund, and 1553, a
// Nagoya sole listing). A code listed on both exchanges is one row per
// place.
//
//   https://www.jpx.co.jp/markets/statistics-equities/misc/01.html
//   https://www.jpx.co.jp/equities/products/etfs/issues/01.html
//   https://www.nse.or.jp/api/stock/search.json
//   https://www.jtg-sec.co.jp/meigara/no_handling.htm

import {
  attachJapanIsins,
  etfManagers,
  fetchText,
  fold,
  foreignManager,
  jasdecRefused,
  jpRow,
  nagoyaEtfs,
  nagoyaListing,
  textOf,
  tokyoListing,
  writeCatalogue,
} from "../mitsubishiufjesmart/japan.mjs";
import { Resolver } from "node:dns";
import https from "node:https";

const DOMESTIC = new Set(["プライム（内国株式）", "スタンダード（内国株式）", "グロース（内国株式）", "出資証券"]);
const FOREIGN = new Set(["プライム（外国株式）", "スタンダード（外国株式）", "グロース（外国株式）"]);

// Page text with every space removed, so a sentence is matched whatever
// the markup puts between its words.
export async function pageText(url, encoding = "utf-8") {
  let html;
  try {
    html = await fetchText(url, encoding);
  } catch (error) {
    // www.secjp.co.jp is a CNAME whose target lacks its trailing dot; some
    // resolvers fail on it, Google's answers. Retry through 8.8.8.8.
    if (!/fetch failed|ENOTFOUND|EAI_AGAIN/i.test(String(error.message || error))) throw error;
    html = await viaPublicDns(url);
  }
  return textOf(html).replace(/\s+/g, "");
}

function viaPublicDns(url) {
  const resolver = new Resolver();
  resolver.setServers(["8.8.8.8", "1.1.1.1"]);
  const lookup = (host, options, callback) =>
    resolver.resolve4(host, (error, addresses) => {
      if (error) return callback(error);
      if (options && options.all) return callback(null, addresses.map((address) => ({ address, family: 4 })));
      callback(null, addresses[0], 4);
    });
  return new Promise((resolve, reject) => {
    const request = https.get(url, { lookup, headers: { "User-Agent": "Mozilla/5.0" }, timeout: 60_000 }, (response) => {
      if (response.statusCode !== 200) return reject(new Error(`${url} answered ${response.statusCode}`));
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    request.on("timeout", () => request.destroy(new Error(`${url} timed out`)));
    request.on("error", reject);
  });
}

// Stops the run when a scope sentence is no longer on the page.
export async function requireSentences(url, sentences) {
  const text = await pageText(url);
  const missing = sentences.filter((sentence) => !text.includes(sentence.replace(/\s+/g, "")));
  if (missing.length) throw new Error(`${url} no longer says: ${missing.join(" / ")}`);
}

// folderUrl: the scraper's import.meta.url. file: the parsed file name.
// foreignShares: keep Tokyo-listed foreign shares. foreignEtfs: keep
// foreign-domiciled Tokyo ETFs. nagoya: add Nagoya Premier, Main, Next and
// its ETF board. checks: promises that stop the run when a page changed.
export async function buildWholeJapan({ folderUrl, file, foreignShares, foreignEtfs, nagoya, checks = [] }) {
  const [tokyo, managers, refused, nagoyaShares, nagoyaFunds] = await Promise.all([
    tokyoListing(),
    etfManagers(),
    jasdecRefused(),
    nagoya ? nagoyaListing() : [],
    nagoya ? nagoyaEtfs() : [],
    ...checks,
  ]);

  const rows = [];
  const dropped = {};
  const drop = (why) => (dropped[why] = (dropped[why] || 0) + 1);
  const foreignFunds = [];
  for (const line of tokyo) {
    if (refused.has(line.code)) drop("JASDEC non-handled");
    else if (DOMESTIC.has(line.section)) rows.push(jpRow({ ...line, exchange: "Tokyo", type: "STOCK" }));
    else if (FOREIGN.has(line.section)) {
      if (foreignShares) rows.push(jpRow({ ...line, exchange: "Tokyo", type: "STOCK" }));
      else drop("Tokyo foreign share");
    } else if (line.section === "ETF・ETN") {
      const name = fold(line.name);
      if (name.includes("ETN")) {
        rows.push(jpRow({ ...line, exchange: "Tokyo", type: "ETN" }));
        continue;
      }
      const foreign = /WisdomTree|ウィズダムツリー/i.test(name) || foreignManager(managers.get(line.code));
      if (foreign) foreignFunds.push(line.code);
      if (foreign && !foreignEtfs) drop("foreign-domiciled ETF");
      else rows.push(jpRow({ ...line, exchange: "Tokyo", type: "ETF" }));
    } else drop(line.section);
  }
  if (foreignFunds.length < 15) throw new Error(`only ${foreignFunds.length} foreign ETFs found on the JPX list`);
  for (const line of nagoyaShares) {
    if (refused.has(line.code)) drop("JASDEC non-handled");
    else rows.push(jpRow({ ...line, exchange: "Nagoya", type: "STOCK" }));
  }
  for (const line of nagoyaFunds) rows.push(jpRow({ ...line, exchange: "Nagoya", type: "ETF" }));

  attachJapanIsins(rows);
  const floors = { "Tokyo STOCK": 3500, "Tokyo ETF": 250, "Tokyo ETN": 5 };
  if (nagoya) floors.Nagoya = 150;
  const output = writeCatalogue(folderUrl, file, rows, floors);
  console.error(`Left out: ${Object.entries(dropped).map(([why, count]) => `${count} ${why}`).join(", ")}`);
  console.error(`Foreign-domiciled ETFs (${foreignEtfs ? "kept" : "left out"}): ${foreignFunds.sort().join(", ")}`);
  return output;
}
