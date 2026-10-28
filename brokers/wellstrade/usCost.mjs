// One round trip on the US tape (Nasdaq, NYSE, NYSE American, NYSE Arca,
// Cboe BZX, IEX, MEMX, the Texas Stock Exchange, and OTC Markets where a
// catalogue carries it): buy n shares at price p, sell them straight back,
// in dollars. Shared by the brokers whose one place is "United States"
// (WellsTrade and the bank, credit-union, app and foreign brokers of the
// same batch). Each broker file passes its own schedule; the sums, the book
// and the US regulatory levies are here. Same contract as
// brokers/hapi/hapi_cost.mjs and brokers/public/public_cost.mjs.
//
// No exchange, clearing or stamp line reaches a US retail client unless the
// broker passes it on. What can be passed on, on the sale only unless said:
//
//   SEC Section 31   $20.60 per $1,000,000 of the sale since 2026-04-04
//                    (Fee Rate Advisory 2026-2; it stays until 60 days after
//                    the FY2027 appropriation). $0.00 before that date.
//                    https://www.sec.gov/rules-regulations/fee-rate-advisories/2026-2
//                    https://www.finra.org/rules-guidance/notices/information-notice-20260317
//   FINRA TAF        $0.000195 a share sold, cap $9.79 a trade (2026).
//                    Paused for trades from 2026-10-01 to 2026-12-31,
//                    resumes 2027-01-01 (SR-FINRA-2026-021, "temporarily
//                    pause assessment of the Trading Activity Fee").
//                    https://www.finra.org/sites/default/files/2026-09/SR-FINRA-2026-021.pdf
//   CAT              set by each broker (Public $0.000009, Robinhood and
//                    moomoo $0.000003 a share, both legs). No public
//                    uniform rate: a broker that prints none pays 0 here.
//
// Owner's rule: a levy the broker does not print stays 0 (`levies` all
// false by default). There is no US transaction tax; taxMap answers the
// ISIN anyway (it holds no US-ISIN rate today).
//
// Book: a listed US line is the per-symbol Rule 605 figure × the Q of the
// broker-dealer named in `rule606` (spreads/rule606.mjs: US_BROKERS keys,
// or virtuamericas / citadelsecurities / drivewealth). With no key, the
// broker folder is passed, so an ALIASES entry added later is picked up;
// until then the book is the quoted NBBO of the name. The Texas Stock
// Exchange is on the same NBBO, so its lines read the same 605 figure. OTC
// Markets lines keep the OTC touch (bp) from spreads/.
//
// FX: in the total only when the listing currency is not a deposit
// currency (deposits.mjs, or `deposits` in the schedule while the folder has
// no entry there). Otherwise the remark "FX x% when cash ≠ USD.". A forced
// conversion with no published rate makes the total N/A.
//
//   schedule = {
//     broker, folder, catalogueUrl, url, readOn,
//     entity?, rule606?,                 // BD key, or null for the quoted NBBO
//     cash?: "USD", deposits?: ["USD"],  // deposits only as a fallback
//     feeCurrency?: "USD",               // currency `ticket` answers in
//     plans?, defaultPlan?, planAlias?,  // one row per plan (query.plan)
//     ticket(ctx) -> number (each side) | { buy, sell, note? } | null
//     levies?: { sec: false|"up"|"nearest"|"penny"|"exact",
//                taf: same, cat: false | { perShare, otcPerShare?, mode? } },
//     fx?: { rate: 0.005, label?: "0.5" } | { unpublished: true },
//     onlineBuy?: bool | (ctx) => bool,
//     tradable?: (ctx) => null | "why",  // a line the online ticket refuses
//     remark?: string | (ctx) => string,
//     basis: string | (ctx) => string,   // French
//     notes?: string[] | (ctx) => string[],
//   }
//   ctx = { shares, price, notional, notionalUsd, fractional, otc, listed,
//           listing, row, plan, day }
//
//   import { usRoundTrip, makePlanOf, printCli } from "../wellstrade/usCost.mjs";
//   export const roundTrip = (query) => usRoundTrip(SCHEDULE, query);
//   printCli(import.meta.url, roundTrip, SCHEDULE);
//
// `usRoundTrip(...)` reads files, not the network.
//
//   node brokers/wellstrade/usCost.mjs --selftest

import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import { isListedUsTape, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { US_BROKERS, qOf, routingOf, usBookPerShare } from "../../spreads/rule606.mjs";
import { finite, plus } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

export const SEC = { rate: 20.6 / 1_000_000, from: "2026-04-04", before: 0 };
export const TAF = { perShare: 0.000195, cap: 9.79 };
export const TAF_PAUSE = { from: "2026-10-01", to: "2026-12-31" };
export const SOURCES = {
  sec: "https://www.sec.gov/rules-regulations/fee-rate-advisories/2026-2",
  secFinra: "https://www.finra.org/rules-guidance/notices/information-notice-20260317",
  tafPause: "https://www.finra.org/sites/default/files/2026-09/SR-FINRA-2026-021.pdf",
  rule606: "https://www.finra.org/finra-data/606-nms-data/bulk-file",
};
const KNOWN_BD = new Set([...Object.keys(US_BROKERS), "virtuamericas", "citadelsecurities", "drivewealth"]);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const today = () => new Date().toISOString().slice(0, 10);
const CENT = 0.01;

// ---------------------------------------------------------------- levies

/** Cents: "up" ceiling, "nearest", "penny" (nearest, a positive amount under a cent is a cent), "exact". */
export function cents(value, mode = "up") {
  if (value == null || Number.isNaN(value)) return null;
  if (!(value > 0)) return 0;
  if (mode === "exact") return value;
  if (mode === "up") return Number((Math.ceil(value / CENT - 1e-9) * CENT).toFixed(2));
  const nearest = Math.round(value / CENT) * CENT;
  if (mode === "penny") return Number(Math.max(CENT, nearest).toFixed(2));
  return Number(nearest.toFixed(2));
}

export function secRate(day = today()) {
  return day >= SEC.from ? SEC.rate : SEC.before;
}

/** TAF per share sold on `day` (YYYY-MM-DD): 0 during FINRA's Q4 2026 pause. */
export function tafPerShare(day = today()) {
  return day >= TAF_PAUSE.from && day <= TAF_PAUSE.to ? 0 : TAF.perShare;
}

export function secFee(notionalUsd, mode = "up", day = today()) {
  if (!mode) return 0;
  return notionalUsd == null ? null : cents(notionalUsd * secRate(day), mode);
}

export function tafFee(shares, mode = "up", day = today()) {
  if (!mode) return 0;
  return cents(Math.min(Number(shares) * tafPerShare(day), TAF.cap), mode);
}

/** One leg of CAT. `mode` defaults to Public's: under a cent it is 0, else nearest cent. */
export function catLeg(shares, cat, otc = false) {
  if (!cat) return 0;
  const rate = otc && cat.otcPerShare != null ? cat.otcPerShare : cat.perShare;
  const raw = Number(shares) * rate;
  const mode = cat.mode || "zero-under-cent";
  if (mode === "zero-under-cent") return raw >= CENT ? Number((Math.round(raw / CENT) * CENT).toFixed(2)) : 0;
  return cents(raw, mode);
}

/** Every regulatory line of the trip, in dollars. Levies off by default. */
export function usLevies(notionalUsd, shares, levies = {}, { otc = false, day = today() } = {}) {
  const sec = secFee(notionalUsd, levies.sec || false, day);
  const taf = tafFee(shares, levies.taf || false, day);
  const catBuy = catLeg(shares, levies.cat, otc);
  const catSell = catLeg(shares, levies.cat, otc);
  return { sec, taf, catBuy, catSell, total: plus(sec, taf, catBuy, catSell) };
}

function levyNotes(levies = {}, sell, day) {
  const out = [];
  out.push(
    levies.sec
      ? `SEC ${secRate(day)} de la vente (${levies.sec === "up" ? "au centime supérieur" : levies.sec === "exact" ? "sans arrondi" : "au centime le plus proche"}) : ${sell?.sec ?? "N/A"} $`
      : "SEC non imprimée par le courtier : 0"
  );
  if (!levies.taf) out.push("TAF non imprimée par le courtier : 0");
  else if (tafPerShare(day) === 0) out.push(`TAF à 0 $ : pause FINRA du ${TAF_PAUSE.from} au ${TAF_PAUSE.to} (SR-FINRA-2026-021), puis ${TAF.perShare} $ la part plafonnée à ${TAF.cap} $`);
  else out.push(`TAF ${TAF.perShare} $ la part vendue, plafond ${TAF.cap} $ : ${sell?.taf ?? "N/A"} $`);
  out.push(levies.cat ? `CAT ${levies.cat.perShare} $ la part aux deux jambes` : "CAT non imprimée : 0");
  return out;
}

// ---------------------------------------------------------------- catalogue

const loaded = new Map();
export function loadRows(catalogueUrl) {
  const key = String(catalogueUrl);
  if (!loaded.has(key)) {
    let rows = null;
    if (fs.existsSync(catalogueUrl)) {
      const catalogue = JSON.parse(fs.readFileSync(catalogueUrl, "utf8"));
      rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
      if (rows.length) warmListingIndex(rows);
    }
    loaded.set(key, rows);
  }
  return loaded.get(key);
}

export function findUsListing(rows, { etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue || null : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const pool = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantCurrency || code(m.row.currency || "USD") === wantCurrency);
  if (!wantPlace) return { named, matches: pool };
  const exact = pool.filter(
    (m) =>
      loose(m.row.exchange) === wantPlace ||
      loose(m.row.mic) === wantPlace ||
      (wantVenue && m.venue && m.venue.mic === wantVenue.mic)
  );
  if (exact.length) return { named, matches: exact };
  // "US", "NYSE", "Nasdaq"... all name the one listed tape: a title is one
  // row on its primary listing, so another listed US exchange is that row.
  const tape = wantPlace === "US" || (wantVenue && (isListedUsTape(wantVenue.mic) || wantVenue.mic === "TXSE"));
  const listed = (m) => isListedUsTape(m.venue?.mic ?? m.row.mic) || (m.venue?.mic ?? m.row.mic) === "TXSE";
  return { named, matches: tape ? pool.filter(listed) : [] };
}

// ---------------------------------------------------------------- book

/** The book of one catalogue match: 605 × Q of `bd` on the listed tape (and TXSE), the touch elsewhere. */
export function usBookOf(m, { bd, folder, perShare = null, bp = null }) {
  const key = bd || folder;
  const mic = m.venue?.mic ?? m.row.mic ?? null;
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic,
    currency: m.row.currency || "USD",
    unsourced: m.unsourced,
    broker: key,
    ticker: m.row.ticker,
  });
  const listedMic = book.mic ?? mic;
  const listed = isListedUsTape(listedMic) || listedMic === "TXSE";
  const quoted = listed
    ? usBookPerShare({ broker: key, ticker: m.row.ticker, fallback: book.leaf?.perShare ?? null })
    : book.leaf?.perShare ?? null;
  const marketPerShare = perShare ?? quoted;
  const marketBp = bp ?? (marketPerShare == null ? book.leaf?.bp ?? null : null);
  const q = listed ? qOf(key) : null;
  return { book, mic: listedMic, listed, otc: listedMic === "OTCM", marketPerShare, marketBp, q, key };
}

function bookNote({ listed, marketPerShare, marketBp, q, key }, schedule, listing, m) {
  if (listed && marketPerShare != null) {
    if (q != null) return `carnet 605 × Q ${routingOf(key)?.name || US_BROKERS[key]?.name || key} (Q ${q.toFixed(3)}), ${marketPerShare} $ la part`;
    return `pas de 606 pour ${schedule.rule606 || schedule.folder} : NBBO coté reconstitué, ${marketPerShare} $ la part`;
  }
  if (marketPerShare != null) return `carnet ${marketPerShare} $ la part`;
  if (marketBp != null) return `carnet ${Number(marketBp.toPrecision(4))} bp (${listing.exchange})`;
  return `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`;
}

// ---------------------------------------------------------------- plans

export function makePlanOf(schedule) {
  return (name) => {
    if (!schedule.plans) return null;
    const raw = String(name || schedule.defaultPlan || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    const key = schedule.planAlias?.[raw] || raw || schedule.defaultPlan;
    const plan = schedule.plans[key];
    return plan ? { id: key, ...plan } : null;
  };
}

// ---------------------------------------------------------------- trip

const call = (x, ctx) => (typeof x === "function" ? x(ctx) : x);

function sides(ticket) {
  if (ticket == null) return null;
  if (typeof ticket === "number") return { buy: ticket, sell: ticket };
  if (ticket.buy == null || ticket.sell == null) return null;
  return ticket;
}

export function usRoundTrip(schedule, query = {}) {
  const { etf, place, currency, shares, price, bp = null, perShare = null } = query;
  const planOf = makePlanOf(schedule);
  const plan = schedule.plans ? planOf(query.plan) : null;
  const cash = schedule.cash || "USD";
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    ...(schedule.plans ? { plan: plan?.id ?? query.plan } : {}),
    onlineBuy: true,
    cashCurrency: cash,
    url: schedule.url,
    remark: "",
  };
  if (schedule.plans && !plan) {
    return { ...answer, why: `formule inconnue : ${query.plan} (${Object.keys(schedule.plans).join("|")})` };
  }
  const rows = loadRows(schedule.catalogueUrl);
  if (!rows) {
    return {
      ...answer,
      why: `le catalogue ${schedule.broker} n'existe pas encore : lancer \`node brokers/${schedule.folder}/${schedule.folder}_scraping.mjs\``,
    };
  }
  const { named, matches } = findUsListing(rows, { etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue ${schedule.broker}` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez ${schedule.broker}`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "USD"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const b = usBookOf(m, { bd: schedule.rule606, folder: schedule.folder, perShare, bp });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: b.mic,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency || "USD"),
    brokerExchange: m.row.exchange || null,
  };
  const day = query.day || today();
  const n = Number(shares);
  const p = Number(price);
  const notional = n > 0 && p > 0 ? n * p : null;
  const notionalUsd = notional == null ? null : toUsd(notional, listing.currency);
  const ctx = {
    shares: n,
    price: p,
    notional,
    notionalUsd,
    fractional: n > 0 && !Number.isInteger(n),
    otc: b.otc,
    listed: b.listed,
    listing,
    row: m.row,
    plan,
    day,
  };

  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const held = depositHas(schedule.folder, plan?.id ?? null, listing.currency) || (schedule.deposits || []).includes(listing.currency);
  const fx = schedule.fx || null;
  const fxLabel = fx?.label ?? (fx?.rate != null ? String(Number((fx.rate * 100).toFixed(4))) : null);
  const remark = [call(schedule.remark, ctx), held && fx?.rate != null ? fxRemark(fxLabel, listing.currency) : ""]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" ");
  const basis = call(schedule.basis, ctx) || `barème ${schedule.broker}, relu le ${schedule.readOn}`;
  const shared = {
    ...answer,
    onlineBuy: call(schedule.onlineBuy ?? true, ctx) !== false,
    listing,
    remark,
    bp: b.marketBp,
    perShare: b.marketPerShare,
    via606: b.q != null,
    ...(b.q != null ? { q: b.q } : {}),
    basis,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    ...(fx?.rate != null ? { fxIfConverted: fx.rate } : {}),
  };

  const refused = schedule.tradable ? schedule.tradable(ctx) : null;
  if (refused) return { ...shared, why: refused };
  if (notional == null) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const feeCcy = schedule.feeCurrency || "USD";
  const t = sides(schedule.ticket(ctx));
  const buyUsd = t ? toUsd(t.buy, feeCcy) : null;
  const sellUsd = t ? toUsd(t.sell, feeCcy) : null;
  const ticketUsd = plus(buyUsd, sellUsd);
  const fxUsd = held ? 0 : fx?.rate != null && notionalUsd != null ? notionalUsd * fx.rate * 2 : null;
  const brokerFees = plus(ticketUsd, fxUsd);
  const levies = usLevies(notionalUsd, n, schedule.levies, { otc: b.otc, day });
  const regulators = levies.total;
  const perShareUsd = b.marketPerShare != null ? toUsd(b.marketPerShare, listing.currency) : null;
  const bookUsd =
    perShareUsd != null ? perShareUsd * n : b.marketBp != null && notionalUsd != null ? (notionalUsd * b.marketBp) / 1e4 : null;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, regulators, taxUsd);

  const why =
    t == null
      ? `courtage inconnu pour cette ligne chez ${schedule.broker}`
      : !held && fx?.rate == null
        ? `${listing.currency} n'est pas une devise de dépôt et le change n'est pas publié`
        : bookUsd == null
          ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de source 605 pour ce ticker"}`
          : null;

  const confidence = [
    basis,
    t?.note || null,
    ...levyNotes(schedule.levies, levies, day),
    bookNote(b, schedule, listing, m),
    held
      ? `ligne en ${listing.currency}, devise de dépôt : aucune conversion dans le chiffre`
      : fx?.rate != null
        ? `${listing.currency} n'est pas une devise de dépôt : change ${fxLabel} % dans chaque sens, dans le chiffre`
        : `${listing.currency} n'est pas une devise de dépôt : change non publié`,
    ...(call(schedule.notes, ctx) || []),
  ].filter(Boolean);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why ? { why } : {}),
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: { ticket: t?.buy ?? null, catBuy: levies.catBuy },
    sell: { ticket: t?.sell ?? null, sec: levies.sec, taf: levies.taf, catSell: levies.catSell },
    commission: { buy: t?.buy ?? null, sell: t?.sell ?? null, currency: feeCcy, eachWay: true, ...(plan ? { plan: plan.id } : {}) },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(ticketUsd, 6),
      bourse: finite(regulators, 6),
      taxes: finite(taxUsd, 6),
      ...(held ? {} : { change: finite(fxUsd, 6) }),
    },
    confidence: confidence.join(" ; "),
  };
}

// ---------------------------------------------------------------- cli

export function printCli(callerUrl, roundTrip, schedule = null) {
  let called = false;
  try {
    called = callerUrl === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule") && schedule) {
    const { ticket, remark, basis, notes, tradable, onlineBuy, ...rest } = schedule;
    console.log(JSON.stringify({ ...rest, catalogueUrl: String(rest.catalogueUrl), sec: SEC, taf: TAF, tafPause: TAF_PAUSE, tafToday: tafPerShare(), q: qOf(schedule.rule606 || schedule.folder) }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!etf) {
    console.error("usage : node <file> <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--plan=id] [--json] [--schedule]");
    process.exitCode = 2;
    return;
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : null,
    ...(flag("plan") ? { plan: flag("plan") } : {}),
  });
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) console.log(out.alternatives.join("\n"));
    return;
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange || ""}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}, ${(l.type || "").toLowerCase()}${out.plan ? `  [${out.plan}]` : ""}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} parts à ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`aller-retour     : ${out.usd == null ? `N/A — ${out.why}` : `${out.usd} $`}`);
    console.log(`frais du courtier: ${out.brokerFees ?? "N/A"} $`);
    const parts = out.parts || {};
    if (parts.marché != null) console.log(`  carnet         : ${parts.marché} $`);
    if (parts.courtage != null) console.log(`  courtage       : ${parts.courtage} $`);
    if (parts.bourse) console.log(`  régulateur     : ${parts.bourse} $`);
    if (parts.taxes) console.log(`  taxes          : ${parts.taxes} $`);
    if (parts.change) console.log(`  change         : ${parts.change} $`);
  } else if (out.why) {
    console.log(`aller-retour     : N/A — ${out.why}`);
  }
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

// ---------------------------------------------------------------- self-test

if (import.meta.url === `file://${process.argv[1]}` && process.argv.includes("--selftest")) {
  const assert = (cond, msg) => {
    if (!cond) {
      console.error(`ÉCHEC : ${msg}`);
      process.exitCode = 1;
    } else console.log(`ok  ${msg}`);
  };
  assert(cents(0.0001, "up") === 0.01 && cents(0.0249, "up") === 0.03, "arrondi au centime supérieur");
  assert(cents(0.004, "penny") === 0.01 && cents(0.004, "nearest") === 0, "penny / nearest");
  assert(secFee(1000, "up", "2026-10-26") === 0.03, "SEC 1 000 $ = 0,0206 → 0,03 $");
  assert(secFee(1000, "up", "2026-03-01") === 0, "SEC à 0 avant le 2026-04-04");
  assert(tafFee(100, "up", "2026-10-26") === 0, "TAF en pause au T4 2026");
  assert(tafFee(100, "up", "2027-01-05") === 0.02 && tafFee(1e6, "up", "2027-01-05") === 9.79, "TAF 2027 et plafond");
  assert(catLeg(10, { perShare: 0.000009 }) === 0 && catLeg(2000, { perShare: 0.000009 }) === 0.02, "CAT sous le centime = 0");
  const base = {
    broker: "WellsTrade (test)",
    folder: "wellstrade",
    catalogueUrl: new URL("wellstrade-parsed.json", import.meta.url),
    url: "https://example.invalid/",
    readOn: "2026-10-26",
    deposits: ["USD"],
    ticket: () => 0,
    basis: "test",
  };
  const a = usRoundTrip({ ...base, rule606: "apex", levies: { sec: "up", taf: "up" } }, { etf: "US0378331005", place: "XNAS", currency: "USD", shares: 4, price: 250, day: "2026-10-26" });
  const expBook = usBookPerShare({ broker: "apex", ticker: "AAPL" }) * 4;
  assert(a.listing?.ticker === "AAPL" && Math.abs(a.parts.marché - expBook) < 1e-6, `AAPL : carnet 605 × Q Apex ${a.parts.marché}`);
  assert(a.parts.bourse === 0.03 && Math.abs(a.usd - (expBook + 0.03)) < 1e-6, `AAPL : total ${a.usd} = carnet + SEC 0,03`);
  const c = usRoundTrip({ ...base, rule606: null, ticket: () => ({ buy: 4.95, sell: 4.95 }) }, { etf: "SPY", place: "ARCX", currency: "USD", shares: 1.5, price: 660 });
  assert(c.via606 === false && c.brokerFees === 9.9 && c.usd != null, `SPY sans 606 : NBBO coté, frais ${c.brokerFees}, total ${c.usd}`);
  const d = usRoundTrip({ ...base, folder: "nodeposit", deposits: ["EUR"], feeCurrency: "EUR", ticket: () => 1, fx: { rate: 0.0025 } }, { etf: "AAPL", currency: "USD", shares: 4, price: 250 });
  assert(Math.abs(d.parts.change - 5) < 1e-9 && d.parts.change != null, `change forcé 0,25 % × 2 sur 1 000 $ = ${d.parts.change}`);
  const e = usRoundTrip({ ...base, folder: "nodeposit", deposits: ["USD"], fx: { rate: 0.005 } }, { etf: "AAPL", currency: "USD", shares: 4, price: 250 });
  assert(e.remark === "FX 0.5% when cash ≠ USD." && e.parts.change === undefined, `remarque de change : « ${e.remark} »`);
  const f = usRoundTrip({ ...base, folder: "nodeposit", deposits: ["EUR"], fx: { unpublished: true } }, { etf: "AAPL", currency: "USD", shares: 4, price: 250 });
  assert(f.usd == null && /change n'est pas publié/.test(f.why), "change forcé non publié : N/A");
  const g = usRoundTrip({ ...base, ticket: () => null }, { etf: "AAPL", currency: "USD", shares: 4, price: 250 });
  assert(g.usd == null && g.brokerFees == null, "courtage inconnu : N/A");
  const tx = usRoundTrip({ ...base, catalogueUrl: new URL("../moneylion/moneylion-parsed.json", import.meta.url), rule606: "drivewealth" }, { etf: "US29273V1008", place: "TXSE", currency: "USD", shares: 50, price: 18 });
  assert(tx.perShare != null && tx.usd != null, `TXSE lit le 605 : ${tx.perShare} $ la part`);
  const otc = usRoundTrip({ ...base, catalogueUrl: new URL("../webullmexico/webullmexico-parsed.json", import.meta.url), rule606: "webull" }, { etf: "US3135861090", place: "OTC Markets", currency: "USD", shares: 100, price: 10 });
  assert(otc.bp != null && otc.via606 === false && otc.usd != null, `OTC garde le touch : ${otc.bp} bp`);
  const planned = usRoundTrip({ ...base, plans: { basic: { label: "Basic", each: 0 }, pro: { label: "Pro", each: 1 } }, defaultPlan: "basic", ticket: (x) => x.plan.each }, { etf: "AAPL", shares: 4, price: 250, plan: "pro" });
  assert(planned.plan === "pro" && planned.brokerFees === 2, "formule par query.plan");
}
