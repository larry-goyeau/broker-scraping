// What one round trip costs at Raiffeisen banka a.d. Beograd in mTrader
// (Moja mBanka): buy n shares or ETF units and sell them back, in dollars.
// Twelve foreign markets (euro and US dollar lines) and the Belgrade Stock
// Exchange (dinar lines, Belex 15 and Belex line constituents).
//
// Read on 2026-10-23.
//   https://www.raiffeisenbank.rs/sr/stanovnistvo/digitalne-usluge/mtrader.html
//     "Koje su naknade za trgovanje?": brokerage on the market value of each
//     transaction, and custody quarterly on the portfolio.
//   https://www.raiffeisenbank.rs/content/dam/rbi/retail/eu/rs/common/tarife-i-pregled-usluga/tarife/stanovnistvo/tarife-naknada-i-tro%C5%A1kova-banke-za-usluge-fizi%C4%8Dkim-licima-standard/tarife-stanovnistvo-standard-15.pdf.coredownload.pdf
//     Tarifa – STANDARD, "Tarife po poslovima HOV", the same figures.
//
//   Foreign markets, "Kupoprodaja i saldiranje finansijskih instrumenata
//   kojima se trguje na tržištu", each buy and each sell:
//     SAD-a, Nemačke i Austrije            0,50%, min EUR 10
//     Francuske, Italije i Španije         0,70%, min EUR 20
//     ostalim tržištima                    0,50%, min EUR 20
//   so US (NYSE, Nasdaq, NYSE Arca, NYSE American, Cboe BZX), Xetra,
//   Frankfurt and Vienna take the first line; Paris, Milan and Madrid the
//   second; Amsterdam, Brussels, Helsinki and Lisbon the third. The tariff's
//   note: "Prilikom trgovanja stranim hartijama od vrednosti u naknade su
//   uključeni svi zavisni troškovi trgovanja i saldiranja transakcija sa HoV
//   trećih lica" (foreign fees include every third-party trading and
//   settlement cost), so nothing is added for exchanges, clearing or US
//   SEC/TAF/CAT. A financial-transaction tax is a tax, not a trading cost,
//   so a French, Italian or Spanish line still takes the tax map's rate.
//   The EUR minimum on a dollar line is its dollar equivalent.
//
//   Belgrade, from the mTrader page: "brokerska naknada iznosi 0.5%, a
//   naknada banke za saldiranje iznosi 0.1%. Dodatno se naplaćuju naknade
//   Beogradske berze i CRHoV" (tariff: 3.1 equity trading 0,5%; 2.2
//   transaction charge for clearing/custody/brokerage clients 0,10%; note *
//   "u naknade nisu uključeni zavisni troškovi trgovanja i saldiranja ...
//   trećih lica"). Those two third-party fees, each side, from their own
//   tariffs:
//     Belgrade Stock Exchange, Tariff Rules (consolidated, 04/2 no.
//     5095-2/24), Tariff No. 22, secondary trading in shares 0.10%, paid by
//     each member that concluded the transaction.
//       https://www.belex.rs/files/regulativa/TARIFNIK%20BERZE%20-%202024%20-%20PRE%C4%8CI%C5%A0%C4%86EN%20TEKST-%20ENG%20-%20SA%20OBJAVOM.pdf
//     Central Securities Depository (CRHoV), Pravilnik o tarifi as amended
//     from 2026-04-17, 6.1.1 "Kupoprodajni poslovi zaključeni na
//     regulisanom tržištu/MTP/OTP za akcije": 0,055% of the transaction,
//     not less than RSD 200, charged to both sides.
//       https://crhov.rs/Content/documents/1526/Izmene%20i%20dopune%20Pravilnika%20o%20tarifi%20koje%20se%20primenjuju%20od%2017.04.2026.pdf
//
//   Custody on foreign shares and ETFs (tariff 1.4): 0.50% a year + PDV
//   under EUR 100,000, 0.4% to 300,000, 0.3% above. A real cost, in the
//   remark of the foreign lines. Domestic securities accounts are free.
//
// US book: Raiffeisen banka Beograd names no US dealer. Its parent's
// execution policy (Raiffeisen Bank International, v2.4, June 2024, annex 2)
// lists Interactive Brokers LLC among the intermediaries it routes through,
// the only US broker-dealer named there, so the US lines take that firm's
// Rule 606 (owner's choice, 2026-10-23).
//   https://rbinternational.com/content/dam/rbi/ho/home/legal/business-terms/wag-mifid/best-execution-policy-rbi-layout-v2-4-english.pdf.coredownload.pdf
//
// Cash: purpose accounts in RSD, EUR and USD (deposits.mjs), and a buy is
// paid "u valuti trgovanja", so no line is converted in the number. The
// bank's exchange-rate list (https://www.raiffeisenbank.rs/sr/common/kursna-lista.html,
// list 245 of 2026-10-22, devize): EUR 114.456 / 120.446, USD 99.2338 /
// 109.575 dinars. Half the buy/sell gap over the mid is the remark: 2.55%
// for euro, 4.95% for dollars. A dinar line is paid from euro at the euro
// figure.
//
// fx.mjs has no RSD rate yet, so a Belgrade total stays unknown until it
// has one (the Belex book is not stored either).
//
//   node brokers/raiffeisenrs/raiffeisenrs_cost.mjs SAP XETR EUR --shares=4 --price=215
//   node brokers/raiffeisenrs/raiffeisenrs_cost.mjs AAPL XNAS USD --shares=4 --price=250
//   node brokers/raiffeisenrs/raiffeisenrs_cost.mjs MC XPAR EUR --shares=2 --price=520
//   node brokers/raiffeisenrs/raiffeisenrs_cost.mjs NIIS BELEX RSD --shares=100 --price=1000
//   node brokers/raiffeisenrs/raiffeisenrs_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { isListedUsTape, listingKey, resolveVenue, spreadLeaf } from "../../spreads/venues.mjs";
import { spreads } from "../../spreads/book.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const FOLDER = "raiffeisenrs";
const CATALOGUE = new URL("raiffeisenrs-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.raiffeisenbank.rs/sr/stanovnistvo/digitalne-usluge/mtrader.html",
  tariff:
    "https://www.raiffeisenbank.rs/content/dam/rbi/retail/eu/rs/common/tarife-i-pregled-usluga/tarife/stanovnistvo/tarife-naknada-i-tro%C5%A1kova-banke-za-usluge-fizi%C4%8Dkim-licima-standard/tarife-stanovnistvo-standard-15.pdf.coredownload.pdf",
  belex: "https://www.belex.rs/files/regulativa/TARIFNIK%20BERZE%20-%202024%20-%20PRE%C4%8CI%C5%A0%C4%86EN%20TEKST-%20ENG%20-%20SA%20OBJAVOM.pdf",
  crhov: "https://crhov.rs/Content/documents/1526/Izmene%20i%20dopune%20Pravilnika%20o%20tarifi%20koje%20se%20primenjuju%20od%2017.04.2026.pdf",
  fxList: "https://www.raiffeisenbank.rs/sr/common/kursna-lista.html",
  fxListOn: "2026-10-22",
  readOn: "2026-10-23",
  entity: "Raiffeisen banka a.d. Beograd, mTrader",
  rule606: "Rule 606 d'Interactive Brokers LLC (intermédiaire de la politique d'exécution de RBI ; choix du propriétaire)",
};

// Foreign groups, each side, minimum in euro.
const FOREIGN = {
  core: { rate: 0.005, minEur: 10, label: "SAD, Nemačka, Austrija" },
  ftt: { rate: 0.007, minEur: 20, label: "Francuska, Italija, Španija" },
  other: { rate: 0.005, minEur: 20, label: "ostala tržišta" },
};
const GROUP_OF_MIC = {
  XNAS: "core", XNYS: "core", ARCX: "core", XASE: "core", BATS: "core",
  XETR: "core", XFRA: "core", XWBO: "core",
  XPAR: "ftt", XMIL: "ftt", XMAD: "ftt",
  XAMS: "other", XBRU: "other", XHEL: "other", XLIS: "other",
};
// Belgrade, each side.
const BELGRADE = { brokerage: 0.005, settlement: 0.001, exchange: 0.001, csd: 0.00055, csdMinRsd: 200 };

const CUSTODY = "Custody is 0.5% a year plus VAT.";
// Buy / sell, dinars per unit, list 245 of 2026-10-22.
const KURS = { EUR: [114.456, 120.446], USD: [99.2338, 109.575] };
const half = ([buy, sell]) => (((sell - buy) / (sell + buy)) * 100).toFixed(3);
const fxNote = (currency) => {
  const cash = listingCash(currency);
  return fxRemark(half(KURS[cash] ?? KURS.EUR), currency);
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();
const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(12));
};
const toCcy = (amount, from, to) => {
  if (code(from) === code(to)) return Number(amount);
  const usd = toUsd(amount, from);
  const per = usdPer(to);
  return usd == null || !(per > 0) ? null : usd / per;
};

const isBelgrade = (row) => code(row?.currency) === "RSD" || /belgrade|belex|beogr/i.test(String(row?.exchange || ""));
const BELGRADE_CODES = new Set(["XBEL", "BELEX", "BELGRADE", "BELGRADESTOCKEXCHANGE", "BSE"]);

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (loose(m.row.exchange) === wantPlace || loose(m.row.mic) === wantPlace) return true;
      if (isBelgrade(m.row)) return BELGRADE_CODES.has(wantPlace);
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return false;
    })
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Raiffeisen Beograd n'existe pas encore : lancer `node brokers/raiffeisenrs/raiffeisenrs_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Raiffeisen Beograd` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Raiffeisen Beograd`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: FOLDER,
    ticker: m.row.ticker,
  });
  const listing = {
    isin: code(m.row.isin) || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: code(m.row.type) || null,
    mic: book.mic ?? m.venue?.mic ?? null,
    exchange: m.venue?.name ?? m.unsourced?.name ?? m.row.exchange ?? null,
    currency: code(m.row.currency),
    brokerExchange: m.row.exchange || null,
  };
  const belgrade = isBelgrade(m.row);
  const group = belgrade ? null : GROUP_OF_MIC[listing.mic] ?? null;
  const rule = group ? FOREIGN[group] : null;
  const us = isListedUsTape(listing.mic);

  const quoted = us ? usBookPerShare({ broker: "interactivebrokers", ticker: listing.ticker, fallback: book.leaf?.perShare ?? null }) : null;
  const marketBp = us ? (bp ?? null) : (bp ?? book.leaf?.bp ?? null);
  const marketPerShare = perShare ?? (us ? quoted : marketBp != null ? null : book.leaf?.perShare ?? null);
  const tax = taxesOf(listing.isin);
  const taxPct = Object.values(taxRates(tax)).reduce((s, r) => s + r, 0);
  const cash = listingCash(listing.currency);
  const held = depositHas(FOLDER, null, cash);
  const remark = belgrade ? fxNote(listing.currency) : [CUSTODY, fxNote(listing.currency)].join(" ");
  const shared = {
    ...answer,
    listing,
    cashCurrency: held ? cash : "EUR",
    remark,
    bp: marketBp,
    perShare: marketPerShare,
    tax,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency) },
    fxIfConverted: 0,
    basis: belgrade
      ? `page mTrader et Tarifa STANDARD relues le ${SCHEDULE.readOn} : Belgrade 0,5 % de courtage + 0,1 % de règlement de la banque ; ` +
        `Bourse de Belgrade 0,10 % (tarif n° 22) ; CRHoV 0,055 %, minimum 200 RSD (6.1.1), chaque sens`
      : `page mTrader et Tarifa STANDARD relues le ${SCHEDULE.readOn} : ${rule ? `${(rule.rate * 100).toFixed(2)} %, minimum ${rule.minEur} € (${rule.label})` : "marché sans ligne"}, ` +
        `frais de tiers compris, chaque sens` + (us ? ` ; ${SCHEDULE.rule606}` : ""),
  };
  if (!belgrade && !rule) {
    return { ...shared, why: `${listing.exchange} n'a pas de ligne dans le barème mTrader` };
  }
  if (!held) {
    return { ...shared, why: `Raiffeisen Beograd ne tient pas de compte en ${cash}` };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  let brokerSide = null;
  let leviesSide = null;
  let floorBites = false;
  if (belgrade) {
    brokerSide = notional * (BELGRADE.brokerage + BELGRADE.settlement);
    const csd = Math.max(notional * BELGRADE.csd, BELGRADE.csdMinRsd);
    leviesSide = notional * BELGRADE.exchange + csd;
  } else {
    const min = toCcy(rule.minEur, "EUR", listing.currency);
    if (min != null) {
      brokerSide = Math.max(notional * rule.rate, min);
      floorBites = notional * rule.rate < min;
    }
    leviesSide = 0;
  }
  const brokerFees = brokerSide == null ? null : dollars(brokerSide * 2, listing.currency);
  const leviesUsd = dollars(leviesSide * 2, listing.currency);
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: us && marketPerShare != null ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (amount) => dollars(amount, us ? "USD" : listing.currency),
  });
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const usd = plus(bookUsd, brokerFees, leviesUsd, taxUsd);
  const why = [
    notionalUsd == null ? `fx.mjs n'a pas de cours ${listing.currency}` : null,
    bookUsd == null ? `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` : null,
  ].filter(Boolean);
  const confidence = [
    shared.basis,
    belgrade
      ? `côté banque ${(brokerSide).toFixed(2)} RSD, Bourse et CRHoV ${leviesSide.toFixed(2)} RSD par sens`
      : floorBites
        ? `le minimum de ${rule.minEur} € mord (${(notional * rule.rate).toFixed(2)} ${listing.currency} calculés)`
        : `${(rule.rate * 100).toFixed(2)} % de ${notional.toFixed(2)} ${listing.currency} par sens`,
    taxPct ? `taxe ${(taxPct * 100).toFixed(2)} % depuis taxMap.mjs, en sus du courtage` : "aucune taxe de transaction dans taxMap.mjs",
    "ligne dans une devise de dépôt : pas de change ; demi-écart de la liste de cours de la banque en remarque",
    belgrade ? "garde des titres domestiques gratuite" : "garde 0,5 % / an + TVA en remarque",
    marketPerShare != null
      ? `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ].join(" ; ");

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    ...(why.length ? { why: why.join(" ; ") } : {}),
    commission: belgrade
      ? { rate: BELGRADE.brokerage + BELGRADE.settlement, eachWay: true, currency: "RSD", thirdParty: { exchange: BELGRADE.exchange, csd: BELGRADE.csd, csdMinRsd: BELGRADE.csdMinRsd } }
      : { rate: rule.rate, min: rule.minEur, minCurrency: "EUR", eachWay: true, currency: listing.currency, thirdPartyIncluded: true },
    trade: { shares: n, price: p, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      courtage: finite(brokerFees, 6),
      bourse: finite(leviesUsd, 6),
      taxes: finite(taxUsd, 6),
    },
    confidence,
  };
}

function printCli() {
  let called = false;
  try {
    called = import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    called = false;
  }
  if (!called) return;
  const flag = (name) => {
    const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };
  if (process.argv.includes("--schedule")) {
    console.log(JSON.stringify({ ...SCHEDULE, foreign: FOREIGN, groupOfMic: GROUP_OF_MIC, belgrade: BELGRADE, kurs: KURS }, null, 2));
    return;
  }
  const [etf, place, currency] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  if (!etf) {
    console.error("usage : node brokers/raiffeisenrs/raiffeisenrs_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });
  console.log(JSON.stringify(out, null, 2));
}

printCli();
