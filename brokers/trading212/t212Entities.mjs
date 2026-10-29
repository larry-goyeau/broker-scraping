// Which Trading 212 company sells each line, and so which residents may see it.
//
// The app catalogue (trading212_scraping.mjs) is read through one signed-in
// account and only ever answers for the company holding it. The public
// "All trading instruments" page answers for all of them at once: every Invest
// line carries `dealerExclusions`, the companies that do not sell it.
//
//   AVUSUK  Trading 212 UK Ltd (formerly Avus Capital UK)
//   T212CY  Trading 212 Markets Ltd (Cyprus)
//   T212DE  Trading 212 EU GmbH
//   T212AU  Trading 212 AU Pty Ltd
//   AVUS    Trading 212 Ltd (Bulgaria). The help centre gives it no country,
//           so it opens no line here.
//
// Countries per company are the help centre's own split ("What are the
// supported countries?", read 2026-10-28). The fees are the same card for all
// four (Invest: no commission, no custody, FX 0.15 %), so one catalogue and one
// cost file serve them; only the lines differ.
//
// Each row gets `entities` (the companies selling it) and `supportedCountries`
// (their residents), which the front already filters on (listingAccepts). An
// ETF's own registration list from the app is kept in `registeredCountries`.
// It is the fund's European marketing list (EEA, UK, Switzerland, a few
// others), so it only narrows those residents: a fund stays hidden in an EEA
// country, Britain or Switzerland where it is not registered, while Australia,
// the Gulf or Latin America follow the company alone.
//
// Lines the session's company does not sell are added from the public page.
// Lines it does sell but that are missing from the app catalogue are not: the
// app drops sell-only, non-tradable and corporate-action lines, and the public
// page does not say which those are. A catalogue line the public page no
// longer lists keeps the session company's residents.
//
//   https://www.trading212.com/trading-instruments/invest
//   https://helpcentre.trading212.com/hc/en-us/articles/12933782261917-What-are-the-supported-countries
//
//   node brokers/trading212/t212Entities.mjs     reapplies it to trading212-parsed.json

import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { stampRows, EEA } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";

const PAGE = "https://www.trading212.com/trading-instruments/invest";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export const ENTITY_COUNTRIES = {
  AVUSUK: [
    "GB", "GH", "MX", "RS", "AO", "GI", "MD", "TZ", "BH", "GG", "MK", "TH", "BO", "HN",
    "OM", "UG", "CO", "IM", "PE", "AE", "EC", "JE", "PH", "ZM", "SV", "KW", "QA",
  ],
  T212CY: ["BG", "LT", "HR", "MT", "CZ", "PL", "EE", "CY", "GR", "RO", "HU", "SK", "IT", "SI", "LV"],
  // France & Overseas: French Guiana, Guadeloupe, Martinique, Mayotte, Réunion.
  T212DE: [
    "DE", "LU", "AT", "NL", "DK", "NO", "FI", "PT", "FR", "GF", "GP", "MQ", "YT", "RE",
    "ES", "IS", "SE", "IE", "CH", "LI",
  ],
  T212AU: ["AU"],
};
const ENTITIES = Object.keys(ENTITY_COUNTRIES);

/** The public page's instruments and exchange schedules, read in a headless Chrome (Cloudflare refuses curl). */
export async function readInvestPage() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run"] });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.goto(PAGE, { waitUntil: "load", timeout: 90_000 });
    // The 7 MB script can still be streaming when the element exists: read it
    // until it parses.
    let props = null;
    for (let i = 0; i < 30 && !props; i++) {
      const text = await page.evaluate(() => document.getElementById("__NEXT_DATA__")?.textContent || "");
      try {
        props = JSON.parse(text)?.props?.pageProps || null;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!props) throw new Error("the Invest page's data never finished loading");
    const instruments = props.instruments;
    if (!Array.isArray(instruments) || instruments.length < 15_000) {
      throw new Error(`the Invest page listed ${instruments?.length ?? 0} instruments`);
    }
    const unknown = new Set(instruments.flatMap((i) => i.dealerExclusions || []).filter((d) => d !== "AVUS" && !ENTITIES.includes(d)));
    if (unknown.size) throw new Error(`unknown Trading 212 companies on the Invest page: ${[...unknown].join(", ")}`);
    return { instruments, schedules: props.workingSchedules || [] };
  } finally {
    await browser.close();
  }
}

const sellers = (instrument) => ENTITIES.filter((e) => !(instrument.dealerExclusions || []).includes(e));
const residents = (entities) => [...new Set(entities.flatMap((e) => ENTITY_COUNTRIES[e]))].sort();

const REGISTRATION = new Set([...EEA, "GB", "CH"]);

function countriesFor(entities, registered) {
  const open = residents(entities);
  return Array.isArray(registered) ? open.filter((c) => !REGISTRATION.has(c) || registered.includes(c)) : open;
}

/**
 * Stamp every share/ETF row with the companies that sell it and their residents,
 * and add the lines `sessionEntity` does not sell. Rows are changed in place.
 */
export function withEntities(rows, { instruments, schedules }, sessionEntity = "T212DE") {
  const byCode = new Map(instruments.map((i) => [i.ticker, i]));
  const caption = new Map(schedules.map((s) => [s.id, s.readableCaption]));
  const tally = { stamped: 0, gone: 0, added: 0, skippedSessionLines: 0 };
  const have = new Set();
  for (const row of rows) {
    if (row.type === "CRYPTO" || !row.code) continue;
    have.add(row.code);
    if (row.registeredCountries === undefined && Array.isArray(row.supportedCountries) && !row.entities) {
      row.registeredCountries = row.supportedCountries;
    }
    const instrument = byCode.get(row.code);
    row.entities = instrument ? sellers(instrument) : [sessionEntity];
    row.supportedCountries = countriesFor(row.entities, row.registeredCountries);
    if (instrument) tally.stamped++;
    else tally.gone++;
  }
  for (const instrument of instruments) {
    if (have.has(instrument.ticker) || instrument.conditionalVisibility || !instrument.isin) continue;
    const entities = sellers(instrument);
    if (!entities.length) continue;
    if (entities.includes(sessionEntity)) {
      tally.skippedSessionLines++;
      continue;
    }
    const exchange = caption.get(instrument.exchangeId) || null;
    const name = String(instrument.description || instrument.fullName || "").replace(/\s+/g, " ").trim();
    const ticker = String(instrument.shortName || "").toUpperCase() || null;
    rows.push({
      query: instrument.isin,
      isin: instrument.isin,
      ticker,
      name,
      label: String(instrument.fullName || "").replace(/\s+/g, " ").trim() || null,
      code: instrument.ticker,
      exchange,
      exchangeId: instrument.exchangeId ?? null,
      currency: instrument.currency || null,
      type: instrument.type || null,
      subclasses: instrument.subclasses || null,
      raw: [ticker, name, exchange, instrument.currency, "public Invest page"].filter(Boolean).join(" "),
      entities,
      supportedCountries: residents(entities),
    });
    tally.added++;
  }
  return tally;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = new URL("trading212-parsed.json", import.meta.url);
  const rows = JSON.parse(fs.readFileSync(file, "utf8"));
  const tally = withEntities(rows, await readInvestPage());
  fs.writeFileSync(file, JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
  const per = Object.fromEntries(ENTITIES.map((e) => [e, rows.filter((r) => r.entities?.includes(e)).length]));
  console.error(
    `${rows.length} rows: ${tally.stamped} stamped from the Invest page, ${tally.gone} no longer on it (session company only), ` +
      `${tally.added} added for the other companies, ${tally.skippedSessionLines} session-company lines missing from the app catalogue left out`
  );
  console.error(`lines per company: ${Object.entries(per).map(([e, n]) => `${e} ${n}`).join(", ")}`);
}
