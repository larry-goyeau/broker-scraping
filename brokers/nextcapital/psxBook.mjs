// The whole Pakistan Stock Exchange book of shares and ETFs, for the PSX
// brokers whose only place is the exchange (nextcapital, foundation, adam,
// babaequities, mra, optimus, darson, ...). A PSX broker's online account
// trades the exchange's ready market; the scraper calls psxBook() and then
// removes only what the broker itself excludes on its own pages.
//
// The list is the exchange's own: the regular deliverable market (REG), one
// symbol and name per line, on the PSX data portal's "Eligible Scrips"
// page. The other boards there (odd lot, futures, cash-settled futures,
// bonds, IPO, square-up, ...) carry the same companies or no equity.
//
//   https://dps.psx.com.pk/eligible-scrips
//   https://dps.psx.com.pk/data/eligible-scrips/REG.xml
//
// Kept: shares, preference shares, modarabas, REITs (TPL REIT Fund I
// included) and the nine ETFs, all in rupees on XKAR.
// Left out:
//   - a right ("... Right", "Convt (Pref) Right", "(Right)"): an
//     entitlement, not a share;
//   - a closed-end mutual fund (HBL Growth Fund, HBL Investment Fund,
//     Tri-Star Mutual Fund, Investec Mutual Fund): a fund, not an ETF;
//   - a debt line (obligation.mjs; REG carries none today);
//   - a company the exchange prints as delisted or suspended on its
//     company page (https://dps.psx.com.pk/company/<SYMBOL>), or whose last
//     trade there is more than six months old, or that is on the PSX
//     suspension list ("List of Companies / Securities in which Trading is
//     suspended under clauses 5.11. & 5B.14 of PSX Regulations",
//     https://www.psx.com.pk/psx/themes/psx/uploads/Suspension-Updated-_02-9-2021.pdf)
//     while the portal has not been read for it. That is psxStatus.mjs at
//     the repo root (withoutDelisted), the filter every PSX scraper uses;
//     its store, assets/psx-status.json, is refreshed with
//     `node psxStatus.mjs`. REG keeps such lines: Agro Allianz (AAL),
//     suspended and winding up, last traded on 11 August 2018.
// Remarks, not removals (they depend on the client):
//   - a GEM Board line (GEMBCEM, GEMMEL, GEMNETS, GEMPACRA, GEMPAPL):
//     accredited investors only (GEM_REMARK, source in psxStatus.mjs);
//   - a company the portal flags NON-COMPLIANT, DEFAULTER or WINDING-UP but
//     still trades: it is on the exchange's non-compliant counter.
//
// ISINs: the page prints none (nor does the company page). They come from
// the shared lists (assets/stocks.csv, assets/etfs.csv, through stampRows),
// then from brokers/standardcapital/psxIsins.mjs for the nine ETFs and the
// few companies those lists lack; `query` is the ISIN when there is one.
//
// The last REG file read is kept next to this module (psx-regular.xml) and
// used, with a warning, when the portal does not answer.
//
//   import { psxBook } from "../nextcapital/psxBook.mjs";
//   const rows = await psxBook();          // rows.report: counts of what was left out
//
//   node brokers/nextcapital/psxBook.mjs    prints the counts, writes nothing but the cache

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { GEM_REMARK, psxClosed, psxFlags, psxGemBoard } from "../../psxStatus.mjs";
import { fillPsxIsins } from "../standardcapital/psxIsins.mjs";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const PSX_PLACE = "Pakistan Stock Exchange";
export const PSX_MIC = "XKAR";
const LIST_PAGE = "https://dps.psx.com.pk/eligible-scrips";
const LIST = "https://dps.psx.com.pk/data/eligible-scrips/REG.xml";
const CACHE = new URL("psx-regular.xml", import.meta.url);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function clean(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function regularXml() {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(LIST, {
        headers: { "User-Agent": UA, Accept: "application/xml, text/xml, */*", Referer: LIST_PAGE },
        signal: AbortSignal.timeout(30_000),
      });
      const xml = response.ok ? await response.text() : "";
      if ((xml.match(/<symbol_code>/g) || []).length >= 400) {
        fs.writeFileSync(CACHE, xml);
        return { xml, source: LIST };
      }
      last = `${response.status} ${LIST}`;
    } catch (error) {
      last = `${LIST}: ${error.cause?.message || error.message || error}`;
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  if (!fs.existsSync(CACHE)) throw new Error(`PSX regular market list unavailable (${last}) and no cached copy`);
  console.error(`PSX portal did not answer (${last}); using ${fileURLToPath(CACHE)}`);
  return { xml: fs.readFileSync(CACHE, "utf8"), source: fileURLToPath(CACHE) };
}

// "LimitedRight", "Limited Right", "Convt (Pref) Right", "Limited.(Right)".
const isRight = (name) => /\bright\b/i.test(name) || /Right\)?\.?\s*$/.test(name);

function kindOf(name) {
  if (/\bETF\b|exchange traded fund/i.test(name)) return "ETF";
  if (/\bREIT\b/i.test(name)) return "STOCK";
  if (/\bfund\b/i.test(name)) return "FUND";
  return "STOCK";
}

/**
 * Every share and ETF tradable on the PSX ready market, with ISINs.
 * Rows: { query, ticker, name, exchange: "Pakistan Stock Exchange", mic: "XKAR",
 * currency: "PKR", type: "STOCK" | "ETF", isin, raw, remark? }, sorted by ticker.
 * rows.report (not serialised) holds the source and what was left out.
 */
export async function psxBook() {
  const { xml, source } = await regularXml();
  const pairs = [...xml.matchAll(/<symbol_code>([\s\S]*?)<\/symbol_code>\s*<symbol_name>([\s\S]*?)<\/symbol_name>/g)];
  if (pairs.length < 400) throw new Error(`PSX published ${pairs.length} regular symbols`);

  const dropped = { right: [], fund: [], debt: [], closed: [] };
  const seen = new Set();
  const rows = [];
  for (const [, code, label] of pairs) {
    const ticker = clean(code).toUpperCase();
    const name = clean(label).replace(/\s*\(GEM\)\s*$/i, "") || ticker;
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    if (isRight(name)) {
      dropped.right.push(ticker);
      continue;
    }
    const type = kindOf(name);
    if (type === "FUND") {
      dropped.fund.push(ticker);
      continue;
    }
    const closed = psxClosed(ticker);
    if (closed) {
      dropped.closed.push(`${ticker} (${closed})`);
      continue;
    }
    const flags = psxFlags(ticker);
    const remark = psxGemBoard(ticker)
      ? GEM_REMARK
      : /NON-COMPLIANT|DEFAULTER|WINDING-UP/.test(flags)
        ? `PSX non-compliant company: traded on the exchange's non-compliant counter${/WINDING-UP/.test(flags) ? "; winding-up proceedings" : ""}.`
        : "";
    rows.push({
      query: ticker,
      ticker,
      name,
      exchange: PSX_PLACE,
      mic: PSX_MIC,
      currency: "PKR",
      type,
      isin: "",
      raw: [ticker, clean(label), "PSX", "PKR", type].join(" "),
      ...(remark ? { remark } : {}),
    });
  }

  const kept = withoutObligations(rows);
  const keptSet = new Set(kept);
  dropped.debt = rows.filter((row) => !keptSet.has(row)).map((row) => row.ticker);
  const stamped = stampRows(kept);
  const fromPsxIsins = fillPsxIsins(stamped);
  for (const row of stamped) if (row.isin) row.query = row.isin;
  stamped.sort((left, right) => left.ticker.localeCompare(right.ticker));

  const must = (ticker, type) => {
    if (!stamped.some((row) => row.ticker === ticker && row.type === type)) throw new Error(`${ticker} is not a PSX ${type} line`);
  };
  must("OGDC", "STOCK");
  must("MIIETF", "ETF");
  must("DCR", "STOCK");
  if (stamped.filter((row) => row.type === "ETF").length < 8) throw new Error("fewer than 8 PSX ETFs");
  if (stamped.length < 400) throw new Error(`only ${stamped.length} PSX lines kept`);

  Object.defineProperty(stamped, "report", {
    enumerable: false,
    value: {
      source,
      listed: pairs.length,
      kept: stamped.length,
      etf: stamped.filter((row) => row.type === "ETF").length,
      withIsin: stamped.filter((row) => row.isin).length,
      fromPsxIsins,
      gem: stamped.filter((row) => row.remark === GEM_REMARK).length,
      nonCompliant: stamped.filter((row) => /non-compliant counter/.test(row.remark || "")).length,
      dropped,
    },
  });
  return stamped;
}

/** One line for a scraper's console: what the book kept and left out. */
export function psxBookSummary(rows) {
  const r = rows.report;
  if (!r) return `${rows.length} PSX lines`;
  return [
    `${r.listed} symbols on the PSX regular market, ${r.kept} kept (${r.etf} ETF), ${r.withIsin} with an ISIN (${r.fromPsxIsins} from psxIsins.mjs);`,
    `left out: ${r.dropped.right.length} rights, ${r.dropped.fund.length} closed-end funds, ${r.dropped.debt.length} debt,`,
    `${r.dropped.closed.length} delisted, suspended or without a trade for six months;`,
    `remarks: ${r.gem} GEM Board, ${r.nonCompliant} non-compliant counter`,
  ].join(" ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = await psxBook();
  console.error(psxBookSummary(rows));
  console.error("closed:", rows.report.dropped.closed.join(", "));
  console.error("without ISIN:", rows.filter((row) => !row.isin).map((row) => row.ticker).join(", ") || "none");
}
