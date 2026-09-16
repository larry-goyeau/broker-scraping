// What one round trip costs at Quantfury: buy n shares at price p — or a coin
// for a given number of dollars — and sell the line back at once. The answer is
// one number in dollars, `usd`, and beside it `brokerFees`, the part Quantfury
// bills.
//
// Quantfury bills nothing, and says so in the one place that binds it: the
// client agreement of 5 January 2026, §13. The Products and Services "are
// provided without commissions, leverage fees, and/or any other kind of fee to
// clients; and all trading positions are available to trade and invest at the
// real time spot bid and ask prices of the relevant exchange where the Asset is
// trading when opening, reducing, and/or closing trades, in each case as
// technically achievable by Quantfury using its best commercial efforts". That
// last clause is quoted here because this file used to cut it: both halves of
// the promise, the zero and the untouched price, are best efforts and not a
// guarantee.
//
// So the broker's share of a trip is 0 and the whole bill is the book the
// client crosses: buy at the ask, sell at the bid. That is not a cost absorbed,
// it is the business model — Quantfury pairs a client's buy at the ask with
// another client's sell at the bid and keeps the difference, on prices it does
// not widen. Which makes this the one file on the shelf where what a broker
// bills and what it earns differ by the whole amount. `brokerFees` is 0 while
// `usd` is not, and both are right: the spread belongs to whoever quoted it,
// and the client would have crossed the same book anywhere.
//
// One half of that promise can be checked without placing an order, and it is
// the half everything else rests on. The real-time hub behind
// trading.quantfury.com streams the bid and ask the client is actually shown,
// and on 14 September 2026 they land on the exchanges' own to the cent:
// BTC/USDT quoted 78 578.02 / 78 578.03 at Quantfury and 78 578.02 / 78 578.03
// at Binance, BTC/USD 78 560.01 / 78 560.02 at Quantfury and the same at
// Coinbase, with SOL, XRP and LTC matching on both tapes too. Not one tick of
// widening, on either venue. The "real time spot bid and ask prices of the
// relevant exchange" of §13 is measured here rather than merely promised — on
// crypto, where the reference book is public, and at that one instant.
//
// What is deliberately not zero:
//
//   taxes       A transfer tax follows the instrument, not the price list.
//               British stamp duty is owed by whoever acquires the shares and
//               the French FTT by whoever acquires the line, wherever the two
//               orders met. Quantfury publishes no tax line and §56 leaves
//               every tax to the client, so these rates come from the tax map,
//               not from a charge anyone has seen debited. On a London share
//               the 0.5 % dwarfs the book many times over — which is why the
//               identity of the line matters more here than anywhere, and why
//               the second weak joint below is the serious one.
//
//               Quantfury's 25 Italian and 29 Spanish lines are charged none,
//               and that is now a reading rather than a silence. The map reads
//               Trading212's ex-ante disclosure, and on the Spanish 0.2 % that
//               reading is negative, not absent: Bolsa de Madrid was swept line
//               by line, 139 issuers including Iberdrola, Santander, Telefónica,
//               Repsol and ACS, and not one comes back carrying a purchase tax.
//               It covers all 29 Spanish lines here. The Italian 0.1 % had
//               never been asked at all, because Trading212's Borsa Italiana
//               shelf is 345 foreign ETFs that owe none, and the eleven Italian
//               issuers it does carry sit on Xetra, gettex, SIX, NYSE and
//               NASDAQ — outside the venues the sweep walks in full, which is
//               why `taxes.mjs` gained `--isin=`. Asked that way, Intesa, Enel,
//               Eni, Generali, Leonardo and Prada all price with no Italian
//               tax, against controls that do return one: 0.4 % on
//               TotalEnergies, 0.5 % on BT Group. Buying an Italian share off
//               its home tape is exactly what Quantfury does through Cboe
//               Europe, so the reading transfers. Six of the 25 are covered by
//               it; the other nineteen are not on Trading212's shelf and stay
//               unasked. This header used to call all of them taxed.
//
// What is zero and sourced, rather than merely unseen:
//
//   commission  §13 above, and the conditions page: no trade commission.
//   portage     No overnight or borrowing fee, even with leverage. The
//               catalogue holds only unleveraged lines anyway — the scraper
//               keeps t=1 shares, t=5 spot crypto and t=6 funds, and drops
//               the futures and currency contracts.
//   SEC / TAF   Those are levied on US exchanges and FINRA members for covered
//               sales. Quantfury Trading Americas is a Bahamian dealer
//               (SIA-F204, DARE-DAB-027) matching its own clients, not a US
//               broker-dealer passing a fee through, and it publishes no such
//               pass-through. Unlike stamp duty, this is a charge on the venue,
//               not a tax on the buyer.
//
// And the zero that was assumed, then read as half true, and is now measured
// back to zero where it counts:
//
//   change      Nothing in the agreement or on the conditions page mentions
//               converting between the balance a client holds and the currency
//               a line is quoted in, and this file wrote 0 on that silence.
//               The silence was the wrong place to look. A signed-in account's
//               own `cashAccount` payload prices every wallet Quantfury offers,
//               as `commissionOnConvertPercent`, and on 14 September 2026 it
//               reads 0 % on USD, EUR, GBP and CHF, 1 % on BRL, MXN and CLP,
//               1.5 % on COP and 4 % on ARS. Every crypto wallet reads 0.
//
//               Read that way it looked like the largest number in this file:
//               the 70 Brazilian and 11 Mexican lines would cost a
//               dollar-funded reader 1 % going in and 1 % coming out, 200 bp
//               against a book of ten. What it did not say is whether a tariff
//               written for converting a wallet by hand also lands on an order
//               in a foreign-quoted line. OANDA's silence on that same point
//               had turned out to cost 0.52 % a leg, so the question was worth
//               a funded trip rather than a guess.
//
//               The trip was run on 15 September 2026, B3 open, the account
//               holding dollars only: ten PETR4 bought at R$49.12 and sold
//               fifty-four seconds later at R$49.11, R$491.20 a side, about
//               $95.80. The balance went from $350.04 to $350.02. Two cents,
//               and the position sheet accounts for all of them — minus R$0.10,
//               the one-tick round trip, converted. The wallet tariff would
//               have taken about $1.92 of the same trip. It did not take a
//               cent.
//
//               So trading a line quoted in a currency the account does not
//               hold is free, and `usd` is right to carry no conversion for any
//               of the 2 030 lines. `commissionOnConvertPercent` is still real
//               and still worth reading, but it prices a different act: moving
//               a balance between wallets deliberately. It stays in
//               `fxIfConverted`, described as what it is, and out of the total
//               — not because the funding currency is unknown, but because a
//               round trip does not trigger it.
//
// Two weak joints, both in the catalogue rather than in the tariff:
//
//   la place    Quantfury names an operator, not a tape, and for all 281 of the
//               European lines the operator it names is "Cboe Europe", with a
//               Chi-X suffix on the ticker to match. `spread.json` collects no
//               Cboe Europe book at all, so the venue shown to the reader is
//               the one Quantfury names and the book priced is the primary's,
//               standing in: 232 of the 281 carry one, median 8.2 bp — Paris
//               9.2, Amsterdam 7.8, Xetra 10.6, Milan 10.7 — and the nine above
//               50 bp sit on the thin regional tapes, Munich, gettex and
//               Vienna, where a small name really is that wide. How far Cboe
//               Europe's own touch sits from the primary's used to be the gap
//               here, and `quantfury-probe.mjs` closed it on 15 September 2026
//               without placing an order: the price endpoint publishes the bid
//               and ask the client is shown, so the two books were set side by
//               side on all 281 lines. Quantfury's own touch comes to a median
//               8.93 bp against the stand-in's 8.16 — a gap of 0.65 bp, and the
//               exchange rate applied sits 0.17 bp off the pair's mid.
//
//               So the stand-in is a fair proxy at the median, and the promise
//               of §13 holds on equities as it did on crypto. It is not free of
//               dispersion: of the 232 lines with a book in basis points, 158
//               are wider at Quantfury and 74 tighter, so the figure is a cloud
//               centred just above zero rather than an identity. The tail is
//               where the stand-in is worst, not Quantfury — the five biggest
//               gaps, ACE 31 bp over Milan, HLAG and BC8 28 over Munich, Rubis
//               27 over Paris, all compare against thin secondary tapes. The
//               probe has to run in session, because outside it every line
//               comes back with the bid equal to the ask.
//
//               The same reading names the venue more precisely than the
//               catalogue does: 57 of the short names carry a `.CHI` suffix and
//               2 a `.DXE`, which is Cboe Europe's Chi-X and DXE order books,
//               and 57 more carry `.BS`. The other 156 stay mute.
//
//   l'ISIN      Quantfury publishes none: all 1 981 are the scraper's own
//               ticker match against the root CSVs. That match used to waive
//               its name floor whenever a ticker landed on a venue the operator
//               reached, and since "Cboe Europe" reached into the LSE namespace
//               a short continental ticker kept coming back British: DIA was
//               Dialight and not DiaSorin, ITX Itaconix and not Inditex, TRN
//               Trainline and not Terna. Each carried the wrong book, and the
//               wrong treasury with it — a 0.5 % stamp duty charged to three
//               Italian companies. `quantfury_scraping.mjs` now leaves London
//               out of what "Cboe Europe" expands to and enforces the floor
//               there, which repaired six lines and dropped eight. Seven of the
//               eight were wrong and are better absent; the eighth, DHL Group,
//               is a real loss, since the CSVs still call it Deutsche Post and
//               no name score bridges that. The size of the repair is the
//               measure of what it was: the worst European book was 2 754 bp
//               and is 169 bp, and the lines owing British stamp duty went from
//               four to one. What remains is that the identity is still
//               inferred, and a rename can still cost a line.
//
// Out of the round trip on purpose: the dividend a long holder receives (§57),
// the interest a balance does not earn (§74), and funding in or out. None of
// them is a cost of buying and selling at once.
//
// A client owns what he buys without leverage and may transfer it out to an
// approved brokerage (§11), so this is a real holding and the transfer taxes
// above really are owed. What no column can hold is the other side of a zero
// tariff: §38, §52, §60, §66 and §73 let Quantfury reverse positions and seize
// or reduce a balance at its own discretion, and §37 bars residents of the
// United States, Canada, the Bahamas and the British Virgin Islands outright.
//
//   https://quantfury.com/trading-and-investing-conditions/
//   https://quantfury.com/business-model/
//   https://quantfury.com/quantfury-client-agreement.pdf
//
//   node quantfury/quantfury_cost.mjs AAPL --shares=10 --price=230
//   node quantfury/quantfury_cost.mjs SHEL LSE EUR --shares=100 --price=30
//   node quantfury/quantfury_cost.mjs AALB EURONEXT EUR --shares=10 --price=35
//   node quantfury/quantfury_cost.mjs BTC --amount=1000
//   node quantfury/quantfury_cost.mjs --schedule
//   node quantfury/quantfury-probe.mjs            (la touche Cboe Europe, en séance)
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { cryptoId, listingKey, resolveVenue, spreadLeaf } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("quantfury-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  conditions: "https://quantfury.com/trading-and-investing-conditions/",
  model: "https://quantfury.com/business-model/",
  agreement: "https://quantfury.com/quantfury-client-agreement.pdf",
  agreementVersion: "2026-01-05",
  readOn: "2026-09-14",
  entity: "Quantfury Trading Americas Limited",
  regulator: "Securities Commission of The Bahamas",
  licences: ["SIA-F204", "DARE-DAB-027"],
  groupUk: "Quantfury Trading UK Limited, FCA 577611",
  barred: ["US", "CA", "BS", "VG"],
};

// Every one of these is a published zero, not an unknown treated as free. They
// are named rather than inlined so `--schedule` can print the barème as the
// other brokers print theirs, and so that a future charge has a place to land.
const COMMISSION_EACH = 0;
const TICKET = 0;
const BORROWING = 0;
const SEC_RATE = 0;
const TAF_PER_SHARE = 0;

// This one used to be inferred and is now read. The account's own cashAccount
// payload prices every wallet Quantfury offers, as `commissionOnConvertPercent`
// — zero on the currencies this shelf trades in on both sides of the Atlantic,
// and far from zero in Latin America. It is charged entering and again leaving,
// so a round trip pays twice what stands here. Crypto wallets all read 0.
const CONVERT_PERCENT = {
  USD: 0,
  EUR: 0,
  GBP: 0,
  CHF: 0,
  TRY: 0,
  USDT: 0,
  BRL: 0.01,
  MXN: 0.01,
  CLP: 0.01,
  COP: 0.015,
  ARS: 0.04,
};

// A currency the payload did not price stays N/A rather than falling back to
// the free that this file wrongly assumed for all of them.
const convertRate = (currency) => CONVERT_PERCENT[String(currency || "").toUpperCase()] ?? null;

const US_MICS = new Set(["XNAS", "XNYS", "ARCX", "XASE", "BATS"]);
const US_EX = new Set(["NASDAQ", "NYSE", "AMEX", "ARCA", "CBOE", "BATS", "OTC"]);

// The operators Quantfury prints beside a line in its own catalogue string.
const OPERATORS = ["Cboe Europe", "NASDAQ", "NYSE", "AMEX", "B3", "BMV", "BIVA", "Binance", "Coinbase", "CME", "ICE"];
const CBOE_EUROPE = "Cboe Europe";

// `quantfury-probe.mjs` in session, no order placed: the touch Quantfury shows
// against the primary book standing in for it, line by line. Written out to
// `quantfury-probe.json`.
const PROBE = {
  on: "2026-09-15",
  lines: 281,
  withStandIn: 232,
  quantfuryBp: 8.93,
  standInBp: 8.16,
  gapBp: 0.65,
  wider: 158,
  tighter: 74,
  rateOffBp: 0.17,
};

// The one funded round trip in this file, and the only thing that could settle
// whether trading a foreign-quoted line pays the wallet tariff. Account funded
// in dollars, line quoted in reais, both legs a minute apart on an open B3.
const TRIP = {
  on: "2026-09-15",
  ticker: "PETR4",
  venue: "B3",
  currency: "BRL",
  shares: 10,
  buy: 49.12,
  sell: 49.11,
  notionalLocal: 491.2,
  pnlLocal: -0.1,
  balanceBefore: 350.04,
  balanceAfter: 350.02,
  walletTariff: 0.01,
  // R$491.20 through this file's own rate. The comparison is what matters:
  // two legs of the wallet tariff would have been about $1.92, not $0.02.
  notionalUsd: 95.8,
  costUsd: 0.02,
};

const CRYPTO_REMARK = "Binance / Coinbase spread not published here.";

// Le change reste hors du total parce qu'il dépend de la devise du solde, que
// ce fichier ne connaît pas ; il est dit ici, et d'autant plus fort qu'il pèse.
// Les pays barrés, eux, relèvent de l'éligibilité et non du prix d'un
// aller-retour : ils restent dans `--schedule`.
function remarkOf({ crypto, marketBp, listing, convert }) {
  const lines = [];

  if (convert > 0) {
    lines.push(
      `Trading in ${listing.currency} from a dollar balance is free, measured. ` +
        `The card's ${(100 * convert).toFixed(2)}% only hits a wallet converted by hand.`
    );
  }

  if (crypto && marketBp == null) lines.push(CRYPTO_REMARK);
  return lines.join("\n");
}

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const isCrypto = (row) => row?.type === "CRYPTO" || /^CRYPTO$/i.test(String(row?.exchange || ""));
const cryptoBase = (ticker) => String(ticker || "").split("/")[0].toUpperCase();

// What Quantfury itself said the venue was, read off the catalogue string it
// was scraped from. The row's `exchange` is the scraper's answer, not this one.
const saidVenue = (row) =>
  OPERATORS.find((op) => new RegExp(`\\s${op}\\s+[A-Z]{3,4}\\b`, "i").test(String(row?.raw || ""))) || null;

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({
  quote: QUOTE,
  asOf: FX_AS_OF,
  listing: usdPer(currency),
});

export function isAmerican(row, mic) {
  return US_MICS.has(String(mic || "").toUpperCase()) || US_EX.has(loose(row?.exchange));
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => {
    if (loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked) return true;
    return isCrypto(r) && loose(cryptoBase(r.ticker)) === asked;
  });

  const crypto = named.filter(isCrypto);
  if (crypto.length && (!place || /crypto/i.test(place))) {
    const row =
      (wantCurrency && crypto.find((r) => String(r.currency).toUpperCase() === wantCurrency)) ||
      crypto.find((r) => String(r.currency).toUpperCase() === "USD") ||
      crypto[0];
    const { venue, unsourced } = listingKey(row);
    return { named, matches: [{ row, venue, unsourced }] };
  }

  const matches = named
    .filter((r) => !isCrypto(r))
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => {
      if (!wantPlace) return true;
      // A reader may ask for the venue Quantfury names as easily as the one the
      // scraper filed the line under.
      if (loose(saidVenue(m.row)) === wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      // The catalogue files Paris, Amsterdam, Brussels and Lisbon under the
      // one operator name the scraper picked.
      if (
        wantVenue &&
        ["XPAR", "XAMS", "XBRU", "XLIS"].includes(wantVenue.mic) &&
        loose(m.row.exchange) === "EURONEXT"
      ) {
        return true;
      }
      return loose(m.row.exchange) === wantPlace || loose(m.row.exchange).includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named
    .map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${saidVenue(r) || r.exchange || "place non dite"}`)
    .slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const { venue, unsourced } = listingKey(r);
    // A coin has no ISIN and is found by its base, the same way `roundTrip`
    // finds it; counting it as bookless would understate the shelf by 49 lines.
    const book = spreadLeaf(spreads, {
      isin: isCrypto(r) ? cryptoId(cryptoBase(r.ticker)) : r.isin,
      mic: isCrypto(r) ? null : (venue?.mic ?? null),
      currency: r.currency,
      unsourced: isCrypto(r) ? null : unsourced,
    });
    const slot = (out[type] ||= { n: 0, withBook: 0, taxed: 0, cboeEurope: 0 });
    slot.n += 1;
    if (book.leaf?.bp != null || book.leaf?.perShare != null) slot.withBook += 1;
    if (Object.keys(taxRates(taxesOf(r.isin))).length) slot.taxed += 1;
    if (saidVenue(r) === CBOE_EUROPE) slot.cboeEurope += 1;
  }
  return out;
}

function taxParts(isin) {
  const tax = taxesOf(isin);
  const rates = taxRates(tax);
  // The PTM levy is a flat pound on a London ticket above £10,000, not a rate
  // on the amount, and the tax map can only carry it as one. `roundTrip` could
  // hold the pound now that the affine triple is gone, but it is still left out
  // on the ground that put it out: the levy is collected by brokers inside the
  // UK Takeover Code's chain, Quantfury is a Bahamian dealer outside it, and it
  // publishes no such pass-through. Were it owed it would add about £1.
  delete rates.PTM_LEVY;
  const taxTotal = Object.values(rates).reduce((sum, rate) => sum + rate, 0);
  return { tax, rates, taxTotal };
}

export function roundTrip({ etf, place, currency, shares, price, amount, bp = null, perShare = null }) {
  // Quantfury bills nothing whether or not the book is known, so `brokerFees`
  // is 0 from the first line and survives every N/A below it.
  const base = { usd: null, brokerFees: 0, etf, place, currency, onlineBuy: true, cashCurrency: "" };

  if (!catalogue) {
    return {
      ...base,
      brokerFees: null,
      why: "le catalogue Quantfury n'existe pas encore : lancer `node quantfury/quantfury_scraping.mjs`",
    };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...base, brokerFees: null, why: `${etf} n'est pas dans le catalogue Quantfury` };
  if (!matches.length) {
    return {
      ...base,
      brokerFees: null,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Quantfury`,
      alternatives: listAlternatives(named),
    };
  }

  const m = matches[0];
  const crypto = isCrypto(m.row);
  // A coin is looked up by its base rather than by an ISIN it does not have.
  // Quantfury names Binance and Coinbase as the prices it pairs clients on, and
  // `spreadLeaf` answers with the wider of the two, which is the book a client
  // could have met.
  const book = spreadLeaf(spreads, {
    isin: crypto ? cryptoId(cryptoBase(m.row.ticker)) : m.row.isin,
    mic: crypto ? null : (m.venue?.mic ?? null),
    currency: m.row.currency,
    unsourced: m.unsourced,
  });

  const said = saidVenue(m.row);
  const european = said === CBOE_EUROPE;
  const bookMic = book.mic ?? m.venue?.mic ?? null;

  const listing = {
    isin: String(m.row.isin || "").toUpperCase() || null,
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    // Quantfury's own venue string wins where the catalogue's is an artefact of
    // the ticker match — every European line — and loses where it is coarser
    // than the catalogue's: it files NYSE Arca funds under "NYSE".
    mic: european ? null : bookMic,
    exchange: european ? CBOE_EUROPE : (m.venue?.name ?? m.row.exchange ?? null),
    currency: String(m.row.currency || "").toUpperCase(),
    brokerExchange: m.row.exchange || null,
    // Which book was actually read. On a European line it is not the venue above.
    bookVenue: bookMic,
  };

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const american = isAmerican(m.row, bookMic);
  const { tax, rates, taxTotal } = crypto ? { tax: null, rates: {}, taxTotal: 0 } : taxParts(listing.isin);
  const convert = convertRate(listing.currency);

  const answer = {
    ...base,
    listing,
    feeMarket: crypto ? "crypto" : american ? "us" : "autre",
    venueAuthoritative: european,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.conditions,
    basis:
      `accord client Quantfury §13 du ${SCHEDULE.agreementVersion} (aucun frais), relu le ${SCHEDULE.readOn}` +
      (european ? `, carnet ${bookMic || "primaire"} en doublure de ${CBOE_EUROPE}` : ""),
    fx: fxNote(listing.currency),
    // Le barème du portefeuille, pour qui convertit à la main. Il ne s'applique
    // pas à un ordre : l'aller-retour du TRIP l'a montré.
    fxIfConverted: convert,
    fxNote:
      `trader en ${listing.currency} depuis un autre solde ne coûte rien, mesuré le ${TRIP.on} ` +
      `sur ${TRIP.ticker}` +
      (convert == null
        ? `. Le barème du compte ne cote pas cette devise pour une conversion à la main`
        : convert === 0
          ? `. Convertir un portefeuille en ${listing.currency} est gratuit au barème du ${SCHEDULE.readOn}`
          : `. Convertir un portefeuille en ${listing.currency} à la main coûte ${(100 * convert).toFixed(2)} %, ` +
            `ce qui est un autre geste`),
    tax,
    taxRates: Object.keys(rates).length ? rates : null,
    remark: remarkOf({ crypto, marketBp, listing, convert }),
    confidence: confidenceOf({ crypto, european, bookMic, leaf, marketBp, marketPerShare, taxTotal, tax, american, listing, convert }),
  };

  // A coin is bought by the dollar, a share by the unit at a price.
  const n = Number(shares);
  const p = Number(price);
  const a = Number(amount);
  const notionalUsd = crypto ? (a > 0 ? a : null) : n > 0 && p > 0 ? toUsd(n * p, listing.currency) : null;

  if (notionalUsd == null) {
    return {
      ...answer,
      why: crypto
        ? "aucun montant pour cette pièce"
        : !(n > 0)
          ? "aucun nombre de parts"
          : !(p > 0)
            ? "aucun prix pour cette ligne : lancer node prices.mjs"
            : `aucun taux ${listing.currency} → ${QUOTE}`,
    };
  }

  // The book is already a round trip — Rule 605 per share in America, basis
  // points elsewhere — so it is crossed once, not once per side.
  const bookUsd =
    marketBp != null
      ? (notionalUsd * marketBp) / 1e4
      : marketPerShare != null && !crypto
        ? dollars(marketPerShare * n, american ? QUOTE : listing.currency)
        : null;

  // Bought once, so charged once: a transfer tax is owed by whoever acquires
  // the line and not again by whoever sells it back.
  const taxUsd = notionalUsd * taxTotal;

  return {
    ...answer,
    usd: finite(plus(bookUsd, taxUsd), 6),
    trade: crypto
      ? { amount: notionalUsd, currency: QUOTE }
      : { shares: n, price: p, notional: n * p, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    parts: {
      marché: finite(bookUsd, 6),
      taxes: finite(taxUsd, 6),
      commission: COMMISSION_EACH,
      réglementaire: SEC_RATE + TAF_PER_SHARE,
      // Les parts somment `usd`, et `usd` ne suppose aucune conversion : le
      // tarif réel de la devise est dans `fxIfConverted`, hors du total.
      change: 0,
      portage: BORROWING,
      ticket: TICKET,
    },
    ...(bookUsd == null
      ? {
          // The venue named here is the one searched, which on a European line
          // is the stand-in and not the Cboe Europe shown to the reader.
          why: crypto
            ? "ni Binance ni Coinbase ne cote cette pièce contre le dollar"
            : `aucun carnet pour ${m.unsourced?.name || m.venue?.name || m.row.exchange} : ` +
              `${m.unsourced?.why || "pas de feuille de spread"}`,
        }
      : {}),
  };
}

function confidenceOf({ crypto, european, bookMic, leaf, marketBp, marketPerShare, taxTotal, tax, american, listing, convert }) {
  const lines = [
    `aucun frais chez Quantfury : ni commission, ni portage, ni ticket (accord client §13 du ${SCHEDULE.agreementVersion}, relu le ${SCHEDULE.readOn})`,
    "la colonne « frais du courtier » vaut donc 0 alors que le total ne vaut pas 0 : Quantfury se paie du carnet, mais ce carnet est celui de la place et le client l'aurait croisé ailleurs",
  ];

  if (crypto && marketBp != null) {
    lines.push(
      "crypto : Quantfury reprend le spot Binance / Coinbase, et le coût est la touche de ces carnets, lue à la plus large des deux quand les deux cotent la pièce" +
        ` — reprise vérifiée au centime le ${SCHEDULE.readOn} en comparant les cotations diffusées par Quantfury à celles des deux bourses`
    );
  } else if (crypto) {
    lines.push(
      "crypto : ni Binance ni Coinbase ne cote cette pièce contre le dollar, donc le carnet reste N/A plutôt que 0"
    );
  } else if (marketBp == null && marketPerShare == null) {
    lines.push("pas de feuille de carnet pour cet ISIN / cette place : le spread reste N/A");
  } else {
    lines.push(
      `le coût est le carnet croisé, ${american ? "mesuré sur la bande 605" : "lu dans spread.json"}, ` +
        "puisque Quantfury exécute au bid et à l'ask de la place sans les élargir"
    );
  }

  if (european) {
    lines.push(
      `place : Quantfury dit ${CBOE_EUROPE} pour toute l'Europe, et aucune bande ${CBOE_EUROPE} n'est collectée, ` +
        `donc le carnet ${bookMic || "primaire"} sert de doublure (médiane ${PROBE.standInBp} bp sur ` +
        `${PROBE.withStandIn} lignes cotées). La doublure a été éprouvée le ${PROBE.on} sur les ${PROBE.lines} lignes ` +
        `européennes, sans ordre : la touche affichée par Quantfury sort à ${PROBE.quantfuryBp} bp de médiane, soit ` +
        `${PROBE.gapBp} bp de plus, avec ${PROBE.wider} lignes plus larges et ${PROBE.tighter} plus serrées`
    );
    lines.push(
      "ISIN : celui-ci vient de l'appariement par ticker du scraper, pas de Quantfury ; le plancher de nom s'applique désormais à l'Europe, mais l'identité reste déduite"
    );
  }

  if (taxTotal > 0) {
    lines.push(
      `taxe de transfert ${(100 * taxTotal).toFixed(2)} % ${tax?.country ? `(${tax.country}) ` : ""}` +
        "prise dans la carte des taxes : Quantfury n'en publie aucune et laisse l'impôt au client (§56), " +
        "mais le droit suit le titre et non le tarif du courtier" +
        // Le rapport ne vaut d'être dit que quand l'impôt écrase le carnet ;
        // l'inverse signale une doublure aberrante, pas une taxe légère.
        (marketBp && (1e4 * taxTotal) / marketBp >= 2
          ? `, et il pèse ${((1e4 * taxTotal) / marketBp).toFixed(0)} fois le carnet`
          : "")
    );
  }

  lines.push(
    "ni SEC ni TAF : courtier bahaméen appariant ses propres clients (SIA-F204), pas un courtier américain qui répercute"
  );
  // Le change était la dernière inconnue chère de ce fichier. Elle est levée
  // par un aller-retour réel, et dans le bon sens : l'ordre ne le paie pas.
  lines.push(
    `change nul sur l'ordre, mesuré : le ${TRIP.on}, ${TRIP.shares} ${TRIP.ticker} achetées ` +
      `${TRIP.buy} et revendues ${TRIP.sell} ${TRIP.currency} depuis un solde en dollars ont rendu ` +
      `${TRIP.balanceAfter} $ sur ${TRIP.balanceBefore} $, soit ${TRIP.costUsd.toFixed(2)} $ sur ` +
      `${TRIP.notionalUsd} $ — la traversée du carnet et rien d'autre, quand le barème du portefeuille ` +
      `aurait pris ${(200 * TRIP.walletTariff * TRIP.notionalUsd / 100).toFixed(2)} $`
  );
  if (convert > 0) {
    lines.push(
      `le ${(100 * convert).toFixed(2)} % que le barème du compte cote sur le ${listing?.currency || "?"} ` +
        "ne vaut donc que pour une conversion de portefeuille à la main, pas pour un ordre"
    );
  }
  lines.push(
    `commission nulle éprouvée sur un seul aller-retour, à ${TRIP.venue} : ailleurs, cotations en direct et barème lu`
  );
  if (!crypto && !leaf) lines.push("carnet absent, le chiffre ci-dessus ne tient qu'aux taxes");

  return lines.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          commissionEachWay: COMMISSION_EACH,
          ticket: TICKET,
          borrowing: BORROWING,
          convertPercent: CONVERT_PERCENT,
          secRate: SEC_RATE,
          tafPerShare: TAF_PER_SHARE,
          coverage: coverage(),
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error(
      "usage : node quantfury_cost.mjs <ticker|ISIN> [place] [devise] [--shares=n] [--price=p] [--amount=usd] [--json]\n" +
        "        node quantfury_cost.mjs --schedule\n" +
        "  ex.   node quantfury_cost.mjs AAPL --shares=10 --price=230\n" +
        "        node quantfury_cost.mjs SHEL LSE EUR --shares=100 --price=30\n" +
        "        node quantfury_cost.mjs BTC --amount=1000"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : 10,
    price: flag("price") ? Number(flag("price")) : undefined,
    amount: flag("amount") ? Number(flag("amount")) : 1000,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const show = (x) => (x == null ? "N/A" : x);

  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives?.length) {
      console.log(`\nce que Quantfury propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    }
    process.exit(0);
  }

  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(
    `${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}` +
      (out.venueAuthoritative && l.bookVenue ? `, carnet lu sur ${l.bookVenue}` : "") +
      "\n"
  );

  if (out.trade?.amount != null) {
    console.log(`${out.trade.amount} $ aller-retour\n`);
  } else if (out.trade) {
    console.log(
      `${out.trade.shares} part${out.trade.shares > 1 ? "s" : ""} à ${out.trade.price} ${l.currency} = ` +
        `${out.trade.notional.toFixed(2)} ${l.currency} (${Number(out.trade.notionalUsd).toFixed(2)} $)\n`
    );
  }

  console.log(`aller-retour     : ${show(out.usd)} $`);
  console.log(`frais du courtier: ${out.brokerFees} $`);
  if (out.parts) {
    console.log(`  carnet         : ${show(out.parts.marché)} $`);
    console.log(
      `  taxes          : ${show(out.parts.taxes)} $` +
        (out.taxRates ? `   (${Object.entries(out.taxRates).map(([k, v]) => `${k} ${v}`).join(", ")})` : "")
    );
  }
  if (out.why) console.log(`  ${out.why}`);

  console.log(`\n  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);

  if (out.remark) console.log(`\n${out.remark}`);
  if (out.url) console.log(`\n${out.url}`);
}
