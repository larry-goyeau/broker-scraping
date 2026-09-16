// What one round trip costs at bunq Stocks: put an amount of euro into a line,
// take it back out at once. `roundTrip(...)` answers the whole bill in dollars
// and, beside it, the part bunq keeps.
//
// bunq sizes an order in euro, not in shares — « you choose an amount in euros
// instead of a number of shares », fractions included, from 10 € up. So the
// commission and the transaction tax both bite on that amount, and a share
// count is only ever a way of naming one. Below 10 € there is no order to
// price, and this file answers N/A rather than a number.
//
// The fee is a percentage of the amount, charged on the buy and again on the
// sell. After the first three months it is 0,99 %; a bunq Pro account takes
// 20 % off it and a bunq Elite account half, which the help page spells out as
// 0,79 % and 0,49 %. The 0,58 % printed beside the Pro rate is not a tier: it
// is how bunq splits its own 0,79 % with Ginmon.
//
// The first three months are free up to 100 000 € of completed buy and sell
// orders, and the limit is a cliff rather than a proration: « if a single trade
// pushes you over the €100,000 free limit, the standard fee will apply to the
// entire amount of that specific trade ». `--plan=promo` prices the window and
// cannot know where in it you stand, so it prices the free side of the cliff.
// The default is Core, the published ongoing rate.
//
// The catalogue names an ISIN and a euro quote, never a venue. Upvest's
// best-execution list of 2025-12-16 puts EUR shares and EUR ETPs on Tradegate,
// then Quotrix; Xetra is not on it, and bunq's own hours, 08:00 to 21:00 CEST,
// are those books' and not Xetra's. So the venue here is Upvest's and not the
// catalogue's, which is what `venueAuthoritative` tells the page.
//
// Transaction taxes are where bunq and the root tax map disagree, and the
// disagreement is real rather than a gap. See `TAXES` below.
//
// Two live trips on an Elite account still inside the first three months,
// 2026-09-09, phone app. Every ticket printed Fees € 0.00. EUNL
// (IE00B4L5Y983) 50 € both ways at 126.00, cash 50 → 50. TTE (FR0000120271)
// buy 49,20 € (0,6236477 × 78,57 plus 0,20 € of tax), sell 48,97 €; cash 50 →
// 49,76, the 24 cents being the tax plus a 3-cent tick. The 0,49 % Elite rate
// was not charged, so the percentage itself is read and not measured. The
// quotes are to the cent, so no book can be read off those tickets.
//
//   https://help.bunq.com/articles/how-are-trading-fees-calculated
//   https://help.bunq.com/articles/start-investing-on-the-go-with-stocks
//
//   node bunq/bunq_cost.mjs EUNL --shares=1 --price=126
//   node bunq/bunq_cost.mjs IE00B4L5Y983 --amount=1000 --plan=pro
//   node bunq/bunq_cost.mjs TOTB --amount=500 --plan=elite
//   node bunq/bunq_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import fs from "node:fs";
import { listingKey, resolveVenue } from "../venues.mjs";
import { plus, finite } from "../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, toUsd, usdPer } from "../fx.mjs";
import { taxesOf, taxRates } from "../taxMap.mjs";

const CATALOGUE = new URL("bunq-parsed.json", import.meta.url);
const SPREADS = new URL("../parsed_json/spread.json", import.meta.url);

const SCHEDULE = {
  source: "https://help.bunq.com/articles/how-are-trading-fees-calculated",
  stocks: "https://help.bunq.com/articles/start-investing-on-the-go-with-stocks",
  plans: "https://www.bunq.com/en-de/personal/plans",
  product: "https://www.bunq.com/en-de/personal/features/stocks",
  execution:
    "https://eu-assets.contentstack.com/v3/assets/blt4a5ee0113ab335fb/bltc1b2304cb5f11b46/6a4775fe310892726ee90bc1/upvest_best_execution_policy.pdf",
  readOn: "2026-09-15",
  entity: "bunq (NL), Stocks via Ginmon / Upvest",
};

// Upvest §05a3, 16 Dec 2025: EUR shares and EUR ETPs, in this order.
const UPVEST_EUR_MICS = ["XGAT", "XQTX"];
const MIC_NAME = { XGAT: "Tradegate", XQTX: "Quotrix" };

// Free rather than Core: both trade at 0,99 %, so Core is Free plus a monthly
// bill and never the cheaper answer. `--plan=core` still prices it.
const DEFAULT_PLAN = "free";
const MIN_ORDER_EUR = 10;
const PROMO_VOLUME_EUR = 100000;
const HOURS = "08:00–21:00 CEST";

// Stocks is offered to verified users resident in these eleven countries, and
// Ginmon adds nationality rules on top. It is a fact about the reader and not
// about the line, so it stays out of `onlineBuy`, which speaks about whether an
// instrument can be bought at all.
const RESIDENCY = ["AT", "BE", "FR", "DE", "IE", "IT", "LU", "NL", "PT", "SK", "ES"];

// The transaction taxes bunq says it collects, and the reason two of the three
// are written here rather than in `taxMap.mjs`.
//
// The root map records what Trading212's ex-ante disclosure charges per ISIN,
// and on Italian and Spanish lines it charges nothing — not for want of asking:
// Santander, Inditex, Repsol, Iberdrola, Intesa, Eni and Enel are all priced
// there, all at zero, on the same sweep that prints 0,400 % against every
// French line. Those are not issuers under an exemption threshold. So the zero
// is Trading212's own behaviour, and the map is right to carry it.
//
// bunq says the opposite in its own words: the tax « will be displayed in the
// app before you complete a purchase and will be added to the purchase price ».
// Both brokers can be telling the truth, because a foreign intermediary chooses
// whether to collect these taxes or leave the buyer to declare them. That makes
// the figure a fact about bunq and not about the instrument, which is why it is
// not at the root.
//
// The sentence also names where the figure can be read: the screen between
// « Next » and « Buy » quotes the fee and the tax for the amount typed, and it
// renders on an empty account, so `bunq-preview.mjs` reads it without buying.
// Eight lines at 100 €, on 2026-09-15:
//
//   Eni, Intesa, Saipem          0,20 €   →  0,2 % italien
//   Santander, Solaria           0,20 €   →  0,2 % espagnol
//   TotalEnergies                0,40 €   →  0,4 % français
//   Ahold, SAP, iShares Core     0
//
// So the Italian rate is twice what bunq's page prints. 0,2 % is Italy's rate
// off a regulated market, against 0,1 % on one, so the likely reading is that
// the leg Upvest executes is not treated as on-venue — but the rate below is
// the measurement, not that explanation. It is the second figure that page has
// got wrong: it still prints 0,3 % for France, the rate before the 2025 rise,
// while the map's 0,4 % is what both a real buy on 2026-09-09 and the preview
// above charge. France therefore stays with the map.
//
// Neither exemption threshold bunq cites was seen to bite. Saipem is the
// smallest Italian line in the catalogue and Solaria sits on the Spanish
// billion, and both are taxed in full, so no threshold is modelled.
const OWN_FTT = {
  IT: { name: "ITALIAN_FTT", rate: 0.002 },
  ES: { name: "SPANISH_FTT", rate: 0.002 },
};

const CHECK = {
  plan: "elite",
  promo: true,
  on: "2026-09-09",
  eunl: { isin: "IE00B4L5Y983", ticker: "EUNL", buy: 50, sell: 50, fee: 0, cash: { start: 50, end: 50 } },
  tte: {
    isin: "FR0000120271",
    ticker: "TOTB",
    stock: 49,
    ftt: 0.2,
    buy: 49.2,
    sell: 48.97,
    cash: { start: 50, end: 49.76 },
    fttRate: 0.2 / 49,
  },
  // Order previews read at 100 €, no order placed. Every one of them quoted
  // « Fees 0% — Free for the first 3 months », which is why the rates in
  // `PLANS` are still read and not measured.
  preview: {
    on: "2026-09-15",
    amount: 100,
    taxed: { ENI: 0.2, IES: 0.2, SPEA: 0.2, BSD2: 0.2, SLR: 0.2, TOTB: 0.4 },
    free: ["SAP", "Ahold Delhaize", "EUNL"],
  },
};

const PLANS = {
  free: { id: "free", label: "Free", rate: 0.0099, monthly: 0, off: 0 },
  core: { id: "core", label: "Core", rate: 0.0099, monthly: 3.99, off: 0 },
  pro: { id: "pro", label: "Pro", rate: 0.0079, monthly: 9.99, off: 0.2 },
  elite: { id: "elite", label: "Elite", rate: 0.0049, monthly: 18.99, off: 0.5 },
  promo: { id: "promo", label: "trois premiers mois", rate: 0, monthly: null, off: 1 },
};

const PLAN_ALIAS = {
  free: "free",
  core: "core",
  easy: "core",
  standard: "core",
  default: "core",
  pro: "pro",
  elite: "elite",
  promo: "promo",
  trial: "promo",
  first3: "promo",
};

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
const spreads = fs.existsSync(SPREADS) ? JSON.parse(fs.readFileSync(SPREADS, "utf8")).spreads || {} : {};

const loose = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v.toPrecision(6));
};

const fxNote = (currency) => ({ quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(currency) });

// The scrape does not print a place. The published primary EUR book is Tradegate.
const venueRow = (row) => ({ ...row, exchange: row.exchange || "TRADEGATE" });

function upvestBook(isin, currency) {
  const id = String(isin || "").toUpperCase();
  const ccy = String(currency || "EUR").toUpperCase();
  for (const mic of UPVEST_EUR_MICS) {
    const leaf = spreads[id]?.[mic]?.[ccy];
    if (leaf && (leaf.bp != null || leaf.perShare != null)) return { leaf, mic };
  }
  return { leaf: null, mic: null };
}

export function planOf(name = DEFAULT_PLAN) {
  const key = String(name || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return PLANS[PLAN_ALIAS[key] || key] || null;
}

// The map's rates, plus the one bunq collects where the map measured a zero.
// Guarded against the day the sweep does find an Italian or Spanish line: a
// rate already there is not doubled.
export function taxesFor(isin) {
  const tax = taxesOf(isin);
  const mapped = taxRates(tax);
  const cc = String(isin || "").slice(0, 2).toUpperCase();
  const own = OWN_FTT[cc];
  const already = own && Object.keys(mapped).some((k) => new RegExp(cc === "IT" ? "ITALIAN" : "SPANISH", "i").test(k));
  const added = own && !already ? { [own.name]: own.rate } : {};
  return { tax, rates: { ...mapped, ...added }, added: Object.keys(added), country: cc };
}

function remarkOf(plan) {
  return plan.monthly ? `${plan.monthly} €/month.` : "";
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantVenue = place ? resolveVenue({ exchange: place, mic: place }).venue : null;
  const wantPlace = loose(place);
  const wantCurrency = String(currency || "").toUpperCase();

  const named = rows.filter((r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(venueRow(r)) }))
    .filter((m) => {
      if (!wantPlace) return true;
      if (wantVenue && m.venue) return m.venue.mic === wantVenue.mic;
      return loose(m.row.exchange || "TRADEGATE") === wantPlace || loose(m.row.exchange || "TRADEGATE").includes(wantPlace);
    })
    .filter((m) => !wantCurrency || String(m.row.currency || "").toUpperCase() === wantCurrency);

  return { named, matches };
}

const listAlternatives = (named) =>
  named.map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "Tradegate"}`).slice(0, 12);

function coverage() {
  if (!rows.length) return null;
  const out = {};
  for (const r of rows) {
    const type = r.type || "?";
    const book = upvestBook(r.isin, r.currency);
    const slot = (out[type] ||= { n: 0, withBook: 0, ownFtt: 0, byMarket: {} });
    slot.n += 1;
    if (book.leaf) slot.withBook += 1;
    if (taxesFor(r.isin).added.length) slot.ownFtt += 1;
    const mk = (slot.byMarket[book.mic || "unsourced"] ||= { n: 0, withBook: 0 });
    mk.n += 1;
    if (book.leaf) mk.withBook += 1;
  }
  return out;
}

export function roundTrip({ etf, place, currency, shares, price, amount, bp = null, perShare = null, plan = DEFAULT_PLAN }) {
  const picked = planOf(plan);
  const answer = {
    usd: null,
    etf,
    place,
    currency,
    onlineBuy: true,
    cashCurrency: "EUR",
    venueAuthoritative: true,
    plan: picked?.id ?? plan,
    minOrder: { amount: MIN_ORDER_EUR, currency: "EUR" },
    residency: RESIDENCY,
  };

  if (!picked) return { ...answer, why: `formule inconnue : ${plan} (free|core|pro|elite|promo)` };
  if (!catalogue) {
    return { ...answer, why: "le catalogue bunq n'existe pas encore : lancer `node bunq/bunq_scraping.mjs` avec web.bunq.com ouvert" };
  }

  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue bunq` };
  if (!matches.length) {
    return { ...answer, why: `${etf} n'est pas coté sous cette forme chez bunq`, alternatives: listAlternatives(named) };
  }

  const m = matches[0];
  const book = upvestBook(m.row.isin, m.row.currency);
  const listing = {
    isin: String(m.row.isin || "").toUpperCase(),
    ticker: m.row.ticker || null,
    name: m.row.name || null,
    type: m.row.type || null,
    mic: book.mic ?? m.venue?.mic ?? "XGAT",
    exchange: MIC_NAME[book.mic] ?? m.venue?.name ?? "Tradegate",
    currency: String(m.row.currency || "EUR").toUpperCase(),
    brokerExchange: m.row.exchange || null,
  };

  const leaf = book.leaf;
  const marketBp = bp ?? leaf?.bp ?? null;
  const marketPerShare = perShare ?? leaf?.perShare ?? null;
  const { tax, rates, added } = taxesFor(listing.isin);
  const taxPct = Object.values(rates).reduce((s, r) => s + r, 0);

  const shared = {
    ...answer,
    listing,
    feeMarket: book.mic === "XQTX" ? "quotrix" : "tradegate",
    catalogueVenue: m.row.exchange || null,
    bp: marketBp,
    perShare: marketPerShare,
    url: leaf?.url ?? SCHEDULE.source,
    tax,
    fx: fxNote(listing.currency),
    fxIfConverted: 0,
    remark: remarkOf(picked),
    commission: { rate: picked.rate, eachWay: true, currency: "EUR", plan: picked.id },
    basis:
      `bunq Stocks ${picked.label}, ${(picked.rate * 100).toFixed(2)} % du montant par jambe, ` +
      `aide lue le ${SCHEDULE.readOn} — exécution Upvest à ${listing.exchange}` +
      (listing.mic ? ` (${listing.mic})` : ""),
  };
  const said = (why) => ({ ...shared, why, confidence: confidenceOf({ picked, marketBp, rates, added, taxPct, listing, leaf }) });

  if (!leaf) return said(`${listing.ticker || listing.isin} n'a de carnet ni à Tradegate ni à Quotrix, les deux places euro d'Upvest`);

  // An amount of euro is what bunq is actually given; a share count and a price
  // are only another way of naming one, since every line here is fractional.
  const typed = Number(amount);
  const n = Number(shares);
  const p = Number(price);
  const notional = typed > 0 ? typed : n > 0 && p > 0 ? n * p : null;
  if (notional == null) return said(n > 0 && !(p > 0) ? "aucun prix pour cette ligne : lancer node prices.mjs" : "aucun montant ni nombre de parts");
  if (notional < MIN_ORDER_EUR) {
    return said(`ordre de ${notional.toFixed(2)} € sous le minimum de ${MIN_ORDER_EUR} € chez bunq`);
  }

  const notionalUsd = dollars(notional, listing.currency);
  // The book is already a round trip, so it is counted once and not per side.
  const bookUsd = marketBp != null && notionalUsd != null ? (notionalUsd * marketBp) / 1e4 : null;
  const commEachUsd = notionalUsd == null ? null : notionalUsd * picked.rate;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxPct;

  const usd = plus(bookUsd, commEachUsd, commEachUsd, taxUsd);
  // What bunq and Ginmon keep. The book belongs to whoever quoted it and the
  // transaction tax to a treasury, so neither is theirs to be counted here.
  const brokerFees = plus(commEachUsd, commEachUsd);

  return {
    ...shared,
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    trade: { shares: n > 0 ? n : null, price: p > 0 ? p : null, notional, notionalUsd: finite(notionalUsd, 6), currency: listing.currency },
    buy: {
      commission: finite(commEachUsd, 6),
      native: { charged: finite(notional * picked.rate, 6), currency: "EUR", rate: picked.rate },
      taxes: finite(taxUsd, 6),
      taxRates: Object.keys(rates).length ? rates : null,
    },
    sell: {
      commission: finite(commEachUsd, 6),
      native: { charged: finite(notional * picked.rate, 6), currency: "EUR", rate: picked.rate },
    },
    parts: {
      marché: finite(bookUsd, 6),
      commission: finite(plus(commEachUsd, commEachUsd), 6),
      taxes: finite(taxUsd, 6),
    },
    confidence: confidenceOf({ picked, marketBp, rates, added, taxPct, listing, leaf }),
  };
}

function confidenceOf({ picked, marketBp, rates, added, taxPct, listing, leaf }) {
  const lines = [];

  lines.push(
    picked.id === "promo"
      ? `Fenêtre des trois premiers mois : 0 % à l'achat comme à la vente, jusqu'à ` +
        `${PROMO_VOLUME_EUR.toLocaleString("fr-FR")} € d'ordres exécutés. Le plafond est une falaise et non un prorata — ` +
        `l'ordre qui le franchit est facturé en entier au tarif courant — et ce fichier ne sait pas où vous en êtes, ` +
        `donc il chiffre le bon côté de la falaise.`
      : `${(picked.rate * 100).toFixed(2)} % du montant à l'achat et autant à la vente (${picked.label})` +
        (picked.off ? `, soit ${picked.off * 100} % de remise sur les 0,99 % de base` : "") +
        `, aide bunq lue le ${SCHEDULE.readOn}. Les trois premiers mois sont à 0 % jusqu'à ` +
        `${PROMO_VOLUME_EUR.toLocaleString("fr-FR")} € (--plan=promo).`
  );

  lines.push(
    `Le pourcentage porte sur le montant en euro, puisque bunq achète un montant et non des parts, ` +
      `fractions comprises, à partir de ${MIN_ORDER_EUR} € — en dessous ce fichier rend N/A plutôt qu'un prix.`
  );

  lines.push(
    `Aller-retour réel le ${CHECK.on}, compte Elite encore dans la fenêtre gratuite : ` +
      `${CHECK.eunl.ticker} ${CHECK.eunl.buy} € dans les deux sens, frais 0, caisse ${CHECK.eunl.cash.start} → ${CHECK.eunl.cash.end}, ` +
      `puis ${CHECK.tte.ticker} acheté ${CHECK.tte.buy} € et vendu ${CHECK.tte.sell} €, caisse ${CHECK.tte.cash.start} → ${CHECK.tte.cash.end}. ` +
      `Les deux tickets affichaient 0 € de frais, donc le pourcentage lui-même est lu et non mesuré : ` +
      `les récapitulatifs du ${CHECK.preview.on} annonçaient encore « Fees 0% — Free for the first 3 months ».`
  );

  if (added.length) {
    const cc = added[0].startsWith("ITALIAN") ? "IT" : "ES";
    const own = OWN_FTT[cc];
    const shown = cc === "IT" ? "Eni, Intesa et Saipem" : "Santander et Solaria";
    lines.push(
      `Taxe de transaction ${(100 * own.rate).toFixed(1)} % à l'achat, mesurée et non prise de la carte racine : ` +
        `le balayage Trading212 chiffre les grandes ${cc === "IT" ? "italiennes" : "espagnoles"} et les rend toutes à zéro, ` +
        `quand le récapitulatif d'ordre bunq facture ${CHECK.preview.taxed.ENI.toFixed(2)} € sur ` +
        `${CHECK.preview.amount} € pour ${shown} le ${CHECK.preview.on}. Les deux peuvent dire vrai, un intermédiaire ` +
        `étranger pouvant collecter ou laisser déclarer.` +
        (cc === "IT"
          ? ` C'est le double des 0,1 % qu'imprime l'aide bunq, soit le taux italien hors marché réglementé.`
          : ``) +
        ` Les seuils de petite capitalisation ne sont pas modélisés, faute de les avoir vus jouer : Saipem et Solaria ` +
        `sont taxées plein tarif.`
    );
  } else if (rates.FRENCH_TRANSACTION_TAX != null) {
    lines.push(
      `Taxe française ${(100 * rates.FRENCH_TRANSACTION_TAX).toFixed(2)} % à l'achat, depuis la carte racine et non ` +
        `depuis l'aide bunq, qui imprime encore 0,3 % : un achat réel le ${CHECK.on} a été taxé ${CHECK.tte.ftt} € ` +
        `sur ${CHECK.tte.stock} € de titres, soit ${(100 * CHECK.tte.fttRate).toFixed(3)} %. La mesure tranche contre la page.`
    );
  } else if (taxPct === 0) {
    lines.push(`Aucune taxe de transaction sur cette ligne, ni dans la carte racine ni dans les trois pays que bunq cite.`);
  }

  lines.push(
    leaf
      ? `Carnet ${listing.exchange} (${listing.mic}) à ${marketBp} points de base, dans l'ordre publié par Upvest : ` +
        `Tradegate puis Quotrix. Le catalogue bunq ne nomme aucune place, et les horaires de bunq, ${HOURS}, ` +
        `sont ceux de ces carnets et non de Xetra.`
      : `Pas de feuille Tradegate ni Quotrix pour cet ISIN dans spread.json.`
  );

  lines.push(
    `Compte en euro et catalogue tout en euro : aucune conversion. ` +
      `Hors aller-retour, Stocks n'est ouvert qu'aux résidents de ${RESIDENCY.length} pays (${RESIDENCY.join(", ")}), ` +
      `et Ginmon y ajoute ses propres règles de nationalité.`
  );

  return lines.join(" ; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flag = (name) => {
    const m = process.argv.find((a) => a.startsWith(`--${name}=`));
    return m ? m.split("=").slice(1).join("=") : null;
  };

  if (process.argv.includes("--schedule")) {
    console.log(
      JSON.stringify(
        {
          ...SCHEDULE,
          defaultPlan: DEFAULT_PLAN,
          minOrderEur: MIN_ORDER_EUR,
          promoVolumeEur: PROMO_VOLUME_EUR,
          promoIsCliff: true,
          hours: HOURS,
          residency: RESIDENCY,
          ownFtt: OWN_FTT,
          plans: Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, { ...v, roundTrip: v.rate * 2 }])),
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
      "usage : node bunq_cost.mjs <ticker|ISIN> [place] [devise] [--amount=e] [--shares=n] [--price=p] [--plan=free|core|pro|elite|promo] [--json]\n" +
        "        node bunq_cost.mjs --schedule\n" +
        "  ex.   node bunq_cost.mjs EUNL --shares=1 --price=126\n" +
        "        node bunq_cost.mjs IE00B4L5Y983 --amount=1000 --plan=pro\n" +
        "        node bunq_cost.mjs TOTB --amount=500 --plan=elite"
    );
    process.exit(2);
  }

  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    amount: flag("amount") ? Number(flag("amount")) : null,
    bp: flag("bp") ? Number(flag("bp")) : null,
    perShare: flag("per-share") ? Number(flag("per-share")) : null,
    plan: flag("plan") || DEFAULT_PLAN,
  });

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  const l = out.listing;
  if (!l) {
    console.log(out.why || "rien à dire");
    if (out.alternatives?.length) console.log(`\nce que bunq propose sous ce nom :\n  ${out.alternatives.join("\n  ")}`);
    process.exit(0);
  }

  const picked = planOf(out.plan);
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}${l.mic ? ` (${l.mic})` : ""}, ${l.currency}${l.type ? `, ${l.type.toLowerCase()}` : ""}  [${picked?.label || out.plan}]\n`);

  if (out.trade) {
    const t = out.trade;
    console.log(
      `${t.shares ? `${t.shares} part${t.shares > 1 ? "s" : ""} à ${t.price} ${t.currency} = ` : ""}` +
        `${t.notional.toFixed(2)} ${t.currency}` +
        (t.notionalUsd != null ? ` (${t.notionalUsd.toFixed(2)} $)` : "")
    );
    console.log();
  }

  console.log(`aller-retour     : ${out.usd == null ? `N/A${out.why ? ` — ${out.why}` : ""}` : `${out.usd} $`}`);
  console.log(`frais du courtier: ${out.brokerFees == null ? "N/A" : `${out.brokerFees} $`}`);
  if (out.parts) {
    for (const [name, v] of Object.entries(out.parts)) {
      if (v != null) console.log(`  ${name.padEnd(15)}: ${v} $`);
    }
  }
  console.log();
  console.log(`  ${out.basis}`);
  for (const line of (out.confidence || "").split(" ; ")) console.log(`  ${line}`);
  if (out.remark) for (const r of out.remark.split("\n")) console.log(`  · ${r}`);
  if (out.url) console.log(`\n${out.url}`);
}
