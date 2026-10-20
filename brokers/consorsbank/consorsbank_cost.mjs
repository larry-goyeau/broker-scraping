// What one round trip costs at Consorsbank (BNP Paribas S.A., Niederlassung
// Deutschland): buy n shares at price p, sell them back at once, in dollars.
// Online orders, status Silver: a new depot, 0 to 25 orders a calendar year.
//
// Read 2026-10-20:
//   Price list (Preis- und Leistungsverzeichnis) valid from 9 October 2025,
//   Stand 07/2026, CB.80.089_403, "Orderaufgabe per Online-Broking", p. 4:
//   https://www.consorsbank.de/content/dam/de-cb/b2c/content/pdf/transversal/agb/CB.80.089_403-OL_PLV-Depot-Ver.K-TG.K-Girokonto-NK.pdf
//   The list valid from 16 December 2026 (Stand 09/2026, CB.80.089_404)
//   repeats the same order table:
//   https://www.consorsbank.de/content/dam/de-cb/b2c/content/pdf/transversal/agb/PLV-ab-16.12.2026.pdf
//   Price page, "1.3 Handelsplatzkosten" (German, smart-order and foreign
//   place costs, which the PDF sends to this page):
//   https://www.consorsbank.de/web/Service/Preise-Zinsen/Preise-Zinsen-Wertpapiere
//   Status tiers: https://www.consorsbank.de/web/Wertpapierhandel/Preismodell
//   Foreign places, home-currency rule:
//   https://www.consorsbank.de/web/Wertpapierhandel/Boersen-und-Handelsplaetze/International
//   FX for securities, "3.4 Margen (alle anderen Geschäftsarten)":
//   https://www.consorsbank.de/web/Service/Preise-Zinsen/Preise-Zinsen-Sonstiges
//   StarPartner ETFs: https://www.consorsbank.de/web/Sparen-Anlegen/Anlegen/ETF-Einmalanlage
//   and the ETF finder's STARPARTNER_CC_PRICE field, read 2026-10-20:
//   https://www.consorsbank.de/web-financialinfo-service/api/marketdata/etfs/finderv1?pagesize=50&page=N&sort=name_asc
//   Execution policy, Stand 03/2025, section 9 (US routing):
//   https://www.consorsbank.de/content/dam/de-cb/b2c/content/pdf/service/barrierefreiheit/Grunds_tze%20zur%20Ausf_hrung%20von%20Auftr_gen%20in%20Finanzinstrumenten.pdf
//
//   Each order, any place   4.95 € + 0.25 %, floor 9.95 €, cap 69 €
//                           (Silver). Gold, from 26 orders a year:
//                           3.95 € + 0.25 %, floor 8.95 €, cap 59 €.
//   The place cost comes on top of the cap:
//   Tradegate               0.95 €
//   gettex, LS Exchange, Quotrix   1.95 €
//   Xetra                   1.95 € plus the exchange's transaction fee
//   Frankfurt, Munich, Stuttgart   2.95 € plus the transaction fee
//   Düsseldorf, Hamburg, Hannover, Berlin   4.95 € plus the transaction
//                           fee, the broker's courtage and the trading fee
//                           (the exchange charges: see below)
//   USA Smart Order         21 €
//   Canada Smart Order      69 € (Toronto, TSX Venture, CSE, Pure Trading)
//   Amsterdam 42, Brussels 56, Dublin 54, Helsinki 56, Hong Kong 124,
//   Copenhagen 47, Lisbon 64, London 34, Luxembourg 53, Madrid 59,
//   Milan 56, Oslo 69, Paris 36, Singapore 121, Stockholm 65, Sydney 101,
//   Tokyo 72, Wellington 136, Vienna 56, Zurich 41 (€ an order).
//
// The exchange's own charges. Consorsbank names them but prints no
// amount in any price list (22 versions, 2014 to 16 Dec 2026). They are
// priced here from each exchange's list in force in 2026, an amount a
// side, read 2026-10-20. [list] is the exchange's printed price;
// [statement] is what real Consorsbank statements show it passes on.
//
//   Xetra: Transaktionsentgelt 0.48 bp, at least 0.60 €. [list] Deutsche
//     Börse price list, T7, Stand 01.07.2026, §2.2.1.1, 2.2.1.2, 2.2.1.4,
//     standard order, High Volume (Medium 0.63 €, Low 0.69 €, Basic 0.90 €
//     minimums). For an ETF the fee base stops at 1,000,000 € (printed
//     after the ETF table). No VAT.
//     https://www.cashmarket.deutsche-boerse.com/resource/blob/2689120/b36a095ff6636e83ca1e3bd00ce5688f/data/2026_07_27_dbag_preisv_t7_xontro.pdf
//     [statement] the High Volume model: Consorsbank statements of
//     13.02.2023 (buy 2,120 €) and 21.07.2023 (sell 3,372.80 €) each
//     print "Transaktionsentgelt 0,60 EUR" beside its 1.95 €.
//   Frankfurt floor: Handelsentgelt 5.04 bp, at least 2.52 €, no cap.
//     [list] same price list, §2.3. [statement] the statement of
//     25.01.2022 (sell 5,184 €) prints "Handelsentgelt 2,61 EUR" =
//     5.04 bp and no separate line for the floor transaction fee
//     (0.96 bp, at least 0.60 €), so that fee is not added.
//   Statements: Portfolio Performance test files Kauf22, Verkauf13,
//   Verkauf12 (anonymised Consorsbank PDFs):
//   https://github.com/portfolio-performance/portfolio/tree/master/name.abuchen.portfolio.tests/src/name/abuchen/portfolio/datatransfer/pdf/consorsbank
//   Stuttgart: Transaktionsentgelt by order value. [list] "Übersicht
//     Gebühren- und Entgeltstruktur", Stand 10.07.2026, MIC XSTU:
//     DAX share 0.62‰ min 2.09 € to 15,000 €, 0.42‰ min 9.30 € to
//     50,000 €, 0.36‰ min 21 € above, cap 63 €. Other share 0.95‰ min
//     2.73 €, 0.75‰ min 14.25 €, 0.70‰ min 37.50 €, cap 63 €. ETF/ETP
//     1‰ to 12,100 €, 0.40‰ min 12.10 € to 100,000 €, 0.10‰ min 40 €
//     above, no cap. No specialist fee. VAT only "sofern ... Umsatzsteuer
//     entsteht": not added.
//     https://www.boerse-stuttgart.de/media/452fje31/2026-07-10_uebersicht-gebuehren-und-entgeltstruktur_clean_de-1.pdf
//   Munich: order fee 0.029%, min 1.30 €, max 14 €, plus 19% VAT [list]
//     "Entgeltmodell an der Börse München für Kreditinstitute" 2026:
//     https://www.boerse-muenchen.de/fileadmin/user_upload/pdfs/2026_Entgeltmodell_Boerse_Muenchen.pdf
//     plus the specialist's courtage, 0.8‰ (DAX 0.4‰), min 0.75 € [list]
//     https://www.boerse-muenchen.de/handel-support/kosten
//     Consorsbank names only the Transaktionsentgelt for Munich; the
//     courtage is added because the exchange levies it on every executed
//     order (inferred, no Consorsbank Munich statement found).
//   Düsseldorf: order fee, shares 3.8 bp min 1.30 €, funds/ETPs 3.8 bp
//     min 1.00 € max 19 €, plus VAT [list] BÖAG Preisverzeichnis Börse
//     Düsseldorf, Stand 1.1.2024, current upload 07/2026:
//     https://www.boerse-duesseldorf.de/wp-content/uploads/sites/11/2026/07/Preisverzeichnis-Boerse-Duesseldorf-Stand-2024-01-01_.pdf
//     Courtage: shares none ("Courtage-Befreiung für alle Aktiengeschäfte",
//     Quality Trading, https://www.boerse-duesseldorf.de/), funds and ETPs
//     0.8‰ min 0.75 € [list] Entgeltordnung der Skontroführer, Börsenordnung
//     Stand 27.07.2026:
//     https://www.boerse-duesseldorf.de/wp-content/uploads/sites/11/2026/08/2026-07-27-Boersenordnung-an-der-Boerse-Duesseldorf.pdf
//   Hamburg, Hannover: order fee 0.25‰, min 1.30 € (shares) or 1.40 €
//     (other securities), max 11 €, plus VAT [list] BÖAG Preisverzeichnis,
//     Teil B Kreditinstitute (Hamburg Stand 2.11.2009, Hannover 01.09.2022):
//     https://www.boerse-hamburg.de/wp-content/uploads/sites/11/2021/09/Preisverzeichnis_xontro_Hamburg.pdf
//     https://www.boerse-hannover.de/wp-content/uploads/sites/11/2022/09/2022-09-01-Preisverzeichnis-Hannover.pdf
//     Courtage 0.8‰ (DAX 0.4‰), min 0.75 €; none on DAX shares up to
//     50,000 €, on MDAX, TecDAX, SDAX and foreign shares up to 25,000 €;
//     ETFs pay it [list] Börsenordnung Hamburg Stand 13.08.2026, Hannover
//     Stand 27.07.2026, Anlage Entgeltordnung:
//     https://www.boerse-hamburg.de/wp-content/uploads/sites/11/2026/08/Boersenordnung-Hamburg-13.08.2026.pdf
//     https://www.boerse-hannover.de/wp-content/uploads/sites/11/2026/07/2026-07-27-Boersenordnung-Hannover_.pdf
//     [statement] Consorsbank Hamburg buy of 06.09.2019, 3,390 € of a
//     small cap: "Courtage 2,71" = 0.8‰, no VAT on courtage. That
//     statement (2.50 € tariff, before 2023) shows no BÖAG order fee; the
//     order fee is still added here because today's page names a
//     "Transaktionsentgelt" for these places, so Hamburg, Hannover,
//     Düsseldorf and Munich may run up to 1.55 € a side high.
//     A German share outside the DAX up to 25,000 € is N/A here: the
//     MDAX/SDAX/TecDAX exemption needs index membership the catalogue
//     does not carry.
//   DAX 40: composition as of 22 June 2026 (Hochtief in for Porsche SE),
//     https://de.wikipedia.org/wiki/DAX, ISINs from this catalogue.
//   Berlin: floor trading (XONTRO) closed on 1 January 2026, so N/A:
//     https://www.boerse-berlin.de/index.php/Boerse_Berlin/Einstellung_Xontro
//   The courtage rates are maximums a specialist may waive. Clearstream
//   settlement and Eurex clearing charges are not printed and not added.
//
// Foreign places add
// "ggf." third-party costs and stamp duty that the page says it lists but
// does not. The fixed place cost is the fee here; stamp duty and the French
// FTT come from taxMap.mjs. Iceland has no published place cost.
//
// A foreign place trades only in its home currency. A London line in
// dollars is accepted and then cancelled, says the FAQ. Such a row is not
// buyable online and stays hidden.
//
// StarPartner ETFs (Amundi, BNP Paribas AM, iShares, Xtrackers, WisdomTree):
// 245 buy for 0 € and 268 for 3.95 € on Tradegate, read from the finder on
// 2026-10-20. Only the buy; the sale is the normal price.
//
// FX. Cash is EUR, with currency accounts in EUR, USD, GBP, CAD, AUD, NOK,
// SGD, TRY, ZAR, JPY and SEK (deposits.mjs). A securities trade converts at
// the Bloomberg fix plus a margin per currency, in units of that currency
// per euro (USD 0.003, GBP 0.002, CHF 0.003, DKK 0.020, SEK 0.024, ...),
// turned into a percent at the fx.mjs mid. A listing in a deposit
// currency keeps FX out of the total and says "FX x% when cash ≠ CCY."
// CHF and DKK convert on the buy and back on the sell, in the total.
// A German place settles in euro and converts at its own rate, which is
// not published: a non-euro row on a German place is N/A. ISK cannot be
// converted at all.
//
// A US line: orders go to "a BNP Paribas group company", not named, so the
// book is the quoted NBBO. SEC fee and TAF are not published and stay 0.
//
//   node brokers/consorsbank/consorsbank_cost.mjs IE00B4L5Y983 Tradegate EUR --shares=10 --price=110
//   node brokers/consorsbank/consorsbank_cost.mjs DE0007164600 "Börse Xetra" EUR --shares=10 --price=197.2
//   node brokers/consorsbank/consorsbank_cost.mjs DE0007164600 "Börse Düsseldorf" EUR --shares=10 --price=197.2
//   node brokers/consorsbank/consorsbank_cost.mjs US0378331005 Nasdaq USD --shares=10 --price=343
//   node brokers/consorsbank/consorsbank_cost.mjs CH0038863350 "SIX Swiss Exchange" CHF --shares=20 --price=77

import { rowsNamed, warmListingIndex } from "../../listingIndex.mjs";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { listingKey, spreadLeaf } from "../../spreads/venues.mjs";
import { usBookPerShare } from "../../spreads/rule606.mjs";
import { spreads } from "../../spreads/book.mjs";
import { bookParts, plus, finite } from "../../na.mjs";
import { AS_OF as FX_AS_OF, QUOTE, fxRemark, listingCash, toUsd, usdPer } from "../../fx.mjs";
import { depositHas } from "../../deposits.mjs";
import { taxesOf, taxRates } from "../../taxMap.mjs";

const CATALOGUE = new URL("consorsbank-parsed.json", import.meta.url);

const SCHEDULE = {
  url: "https://www.consorsbank.de/web/Service/Preise-Zinsen/Preise-Zinsen-Wertpapiere",
  plv: "https://www.consorsbank.de/content/dam/de-cb/b2c/content/pdf/transversal/agb/CB.80.089_403-OL_PLV-Depot-Ver.K-TG.K-Girokonto-NK.pdf",
  fx: "https://www.consorsbank.de/web/Service/Preise-Zinsen/Preise-Zinsen-Sonstiges",
  readOn: "2026-10-20",
  entity: "Consorsbank",
};

const SILVER = { base: 4.95, rate: 0.0025, min: 9.95, max: 69 };
const GOLD = { base: 3.95, rate: 0.0025, min: 8.95, max: 59, from: 26 };

// Margin on the mid, in units of the currency per euro, "3.4 Margen".
const FX_MARGIN = {
  AUD: 0.025,
  DKK: 0.02,
  GBP: 0.002,
  HKD: 0.15,
  INR: 2,
  JPY: 0.36,
  CAD: 0.006,
  MXN: 0.3,
  NZD: 0.03,
  NOK: 0.024,
  PLN: 0.08,
  SEK: 0.024,
  CHF: 0.003,
  SGD: 0.03,
  ZAR: 0.15,
  KRW: 18,
  THB: 1.4,
  CZK: 0.5,
  TRY: 0.05,
  HUF: 5,
  USD: 0.003,
};

// German places. `exchange` names the exchange's own charges, priced by
// EXCHANGE_FEE; `extra` names what the price list adds without a figure.
const GERMAN = {
  TRADEGATE: { fee: 0.95, label: "Tradegate" },
  GETTEX: { fee: 1.95, label: "gettex" },
  LSEXCHANGE: { fee: 1.95, label: "LS Exchange" },
  QUOTRIX: { fee: 1.95, label: "Quotrix" },
  BORSEXETRA: { fee: 1.95, label: "Xetra", exchange: "xetra" },
  BORSEFRANKFURT: { fee: 2.95, label: "Frankfurt", exchange: "frankfurt" },
  BORSEMUNCHEN: { fee: 2.95, label: "Munich", exchange: "munich" },
  BORSESTUTTGART: { fee: 2.95, label: "Stuttgart", exchange: "stuttgart" },
  BORSEDUSSELDORF: { fee: 4.95, label: "Düsseldorf", exchange: "dusseldorf" },
  BORSEHAMBURG: { fee: 4.95, label: "Hamburg", exchange: "boag" },
  BORSEHANNOVER: { fee: 4.95, label: "Hannover", exchange: "boag" },
  BORSEBERLIN: {
    fee: 4.95,
    label: "Berlin",
    extra: "Transaktionsentgelt, Maklercourtage et Handelsentgelt",
    closed: "le parquet de Berlin (XONTRO) a fermé le 1er janvier 2026 : aucune grille de frais de bourse en vigueur",
  },
};

// The exchanges' own charges, in euro a side. Sources and dates in the
// header. VAT is added where the list says "zzgl. Umsatzsteuer".
const VAT = 1.19;
const clamp = (value, min, max) => Math.min(max ?? Infinity, Math.max(min ?? 0, value));

// DAX 40 on 22 June 2026, ISINs as in this catalogue.
const DAX40 = new Set(
  `
  DE000A1EWWW0 NL0000235190 DE0008404005 DE000BASF111 DE000BAY0017 DE0005200000
  DE0005190003 DE000A1DAHH0 DE000CBK1001 DE0005439004 DE000DTR0CK8 DE0005140008
  DE0005810055 DE0005557508 DE0005552004 DE000ENAG999 DE000FRE5EN2 DE0005785802
  DE0006602006 DE0008402215 DE0006047004 DE0006048432 DE0006070006 DE0006231004
  DE0007100000 DE0006599905 DE000A0D9PT0 DE0008430026 NL0015002SN0 DE0007030009
  DE0007037129 DE0007164600 DE000A12DM80 DE0007236101 DE000ENER6Y0 DE000SHL1006
  DE000SYM9999 DE0007664039 DE000A1ML7J1 DE000ZAL1111
`.split(/\s+/).filter(Boolean),
);

// Börse Stuttgart, Stand 10.07.2026: bands of the order value.
const STUTTGART_DAX = [
  { to: 15000, rate: 0.00062, min: 2.09, max: 63 },
  { to: 50000, rate: 0.00042, min: 9.3, max: 63 },
  { to: Infinity, rate: 0.00036, min: 21, max: 63 },
];
const STUTTGART_SHARE = [
  { to: 15000, rate: 0.00095, min: 2.73, max: 63 },
  { to: 50000, rate: 0.00075, min: 14.25, max: 63 },
  { to: Infinity, rate: 0.0007, min: 37.5, max: 63 },
];
const STUTTGART_ETP = [
  { to: 12100, rate: 0.001 },
  { to: 100000, rate: 0.0004, min: 12.1 },
  { to: Infinity, rate: 0.0001, min: 40 },
];

const euro = (x) => x.toFixed(2).replace(".", ",");

// What a listing is, for the exchange tables: "dax", "share" or "etp".
function kindOf(listing) {
  if (listing.type === "STOCK") return DAX40.has(listing.isin) ? "dax" : "share";
  if (["ETF", "ETC", "ETN", "ETP", "FUND"].includes(listing.type)) return "etp";
  return null;
}

// { eur, note } for one side, or { eur: null, why }.
const EXCHANGE_FEE = {
  xetra(v, kind) {
    const base = kind === "etp" ? Math.min(v, 1000000) : v;
    const eur = Math.max(0.6, base * 0.000048);
    return { eur, note: `Transaktionsentgelt Xetra ${euro(eur)} € (0,48 pb, min 0,60 €, modèle High Volume)` };
  },
  frankfurt(v) {
    const eur = Math.max(2.52, v * 0.000504);
    return { eur, note: `Handelsentgelt Francfort ${euro(eur)} € (5,04 pb, min 2,52 €)` };
  },
  stuttgart(v, kind) {
    const steps = kind === "etp" ? STUTTGART_ETP : kind === "dax" ? STUTTGART_DAX : STUTTGART_SHARE;
    const hit = steps.find((s) => v <= s.to);
    const eur = clamp(v * hit.rate, hit.min, hit.max);
    const table = kind === "etp" ? "ETP" : kind === "dax" ? "action du DAX" : "autre action";
    return { eur, note: `Transaktionsentgelt Stuttgart ${euro(eur)} € (${table}, ${(hit.rate * 1000).toFixed(2).replace(".", ",")} ‰, hors TVA)` };
  },
  munich(v, kind) {
    const fee = clamp(v * 0.00029, 1.3, 14) * VAT;
    const courtage = Math.max(0.75, v * (kind === "dax" ? 0.0004 : 0.0008));
    return {
      eur: fee + courtage,
      note: `Munich : entgelt ${euro(fee)} € TTC (0,029 %, min 1,30 €, max 14 €) + courtage ${euro(courtage)} € (${kind === "dax" ? "0,4" : "0,8"} ‰, min 0,75 €)`,
    };
  },
  dusseldorf(v, kind) {
    const fee = (kind === "etp" ? clamp(v * 0.00038, 1, 19) : Math.max(1.3, v * 0.00038)) * VAT;
    const courtage = kind === "etp" ? Math.max(0.75, v * 0.0008) : 0;
    return {
      eur: fee + courtage,
      note:
        `Düsseldorf : entgelt ${euro(fee)} € TTC (3,8 pb, ${kind === "etp" ? "min 1,00 €, max 19 €" : "min 1,30 €"}) + ` +
        (kind === "etp" ? `courtage ${euro(courtage)} € (0,8 ‰, min 0,75 €)` : "courtage 0 (Quality Trading, actions)"),
    };
  },
  boag(v, kind, listing, label) {
    const fee = clamp(v * 0.00025, kind === "etp" ? 1.4 : 1.3, 11) * VAT;
    let courtage;
    if (kind === "etp") courtage = Math.max(0.75, v * 0.0008);
    else if (kind === "dax") courtage = v <= 50000 ? 0 : Math.max(0.75, v * 0.0004);
    else if (!String(listing.isin || "").startsWith("DE")) courtage = v <= 25000 ? 0 : Math.max(0.75, v * 0.0008);
    else if (v > 25000) courtage = Math.max(0.75, v * 0.0008);
    else {
      return {
        eur: null,
        why:
          `${label} : courtage nulle jusqu'à 25 000 € pour une action du MDAX, du TecDAX ou du SDAX, 0,8 ‰ sinon ; ` +
          `l'appartenance à ces indices n'est pas dans le catalogue`,
      };
    }
    return {
      eur: fee + courtage,
      note:
        `${label} : entgelt ${euro(fee)} € TTC (0,25 ‰, min ${kind === "etp" ? "1,40" : "1,30"} €, max 11 €) + ` +
        (courtage > 0
          ? `courtage ${euro(courtage)} €`
          : `courtage 0 (${kind === "dax" ? "action du DAX jusqu'à 50 000 €" : "action étrangère jusqu'à 25 000 €"})`),
    };
  },
};

export function exchangeFeeEur(where, notionalEur, listing) {
  if (!where?.exchange) return null;
  const kind = kindOf(listing);
  if (!kind) return { eur: null, why: `${where.label} : aucune grille de la bourse pour le type ${listing.type || "?"}` };
  return EXCHANGE_FEE[where.exchange](notionalEur, kind, listing, where.label);
}

// Foreign places: the fixed place cost in euro and the home currency.
const PARIS = { fee: 36, home: ["EUR"], label: "Paris" };
const BRUSSELS = { fee: 56, home: ["EUR"], label: "Brussels" };
const LISBON = { fee: 64, home: ["EUR"], label: "Lisbon" };
const MADRID = { fee: 59, home: ["EUR"], label: "Madrid" };
const STOCKHOLM = { fee: 65, home: ["SEK"], label: "Stockholm" };
const HELSINKI = { fee: 56, home: ["EUR"], label: "Helsinki" };
const COPENHAGEN = { fee: 47, home: ["DKK"], label: "Copenhagen" };
const CANADA = { fee: 69, home: ["CAD"], label: "Canada Smart Order" };
const USA = { fee: 21, home: ["USD"], label: "USA Smart Order", us: true };
const FOREIGN = {
  EURONEXTPARIS: PARIS,
  EURONEXTGROWTHPARIS: PARIS,
  EURONEXTACCESSPARIS: PARIS,
  EURONEXTAMSTERDAM: { fee: 42, home: ["EUR"], label: "Amsterdam" },
  EURONEXTBRUSSELS: BRUSSELS,
  EURONEXTACCESSBRUSSELS: BRUSSELS,
  EURONEXTGROWTHBRUSSELS: BRUSSELS,
  EURONEXTDUBLIN: { fee: 54, home: ["EUR"], label: "Dublin" },
  EURONEXTLISBON: LISBON,
  EURONEXTACCESSLISBON: LISBON,
  EURONEXTGROWTHLISBON: LISBON,
  EURONEXTMILAN: { fee: 56, home: ["EUR"], label: "Milan" },
  EURONEXTOSLO: { fee: 69, home: ["NOK"], label: "Oslo" },
  BOLSADEMADRID: MADRID,
  BMEGROWTH: MADRID,
  LONDONSTOCKEXCHANGE: { fee: 34, home: ["GBX", "GBP"], label: "London" },
  SIXSWISSEXCHANGE: { fee: 41, home: ["CHF"], label: "Zurich" },
  WIENERBORSE: { fee: 56, home: ["EUR"], label: "Vienna" },
  LUXEMBOURGSTOCKEXCHANGE: { fee: 53, home: ["EUR"], label: "Luxembourg" },
  NASDAQSTOCKHOLM: STOCKHOLM,
  FIRSTNORTHSTOCKHOLM: STOCKHOLM,
  NASDAQHELSINKI: HELSINKI,
  FIRSTNORTHHELSINKI: HELSINKI,
  NASDAQCOPENHAGEN: COPENHAGEN,
  FIRSTNORTHDENMARK: COPENHAGEN,
  TORONTOSTOCKEXCHANGE: CANADA,
  TSXVENTURE: CANADA,
  CANADIANSECURITIESEXCHANGE: CANADA,
  PURETRADING: CANADA,
  NASDAQ: USA,
  NEWYORKSTOCKEXCHANGE: USA,
  NYSEAMERICAN: USA,
  NYSEARCA: USA,
  TOKYO: { fee: 72, home: ["JPY"], label: "Tokyo" },
  AUSTRALIANSECURITIESEXCHANGE: { fee: 101, home: ["AUD"], label: "Sydney" },
  HONGKONGSTOCKEXCHANGE: { fee: 124, home: ["HKD"], label: "Hong Kong" },
  SINGAPOREEXCHANGE: { fee: 121, home: ["SGD"], label: "Singapore" },
  NZX: { fee: 136, home: ["NZD"], label: "Wellington" },
};
// In the catalogue, with no place cost in the price list.
const UNPRICED = new Set(["NASDAQICELAND", "FIRSTNORTHICELAND"]);

// StarPartner ETFs, buy order on Tradegate. Read 2026-10-20 from the ETF
// finder (STARPARTNER_CC_PRICE 0 and 3.95).
const STAR_ZERO = new Set(
  `
  DE000ETF9074 DE000ETF9090 FR0010150458 FR0010524777 FR0010527275 FR0014003FW1
  IE000004V778 IE0000902GT6 IE0000ZVYDH0 IE00016PSX47 IE0001GSQ2O9 IE0001TLQX55
  IE00026BEVM6 IE0003NQ0IY5 IE0003W9O921 IE0004HBJKG0 IE0004J37T45 IE00052T92P8
  IE0005E47AH7 IE0005HNE843 IE0005NYD352 IE000611IJM3 IE00061J0RC6 IE0006FDYJF8
  IE0006FM6MI8 IE0006GNB732 IE0006YM7D84 IE00074JLU02 IE00077IIPQ8 IE0007M3MLF3
  IE0007UE04X9 IE0007ULOZS8 IE0007WJ6B10 IE0007YP0PL1 IE0008TKP6O7 IE0008YN0OY8
  IE000940RNE6 IE0009SJ3GE3 IE000ANYHV73 IE000CL68Z69 IE000CXVOXQ1 IE000D1017N2
  IE000DVHJV46 IE000E7EI9P0 IE000EFHIFG3 IE000ENYES77 IE000ER61U30 IE000F9AQNW6
  IE000FCGBU62 IE000FF2EBQ8 IE000GEHNQU9 IE000GYDNJS5 IE000HT7E0B1 IE000IDLWOL4
  IE000J0LN0R5 IE000JKS50V3 IE000JZYIUN0 IE000K1P4V37 IE000KF370H3 IE000KHX9DX6
  IE000KXCEXR3 IE000KYX7IP4 IE000LAP5Z18 IE000LAUZQT6 IE000LTA2082 IE000M86QRT4
  IE000MCVFK47 IE000MJIXFE0 IE000MO2MB07 IE000N9MLVT1 IE000NM0ALX6 IE000NS5HRY9
  IE000O8KMPM1 IE000P3D0W60 IE000P4AYI47 IE000PMX0MW6 IE000Q6C8036 IE000SRQBBT6
  IE000TL3PL69 IE000TZT8TI0 IE000UATQPE2 IE000UZCJS58 IE000V04SL39 IE000V0GDVU7
  IE000VCBWFL8 IE000VXC51U5 IE000W6L2AI3 IE000WP7CVZ7 IE000WQ16XQ4 IE000X9TLGN8
  IE000XLJ2JQ9 IE000XNILW20 IE000Y6ZXZ48 IE000Y77LGG9 IE000YGEAK03 IE000ZIJ5B20
  IE00BD6RZT93 IE00BD6RZW23 IE00BDF12W49 IE00BDF16114 IE00BDVPNG13 IE00BFMNHK08
  IE00BG370F43 IE00BGHQ0G80 IE00BJ0KDQ92 IE00BJGWQN72 IE00BK1PV551 IE00BKLF1R75
  IE00BLPK3577 IE00BM67HT60 IE00BM9TSP27 IE00BMY76136 IE00BNC1G699 IE00BNKF6C99
  IE00BQQ3Q067 IE00BQZJBM26 IE00BQZJBQ63 IE00BQZJBX31 IE00BQZJC527 IE00BYQCZJ13
  IE00BYQCZN58 IE00BYZNF849 IE00BZ02LR44 IE00BZ56RG20 IE00BZ56RN96 IE00BZ56SW52
  IE00BZ56TQ67 LU0274209740 LU0292107991 LU0292108619 LU0292109005 LU0322252171
  LU0322252338 LU0476289540 LU0490618542 LU0592216393 LU0838782315 LU0908501058
  LU1109943388 LU1242369327 LU1291097779 LU1291101555 LU1377381717 LU1377382103
  LU1377382285 LU1377382368 LU1481201025 LU1481201611 LU1481201702 LU1481202692
  LU1525418643 LU1547515137 LU1602144575 LU1602144906 LU1615090864 LU1615092217
  LU1646360542 LU1659681230 LU1659681313 LU1659681586 LU1659681669 LU1681039647
  LU1681040223 LU1681040496 LU1681040900 LU1681041031 LU1681041114 LU1681046006
  LU1681046261 LU1737653987 LU1753045332 LU1753045415 LU1753045845 LU1753045928
  LU1806495575 LU1812090543 LU1834988278 LU1859444769 LU1861137484 LU1861138961
  LU1900066033 LU1900067940 LU1900068914 LU1940199711 LU1953136287 LU1953136527
  LU1953137681 LU1981859819 LU2008760592 LU2008761053 LU2008763935 LU2023678282
  LU2023678449 LU2023678878 LU2023679090 LU2037748345 LU2037748774 LU2109787049
  LU2109787551 LU2109787635 LU2130768844 LU2182388236 LU2194447293 LU2194449075
  LU2195226068 LU2233156749 LU2244386053 LU2244386137 LU2244387457 LU2244387887
  LU2269164310 LU2296661775 LU2300294589 LU2314312849 LU2356220926 LU2365458145
  LU2365458731 LU2365458814 LU2368674631 LU2370241684 LU2385068593 LU2402389261
  LU2439113387 LU2439119236 LU2439733507 LU2439734141 LU2446383338 LU2469465822
  LU2470620761 LU2470620845 LU2490201840 LU2533810789 LU2533810862 LU2572257397
  LU2572257470 LU2611732806 LU2697596745 LU2697596828 LU2697597552 LU2697597719
  LU2823895847 LU2823896811 LU2859297330 LU2859392081 LU3038520774
`.split(/\s+/).filter(Boolean),
);
const STAR_FLAT = new Set(
  `
  DE000A2QP323 DE000A2QP349 DE000ETF7011 DE000ETF7029 DE000ETF7037 DE000ETF9033
  DE000ETF9082 FR0007054358 FR0007056841 FR0010245514 FR0010261198 FR0010315770
  FR0010405431 FR0010429068 FR0010655746 FR0010717090 FR0010754200 FR0010756114
  FR0010790980 FR0010821819 FR0010930644 FR0011475078 FR0011550193 FR0011550672
  FR0011720911 FR0011857234 FR0012739431 FR0012740983 FR0013041530 IE00002ZKAP0
  IE0001DKJVC2 IE0001FQFU60 IE00023EZQ82 IE0002PGSLZ5 IE0002Y8CX98 IE00036F4K40
  IE0003BJ2JS4 IE000472H9T4 IE00050EGWG5 IE0006FFX5U1 IE0006WW1TQ4 IE00085PWS28
  IE00094GSCQ4 IE000AZV0AS3 IE000CNSFAR2 IE000CXLGK86 IE000F354Q61 IE000GWA2J58
  IE000KD0BZ68 IE000OV4XWA3 IE000PSF3A70 IE000Q9W2IR3 IE000RN58M26 IE000UZZ5D45
  IE000W8WMSL2 IE000X7DRW38 IE000XL4IXU1 IE000XOQ9TK4 IE000Y83YZ44 IE000YBGJ9I4
  IE000YDOORK7 IE00B0M63623 IE00B1FZS574 IE00B27YCF74 IE00B3VWLG82 IE00B3VWMM18
  IE00B3Y8D011 IE00B4PY7Y77 IE00B4WXJD03 IE00B5WHFQ43 IE00B6QGFW01 IE00B6TLBW47
  IE00B9MRJJ36 IE00BCLWRG39 IE00BDVPNS35 IE00BDVPNV63 IE00BF3N7219 IE00BG88WG77
  IE00BGDPWV87 IE00BGDQ0T50 IE00BGV5VN51 IE00BGV5VR99 IE00BH361H73 IE00BJ5JPH63
  IE00BJ5JPJ87 IE00BJZ2DD79 IE00BKM4H197 IE00BKP5L730 IE00BKPX3K41 IE00BKT1CS59
  IE00BKTLJC87 IE00BKY4W127 IE00BL25JL35 IE00BL25JM42 IE00BL25JN58 IE00BL25JP72
  IE00BLLZQ805 IE00BLLZQS08 IE00BLNMYC90 IE00BLP53M98 IE00BM67HJ62 IE00BM67HK77
  IE00BM67HL84 IE00BM67HR47 IE00BM67HV82 IE00BMFKG444 IE00BTJRMP35 IE00BVXBH163
  IE00BVXC4854 IE00BYM31M36 IE00BYMLZY74 IE00BYQCZX56 IE00BYXPXK00 LU0192223062
  LU0252633754 LU0274208692 LU0274209237 LU0292095535 LU0292096186 LU0292106167
  LU0292107645 LU0322250712 LU0322253229 LU0322253906 LU0328475792 LU0397221945
  LU0489337690 LU0496786905 LU0514695187 LU0514695690 LU0533032859 LU0533033238
  LU0533033667 LU0614173549 LU0779800910 LU0832436512 LU0875160326 LU0950381748
  LU1220245556 LU1287022708 LU1287023003 LU1287023185 LU1287023268 LU1287023342
  LU1291109616 LU1547516291 LU1563454310 LU1563454823 LU1574142243 LU1589349734
  LU1598688189 LU1598689153 LU1598690169 LU1646360971 LU1650487413 LU1650487926
  LU1650488494 LU1650488817 LU1650489385 LU1650489898 LU1650492256 LU1681037864
  LU1681038243 LU1681038599 LU1681038672 LU1681038912 LU1681039134 LU1681039480
  LU1681041460 LU1681041627 LU1681041890 LU1681041973 LU1681042609 LU1681042864
  LU1681043086 LU1681043599 LU1681043912 LU1681044480 LU1681044647 LU1681044720
  LU1681045024 LU1681045370 LU1681045537 LU1681046691 LU1681046774 LU1681046931
  LU1681048127 LU1681048630 LU1681048804 LU1681049109 LU1686830909 LU1691909508
  LU1737652310 LU1737652583 LU1737652823 LU1737653631 LU1781541252 LU1781541849
  LU1812092168 LU1829218749 LU1829219390 LU1829219556 LU1829219713 LU1829220216
  LU1829221024 LU1832418773 LU1834983477 LU1834983550 LU1834983634 LU1834985845
  LU1834986900 LU1834987890 LU1834987973 LU1834988518 LU1834988609 LU1834988781
  LU1834988864 LU1841731745 LU1861132840 LU1900065811 LU1900066207 LU1900066462
  LU1900066975 LU1900067601 LU1900068161 LU1900068328 LU2009202107 LU2082996112
  LU2082996385 LU2082996542 LU2082997359 LU2082997516 LU2082997789 LU2082997946
  LU2082998837 LU2082999058 LU2082999132 LU2082999215 LU2090062436 LU2090062782
  LU2090062865 LU2090062949 LU2090063673 LU2133056387 LU2197908721 LU2263803533
  LU2376679564 LU2572256662 LU2572256746 LU2572257124 LU2573966905 LU2581375156
  LU2611732475 LU2611732558 LU2673522830 LU2673522913 LU2673523051 LU2673523135
  LU2673523218 LU2673523309 LU2673523481 LU2673523564 LU2809864296 LU2809864452
  LU2809864619 LU2810185665 LU2914558916 LU3061478973
`.split(/\s+/).filter(Boolean),
);
const STAR_FLAT_EUR = 3.95;

const catalogue = fs.existsSync(CATALOGUE) ? JSON.parse(fs.readFileSync(CATALOGUE, "utf8")) : null;
const rows = Array.isArray(catalogue) ? catalogue : catalogue?.rows || [];
if (rows.length) warmListingIndex(rows);

const loose = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const code = (s) => String(s || "").trim().toUpperCase();

const dollars = (amount, currency) => {
  const v = toUsd(amount, currency);
  return v == null ? null : Number(v);
};

function eurOf(amount, currency) {
  const ccy = code(currency);
  if (!(amount >= 0) || !ccy) return null;
  if (ccy === "EUR") return amount;
  const usd = toUsd(amount, ccy);
  const per = usdPer("EUR");
  if (usd == null || !(per > 0)) return null;
  return usd / per;
}

export function commissionEur(notionalEur, tier = SILVER) {
  return Math.min(tier.max, Math.max(tier.min, tier.base + tier.rate * notionalEur));
}

// The 3.4 margin as a fraction of the amount: units per euro over the
// euro's mid in that currency. GBX converts as GBP.
export function fxRate(currency) {
  const ccy = listingCash(currency);
  const margin = FX_MARGIN[ccy];
  const eur = usdPer("EUR");
  const one = usdPer(ccy);
  if (margin == null || !(eur > 0) || !(one > 0)) return null;
  return margin / (eur / one);
}

export function placeOf(exchange) {
  const e = loose(exchange);
  if (GERMAN[e]) return { kind: "german", ...GERMAN[e] };
  if (FOREIGN[e]) return { kind: "foreign", ...FOREIGN[e] };
  if (UNPRICED.has(e)) return { kind: "unpriced" };
  return null;
}

function starBuy(isin, place) {
  if (place?.label !== "Tradegate") return null;
  const id = code(isin);
  if (STAR_ZERO.has(id)) return 0;
  if (STAR_FLAT.has(id)) return STAR_FLAT_EUR;
  return null;
}

function pct(x) {
  const two = Number((100 * x).toFixed(2));
  return two > 0 ? String(two) : String(Number((100 * x).toPrecision(1)));
}

function findListing({ etf, place, currency }) {
  const asked = loose(etf);
  const wantPlace = loose(place);
  const wantCurrency = code(currency);
  const named = rowsNamed(rows, asked, (r) => loose(r.isin) === asked || loose(r.ticker) === asked || loose(r.query) === asked);
  const matches = named
    .map((r) => ({ row: r, ...listingKey(r) }))
    .filter((m) => !wantPlace || loose(m.row.exchange) === wantPlace)
    .filter((m) => !wantCurrency || code(m.row.currency) === wantCurrency);
  return { named, matches };
}

export function roundTrip({ etf, place, currency, shares, price, bp = null, perShare = null, plan = null }) {
  const answer = {
    usd: null,
    brokerFees: null,
    ccy: QUOTE,
    etf,
    place,
    currency,
    plan,
    onlineBuy: true,
    cashCurrency: "EUR",
    url: SCHEDULE.url,
    remark: "",
  };
  if (!catalogue) {
    return { ...answer, why: "le catalogue Consorsbank n'existe pas encore : lancer `node brokers/consorsbank/consorsbank_scraping.mjs`" };
  }
  const { named, matches } = findListing({ etf, place, currency });
  if (!named.length) return { ...answer, why: `${etf} n'est pas dans le catalogue Consorsbank` };
  if (!matches.length) {
    return {
      ...answer,
      why: `${etf} n'est pas coté sur cette place dans cette devise chez Consorsbank`,
      alternatives: named.slice(0, 8).map((r) => `${r.ticker || r.isin} ${r.currency || "?"} @ ${r.exchange || "?"}`),
    };
  }

  const m = matches[0];
  const book = spreadLeaf(spreads, {
    isin: m.row.isin,
    mic: m.venue?.mic ?? null,
    currency: m.row.currency,
    unsourced: m.unsourced,
    broker: "consorsbank",
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
  let marketPerShare = perShare ?? book.leaf?.perShare ?? null;
  let marketBp = bp ?? (marketPerShare != null ? null : book.leaf?.bp ?? null);
  const american = ["XNAS", "XNYS", "ARCX", "XASE", "BATS"].includes(listing.mic) && listing.currency === "USD";
  if (american && bp == null && perShare == null && marketBp == null && marketPerShare == null) {
    const quoted = usBookPerShare({ broker: "consorsbank", ticker: listing.ticker });
    if (quoted != null) marketPerShare = quoted;
  }
  const parts = bookParts({
    bp: marketBp,
    perShare: marketPerShare,
    venue: marketPerShare != null && american ? { source: "us605" } : m.venue,
    unsourced: m.unsourced,
    toUsd: (value) => dollars(value, listing.currency),
  });
  const tax = taxesOf(listing.isin);
  const taxTotal = Object.values(taxRates(tax)).reduce((sum, rate) => sum + rate, 0);
  const where = placeOf(listing.brokerExchange);
  const cash = listingCash(listing.currency);
  const shared = {
    ...answer,
    listing,
    remark: "",
    cashCurrency: "EUR",
    bp: marketBp,
    perShare: marketPerShare,
    basis:
      `barème Consorsbank relu le ${SCHEDULE.readOn} (PLV du 9 octobre 2025, Stand 07/2026) : statut Silver, ` +
      `4,95 € + 0,25 % par ordre, plancher 9,95 €, plafond 69 €, plus le coût de place ; ` +
      `frais de la bourse allemande selon sa grille 2026 (Xetra, Francfort : modèle lu sur des avis d'opéré Consorsbank)`,
    tax,
    ccy: QUOTE,
    fx: { quote: QUOTE, asOf: FX_AS_OF, listing: usdPer(listing.currency), eur: usdPer("EUR") },
  };

  if (!where) {
    return { ...shared, why: `${listing.brokerExchange || listing.exchange} n'a pas de coût de place publié chez Consorsbank` };
  }
  if (where.kind === "unpriced") {
    return {
      ...shared,
      why:
        `${listing.brokerExchange} : aucun coût de place publié par la Consorsbank (l'Islande n'est pas dans sa liste ` +
        `des bourses étrangères) et l'ISK n'est plus convertible chez elle depuis 2008`,
    };
  }
  if (where.kind === "foreign" && !where.home.includes(listing.currency)) {
    return {
      ...shared,
      onlineBuy: false,
      why:
        `la Consorsbank ne traite une bourse étrangère que dans sa devise locale (${where.home.join("/")}) : ` +
        `un ordre ${listing.currency} sur ${where.label} est accepté puis annulé (FAQ Börsen und Handelsplätze International)`,
    };
  }

  const n = Number(shares);
  const p = Number(price);
  if (!(n > 0 && p > 0)) {
    return { ...shared, why: !(n > 0) ? "aucun nombre de parts" : "aucun prix pour cette ligne : lancer node assets/prices.mjs" };
  }

  const notional = n * p;
  const notionalUsd = dollars(notional, listing.currency);
  const notionalEur = eurOf(notional, listing.currency);
  const trade = {
    shares: n,
    price: p,
    notional,
    notionalUsd: finite(notionalUsd, 6),
    currency: listing.currency,
  };
  if (notionalEur == null) return { ...shared, trade, why: `aucun cours de l'euro pour convertir ${listing.currency}` };

  if (where.kind === "german" && listing.currency !== "EUR") {
    return {
      ...shared,
      trade,
      why:
        `une place allemande règle toujours en euro et convertit ${listing.currency} à son propre cours, ` +
        `que la Consorsbank ne publie pas : change forcé inconnu`,
    };
  }

  // One side: commission (or the StarPartner buy price) plus the place cost.
  const star = where.kind === "german" && listing.type !== "STOCK" ? starBuy(listing.isin, where) : null;
  const commission = commissionEur(notionalEur, SILVER);
  // The exchange's own charge, on top of the place cost (same both ways).
  const bourse = where.kind === "german" ? exchangeFeeEur(where, notionalEur, listing) : null;
  const bourseEach = bourse?.eur ?? 0;
  const unpriced = Boolean(where.extra) || (bourse != null && bourse.eur == null);
  const buyEach = star != null ? star : commission + where.fee + bourseEach;
  const sellEach = commission + where.fee + bourseEach;

  // A deposit currency is not converted; CHF, DKK and the rest convert on
  // the buy and back on the sell at the 3.4 margin.
  const held = listing.currency === "EUR" || depositHas("consorsbank", null, cash);
  const rate = cash === "EUR" ? 0 : fxRate(listing.currency);
  if (!held && rate == null) {
    return {
      ...shared,
      trade,
      why: `aucune marge de change publiée pour ${cash} : change forcé inconnu`,
    };
  }
  const fxEach = held ? 0 : notionalEur * rate;

  // Gold, from 26 orders a calendar year: same place cost, lower commission.
  const goldBuy = star != null ? star : commissionEur(notionalEur, GOLD) + where.fee + bourseEach;
  const goldSell = commissionEur(notionalEur, GOLD) + where.fee + bourseEach;
  const goldSaving = buyEach + sellEach - (goldBuy + goldSell);
  const remarks = [];
  if (held && cash !== "EUR" && rate != null) remarks.push(fxRemark(pct(rate), listing.currency));
  if (goldSaving > 0.005) remarks.push(`If ${GOLD.from} or more trades a year, fees ${pct(goldSaving / notionalEur)}% lower.`);

  const courtageUsd = dollars(buyEach + sellEach, "EUR");
  const fxUsd = dollars(fxEach * 2, "EUR");
  const known = plus(courtageUsd, fxUsd);
  const brokerFees = unpriced ? null : known;
  const bookUsd =
    parts.a == null || notionalUsd == null || parts.b == null ? null : parts.a * notionalUsd + parts.b * n;
  const taxUsd = notionalUsd == null ? null : notionalUsd * taxTotal;
  const usd = plus(bookUsd, brokerFees, taxUsd);

  const confidence = [
    shared.basis,
    star != null
      ? `achat StarPartner sur Tradegate ${star.toFixed(2)} € tout compris, vente ${sellEach.toFixed(2)} € ` +
        `(commission ${commission.toFixed(2)} € + place ${where.fee.toFixed(2)} €)`
      : `commission ${commission.toFixed(2)} € + place ${where.label} ${where.fee.toFixed(2)} €, par ordre`,
    bourse?.note ? `${bourse.note}, par ordre` : null,
    where.extra ? `plus ${where.extra} de la bourse, non chiffré par la Consorsbank : total inconnu` : null,
    bourse?.why ? `${bourse.why} : total inconnu` : null,
    where.kind === "foreign" ? "coût de place étranger fixe ; frais tiers « ggf. » non publiés, comptés à 0" : null,
    where.us ? "SEC et TAF non publiés, comptés à 0 ; courtier US « société du groupe BNP Paribas » non nommé : NBBO coté" : null,
    held
      ? cash === "EUR"
        ? "montant en euro"
        : `compte en ${cash} possible : change ${rate == null ? "?" : pct(rate)} % hors total`
      : `change forcé EUR→${cash} : ${pct(rate)} % du montant, à l'achat et à la vente (marge 3.4)`,
    taxTotal > 0 ? `taxe ${(100 * taxTotal).toFixed(3)} % à l'achat (taxMap)` : null,
    marketPerShare != null
      ? american
        ? `carnet ${marketPerShare} $ la part, NBBO coté`
        : `carnet ${marketPerShare} $ la part`
      : marketBp != null
        ? `carnet ${marketBp} bp`
        : `pas de feuille de carnet : ${m.unsourced?.name || listing.exchange}`,
  ]
    .filter(Boolean)
    .join(" ; ");

  return {
    ...shared,
    ...(held || cash === "EUR"
      ? {}
      : {
          basis:
            `${shared.basis} ; change forcé EUR→${cash} : marge ${FX_MARGIN[cash]} ${cash} par euro sur le fixing ` +
            `Bloomberg, soit ${pct(rate)} % à l'achat et à la vente (Preise & Zinsen Sonstiges, 3.4)`,
        }),
    usd: finite(usd, 6),
    brokerFees: finite(brokerFees, 6),
    remark: remarks.join("\n"),
    commission: {
      base: SILVER.base,
      rate: SILVER.rate,
      min: SILVER.min,
      cap: SILVER.max,
      each: sellEach,
      buyEach,
      sellEach,
      commissionEach: commission,
      venueEach: where.fee,
      ...(bourse ? { exchangeEach: bourse.eur } : {}),
      ...(star != null ? { starBuy: star } : {}),
      fxEach,
      currency: "EUR",
      eachWay: true,
    },
    ...(where.closed
      ? { why: where.closed }
      : where.extra
      ? {
          why:
            `${where.label} : la Consorsbank facture ${where.fee.toFixed(2).replace(".", ",")} € plus ${where.extra} ` +
            `de la bourse, sans en publier le montant`,
        }
      : bourse?.why
      ? { why: bourse.why }
      : bookUsd == null
        ? { why: `aucun carnet pour ${m.unsourced?.name || listing.exchange} : ${m.unsourced?.why || "pas de feuille de carnet"}` }
        : {}),
    trade,
    parts: {
      marché: finite(bookUsd, 6),
      courtage: unpriced ? null : finite(courtageUsd, 6),
      change: finite(fxUsd, 6),
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
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const [etf, place, currency] = positional;
  if (!etf) {
    console.error("usage: node brokers/consorsbank/consorsbank_cost.mjs <ticker|ISIN> [venue] [currency] [--shares=n] [--price=p]");
    process.exit(2);
  }
  const out = roundTrip({
    etf,
    place,
    currency,
    shares: flag("shares") ? Number(flag("shares")) : null,
    price: flag("price") ? Number(flag("price")) : null,
    plan: flag("plan"),
  });
  if (!out.listing) {
    console.log(out.why);
    if (out.alternatives) console.log(out.alternatives.join("\n"));
    process.exit(0);
  }
  const l = out.listing;
  console.log(`${l.ticker || l.isin} — ${l.name || ""}`);
  console.log(`${l.exchange}, ${l.currency}, ${(l.type || "").toLowerCase()}\n`);
  if (out.trade) {
    const t = out.trade;
    console.log(`${t.shares} shares at ${t.price} ${t.currency} = ${t.notional.toFixed(2)} ${t.currency}\n`);
    console.log(`round trip    : ${out.usd == null ? "unknown" : `${out.usd} $`}`);
    console.log(`broker fees   : ${out.brokerFees == null ? "unknown" : `${out.brokerFees} $`}`);
    if (out.parts) {
      for (const [k, v] of Object.entries(out.parts)) console.log(`  ${k.padEnd(12)}: ${v == null ? "unknown" : `${v} $`}`);
    }
  }
  if (!out.onlineBuy) console.log("not buyable online");
  if (out.why) console.log(`\n${out.why}`);
  if (out.remark) console.log(`\n${out.remark}`);
  if (out.confidence) console.log(`\n${out.confidence}`);
}

printCli();
