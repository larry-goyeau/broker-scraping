// Who a scraped broker will onboard, as ISO country codes. The front uses this
// to hide a listing the visitor cannot open an account to trade. The test is
// residency as the broker states it on the application (nationality only when
// the broker names it separately, e.g. bunq / Ginmon).
//
// Lists are taken from the broker's own help or onboarding pages. A broker
// missing here falls back to the home country in broker-list.txt.

export const EEA = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR",
  "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT",
  "RO", "SE", "SI", "SK",
];

export const EU = EEA.filter((c) => c !== "IS" && c !== "LI" && c !== "NO");

export const GCC = ["AE", "BH", "KW", "OM", "QA", "SA"];

const SANCTIONED = ["BY", "CU", "IR", "KP", "RU", "SY"];

export const COUNTRY_NAMES = {
  AD: "Andorra", AE: "United Arab Emirates", AF: "Afghanistan", AL: "Albania",
  AM: "Armenia", AO: "Angola", AR: "Argentina", AT: "Austria", AU: "Australia",
  AZ: "Azerbaijan", BA: "Bosnia and Herzegovina", BD: "Bangladesh", BE: "Belgium",
  BG: "Bulgaria", BH: "Bahrain", BM: "Bermuda", BO: "Bolivia", BR: "Brazil",
  BY: "Belarus", CA: "Canada", CH: "Switzerland", CL: "Chile", CN: "China",
  CO: "Colombia", CR: "Costa Rica", CY: "Cyprus", CZ: "Czechia", DE: "Germany",
  DK: "Denmark", DO: "Dominican Republic", DZ: "Algeria", EC: "Ecuador",
  EE: "Estonia", EG: "Egypt", ES: "Spain", FI: "Finland", FO: "Faroe Islands",
  FR: "France", GB: "United Kingdom", GE: "Georgia", GG: "Guernsey", GH: "Ghana",
  GI: "Gibraltar", GL: "Greenland", GR: "Greece", GT: "Guatemala", HK: "Hong Kong",
  HN: "Honduras", HR: "Croatia", HU: "Hungary", ID: "Indonesia", IE: "Ireland",
  IL: "Israel", IM: "Isle of Man", IN: "India", IS: "Iceland", IT: "Italy",
  JE: "Jersey", JO: "Jordan", JP: "Japan", KE: "Kenya", KN: "Saint Kitts and Nevis",
  KR: "South Korea", KW: "Kuwait", KZ: "Kazakhstan", LB: "Lebanon",
  LI: "Liechtenstein", LK: "Sri Lanka", LT: "Lithuania", LU: "Luxembourg",
  LV: "Latvia", MA: "Morocco", MC: "Monaco", MD: "Moldova", ME: "Montenegro",
  MK: "North Macedonia", MO: "Macau", MR: "Mauritania", MT: "Malta", MX: "Mexico", MY: "Malaysia",
  NG: "Nigeria", NL: "Netherlands", NO: "Norway", NZ: "New Zealand", OM: "Oman",
  PA: "Panama", PE: "Peru", PH: "Philippines", PK: "Pakistan", PL: "Poland",
  PT: "Portugal", QA: "Qatar", RO: "Romania", RS: "Serbia", SA: "Saudi Arabia",
  SE: "Sweden", SG: "Singapore", SI: "Slovenia", SK: "Slovakia", SM: "San Marino",
  SN: "Senegal", SV: "El Salvador", TH: "Thailand", TN: "Tunisia", TR: "Turkey",
  TT: "Trinidad and Tobago", TW: "Taiwan", TZ: "Tanzania", UA: "Ukraine",
  UG: "Uganda", US: "United States", UY: "Uruguay", UZ: "Uzbekistan",
  VA: "Vatican City", VE: "Venezuela", VN: "Vietnam", ZA: "South Africa",
  ZM: "Zambia", ZW: "Zimbabwe",
};

const US = { countries: ["US"] };
const WORLD = { all: true, except: SANCTIONED };
const WORLD_NO_US = { all: true, except: [...SANCTIONED, "US"] };
const WORLD_NO_US_CA = { all: true, except: [...SANCTIONED, "US", "CA"] };

// Trading 212 help centre, four entities (UK / Markets Ltd / AU / EU GmbH).
// Belgium is not on that page.
const T212 = [
  "GB", "GH", "MX", "RS", "AO", "GI", "MD", "TZ", "BH", "GG", "MK", "TH", "BO",
  "HN", "OM", "UG", "CO", "IM", "PE", "AE", "EC", "JE", "PH", "ZM", "SV", "KW",
  "QA", "BG", "LT", "HR", "MT", "CZ", "PL", "EE", "CY", "GR", "RO", "HU", "SK",
  "IT", "SI", "LV", "AU", "DE", "LU", "AT", "NL", "DK", "PT", "FI", "ES", "FR",
  "IS", "IE", "CH", "LI", "SE", "NO",
];

// Trade Republic support (permanent resident) + Poland launch, Sept 2025.
const TRADE_REPUBLIC = [
  "DE", "AT", "FR", "ES", "IT", "NL", "BE", "LU", "FI", "IE", "GR", "PT",
  "EE", "LV", "LT", "SI", "SK", "PL",
];

// DEGIRO CH helpdesk residency table + UK entity.
const DEGIRO = [
  "AU", "AT", "BE", "BG", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "IS", "IE",
  "IT", "LV", "LI", "LT", "LU", "NL", "NZ", "RO", "PL", "PT", "SG", "SK", "SI",
  "ES", "SE", "CH", "GB",
];

// Lightyear official eligibility. Not Poland, not Switzerland, not US persons.
const LIGHTYEAR = [
  "AT", "BE", "BG", "HR", "CY", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "NO", "PT", "SK", "SI", "ES", "SE", "GB",
];

// BUX press / about: eight EU markets.
const BUX = ["NL", "BE", "FR", "DE", "ES", "IT", "AT", "IE"];

// N26 support: stocks/ETFs markets (not the full N26 bank list).
const N26_STOCKS = [
  "DE", "AT", "FR", "ES", "BE", "DK", "EE", "FI", "GR", "IE", "LV", "LT", "NO",
  "PL", "PT", "SK", "SI", "NL",
];

// bunq Stocks: must live in these 11. Ginmon also bans US nationality.
const BUNQ_RESIDENCY = ["AT", "BE", "FR", "DE", "IE", "IT", "LU", "NL", "PT", "SK", "ES"];

// Bitpanda verification list. UK can register; stocks are an EU product.
const BITPANDA = [
  "AD", "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FO", "FI", "FR", "DE",
  "GR", "GG", "VA", "HU", "IS", "IE", "IM", "IT", "JE", "LV", "LI", "LT", "LU",
  "MT", "MC", "NL", "NO", "PL", "PT", "RO", "SM", "RS", "SK", "SI", "ES", "SE",
  "CH", "TR", "GB",
];

// Revolut bank signup is wider (US, AU, JP…). The scraped book is Invest/stocks
// under the UK/EEA entities.
const REVOLUT_STOCKS = [...EEA, "GB", "CH"];

// Saxo onboarding cut of July 2024 (home.saxo country picker), plus usual bans.
const SAXO = [
  "AT", "BE", "HR", "CZ", "DK", "EE", "FO", "FI", "FR", "DE", "GR", "GL", "HU",
  "IS", "IE", "IT", "LV", "LT", "LU", "MT", "MC", "NL", "NO", "PL", "PT", "RO",
  "SK", "SI", "ES", "SE", "CH", "GB", "IL", "QA", "SA", "AE", "HK", "JP", "MY",
  "SG", "TH", "AU",
];

// Firstrade international page (plus ordinary US accounts).
const FIRSTRADE = ["US", "CN", "HK", "IN", "IL", "JP", "KR", "MO", "MY", "MX", "NZ", "SG", "TW"];

// Tradier KB "Permitted and Blocked Countries". Codes we have a name for;
// Algeria is on both lists, so it stays out. UK, CA, AU, LV, MT, BG, HR, CY
// are on the blocked list.
const TRADIER = [
  "AD", "AE", "AM", "AR", "AT", "BD", "BE", "BH", "BM", "BR", "CH", "CL", "CN",
  "CO", "CR", "CZ", "DE", "DK", "DO", "EC", "EE", "EG", "ES", "FI", "FO", "FR",
  "GE", "GL", "GR", "GT", "HK", "HN", "HU", "ID", "IE", "IL", "IM", "IN", "IS",
  "IT", "JE", "JP", "KN", "KR", "KW", "KZ", "LI", "LT", "LU", "MA", "MO", "MR",
  "MX", "MY", "NL", "NO", "NZ", "OM", "PE", "PL", "PT", "QA", "RO", "RS", "SA",
  "SE", "SG", "SI", "SK", "SM", "SV", "TH", "US", "UY", "UZ", "VA", "ZM",
];

// Robinhood US (stocks) + UK (stocks) + Europe UAB (EEA stock tokens).
const ROBINHOOD = ["US", "GB", ...EEA];

// Webull national entities + AFM passport of Webull Securities (Europe) B.V.
// (NL home, outgoing passport from Jan/Feb 2026). Not BG/CY/IS/LI/MT.
const WEBULL = [
  "US", "CA", "GB", "HK", "SG", "JP", "AU", "BR", "ZA", "TH", "ID", "MY", "MX",
  "NL", "BE", "DK", "DE", "EE", "FI", "FR", "GR", "HU", "IE", "IT", "HR", "LV",
  "LT", "LU", "NO", "AT", "PL", "PT", "RO", "SI", "SK", "ES", "CZ", "SE",
];

// Vivid help: where you can create an account.
const VIVID = ["AT", "CY", "FR", "DE", "IT", "LU", "NL", "PT", "ES", "CH"];

// XTB help (Mar 2026): EU + UK + MENA + CA via FR + International Ltd list.
// Quantroutine: Belgium and the US cannot proceed.
const XTB_INTL = [
  "AO", "BM", "GE", "MK", "MY", "MR", "MD", "ME", "PH", "KN", "RS", "ZA", "TT",
  "TH", "VN", "ZM",
];
const XTB = [...EU.filter((c) => c !== "BE"), "GB", "CA", ...GCC, ...XTB_INTL];

// Freedom24 reviews compiled from the CySEC entity: EEA plus a few extras, not UK/US.
const FREEDOM24 = [
  ...EEA, "CH", "UA", "KZ", "AZ", "GE", "TH", "AE", "QA", "MD", "IL",
];

// EuroFinance / EFOCS FAQ citizenship list. US persons are refused in the
// same article even though "USA" appears in the list.
const EFOCS = [
  "AL", "AD", "AM", "AU", "AT", "AZ", "BE", "BA", "BG", "CA", "HR", "CY", "CZ",
  "DK", "EE", "FI", "FR", "GE", "DE", "GR", "HU", "IS", "IE", "IT", "IL", "KZ",
  "KE", "LV", "LI", "LT", "LU", "MT", "MD", "MC", "ME", "NL", "NZ", "MK", "NO",
  "PL", "PT", "RO", "SM", "RS", "SK", "SI", "ES", "SE", "CH", "TR", "UA", "GB",
  "VA",
];

// Plum help: app residency (not the long nationality toggle).
const PLUM = ["GB", "IE", "FR", "ES", "PT", "IT", "BE", "NL", "GR", "CY"];

// Sarwa help "Who can open a Sarwa account": world except US persons and
// this residency/tax list (codes we name). Passport bans IR/KP sit in SANCTIONED.
const SARWA_BLOCKED = [
  "AF", "HR", "CY", "NG", "PA", "SN", "UG", "UA", "TZ", "VE", "VN",
];

export const ACCEPTED = {
  // US retail. tastytrade / Alpaca take many non-US addresses; Canada is out.
  alpaca: WORLD_NO_US_CA, // alpaca.markets/learn/live-trading-account-non-us
  firstrade: { countries: FIRSTRADE },
  tastytrade: { all: true, except: [...SANCTIONED, "CA"] },
  // TS Securities (US + non-EEA) + TS Europe B.V. (30 EEA). User agreement
  // is not an offer in Hong Kong or Japan.
  tradestation: { all: true, except: [...SANCTIONED, "HK", "JP"] },
  tradier: { countries: TRADIER },
  // America (US) + Canada + Europe B.V. (12 EEA) + Bahamas International
  // for other non-US / non-CA residents. Combined brand is worldwide.
  tradezero: WORLD,
  // Official: foreign-account fees, clients in 100+ countries, LATAM / ME /
  // Africa / Asia. No published country allow-list.
  choicetrade: WORLD,
  robinhood: { countries: ROBINHOOD },
  // TradeUP Global: US + non-US. Help centre (Aug 2026): CN and TW onboarding
  // is paused.
  tradeup: { all: true, except: [...SANCTIONED, "CN", "TW"] },
  // W-8 / non-resident alien on the application; no published block list.
  siebert: WORLD,
  // sogotrade.com/products/intaccout.aspx: any foreign citizen+resident,
  // plus ordinary US accounts.
  sogotrade: WORLD,
  webull: { countries: WEBULL },

  // Official: international residents can open a margin account; US usually cannot.
  questrade: WORLD_NO_US,
  boursobank: { countries: ["FR"] }, // DIY app; foreign tax residents need a desk path
  easybourse: { countries: ["FR"] },
  labanquepostale: { countries: ["FR"] },
  // Online DIY for EU/UK; non-EU/UK must call. US asked on the form (FATCA).
  davy: { groups: ["EEA"], countries: ["GB"] },
  plum: { countries: PLUM },

  n26: { countries: N26_STOCKS },
  vivid: { countries: VIVID },
  bunq: { countries: BUNQ_RESIDENCY },
  bux: { countries: BUX },
  degiro: { countries: DEGIRO },
  traderepublic: { countries: TRADE_REPUBLIC },
  trading212: { countries: T212 },
  lightyear: { countries: LIGHTYEAR },
  revolut: { countries: REVOLUT_STOCKS },
  bitpanda: { countries: BITPANDA },
  captrader: { groups: ["EEA"], countries: ["CH"] },
  // CSSF passport, offices in LU/NL/BE/FR/DE/CH, clients in 28 countries.
  whselfinvest: { groups: ["EEA"], countries: ["CH", "GB"] },
  saxo: { countries: SAXO },
  swissquote: WORLD_NO_US,
  interactivebrokers: WORLD, // IBKR: all except OFAC / higher-risk
  xtb: { countries: XTB },
  ig: WORLD_NO_US,
  oanda: WORLD,
  admiral: WORLD_NO_US,
  freedom24: { countries: FREEDOM24 },
  etoro: WORLD_NO_US_CA, // eToro T&Cs: blocked US and Canada
  quantfury: WORLD_NO_US,
  puprime: WORLD_NO_US,
  // FAQ: citizens or residents of most countries except sanctions / local bans.
  mexem: WORLD,
  century: { groups: ["GCC"], countries: [...EEA, "GB", "CH", "IN", "PK", "EG", "ZA", "SG", "MY", "HK"] },
  // Open-account page lists a National ID path for non-UAE residents.
  bhmuae: WORLD,
  alramz: WORLD, // FAQ: separate KYC pack for non-UAE residents
  sarwa: { all: true, except: [...SANCTIONED, "US", ...SARWA_BLOCKED] },
  // Egypt FRA book + ADGM/FSRA UAE book. Not a worldwide app.
  thndr: { countries: ["EG", "AE"] },
  // Foreign nationals get the USD book; US persons cannot.
  easyequities: WORLD_NO_US,
  vested: { countries: ["IN"] }, // PAN / Aadhaar / LRS — India residents
  tiger: { countries: ["AU", "NZ", "SG", "HK", "MY", "ID", "CN"] },
  // Passport + foreign address pack; no published country allow-list.
  investimental: WORLD,
  // Open-account page: simplified postal KYC if the bank is in the EU/EEA,
  // Switzerland or the US — that is the bank's country, not the client's.
  // A French passport is enough in practice (not Bulgaria-only).
  elana: { groups: ["EEA"], countries: ["CH"] },
  efocs: { countries: EFOCS },
};

const GROUPS = { EEA, EU, GCC };

export function expand(spec) {
  const set = new Set();
  if (!spec) return set;
  if (spec.all) {
    for (const code of Object.keys(COUNTRY_NAMES)) set.add(code);
  }
  for (const group of spec.groups || []) {
    for (const code of GROUPS[group] || []) set.add(code);
  }
  for (const code of spec.countries || []) set.add(String(code).toUpperCase());
  for (const code of spec.except || []) set.delete(String(code).toUpperCase());
  return set;
}

export function specFor(folder, home = "") {
  const key = String(folder || "").split(":")[0];
  const spec = ACCEPTED[key] || ACCEPTED[key.toLowerCase()];
  if (spec) return spec;
  const country = String(home || "").toUpperCase();
  if (/^[A-Z]{2}$/.test(country)) return { countries: [country] };
  return { all: true, except: SANCTIONED };
}

export function accepts(folder, nat, home = "") {
  const code = String(nat || "").trim().toUpperCase();
  if (!code) return true;
  return expand(specFor(folder, home)).has(code);
}

// A listing the broker's own book withholds from this residency, even if the
// visitor can open an account: T212 `supportedCountries`, a KID notice
// (`nonEuResident`), or an Alpaca PTP (`usResidentsOnly`).
export function listingAccepts(row, nat) {
  const code = String(nat || "").trim().toUpperCase();
  if (!code) return true;
  if (row?.usResidentsOnly) return code === "US";
  if (row?.nonEuResident && EEA.includes(code)) return false;
  if (Array.isArray(row?.supportedCountries)) {
    return row.supportedCountries.some((c) => String(c).trim().toUpperCase() === code);
  }
  return true;
}

export function countryOptions() {
  return Object.entries(COUNTRY_NAMES)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

// `nonEuResident` is only set when the broker's own ticket says so (KID /
// NotTradable). An ISIN starting with US is not enough: Elana and tastytrade
// both sell iShares Gold Trust to a European account.
export function stampResidency(row) {
  if (!row || typeof row !== "object") return row;
  if (row.notEuResident) {
    row.nonEuResident = true;
    delete row.notEuResident;
  }
  delete row.nonUsResident;
  return row;
}

export function stampRows(rows) {
  if (!Array.isArray(rows)) return rows;
  for (const row of rows) stampResidency(row);
  return rows;
}
