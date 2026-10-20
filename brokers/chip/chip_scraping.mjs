// What Chip sells in its investment account, with no login. Chip sells
// funds, ETFs and ETCs, and no single shares.
//
// "All of Chip's Investment Funds" is one page of cards. A card links to
// the fund's own page, which prints the full fund name, a ticker, the
// currency and a link to the KIID. When that link carries an ISIN (most
// provider document URLs do), it is stored. The four Vanguard
// LifeStrategy cards have no page; they stay with the card name, the
// provider and no ticker.
//
// Chip names no exchange per fund. Its custodian, Seccl, sends every
// exchange-traded order to Winterflood, whose only execution venue is the
// London Stock Exchange (broker-list.json gives Chip that place). So an ETF
// or ETC becomes one row per LSE main-market line, each with its own TIDM
// and currency, read from the LSE; the line's ISIN is the LSE's, which also
// corrects a KIID link that points at a sister share class. Only lines the
// account can hold are kept: payments are in sterling (GBP, and GBX pence).
// A line with none of those keeps the card as Chip prints it. Open-ended
// funds are dealt with the fund manager and have no exchange. A line whose
// name says ETF is an ETF, ETC an ETC; anything else is a fund.
//
//   https://getchip.uk/investing/investment-funds
//   https://getchip.uk/investing/invest-in-funds/sp-500-tech
//   https://seccl.tech/order-execution/
//
//   node brokers/chip/chip_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { depositHas } from "../../deposits.mjs";
import { lseLine, lseLines, heldAs } from "../../lseListings.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LIST = "https://getchip.uk/investing/investment-funds";

function decode(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function page(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

// One card per fund in the list. The visible provider logo is the one
// without w-condition-invisible; its file name ends in the provider.
function cards(html) {
  const found = [];
  for (const chunk of html.split('<div role="listitem" class="w-dyn-item">').slice(1)) {
    const link = (chunk.match(/^<a href="([^"]+)"/) || [])[1] || "";
    const name = decode((chunk.match(/fs-list-field="name"[^>]*>([\s\S]*?)<\/h6>/) || [])[1]);
    if (!name) continue;
    const logo = [...chunk.matchAll(/<img[^>]*src="([^"]*)"[^>]*class="image_fund-card-provider"/g)].map((match) => match[1])[0] || "";
    const provider = decode(decodeURIComponent((logo.match(/Property%201%3D([^/.]+)\.svg/) || [])[1] || "")).replace(/^L&G$/, "Legal & General");
    found.push({ link: /^https?:/.test(link) ? link.replace(/^http:\/\/www\./, "https://www.") : "", name, provider });
  }
  return found;
}

function details(html) {
  const fields = {};
  for (const match of html.matchAll(/<div class="text-size-medium text-weight-normal text-align-left">([^<]+)<\/div>(?:<div class="text-size-medium text-weight-bold[^"]*">([\s\S]*?)<\/div>|<a href="([^"]*)")/g)) {
    fields[decode(match[1])] = match[2] !== undefined ? decode(match[2]) : decode(match[3]);
  }
  return fields;
}

function kindOf(name) {
  if (/\bETC\b/i.test(name)) return "ETC";
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\bETF\b/i.test(name)) return "ETF";
  return "FUND";
}

const list = cards(await page(LIST));
if (list.length < 30) throw new Error(`only ${list.length} fund cards`);

const rows = [];
const seen = new Set();
for (const card of list) {
  const key = card.link || card.name;
  if (seen.has(key)) continue;
  seen.add(key);
  if (!card.link) {
    const name = [card.provider, card.name].filter(Boolean).join(" ");
    rows.push({ query: name, ticker: "", name, currency: "", type: "FUND", isin: "", raw: [card.name, card.provider].filter(Boolean).join(" ") });
    continue;
  }
  const fields = details(await page(card.link));
  await sleep(250);
  const name = fields["Fund name"];
  const ticker = fields.Ticker || "";
  if (!name) throw new Error(`no fund name on ${card.link}`);
  const kiid = fields.KIID || "";
  const isins = [...new Set((kiid.toUpperCase().match(/(?<![A-Z0-9])[A-Z]{2}[A-Z0-9]{9}\d(?![A-Z0-9])/g) || []))];
  const isin = isins.length === 1 ? isins[0] : "";
  const currency = (fields.Currency || "").toUpperCase();
  const type = kindOf(name);
  const raw = [ticker, name, card.name, card.provider, currency, isin].filter(Boolean).join(" ");
  if (type !== "FUND") {
    const own = ticker ? await lseLine(ticker) : null;
    const id = own?.isin || isin;
    const lines = (id ? await lseLines(id) : own ? [own] : []).filter((line) => depositHas("chip", "", heldAs(line.currency)));
    for (const line of lines) {
      rows.push({
        query: line.ticker,
        ticker: line.ticker,
        name,
        exchange: "London Stock Exchange",
        mic: "XLON",
        currency: line.currency,
        type,
        isin: line.isin,
        raw: `${raw} | XLON ${line.ticker} ${line.currency}`,
      });
    }
    if (lines.length) continue;
  }
  rows.push({ query: ticker || name, ticker, name, currency, type, isin, raw });
}

rows.sort((left, right) => left.name.localeCompare(right.name) || left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("chip-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));

const counts = {};
for (const row of rows) counts[`${row.exchange || "no exchange"} ${row.type} ${row.currency || "-"}`] = (counts[`${row.exchange || "no exchange"} ${row.type} ${row.currency || "-"}`] || 0) + 1;
for (const [key, count] of Object.entries(counts).sort()) console.error(`${key}: ${count}`);
console.error(`${rows.length} rows (${rows.filter((row) => row.isin).length} with an ISIN)`);
