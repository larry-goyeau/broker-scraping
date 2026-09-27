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
  PA: "Panama", PE: "Peru", PF: "French Polynesia", PH: "Philippines", PK: "Pakistan", PL: "Poland",
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
const WORLD_NO_CA = { all: true, except: [...SANCTIONED, "CA"] };
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

// UK fees and EEA fees differ, so the lists stay apart. Britain sees
// Trading Ltd. The EEA and Switzerland see Securities Europe. The Emirates,
// Australia, Gibraltar, Singapore and the United States are other companies.
const REVOLUT_STOCKS = [...EEA, "GB", "CH"];

// Saxo onboarding cut of July 2024 (home.saxo country picker), plus usual bans.
const SAXO = [
  "AT", "BE", "HR", "CZ", "DK", "EE", "FO", "FI", "FR", "DE", "GR", "GL", "HU",
  "IS", "IE", "IT", "LV", "LT", "LU", "MT", "MC", "NL", "NO", "PL", "PT", "RO",
  "SK", "SI", "ES", "SE", "CH", "GB", "IL", "QA", "SA", "AE", "HK", "JP", "MY",
  "SG", "TH", "AU",
];

// Firstrade help, 7 May 2026: international individual accounts, plus
// ordinary US accounts.
// https://help.firstrade.info/en/articles/9268315-can-i-open-an-international-account
const FIRSTRADE = [
  "US", "AT", "BE", "CN", "CZ", "DE", "DK", "ES", "FI", "FR", "GB", "HK", "IE",
  "IL", "IN", "IT", "JP", "KR", "MO", "MX", "MY", "NO", "NZ", "PL", "PT", "SE",
  "SG", "TW", "TH",
];

// Tradier KB "Permitted and Blocked Countries". UK, CA, AU, LV, MT, BG, HR, CY
// stay on the blocked list. BrokerChooser also names Algeria (on both of
// Tradier's own lists), Angola, Bolivia, Monaco, French Polynesia, Taiwan
// and Venezuela.
const TRADIER = [
  "AD", "AE", "AM", "AR", "AT", "BD", "BE", "BH", "BM", "BR", "CH", "CL", "CN",
  "CO", "CR", "CZ", "DE", "DK", "DO", "EC", "EE", "EG", "ES", "FI", "FO", "FR",
  "GE", "GL", "GR", "GT", "HK", "HN", "HU", "ID", "IE", "IL", "IM", "IN", "IS",
  "IT", "JE", "JP", "KN", "KR", "KW", "KZ", "LI", "LT", "LU", "MA", "MO", "MR",
  "MX", "MY", "NL", "NO", "NZ", "OM", "PE", "PL", "PT", "QA", "RO", "RS", "SA",
  "SE", "SG", "SI", "SK", "SM", "SV", "TH", "US", "UY", "UZ", "VA", "ZM",
  "DZ", "AO", "BO", "MC", "PF", "TW", "VE",
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
// Each company has its own floor and its own cash, so a BrokerChooser
// country is not added onto another company's list.
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

// Named bullets on the help-centre article, not the region headings
// (those say 15 Asian and 31 European countries; the bullets name 13 and 30).
// India is eligible for a cash account only.
// https://support.tastytrade.com/support/s/solutions/articles/43000435355
const TASTYTRADE = [
  "EG",
  "AE", "BH", "ID", "IL", "IN", "KR", "MY", "OM", "PH", "SA", "SG", "TH", "TW",
  "AD", "AT", "BE", "CH", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR",
  "HU", "IE", "IM", "IS", "IT", "LI", "LT", "LU", "NL", "NO", "PL", "PT", "RO",
  "SE", "SI", "SK", "SM",
  "DO", "MX", "US",
  "AR", "BR", "CL", "CO", "EC", "PE", "UY",
  "NZ", "PF",
];

// BrokerChooser countries the picker can name, on top of EEA + Switzerland.
const CAPTRADER_BC = [
  "AD", "AE", "AL", "AM", "AO", "AR", "AU", "AZ", "BA", "BD", "BH", "BM", "BO",
  "BR", "CL", "CN", "CO", "CR", "DO", "DZ", "EC", "EG", "FO", "GE", "GG", "GH",
  "GI", "GL", "GT", "HK", "HN", "ID", "IM", "IN", "JE", "JO", "JP", "KE", "KR",
  "KW", "KZ", "LB", "LK", "MA", "MC", "MD", "MK", "MO", "MR", "MX", "MY", "NZ",
  "OM", "PA", "PE", "PF", "PH", "PK", "QA", "RS", "SA", "SG", "SM", "SN", "SV",
  "TH", "TN", "TR", "TW", "TZ", "UA", "UG", "UY", "UZ", "VN", "ZA", "ZM",
];

// BrokerChooser, 29 countries. Germany is the home row. Spain is not listed.
const FLATEX_COMDIRECT = [
  "DE", "AT", "BE", "BG", "CH", "CY", "CZ", "DK", "EE", "FI", "FR", "GB", "GR",
  "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT", "RO",
  "SE", "SI", "SK",
];

// BrokerChooser. Italy is the home row.
const DIRECTA = ["IT", "CH", "DE", "DK", "FR", "GB", "HR", "HU", "IE", "PT"];

export const ACCEPTED = {
  // US account, plus non-US addresses. Canada stays out.
  alpaca: WORLD_NO_CA, // alpaca.markets/learn/live-trading-account-non-us
  firstrade: { countries: FIRSTRADE },
  tastytrade: { countries: TASTYTRADE },
  // TS Securities (US + non-EEA) + TS Europe B.V. (30 EEA). BrokerChooser
  // also lists Hong Kong and Japan. The user agreement says the offer is
  // not made there.
  tradestation: WORLD,
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

  // Questrade, 26 Sep 2026: a non-registered account (cash, margin, corporation)
  // is open to every residence except the US and sanctioned countries.
  // Questwealth, mutual funds and the registered plans are not this book.
  questrade: { all: true, except: [...SANCTIONED, "US"] },
  boursobank: { countries: ["FR"] }, // DIY app; foreign tax residents need a desk path
  easybourse: { countries: ["FR"] },
  labanquepostale: { countries: ["FR"] },
  fortuneo: { countries: ["FR"] },
  // Online DIY for EU/UK; non-EU/UK must call. US asked on the form (FATCA).
  davy: { groups: ["EU"], countries: ["GB"] },
  plum: { countries: PLUM },
  // Terms 7.2: UK tax resident and living in the UK, and not a US person.
  // Help, 16 Jul 2025: UK residents only. Moving abroad closes the account.
  freetrade: { countries: ["GB"] },
  // Help: UK tax resident, with a UK address and a UK current account.
  // Non-UK residents, including UK nationals living abroad, cannot open.
  // US persons cannot open. Terms allow an overseas client only at discretion.
  // https://help.investengine.com/hc/en-gb/articles/31149906352029-Who-can-open-an-InvestEngine-account
  investengine: { countries: ["GB"] },
  // Regulation of 27 June 2026: a Polish citizen who is a Polish tax resident,
  // with an mBank account. A residence outside Poland cannot open.
  // https://pdf.mbank.pl/mbankpl/of/gielda/emakler/regulamin_emakler_obowiazujacy_od_27.06.2026.pdf
  mbank: { countries: ["PL"] },
  // Account page: must live in Japan. Nationality is not a criterion.
  // A stay abroad of a year or more, or an open-ended posting, is non-resident
  // and cannot open.
  // https://www.matsui.co.jp/apply/account/netstock/
  // https://support.matsui.co.jp/faq/show/1879?site_domain=faq
  matsui: { countries: ["JP"] },
  // Communiqué 118/BM/ZRR/2022: a Polish citizen gives a PESEL. A non-resident
  // gives the parents' names and a foreign TIN. Citizenship is recorded and
  // no country is refused.
  // https://www.pekao.com.pl/dam/jcr:1a8f6c9a-4a19-4d9e-b8a7-49f121087c70/20221229_118_BM_ZRR_2022i.2023-03-23-12-56-45.pdf
  pekao: WORLD,
  // Account page: any adult with a Polish ID card or a passport.
  // Communiqué of 31 Dec 2025, in force 1 Jan 2026: no foreign-markets annex,
  // and no foreign-currency trading on the home market, for a citizen, a
  // resident or a tax resident of the high-risk list. The picker is a
  // nationality, so those citizenships are excluded. Ukraine is only the
  // named occupied territories, so UA stays. Northern Cyprus has no code here.
  // https://www.aliorbank.pl/biuro-maklerskie/gielda/rachunek-brokerski.html
  // https://www.aliorbank.pl/dam/jcr:14ab6be8-57ec-4540-8d1d-806aacbd1c87/Komunikat-Kraje-wysokiego-ryzyka-nie-zawieramy-aneksu-do-umowy.pdf
  alior: {
    all: true,
    except: [
      ...SANCTIONED,
      "AE", "AF", "AG", "AO", "AR", "BA", "BB", "BD", "BF", "BI", "BN", "BO", "BS", "BW", "BZ",
      "CD", "CF", "CI", "CM", "DZ", "EC", "EG", "ER", "ET", "GH", "GI", "GQ", "GW", "GY",
      "HT", "ID", "IQ", "JM", "JO", "KE", "KG", "KH", "KW", "KY", "LA", "LB", "LK", "LR", "LY",
      "MA", "ML", "MM", "MN", "MU", "MZ", "NA", "NG", "NI", "NP", "PA", "PG", "PH", "PK",
      "RS", "SD", "SL", "SN", "SO", "SS", "ST", "TD", "TH", "TJ", "TM", "TN", "TR", "TT", "TZ",
      "UG", "US", "VE", "VN", "VU", "YE", "ZA", "ZW",
    ],
  },
  // Help: principal residence in the EU, and no US person. The site and the
  // help centre are German only, so the picker keeps the German-speaking
  // countries inside that list: Germany and Austria.
  // Crypto trading and the securities loan are Germany only.
  // https://support.finanzen-zero.net/hc/de/articles/36630101704477
  finanzen: { countries: ["DE", "AT"] },

  n26: { countries: N26_STOCKS },
  vivid: { countries: VIVID },
  bunq: { countries: BUNQ_RESIDENCY },
  bux: { countries: BUX },
  degiro: { countries: DEGIRO },
  traderepublic: { countries: TRADE_REPUBLIC },
  // Sign-up FAQ: residents of these six, metropolitan France only, never a US
  // taxpayer. Moving outside the EEA ends the relationship, so residency is the
  // test and the German home country alone would be too narrow.
  scalablecapital: { countries: ["DE", "AT", "FR", "IT", "ES", "NL"] },
  trading212: { countries: T212 },
  lightyear: { countries: LIGHTYEAR },
  // User agreement: tax residency in the EU/EEA, and opening needs BankID.
  // The site is Swedish only, so the picker keeps Sweden.
  levler: { countries: ["SE"] },
  revolut: { countries: REVOLUT_STOCKS },
  bitpanda: { countries: BITPANDA },
  // lynxbroker.com account-country: AT BE CZ FI FR DE NL PL SK.
  // lynxbroker.ch opening: primary residence in Germany, Austria or Switzerland.
  lynx: { countries: ["AT", "BE", "CZ", "FI", "FR", "DE", "NL", "PL", "SK", "CH"] },
  // EEA + Switzerland, plus the BrokerChooser countries the picker can name.
  captrader: { groups: ["EEA"], countries: ["CH", ...CAPTRADER_BC] },
  // CSSF passport, offices in LU/NL/BE/FR/DE/CH, clients in 28 countries.
  whselfinvest: { groups: ["EEA"], countries: ["CH", "GB"] },
  saxo: { countries: SAXO },
  // Bank SA prices Switzerland. Bank Europe prices the EEA. The schedules
  // differ, so the lists stay apart. UK, Singapore, Hong Kong and MEA are
  // other companies and are not either card.
  swissquote: { groups: ["EEA"], countries: ["CH"] },
  // open-account-country-list.php has Montenegro, the Philippines and the Holy See.
  // It does not list Afghanistan, Nigeria, Venezuela or Zimbabwe. Russia is on
  // that page and stays out here with the other sanctioned codes.
  interactivebrokers: { all: true, except: [...SANCTIONED, "AF", "NG", "VE", "ZW"] },
  xtb: { countries: XTB },
  ig: WORLD_NO_US,
  // The priced book is OANDA TMS cash shares, sold to the 27 EU countries.
  // UK, Switzerland, Norway, Liechtenstein, the US, Canada, Australia,
  // Singapore, Japan and Global Markets are other companies with other fees.
  oanda: { groups: ["EU"] },
  admiral: WORLD_NO_US,
  freedom24: { countries: FREEDOM24 },
  // Global T&Cs block US and Canada. The US entity is only the ETF CFD
  // shelf sold as a real ETF (`--plan=us`); front hides it from everyone
  // else. Canada has no eToro book.
  etoro: WORLD_NO_CA,
  // Client agreement: not for the US, Canada, the Bahamas or the British Virgin Islands.
  // BS and VG are not in the country list.
  quantfury: { all: true, except: [...SANCTIONED, "US", "CA"] },
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
  // Open-account page: simplified postal KYC if the bank is in the EU/EEA,
  // Switzerland or the US — that is the bank's country, not the client's.
  // A French passport is enough in practice (not Bulgaria-only).
  elana: { groups: ["EEA"], countries: ["CH"] },
  efocs: { countries: EFOCS },
  // The public site is Polish only. Polish is the official language of Poland.
  // They do not publish a residency list.
  bossa: { countries: ["PL"] },
  // No catalogue yet. BrokerChooser’s 29 countries; Spain is not among them.
  flatex: { countries: FLATEX_COMDIRECT },
  comdirect: { countries: FLATEX_COMDIRECT },
  // No catalogue yet. Italy plus the nine BrokerChooser adds.
  directa: { countries: DIRECTA },
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

// Packaged products whose ticket can lack a PRIIPs KID while still sitting
// on the UK OFR (EEA UCITS) or being a UK authorised scheme (GB ISIN).
const PACKAGED = /^(ETF|ETC|ETN|ETP|FUND)$/i;

function isinCountry(row) {
  const isin = String(row.isin || "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) ? isin.slice(0, 2) : "";
}

// UK retail can still buy a packaged line the EU ticket withheld when the
// fund is GB-domiciled (authorised) or EEA-domiciled (OFR). US / AU / CH /
// Jersey stay blocked on both sides. Stocks are not this test.
function ukRetailScheme(row) {
  const cc = isinCountry(row);
  return cc === "GB" || EEA.includes(cc);
}

export function ukResidentBlocked(row) {
  if (!row) return false;
  if (row.nonUkResident === true) return true;
  if (row.nonUkResident === false) return false;
  return Boolean(row.nonEuResident && PACKAGED.test(row.type || "") && !ukRetailScheme(row));
}

// A listing the broker's own book withholds from this residency, even if the
// visitor can open an account: T212 `supportedCountries`, a missing KID
// (`nonEuResident`, EEA only), no UK recognised scheme (`nonUkResident`, GB
// only), an Alpaca PTP (`usResidentsOnly`), or NSE cash (`indianOnly`).
export function listingAccepts(row, nat) {
  const code = String(nat || "").trim().toUpperCase();
  if (!code) return true;
  if (row?.usResidentsOnly) return code === "US";
  if (row?.indianOnly) return code === "IN";
  // CH stays visible: Swiss retail can buy a no-KID line.
  if (row?.nonEuResident && EEA.includes(code)) return false;
  if (ukResidentBlocked(row) && code === "GB") return false;
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
// `nonUkResident` is the same ticket fact for Britain (no OFR / s.272). A
// scraper can set it; otherwise a no-KID packaged line that is not GB/EEA
// domiciled gets it here so existing catalogues do not need a rewrite.
export function stampResidency(row) {
  if (!row || typeof row !== "object") return row;
  if (row.notEuResident) {
    row.nonEuResident = true;
    delete row.notEuResident;
  }
  if (row.notUkResident) {
    row.nonUkResident = true;
    delete row.notUkResident;
  }
  if (row.IndianOnly) {
    row.indianOnly = true;
    delete row.IndianOnly;
  }
  delete row.nonUsResident;
  if (row.nonUkResident == null && ukResidentBlocked(row)) row.nonUkResident = true;
  return row;
}

export function stampRows(rows) {
  if (!Array.isArray(rows)) return rows;
  for (const row of rows) stampResidency(row);
  return rows;
}
