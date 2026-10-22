// Who a scraped broker will onboard, as ISO country codes. The front uses this
// to hide a listing the visitor cannot open an account to trade. The test is
// residency as the broker states it on the application (nationality only when
// the broker names it separately, e.g. bunq / Ginmon).
//
// Lists are taken from the broker's own help or onboarding pages. A broker
// missing here falls back to the home country in broker-list.json.

import { fillListIsins } from "./listIsins.mjs";

export const EEA = [
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR",
  "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT",
  "RO", "SE", "SI", "SK",
];

export const EU = EEA.filter((c) => c !== "IS" && c !== "LI" && c !== "NO");

export const GCC = ["AE", "BH", "KW", "OM", "QA", "SA"];

// Only where the broker's own page names these countries. A line that says
// "sanctions" or "where legal", without naming them, does not use this list.
const SANCTIONED = ["BY", "CU", "IR", "KP", "RU", "SY"];

export const COUNTRY_NAMES = {
  AD: "Andorra", AE: "United Arab Emirates", AF: "Afghanistan", AL: "Albania",
  AM: "Armenia", AO: "Angola", AR: "Argentina", AT: "Austria", AU: "Australia",
  AZ: "Azerbaijan", BA: "Bosnia and Herzegovina", BD: "Bangladesh", BE: "Belgium",
  BF: "Burkina Faso", BG: "Bulgaria", BH: "Bahrain", BJ: "Benin", BM: "Bermuda", BO: "Bolivia", BR: "Brazil",
  BY: "Belarus", CA: "Canada", CH: "Switzerland", CI: "Côte d'Ivoire", CL: "Chile", CN: "China",
  CO: "Colombia", CR: "Costa Rica", CY: "Cyprus", CZ: "Czechia", DE: "Germany",
  DK: "Denmark", DO: "Dominican Republic", DZ: "Algeria", EC: "Ecuador",
  EE: "Estonia", EG: "Egypt", ES: "Spain", FI: "Finland", FO: "Faroe Islands",
  FR: "France", GB: "United Kingdom", GE: "Georgia", GG: "Guernsey", GH: "Ghana",
  GI: "Gibraltar", GL: "Greenland", GR: "Greece", GT: "Guatemala", GW: "Guinea-Bissau", HK: "Hong Kong",
  HN: "Honduras", HR: "Croatia", HU: "Hungary", ID: "Indonesia", IE: "Ireland",
  IL: "Israel", IM: "Isle of Man", IN: "India", IQ: "Iraq", IS: "Iceland", IT: "Italy",
  JE: "Jersey", JO: "Jordan", JP: "Japan", KE: "Kenya", KN: "Saint Kitts and Nevis",
  KR: "South Korea", KW: "Kuwait", KZ: "Kazakhstan", LB: "Lebanon",
  LI: "Liechtenstein", LK: "Sri Lanka", LT: "Lithuania", LU: "Luxembourg",
  LV: "Latvia", MA: "Morocco", MC: "Monaco", MD: "Moldova", ME: "Montenegro",
  MK: "North Macedonia", ML: "Mali", MO: "Macau", MR: "Mauritania", MT: "Malta", MX: "Mexico", MY: "Malaysia",
  NE: "Niger", NG: "Nigeria", NL: "Netherlands", NO: "Norway", NZ: "New Zealand", OM: "Oman",
  PA: "Panama", PE: "Peru", PF: "French Polynesia", PH: "Philippines", PK: "Pakistan", PL: "Poland",
  PT: "Portugal", QA: "Qatar", RO: "Romania", RS: "Serbia", SA: "Saudi Arabia",
  SE: "Sweden", SG: "Singapore", SI: "Slovenia", SK: "Slovakia", SM: "San Marino",
  SN: "Senegal", SV: "El Salvador", TG: "Togo", TH: "Thailand", TN: "Tunisia", TR: "Turkey",
  TT: "Trinidad and Tobago", TW: "Taiwan", TZ: "Tanzania", UA: "Ukraine",
  UG: "Uganda", US: "United States", UY: "Uruguay", UZ: "Uzbekistan",
  VA: "Vatican City", VE: "Venezuela", VN: "Vietnam", ZA: "South Africa",
  ZM: "Zambia", ZW: "Zimbabwe",
  KH: "Cambodia", MM: "Myanmar", MU: "Mauritius", RU: "Russia",
  LA: "Laos", JM: "Jamaica", NP: "Nepal", ET: "Ethiopia", IR: "Iran", LY: "Libya", SY: "Syria",
};

const US = { countries: ["US"] };
const WORLD = { all: true };
const WORLD_NO_US = { all: true, except: ["US"] };
const WORLD_NO_CA = { all: true, except: ["CA"] };
const WORLD_NO_US_CA = { all: true, except: ["US", "CA"] };

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
// this residency/tax list (codes we name). The same page names Belarus,
// Cuba, Iran, North Korea, Russia and Syria.
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

// French is an official language, or the language of a banking form in the
// Maghreb. Arabic is an official language. Only countries the picker names.
const FRENCH = ["FR", "BE", "CH", "LU", "MC", "CA", "SN", "PF", "MA", "DZ", "TN", "MR"];
// German is an official language. Only countries the picker names.
const GERMAN = ["DE", "AT", "CH", "LI", "LU", "BE"];
const ARABIC = ["AE", "BH", "DZ", "EG", "IQ", "JO", "KW", "LB", "MA", "MR", "OM", "QA", "SA", "TN"];

export const ACCEPTED = {
  // US account, plus non-US addresses. Canada stays out.
  alpaca: WORLD_NO_CA, // alpaca.markets/learn/live-trading-account-non-us
  // Help, 30 Sep 2026: clients worldwide, except the prohibited list.
  // That list names Belarus, Cuba, Iran, North Korea, Russia and Syria.
  // Crimea, Donetsk and Luhansk are named, not Ukraine as a whole.
  // Maine and New York are refused too, and the picker has no US state.
  // https://support.kraken.com/articles/where-is-kraken-licensed-or-regulated
  kraken: { all: true, except: [...SANCTIONED, "AF", "CD", "IQ", "JP", "LY", "SD", "SS"] },
  // Registration, and the foreigner article: a current Chilean identity
  // card. Nationality does not matter. The card comes with residence in
  // Chile. A passport, or a RUT without the card, is refused. Once the
  // account exists the app works from anywhere.
  // https://help.zestyfinance.com/es/articles/15937663-que-documentos-necesito-para-registrarme
  // https://help.zestyfinance.com/es/articles/15937662-puedo-usar-la-app-si-soy-una-persona-extranjera
  zesty: { countries: ["CL"] },
  // A foreigner opens with a current temporary RUT, which is residence in
  // Chile. An expired one needs a current residence certificate. A Chilean
  // living abroad can keep the account with a Chilean bank account and
  // Chilean-source income. The picker is residence, so it stays Chile.
  // https://ayuda.fintual.cl/es/articles/4292653-puedo-tener-cuenta-si-no-soy-chileno-a
  // https://ayuda.fintual.cl/es/articles/5327841-puedo-tener-cuenta-si-soy-chileno-y-no-vivo-en-chile
  fintual: { countries: ["CL"] },
  // A new customer applies online while living in New Zealand. A New
  // Zealand citizen living overseas uses the non-resident declaration.
  // The picker is residence, so it stays New Zealand.
  // https://www.asb.co.nz/asb-securities/open-an-account.html
  // https://www.asb.co.nz/documents/asb-securities/non-resident-declaration-form.html
  asb: { countries: ["NZ"] },
  firstrade: { countries: FIRSTRADE },
  // A legal US address and a Social Security number. Citizenship can be
  // American, a green card, or one of the named visas; the address is
  // still residence in the United States. Accounts outside the United
  // States, including the UK book, closed in 2024.
  // https://help.public.com/en/articles/4374819-who-can-create-an-account
  // https://help.public.com/en/articles/9289437-how-can-former-non-us-members-access-important-documents
  public: { countries: ["US"] },
  // A US citizen or a lawful US tax resident, with a Social Security
  // number or an ITIN, located in the United States, and a checking
  // account at a US bank. The picker is that residence.
  // https://cdn.stash.com/disclosures/Stash_Wrap_Fee_Program_Brochure_12.pdf
  stash: { countries: ["US"] },
  tastytradeus: { countries: TASTYTRADE },
  // TS Securities (US + non-EEA) + TS Europe B.V. (30 EEA). BrokerChooser
  // also lists Hong Kong and Japan. The user agreement says the offer is
  // not made there.
  tradestationus: WORLD,
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
  tradeup: { all: true, except: ["CN", "TW"] },
  // W-8 / non-resident alien on the application; no published block list.
  siebert: WORLD,
  // sogotrade.com/products/intaccout.aspx: any foreign citizen+resident,
  // plus ordinary US accounts.
  sogotrade: WORLD,
  // One folder per Webull entity, each for its own residents. Webull EU holds
  // the EEA passport but onboards NL, DE and ES only (FAQ 1087, 2026-10-21;
  // Italy and Portugal announced, not live).
  // https://www.webull.eu/help/faq/1087
  // Webull US: "does not open or maintain accounts for individuals residing
  // outside the United States". https://www.webull.com/help/faq/10863
  webullus: { countries: ["US"] },
  // Webull UK: "Our services are aimed solely at UK residents".
  // https://www.webull-uk.com/help/faq/1378
  webulluk: { countries: ["GB"] },
  webulleu: { countries: ["NL", "DE", "ES"] },
  // Webull SG: Singpass holders, plus a residential status "Others" opened by
  // hand with an ID and proof of address; offshore clients on reverse
  // solicitation, no country named or excluded.
  // https://www.webull.com.sg/help/faq/1027-How-do-I-open-an-account
  // https://www.webull.com.sg/learn/courseware/VydQeI
  webullsg: { all: true },
  // Webull CA: SIN required. https://www.webull.ca/help/faq/371
  webullca: { countries: ["CA"] },
  // Webull AU: "only accepts the applications of Australian residents".
  // https://www.webull.com.au/help/faq/1386
  webullau: { countries: ["AU"] },
  // Webull HK: Hong Kong, Macau and "Other regions (except U.S. residents)";
  // the other-regions route needs proof of address outside mainland China.
  // https://www.webull.hk/en/help/faq/237
  // https://www.webull.hk/help/faq/857
  webullhk: { all: true, except: ["US", "CN"] },

  // Questrade, 26 Sep 2026: a non-registered account (cash, margin, corporation)
  // is open to every residence except the US. The page says sanctioned
  // countries are out and does not name them, so those residencies stay.
  // Questwealth, mutual funds and the registered plans are not this book.
  questrade: { all: true, except: ["US"] },
  boursobank: { countries: ["FR"] }, // DIY app; foreign tax residents need a desk path
  easybourse: { countries: ["FR"] },
  labanquepostale: { countries: ["FR"] },
  fortuneo: { countries: ["FR"] },
  // Online DIY for EU/UK; non-EU/UK must call. US asked on the form (FATCA).
  davy: { groups: ["EU"], countries: ["GB"] },
  plum: { countries: PLUM },
  // Terms 1.3: 18 or over and UK resident. A Crown employee posted overseas,
  // or their spouse or civil partner, may also open. A US person cannot.
  // New investments stop if the client ceases to be UK resident.
  // https://www.fidelity.co.uk/media/PI%20UK/pdf/legal/fidelity-client-terms.pdf
  fidelity: { countries: ["GB"] },
  // The equity form takes a resident, a non-resident Pakistani and a
  // foreigner. Online opening of a resident asks for a Pakistani identity
  // card. The countries where the others live are not listed. The picker
  // is a country, so the country is PK.
  // https://akdsl.com/Files/Equities/Account-Openning-Form-Equities-for-Individuals.pdf
  // https://akdsl.com/Services/RDA
  akd: { countries: ["PK"] },
  // Nafa and the Chase form ask for a Pakistani identity card. A
  // non-resident Pakistani can open too. The countries where that person
  // lives are not listed. The picker is a country, so the country is PK.
  // https://nafa.com.pk/
  // https://chasesecurities.com/open-your-account/
  // https://www.tickeranalysts.com/blog/how-to-open-nafa-account
  chase: { countries: ["PK"] },
  // The FAQ opens a BO account for someone over 18 with a national
  // identity card. A non-resident Bangladeshi is named for an IPO, and
  // a foreign account form exists. The countries where they live are
  // not listed. The picker is a country, so the country is BD.
  // https://www.lbsbd.com/Faq
  // https://www.lbsbd.com/Platforms?platform=ibroker&tab=open-bo-account
  lankabangla: { countries: ["BD"] },
  // A digital booth asks for the national identity card of the applicant
  // and of the nominee. The foreign desk buys Bangladeshi shares for
  // institutions. The countries where they live are not listed. The
  // picker is a country, so the country is BD.
  // https://idlc.com/securities/knowledgebase/faq
  // https://idlc.com/securities/whatweoffer/brokerage
  idlc: { countries: ["BD"] },
  // The equity signup asks for an NIC, a mobile number and an email.
  // A foreign investor is named for treasury bills and bonds. The
  // countries where they live are not listed. The picker is a country,
  // so the country is LK.
  // https://cal.lk/getting-started-eq/
  // https://cal.lk/faq-items/as-a-foreign-investor-can-i-invest-in-treasury-bills-and-bonds/
  capitalalliance: { countries: ["LK"] },
  // Registration asks for an NIK and a photo of the KTP, the Indonesian
  // identity card. No other residence is named.
  // https://ajaib.co.id/pusat-bantuan/registrasi/bagaimana-cara-registrasi-akun-ajaib
  ajaib: { countries: ["ID"] },
  // A Dealing account opens for a UK resident. A Crown employee, or their
  // spouse or dependant, may also open. No other country of residence is
  // named. The ISA asks the same of someone ordinarily resident in the UK.
  // https://www.ajbell.co.uk/faq/who-can-open-dealing-account
  // https://www.ajbell.co.uk/faq/who-can-open-stocks-and-shares-isa
  ajbell: { countries: ["GB"] },
  // An Investment Account, an ISA or a SIPP opens for a UK resident. The
  // footnote includes the Channel Islands and the Isle of Man. Someone
  // born, living or paying tax in the United States cannot open. The
  // picker is a country of residence.
  // https://www.bestinvest.co.uk/help/eligibility
  bestinvest: { countries: ["GB", "GG", "JE", "IM"] },
  // Terms 7.2: UK tax resident and living in the UK, and not a US person.
  // Help, 16 Jul 2025: UK residents only. Moving abroad closes the account.
  freetrade: { countries: ["GB"] },
  // Fund and Share Account: open online only if you live in the UK and are a UK tax resident.
  // https://www.hl.co.uk/investment-services/fund-and-share-account
  hargreaveslansdown: { countries: ["GB"] },
  // Terms 4.1: an individual over 18, resident in the UK or, unless the
  // account is an ISA, in Jersey, Guernsey or the Isle of Man. A crown
  // employee serving overseas, or their spouse or civil partner, may also
  // open. A US person and a resident of Canada cannot.
  // https://www.lloydsbank.com/assets/media/pdfs/investments/direct-investments/terms_conditions.pdf
  lloyds: { countries: ["GB", "GG", "JE", "IM"] },
  // Terms 4.1: an individual over 18, resident in the UK or, unless the
  // account is an ISA, in Jersey, Guernsey or the Isle of Man. A crown
  // employee serving overseas, or their spouse or civil partner, may also
  // open. A US person and a resident of Canada cannot.
  // https://www.halifax.co.uk/assets/pdf/filestore/halifaxsharedealing_termsandconds.pdf
  halifax: { countries: ["GB", "GG", "JE", "IM"] },
  // Help: UK tax resident, with a UK address and a UK current account.
  // Non-UK residents, including UK nationals living abroad, cannot open.
  // US persons cannot open. Terms allow an overseas client only at discretion.
  // https://help.investengine.com/hc/en-gb/articles/31149906352029-Who-can-open-an-InvestEngine-account
  investengine: { countries: ["GB"] },
  // Platform terms 1.3 (February 2025): 18 or over, and resident in the UK
  // for tax purposes. The GIA and ISA forms also require that you are not a
  // US person.
  // https://www.willisowen.co.uk/documents/Willis_Owen_Platform_Terms_and_Conditions_February_2025.pdf
  // https://www.willisowen.co.uk/gia/apply-for-a-gia
  willisowen: { countries: ["GB"] },
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
  // The stock page lists the documents in Chinese. Opening is the
  // online bank or a branch. The English site has no opening form.
  // Chinese is an official language of these countries, so the picker
  // keeps them.
  // https://www.megabank.com.tw/personal/wealth/product/intro/etf-and-stocks
  // https://www.megabank.com.tw/en-us/english
  megabank: { countries: ["CN", "HK", "MO", "SG", "TW"] },
  // The foreign-stock page opens the digital account in Chinese. The
  // English personal site has no opening form. Chinese is an official
  // language of these countries, so the picker keeps them.
  // https://www.dbs.com.tw/personal-zh/investments/equities-etf/foreign-stocks
  // https://internet-banking.dbs.com.tw/dao/
  // https://www.dbs.com.tw/personal/default.page
  dbstw: { countries: ["CN", "HK", "MO", "SG", "TW"] },
  // The foreign-currency account, which the trust uses, opens for a person
  // with a Taiwan national ID or a foreigner with an alien resident
  // certificate. That certificate is residence in Taiwan. The first US
  // order needs a W-8BEN. The picker is a country of residence, so the
  // country is Taiwan.
  // https://www.esunbank.com/zh-tw/personal/deposit/foreign-service/current-account
  // https://www.esunbank.com/zh-tw/about/faq/content?q=wealth/018
  "e.sun": { countries: ["TW"] },
  // Online opening of the digital account asks for a valid Taiwan
  // national identity card. The picker is residence, so the country
  // is Taiwan.
  // https://www.scsb.com.tw/content/dig/dig27_a.html
  // https://apply.scsb.com.tw/openaccount/client/
  scsb: { countries: ["TW"] },
  // Online opening is an adult with ROC nationality, a national identity
  // card and a health-insurance card. A foreigner, a minor and a US
  // taxpayer cannot open online. The picker is residence, so the country
  // is Taiwan.
  // https://service.standardchartered.com.tw/tw/ssl/campaign/casa/faq.html
  standardcharteredtw: { countries: ["TW"] },
  // The foreign-stock page sells to an adult ROC national, an overseas
  // Chinese with a national identity card, or a foreigner with an alien
  // resident certificate. A US taxpayer and an EU person are excluded.
  // The certificate is residence in Taiwan. The picker is residence, so
  // the country is Taiwan.
  // https://www.ubot.com.tw/stocks_ETF
  unionbank: { countries: ["TW"] },
  // Online opening of DAWHO is an adult with ROC nationality and a
  // national identity card. A foreigner cannot open that account. A
  // foreigner with an alien resident certificate can open a branch
  // account. The certificate is residence in Taiwan. The picker is
  // residence, so the country is Taiwan.
  // https://dawho.tw/how/apply/
  sinopactw: { countries: ["TW"] },
  // A digital account is an adult with a national identity card, or a
  // foreigner of 18 with an alien resident certificate. The certificate
  // is residence in Taiwan. The picker is residence, so the country is
  // Taiwan.
  // https://richart.tw/TSDIB_RichartWeb/RC02/RC020201?announceNo=34307
  taishin: { countries: ["TW"] },
  // A foreign-currency account is a ROC national with a national identity
  // card, or a foreigner with a passport and a unified number, or a
  // residence certificate that carries one, plus proof of a Taiwan
  // address. The certificate is residence in Taiwan. The picker is
  // residence, so the country is Taiwan.
  // https://www.ctbcbank.com/twrbo/zh_tw/dep_index/dep_product/dep_foreign_index/dep_foreign_demand.html
  ctbc: { countries: ["TW"] },
  // The rules serve residents and non-residents. An electronic contract
  // is only a natural person who is a resident. The service is provided
  // on the territory of Poland. No other country of residence is named.
  // https://ipopemasecurities.pl/wp-content/uploads/2026/05/Regulaminmaklerskidlaklientowindywid_20260512.pdf
  ipopema: { countries: ["PL"] },
  // Online opening asks for an e-KTP, an NPWP and a photo with the card.
  // An e-KTP is an Indonesian citizen's card. A foreign national who is
  // already a client updates data with a passport. No other country of
  // residence is named.
  // https://www.bions.id/edukasi/saham/cara-buka-rekening-saham-di-bni-sekuritas
  // https://help.bions.id/docs/cara-mengubah-data/
  bni: { countries: ["ID"] },
  // The product page asks for a KTP, an NPWP and a savings account. The
  // firm's own guide says a citizen shows a KTP and a foreigner a passport
  // and a KITAS. A KITAS is a stay permit in Indonesia. No other country
  // of residence is named.
  // https://www.brights.id/id/produk-dan-layanan/layanan/rekening-saham
  // https://www.brights.id/id/blog/cara-buka-rekening-saham
  bri: { countries: ["ID"] },
  // Online opening asks for an INE, an RFC and a CLABE in the client's
  // name. An INE is a Mexican voter's card. A company account is opened
  // by phone. No other country of residence is named.
  // https://www.finamex.com.mx/general/finamex-trading/
  finamex: { countries: ["MX"] },
  // The form says only a Canadian resident can open. The FAQ adds that a
  // non-resident cannot, and that a Canadian citizen or resident of 18
  // can. Citizenship may be other than Canadian. No other country of
  // residence is named.
  // https://www.disnat.com/en/help-contact
  // https://www.disnat.com/aide-contact/document-formulaire/DX01
  disnat: { countries: ["CA"] },
  // The opening page takes a Filipino citizen, a resident foreigner and a
  // non-resident foreigner. A US person sends a W-9 or a W-8BEN. No
  // country of residence is refused.
  // https://www.colfinancial.com/ape/final2/home/open_an_account.asp
  col: { all: true },
  // Online opening asks for a Romanian identity card and a bank statement
  // in the client's name. The tax page tells a non-resident client to name
  // their tax country. It does not name another country of residence for
  // opening.
  // https://primet.ro/intrebari-frecvente
  // https://www.primet.ro/impozitarea-veniturilor-din-tranzactionarea-titlurilor-de-valoare
  prime: { countries: ["RO"] },
  // Online opening asks for a Philippine government ID and a Philippine
  // mobile number. A foreigner sends a current passport and an Alien
  // Certificate of Registration, which is residence in the Philippines.
  // An OFW card is an identity document, not another country of residence.
  // Telemoney is how a client already abroad sends money.
  // https://www.rcbcsec.com/corporate/faqs.html
  rcbc: { countries: ["PH"] },
  // A Filipino opens with a BPI deposit account. A foreigner sends a
  // current passport and an Alien Certificate of Registration, or a work
  // permit. A tourist visa is refused. The picker is residence, so the
  // country is PH.
  // https://new.bpitrade.com/faq/who-can-open-a-bpi-trade-account/
  // https://new.bpitrade.com/faq/what-are-the-requirements-to-open-a-bpi-trade-account/
  bpi: { countries: ["PH"] },
  // The opening note times the account for a Filipino citizen. PERA,
  // including an OFW, requires a Philippine address and fails with
  // "residing outside the PH". The picker is residence, so the country
  // is PH.
  // https://help.dragonfi.ph/hc/en-us/articles/17029342098329-How-long-does-it-take-to-open-an-investment-account-and-start-investing
  // https://help.dragonfi.ph/hc/en-us/articles/52921466054041-PERA-for-OFWs-Document-Submission-Guidelines
  dragonfi: { countries: ["PH"] },
  // The retail account is a CPF. A withdrawal goes only to a bank account
  // in the same name. The contract also speaks to a non-resident, and that
  // is the B3 non-resident module, a registered foreign investor, not a
  // residence the picker names. The picker is residence, so the country
  // is BR.
  // https://cdn.toroinvestimentos.com.br/corretora/documents/regras-e-parametros-de-atuacao.pdf
  // https://cdn.toroinvestimentos.com.br/corretora/documents/contrato-de-intermediacao-e-custodia-toro-investimentos.pdf
  toro: { countries: ["BR"] },
  // GStocks opening takes a Filipino with a government ID, a foreigner
  // residing abroad with a passport, and a foreigner residing in the
  // Philippines with a passport and an AEP, an ACR or an SRRV. No
  // country of residence is refused.
  // https://securities.abcapitalonline.com/frequently-asked-questions/
  abcapital: { all: true },
  // Belgium takes a natural person of 18 whose official and fiscal
  // residence is Belgium. Malta takes a resident of an EEA country,
  // Switzerland or the UK. A name carries only the residences of the
  // book it is on.
  // https://www.medirect.be/nieuws-research/faqs/what-are-the-requirements-to-open-an-account/
  // https://www.medirect.com.mt/pay/account/
  medirect: { groups: ["EEA"], countries: ["CH", "GB"] },
  // FAQ: the account is limited to a resident of Japan. Nationality is not
  // a criterion. A foreign national needs a residence card. A non-resident
  // cannot open.
  // https://faq.sbisec.co.jp/answer/5ec2341f8504de0011d61467/
  // https://faq.sbisec.co.jp/answer/5ecb693a8504de0011d61dc1/
  sbijp: { countries: ["JP"] },
  // Online share trading settles on an account at a SpareBank 1 bank.
  // The public forms ask for a Norwegian national identity number and a
  // Norwegian mobile number. No other country of residence is named.
  // https://www.sb1markets.no/globalassets/alle-dokumenter-2025/general-terms--conditions/special-business-terms-for-trading-financial-instrument-via-online-platform-for-private-individuals.pdf
  // https://www.sparebank1.no/nb/bank/privat/kundeservice/bestill/bli-kunde.html
  spare: { countries: ["NO"] },
  // The account-opening article for someone who has moved to Iceland says
  // the only requirement is an Icelandic kennitala. Nationality is not a
  // test. No other country of residence is named.
  // https://www.arionbanki.is/en/articles/did-you-just-move-to-iceland-and-need-a-bank-account
  arion: { countries: ["IS"] },
  // The account-opening article for someone who has moved to Iceland says
  // an Icelandic kennitala is required. Online share trading is opened by
  // signing the service agreement with electronic ID. Nationality is not a
  // test. No other country of residence is named.
  // https://www.landsbankinn.is/umraedan/fraedsla/ertu-ad-flytja-til-landsins-og-vantar-bankareikning
  // https://www.landsbankinn.is/verdbrefavidskipti-a-netinu
  landsbankinn: { countries: ["IS"] },
  // The non-resident price list names other EU, Norwegian, Icelandic,
  // Liechtenstein and Swiss residents, and opening still asks for a link
  // to Estonia. The picker keeps Estonia.
  // https://www.lhv.ee/en/customer-data
  // https://www.lhv.ee/en/price-list-01-08-2026
  lhvpank: { countries: ["EE"] },
  // Opening asks for a PAN, an Aadhaar linked to a mobile number, and that
  // the client lives in India. An NRI cannot open this account. The picker
  // is a country of residence, so the country is IN.
  // https://www.share.market/support/home/getting-started/creating-a-trading-and-demat-account/who-can-open-a-trading-and-demat-account-on-phonepe-broking/
  sharemarket: { countries: ["IN"] },
  // No licence to deal outside Japan. A foreign national opens with a
  // residence card; nationality is not a criterion. Leaving for a year or
  // more is the non-resident procedure.
  // https://www.rakuten-sec.co.jp/web/support/procedures/non-resident/
  // https://account.rakuten-sec.co.jp/ITS/acc_identification.html
  rakutenjp: { countries: ["JP"] },
  // Any adult with a Malaysian bank account. Nationality is not a test:
  // a non-Malaysian uses a passport. The account is funded from that bank,
  // and the picker is a country of residence, so the country is MY.
  // https://www.rakutentrade.my/faqs/account-opening-general-qs/what-do-i-need-to-open-an-account
  rakutenmy: { countries: ["MY"] },
  // Account page: anyone living in Japan may apply. A minor uses the minor
  // account. Foreign PEPs and US nationals cannot open. The picker is a
  // country of residence, so the country is JP.
  // https://www.paypay-sec.co.jp/account/
  paypay: { countries: ["JP"] },
  // Opening is PAN, Digilocker Aadhaar and an Aadhaar e-sign. The KYC page
  // says an NRI cannot invest. An NRE, NRO or NRI bank account cannot be
  // added. The picker is a country, so the country is IN.
  // https://www.paytmmoney.com/care/paytm-money-kyc
  // https://www.paytmmoney.com/blog/open-your-paytm-money-demat-account-in-just-minutes/
  // https://www.paytmmoney.com/blog/ready-trade-verify-bank-account-first/
  paytmmoney: { countries: ["IN"] },
  // A resident Indian living in India opens the regular account. An NRI
  // opens a 3-in-1 account with a passport, a visa and an overseas address.
  // That page does not name those countries. The picker is a country, so
  // the country is IN.
  // https://www.icicidirect.com/open-a-demat-account
  // https://www.icicidirect.com/faqs/nri-account/what-are-the-documents-required-to-open-an-icici-direct-account
  icici: { countries: ["IN"] },
  // The open-account page takes a resident Indian and an NRI. The 3-in-1
  // account is an Indian resident of 18, with PAN and Aadhaar. An NRI opens
  // with a passport and an overseas address, linked to an NRE or NRO account.
  // That page does not name those countries. The picker is a country, so
  // the country is IN.
  // https://hdfcsky.com/open-demat-account
  // https://hdfcsky.com/sky-learn/demat-account/types-of-demat-account
  hdfcsky: { countries: ["IN"] },
  // A resident opens in their own name. An NRI, a PIO or an OCI opens with
  // a passport and an overseas address, linked to an NRE or NRO account.
  // That page does not name those countries. The picker is a country, so
  // the country is IN.
  // https://www.indiainfoline.com/knowledge-center/demat-account/eligibility-criteria-to-open-demat-account
  // https://www.indiainfoline.com/nri-services
  iifl: { countries: ["IN"] },
  // A Hong Kong resident opens with a Hong Kong identity card and an
  // address proof. The overseas page lets the client name a country of
  // residence and witness the form locally, but it does not name those
  // countries. The picker is a country, so the country is HK.
  // https://www.futuhk.com/en/support/topic2_10
  // https://www.futuhk.com/en/support/topic2_9
  futuhk: { countries: ["HK"] },
  // Opening is a private person living in Japan. A foreign national uses a
  // residence card. A US citizen or a US resident cannot apply. The picker
  // is a country of residence, so the country is JP.
  // https://www.click-sec.com/corp/kouza/entry/kijun.html
  // https://faq.click-sec.com/faq/show/307?category_id=155&site_domain=default
  gmoclick: { countries: ["JP"] },
  // FAQ: an account opens only for someone living in Japan. A foreign
  // national uses a residence card. Nationality is not a criterion. A
  // stay abroad of a year or more, or an open-ended posting, is
  // non-resident and cannot open.
  // https://faq.monex.co.jp/faq/show/1221?site_domain=default
  // https://faq.monex.co.jp/faq/show/4690?site_domain=default
  // https://info.monex.co.jp/support/non-resident-procedure.html
  monexjp: { countries: ["JP"] },
  // Terms, 26 Aug 2025: a Nigerian citizen or a legal resident in Nigeria,
  // with a BVN. The picker is a country of residence, so the country is NG.
  // https://cowrywise.com/terms
  cowrywise: { countries: ["NG"] },
  // The product is offered in Nigeria, Ghana and South Africa. A Nigerian
  // BVN, a Ghana Card or a South African ID is what opens the account, and
  // that person can then use the app from abroad. The picker is residence,
  // so it keeps the three countries.
  // https://faq.investbamboo.com/en/articles/6884650-what-countries-is-bamboo-available-in
  bamboo: { countries: ["NG", "GH", "ZA"] },
  // Payment terms: Czech citizens and foreigners, 15 or older. A Czech
  // phone number is required. A non-EU foreigner shows a residence permit.
  // The picker is a country, so the country is CZ.
  // https://www.airbank.cz/file-download/5118-podminky-platebniho-styku.pdf
  // https://www.airbank.cz/co-vas-nejvic-zajima/zalozeni-uctu-cizinec/
  airbank: { countries: ["CZ"] },
  // FAQ and PDS: Australian tax resident, 18 or older, with an Australian
  // residential address. Nationality is not the test. A non-resident for
  // Australian tax cannot open.
  // https://www.betashares.com.au/direct/faq
  // https://public-files.wealth.betashares.com.au/legal/product-disclosure-statement.pdf
  betashares: { countries: ["AU"] },
  // Help: a new account needs Australian residence or tax residence. A
  // resident or tax resident of another country cannot open. Nationality
  // is not a separate test; the picker is a country, so the country is AU.
  // https://pearler.com/help/is-pearler-right-for-me/4794103-can-i-invest-with-pearler-if-i-m-not-an-australian-resident
  // https://pearler.com/help/is-pearler-right-for-me/5155265-am-i-eligible-to-sign-up-for-pearler
  pearler: { countries: ["AU"] },
  // Support: an account needs an Australian residential address and
  // Australian tax residence. An overseas address is refused. Nationality
  // is not the test. The picker is a country, so the country is AU.
  // https://hellostake.com/au/support/get-started/sign-up/57463401809945
  stakeau: { countries: ["AU"] },
  // Digital opening needs a Colombian resident with a cédula de ciudadanía.
  // A foreigner's card, a minor's card and a company tax number are refused.
  // The residence fields must be in Colombia. The picker is residence, so
  // the country is CO.
  // https://www.bancolombia.com/centro-de-ayuda/preguntas-frecuentes/vincularse-a-valores-bancolombia
  valores: { countries: ["CO"] },
  // The guide is an offer in Australia only. The application requires an
  // Australian residential address, an Australian mobile number and an
  // Australian bank account, and it asks for tax residency. Nationality
  // is not the test. The picker is a country, so the country is AU.
  // https://fund-docs.vanguard.com/AU-Vanguard_Personal_Investor_Guide_Part_A.pdf
  // https://www.vanguardinvestor.com.au/initiate.aspx
  // https://www.vanguard.com.au/personal/support/frequently-asked-questions/my-account
  vanguardau: { countries: ["AU"] },
  // Terms 1.3: an ISA needs a UK resident who pays UK tax. A General Account
  // needs a UK resident who pays tax only in the UK. A pension needs a UK
  // tax resident. Channel Islands and Crown Dependency residents cannot
  // open. A US person cannot. The country is GB.
  // https://www.vanguardinvestor.co.uk/content/dam/intl/uk-retail-direct/documents/vanguard-client-terms-conditions-feb-2025.pdf
  vanguarduk: { countries: ["GB"] },
  // The February 2026 KYC takes a resident, an NRI, a PIO and a foreign
  // national. The mobile line asks for a country code and ten digits, and
  // the printed example is 91. The SMS line is +91. The picker is a
  // country, so the country is IN.
  // https://www.nuvamawealth.com/ewwebimages/webfiles/disclaimer/KYC-Individual.pdf
  nuvama: { countries: ["IN"] },
  // The online opening registers a mobile, then an OTP, then PAN and
  // Aadhaar. The Aadhaar OTP goes to the number linked to that card.
  // The picker is a country, so the country is IN.
  // https://choiceindia.com/open-free-demat-account
  choice: { countries: ["IN"] },
  // A resident account opens with PAN and Aadhaar. m.Stock does not open
  // an NRI account or a non-individual account. The picker is a country,
  // so the country is IN.
  // https://www.mstock.com/articles/nri-demat-account-opening-process
  // https://www.mstock.com/articles/non-repatriable-demat-account
  // https://www.mstock.com/open-demat-account
  "m.stock": { countries: ["IN"] },
  // Online opening is an Indian citizen who lives in India. An NRI opens
  // offline with an NRE or NRO account. The picker is a country, so the
  // country is IN.
  // https://www.motilaloswal.com/open-demat-account/
  // https://www.motilaloswal.com/nri-demat-account
  // https://ekyc.motilaloswal.com/EKYC_Icons/TermsAndConditions.pdf
  motilaloswal: { countries: ["IN"] },
  // The online form fixes +91 and asks for a mobile number, then an OTP.
  // That number is Indian. The picker is a country, so the country is IN.
  // https://kyc.arrow.trade/
  arrow: { countries: ["IN"] },
  // Opening uses Digilocker and the mobile linked to Aadhaar. Without an
  // Aadhaar number the account cannot be opened. An NRI is not supported.
  // The picker is a country, so the country is IN.
  // https://www.sahi.com/faq/account-opening/can-nr-is-open-an-account-on-sahi
  // https://www.sahi.com/faq/account-opening/i-do-not-have-an-aadhaar-number-can-i-still-open-a-demat-account-on-sahi
  sahi: { countries: ["IN"] },
  // The open-account form fixes +91 and an Aadhaar-linked mobile for the
  // OTP. That number is Indian. The picker is a country, so the country is IN.
  // https://aliceblueonline.com/open-demat-account
  aliceblue: { countries: ["IN"] },
  // The KYC mobile asks for a country code and ten digits, and the
  // printed example is 91. The SMS line is +91. The picker is a country,
  // so the country is IN.
  // https://download.arihantcapital.com/account/542320261254165865416.pdf
  arihant: { countries: ["IN"] },
  // Opening an account starts with an Aadhaar-linked mobile number, then
  // PAN and bank proof. That number is Indian. The picker is a country,
  // so the country is IN.
  // https://www.gopocket.in/
  gopocket: { countries: ["IN"] },
  // Opening is PAN and an Aadhaar-linked mobile number. The help centre
  // says an NRI cannot invest in stocks, even with an NRI KYC. A separate
  // page offers an NRI demat through an NRO account and does not name the
  // countries of residence. The picker is a country, so the country is IN.
  // https://groww.in/open-demat-account
  // https://groww.in/help/my-account/ma-account-details/i-am-an-nri--and-my-nri-kyc-is-verified--can-i-invest-through-groww--42
  // https://groww.in/open-nri-demat-account
  groww: { countries: ["IN"] },
  // The online form is for a resident individual. The mobile field is fixed
  // at +91 and asks for a 10-digit number, then an OTP. A company or an NRI
  // is told to email instead. The picker is a country, so the country is IN.
  // https://signup.definedgesecurities.com/
  definedge: { countries: ["IN"] },
  // E-sign uses an OTP on the mobile number linked to Aadhaar. That number
  // is Indian. The picker is a country, so the country is IN.
  // https://tradesmartonline.in/open-demat-account/
  tradesmart: { countries: ["IN"] },
  // The online opening is PAN, Aadhaar through DigiLocker, and an Indian
  // bank account. The KYC instruction mentions a non-resident passport,
  // subject to RBI and FEMA, and does not open a separate country list.
  // The picker is a country of residence, so the country is IN.
  // https://profitmart.in/how-to-open-demat-account/
  // https://profitmart.in/downloads/Forms/Profitmart-Equity-KYC.pdf
  profitmart: { countries: ["IN"] },
  // Non-residents may open the Singapore account. US, UK and Canada
  // restrictions are on certain funds, not on the account. The picker is a
  // nationality.
  // https://secure.fundsupermart.com/fsm/account-opening/non-residents
  // https://secure.fundsupermart.com/fsmone/article/rcms361200/your-biggest-questions-about-investing-with-fsm-global-in-singapore
  fsmonesg: WORLD,
  // The bank named at opening is a Hong Kong clearing participant. The
  // picker is a country, so the country is HK.
  // https://www.fsmglobal.hk/account-opening/personal/account-info
  fsmonehk: { countries: ["HK"] },
  // The opening form refuses a U.S. citizenship, a U.S. permanent resident
  // status, or a U.S. taxpayer identification number. A non-resident of
  // Malaysia can open. The picker is residence, so the excluded country
  // is the United States.
  // https://www.fsmone.com.my/about-us
  fsmonemy: WORLD_NO_US,
  // The 2026 store listing says it is not directed at residents of the
  // United States. The help centre says clients come from over 150
  // countries. The terms require 18 and a KYC check. The picker is a
  // nationality, so the United States is excluded.
  // https://apps.apple.com/ph/app/gotrade-invest-in-us-stocks/id1530178262
  // https://help.heygotrade.com/en/articles/5977562-is-it-possible-to-invest-in-us-shares-from-outside-the-us
  gotradeglobal: WORLD_NO_US,
  // The applicant must be an Indonesian citizen living in Indonesia.
  // The picker is a nationality, so the country is ID.
  // https://help.heygotrade.com/en/articles/5985064-siapa-saja-yang-dapat-memiliki-akun-gotrade-indonesia
  gotradeid: { countries: ["ID"] },
  // A resident of Korea opens with a Korean ID, or with an alien registration
  // card. Nationality is not the test. The picker is a country, so the
  // country is KR.
  // https://krinsider.com/blog/korea-stock-crypto-account-foreigner-2026
  toss: { countries: ["KR"] },
  // Communiqué 118/BM/ZRR/2022 records citizenship and refuses no country.
  // The brokerage agreement is Polish only. The English site does not carry
  // that form. Polish is the official language of Poland, so the picker
  // keeps Poland.
  // https://www.pekao.com.pl/dam/jcr:2959a3f3-a892-47b9-96c6-5b54bc17f792/Umowa%20%C5%9Bwiadczenia%20us%C5%82ug%20maklerskich%20-%20rachunek%20indywidualny.2025-11-25-15-47-00.pdf
  // https://www.pekao.com.pl/en/
  pekao: { countries: ["PL"] },
  // Online opening in Erste internet banking is for a client of Erste Bank
  // Polska who is a resident of Poland. The picker is residence, so the
  // country is PL.
  // https://www.erste.pl/klient-indywidualny/oszczednosci-i-inwestycje/rachunek-maklerski-standard
  erstepl: { countries: ["PL"] },
  // Account page: any adult with a Polish ID card or a passport.
  // Communiqué of 31 Dec 2025, in force 1 Jan 2026: no foreign-markets annex,
  // and no foreign-currency trading on the home market, for a citizen, a
  // resident or a tax resident of the high-risk list. The picker is a
  // nationality, so those citizenships are excluded. The communiqué names
  // Belarus, Cuba, Iran, North Korea, Russia and Syria. Ukraine is only the
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
  degironl: { countries: DEGIRO },
  traderepublic: { countries: TRADE_REPUBLIC },
  // Sign-up FAQ: residents of these six, metropolitan France only, never a US
  // taxpayer. Moving outside the EEA ends the relationship, so residency is the
  // test and the German home country alone would be too narrow.
  scalablecapital: { countries: ["DE", "AT", "FR", "IT", "ES", "NL"] },
  trading212: { countries: T212 },
  lightyear: { countries: LIGHTYEAR },
  // User agreement: 18 or over, tax residence in the EU/EEA, and BankID to
  // open. The site is Swedish only, so the picker keeps Sweden.
  // https://levler.se/dokument/Villkor-for-anvandarkonto-hos-Levler.pdf
  levler: { countries: ["SE"] },
  // Share-and-fund account: residence and tax residence in the EU/EEA,
  // and an account at another Swedish bank. The picker keeps Sweden.
  // https://www.avanza.se/avanzabank/hem/konton/blanketter/aktie-och-fondkonto/villkor_handelsDepaKontoavtal_2018.pdf
  avanza: { countries: ["SE"] },
  // Living abroad needs a link to Sweden, so the picker keeps Sweden.
  // https://www.nordnet.se/faq/bankprodukter-kontohantering/oppna-konto/oppna-konto-for-utlandska-medborgare-eller-utlandsbosatta/oppna-konto-som-utlandska-medborgare-bosatt-utanfor-sverige
  nordnetse: { countries: ["SE"] },
  revolut: { countries: REVOLUT_STOCKS },
  bitpanda: { countries: BITPANDA },
  // lynxbroker.com account-country: AT BE CZ FI FR DE NL PL SK.
  // lynxbroker.ch opening: primary residence in Germany, Austria or Switzerland.
  lynxnl: { countries: ["AT", "BE", "CZ", "FI", "FR", "DE", "NL", "PL", "SK", "CH"] },
  // EEA + Switzerland, plus the BrokerChooser countries the picker can name.
  captrader: { groups: ["EEA"], countries: ["CH", ...CAPTRADER_BC] },
  // CSSF passport, offices in LU/NL/BE/FR/DE/CH, clients in 28 countries.
  whselfinvest: { groups: ["EEA"], countries: ["CH", "GB"] },
  saxofr: { countries: SAXO },
  // Bank SA prices Switzerland. Bank Europe prices the EEA. The schedules
  // differ, so the lists stay apart. UK, Singapore, Hong Kong and MEA are
  // other companies and are not either card.
  swissquote: { groups: ["EEA"], countries: ["CH"] },
  // IBKR books an account with the entity of the holder's residence. Its
  // Europe page: Interactive Brokers Ireland serves "all EU and EEA
  // residents"; the UK and Switzerland are IBUK, the rest of the world other
  // IBKR companies. The country picker sends exactly the 30 EEA countries to
  // the Irish site.
  // https://www.interactivebrokers.eu/en/home.php
  // https://www.interactivebrokers.com/en/choose-country-region.php
  interactivebrokersie: { groups: ["EEA"] },
  xtb: { countries: XTB },
  igue: WORLD_NO_US,
  // UK site, IG Trading and Investments: a GBP share-dealing account, an ISA
  // and a SIPP. The ISA page says any UK resident over 18. The same site
  // says it is not directed at residents of any country outside the UK.
  // Ireland's share dealing is the Ireland site, in euros.
  // https://www.ig.com/uk/investments/isa
  // https://www.ig.com/uk/investments/share-dealing
  // https://www.ig.com/uk/create-account
  iguk: { countries: ["GB"] },
  // The priced book is OANDA TMS cash shares, sold to the 27 EU countries.
  // UK, Switzerland, Norway, Liechtenstein, the US, Canada, Australia,
  // Singapore, Japan and Global Markets are other companies with other fees.
  oandapl: { groups: ["EU"] },
  admiralcy: WORLD_NO_US,
  freedom24: { countries: FREEDOM24 },
  // Global T&Cs block US and Canada. The US entity is only the ETF CFD
  // shelf sold as a real ETF (`--plan=us`); front hides it from everyone
  // else. Canada has no eToro book.
  etoro: WORLD_NO_CA,
  // Client agreement: not for the US, Canada, the Bahamas or the British Virgin Islands.
  // BS and VG are not in the country list.
  quantfury: { all: true, except: ["US", "CA"] },
  // FAQ: citizens or residents of most countries except sanctions / local bans.
  mexem: WORLD,
  century: { groups: ["GCC"], countries: [...EEA, "GB", "CH", "IN", "PK", "EG", "ZA", "SG", "MY", "HK"] },
  // Open-account page lists a National ID path for non-UAE residents.
  bhmuae: WORLD,
  // Residents of the UAE, Oman, Qatar, Bahrain and Kuwait. Saudi Arabia
  // is not on the list. The US broker refuses some nationalities and does
  // not name them. The terms also refuse a resident of the United States.
  // https://getbaraka.com/support/is-baraka-available-in-all-countries
  baraka: { countries: ["AE", "BH", "KW", "OM", "QA"] },
  // A resident of Spain can open, of any nationality, with an account at
  // another Spanish bank. A Spanish national can also live in the EU or
  // the United Kingdom. Anyone else living abroad cannot, so the picker
  // stays Spain.
  // https://myinvestor.es/ayuda/preguntas-frecuentes/cuentas/
  myinvestor: { countries: ["ES"] },
  // Opening asks for the front and back of a DNI, the document of a
  // person who lives in Argentina. The US account, opened from the same
  // login, asks for Argentine tax residence. The picker stays Argentina.
  // https://www.invertironline.com/preguntas-frecuentes
  // https://iol.invertironline.com/autorespuesta/quienespuedeninvertirenestadosunidos/423/420364
  iol: { countries: ["AR"] },
  // The picker is residence, and the country is Argentina.
  // https://balanz.com/abrir-cuenta/
  balanzar: { countries: ["AR"] },
  // A non-resident foreigner can open after a CDI or a CIE. The picker
  // stays Argentina.
  // https://www.ecovalores.com.ar/preguntas-frecuentes.php
  ecovalores: { countries: ["AR"] },
  // A current Peruvian DNI is required. A foreign identity document
  // cannot open the account. The picker is Peru.
  // https://trii.pe/faq
  triipe: { countries: ["PE"] },
  // The catalogue is the individual investment account. Only a natural
  // person who is a tax resident of Slovenia can open it. The bank checks
  // that status with the tax authority. A non-resident payment account is
  // a different product.
  // https://www.bksbank.si/fizicne-osebe/financni-instrumenti/inr-racun
  // https://www.bksbank.si/mbxs8qn54zwj/4m8nTvzu1BzMUUx8ciePqy/df2db0183f26319b269761d9ec32a90c/Posebni_pogoji_poslovanja_z_INR_Mar2026_-_Final.pdf
  bkssi: { countries: ["SI"] },
  // General terms: Swiss residence, and Swiss tax only. A foreign national
  // needs permit B or C, which is still residence in Switzerland.
  // https://static-assets.neon-free.ch/legal/neon/neon_general_terms_and_conditions_en.pdf
  neon: { countries: ["CH"] },
  alramz: WORLD, // FAQ: separate KYC pack for non-UAE residents
  // The individual KYC asks for a passport number for a non-resident and
  // leaves nationality and the mobile number free. A Kuwait civil ID is
  // the resident's document, not a lock on the country. The picker is a
  // country.
  // https://boubyancapital.com/media/filer_public/b0/63/b063e80b-c56d-49a8-9de9-211048de0df8/individual_agreement-24aug2026.pdf
  boubyan: WORLD,
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
  // Opening is a Polish identity card, mObywatel or a trusted profile, plus
  // a tax-office address. The foreign-instruments clause may refuse a
  // client who is not a Polish tax resident, and a US person.
  // https://www.bdm.pl/edukacja/otwarcie-rachunku
  // https://www.bdm.pl/files/bdm/dokumenty/Regulamin/ws_regulamin.pdf
  bdm: { countries: ["PL"] },
  // No catalogue yet. BrokerChooser’s 29 countries; Spain is not among them.
  flatex: { countries: FLATEX_COMDIRECT },
  comdirect: { countries: FLATEX_COMDIRECT },
  // No catalogue yet. Italy plus the nine BrokerChooser adds.
  directa: { countries: DIRECTA },
  // The launch notice still on the commission's site: only Zimbabweans with
  // a valid ID and a Zimbabwean bank account register, in the initial phase.
  // The wallet is funded by Zipit, RTGS or EcoCash. A foreign investor uses
  // a stockbroker, not this platform. The current terms do not add a country.
  // https://seczim.co.zw/capital-markets-in-zimbabwe/
  // https://www.zse.co.zw/zse-direct-terms-and-conditions/
  zsedirect: { countries: ["ZW"] },
  // The online account is opened by linking a level-2 VNeID or by
  // scanning the chip of a Vietnamese citizen card.
  // https://hdsd.dnse.com.vn/master/huong-dan-mo-tai-khoan-ekyc
  dnse: { countries: ["VN"] },
  // The online form is the Vietnamese citizen card. "I am foreigner"
  // does not open a form: it sends the client to a KIS office.
  // https://trading.kisvn.vn/ekyc/
  // https://kisvn.vn/hoc-dau-tu/mo-tai-khoan-chung-khoan-kis-online-ekyc
  kisvn: { countries: ["VN"] },
  // The online form asks for a chip citizen card. A foreign investor or
  // an institution is told to call the hotline.
  // https://www.masvn.com/register
  // https://masvn.com/en/register
  miraevn: { countries: ["VN"] },
  // The app opens an account for a domestic individual. A foreign
  // individual or a company is sent to a BSC counter or a BIDV branch.
  // https://www.bsc.com.vn/tai-ung-dung-bsc-smart-invest/
  bsc: { countries: ["VN"] },
  // The online account is the Vietnamese one.
  vps: { countries: ["VN"] },
  // The online form is the domestic individual. A foreign individual opens
  // at the Hanoi counter or by post, after an indirect-investment account.
  // https://pinetree.vn/en/post/dich-vu/individual-customers/
  pinetree: { countries: ["VN"] },
  // The online account takes a Vietnamese citizen card.
  // https://support.vndirect.com.vn/hc/vi/articles/14250597614745
  vndirect: { countries: ["VN"] },
  // The online account is opened by photographing a Vietnamese citizen card.
  // https://www.vietcap.com.vn/huong-dan-chung/mo-tai-khoan-ekyc
  vietcap: { countries: ["VN"] },
  // The online account is opened with a chip Vietnamese citizen card.
  // https://www.ssi.com.vn/khach-hang-ca-nhan/gioi-thieu-mo-tai-khoan
  ssi: { countries: ["VN"] },
  // The online account is opened with VNeID or a Vietnamese citizen card.
  // The counter file is for a Vietnamese national. The picker is a
  // nationality, so the country is VN.
  // https://www.vcbs.com.vn/chi-tiet-ho-tro-giao-dich/mo-tai-khoan-giao-dich-chung-khoan
  vietcombank: { countries: ["VN"] },
  // Select is offered only to a natural person whose only tax residence
  // is Germany. §2 of the Select framework agreement.
  // https://www.visualvest.de/rechtliches/rechtliche-hinweise
  visualvest: { countries: ["DE"] },
  // The offer is only a private customer living in Germany, a natural
  // person of 18 acting for their own account. A person with a US
  // connection is refused. The picker is residence, so the country is
  // Germany.
  // https://www.ing.de/sparen-anlegen/direkt-depot/
  // https://www.ing.de/dokumente/agb-direkt-depot-extra-konto/
  ingde: { countries: ["DE"] },
  // The application rejects any address that is not a German residence:
  // "Antragstellungen sind nur für Melde- bzw. Wohnsitzadressen in
  // Deutschland möglich." A moderator of the comdirect community confirmed
  // that opening is only for a person living in Germany. The picker is
  // residence, so the country is DE.
  // https://community.comdirect.de/t5/konto-depot-karte/kontoeroeffnung-mit-wohnsitz-schweiz/td-p/361506
  comdirect: { countries: ["DE"] },
  // Opening requires German citizenship and a German tax residence. A
  // residence permit is not enough, and a German citizen living abroad
  // is not onboarded. The picker is residence, so the country is Germany.
  // https://www.justtrade.com/faq
  justtrade: { countries: ["DE"] },
  // The depot is the customer who lives in Germany. Crypto, which sits in
  // that same depot, is offered only to a customer with a German residence.
  // The picker is residence, so the country is DE.
  // https://www.tradersplace.de/angebot/uebersicht/kryptowerte
  tradersplace: { countries: ["DE"] },
  // The service is only for a person living in Japan. A foreign national
  // opens with a residence card. A US citizen, a green-card holder or a US
  // resident cannot open. The picker is residence, so the country is JP.
  // https://www.moomoo.com/jp/support/topic7_299
  // https://www.moomoo.com/jp/support/topic7_287
  moomoojp: { countries: ["JP"] },
  // Indonesian shares are for an Indonesian citizen. A foreigner opens
  // with a passport and needs a KITAS to reach US shares, so that
  // residence is Indonesia. A US citizen adds a FATCA form.
  // https://pluang.com/faq/identity-verification/basic-verification/apakah-warga-negara-asing-wna-bisa-berinvestasi-di-pluang
  // https://pluang.com/faq/us-stocks/about-us-stocks/faktor-tidak-dapat-investasi-di-saham-as
  pluang: { countries: ["ID"] },
  // The online account is opened with a PAN. US stocks are for an Indian
  // resident under LRS. NRI US stocks are marked coming soon, and the NRI
  // Indian account is a document flow.
  // https://www.indmoney.com/us-stocks
  // https://www.indmoney.com/features/nri
  indmoney: { countries: ["IN"] },
  // An Iraqi adult opens with a national ID, a residence certificate and a
  // passport. A non-Iraqi individual opens with a passport. No country is
  // named as excluded.
  // https://rs.iq/open-a-trading-account/
  rabee: { all: true },
  // The dirham account takes a Moroccan or a foreigner living in Morocco,
  // and a Moroccan living abroad. The foreign-currency account also takes
  // a foreigner living abroad. The securities account opens for every CFG
  // client. The opening form is French only, so the country is one where
  // French is spoken.
  // https://www.cfgbank.com/particuliers/notre-offre/banque-quotidien/les-comptes/
  // https://devenirclient.cfgbank.com/prospect/
  cfgbank: { countries: FRENCH },
  // A Moroccan, resident or not, and a foreigner who lives in Morocco.
  // A foreigner living abroad is not named. The picker is residence, and
  // the countries where Moroccans abroad live are not listed, so the
  // country is Morocco.
  // https://www.wafabourse.com/fr/faq
  wafabourse: { countries: ["MA"] },
  // A Moroccan, resident or not, a foreigner living in Morocco, and a
  // foreigner living abroad. The opening form is the Arabic version or
  // the French version, so the country is one where Arabic or French is
  // spoken.
  // https://ebourse.cihbank.ma/identite/comptedistant
  // https://www.cihbank.ma/en/MDM/become-a-client/mdm-Offers
  cih: { countries: [...new Set([...FRENCH, ...ARABIC])] },
  // The opening form offers an Australian resident, who must show an
  // Australian address, or a non-resident living in New Zealand or
  // Singapore. Any other country is "not listed" and not open yet.
  // https://marketech.com.au/focus/features/non-resident-accounts/
  marketech: { countries: ["AU", "NZ", "SG"] },
  // A resident signs up online with a +91 number. An NRI opens offline:
  // the English form and scanned documents go by email, and a relationship
  // manager collects the signed originals. The NRI form asks for a two-digit
  // country code and a ten-digit mobile, and the NRI lead form offers about
  // 210 dial codes, so a number abroad is accepted. The money comes from an
  // NRE or NRO PINS account at Kotak Mahindra Bank, an Indian account opened
  // for a non-resident. US and Canada clients must visit India to sign, which
  // is not a refusal. No country is refused.
  // https://www.kotakneo.com/nri-demat-account
  // https://www.kotakneo.com/support/how-can-i-open-a-trading-and-demat-account-as-an-nri/
  kotak: WORLD,
  // Help centre: only a resident individual can open an account; a
  // non-individual cannot. Opening needs an Aadhaar linked to the mobile
  // number for the OTP e-sign, and the sign-up field fixes +91. The picker
  // is a country, so the country is IN.
  // https://blinkx.in/help-center/articles/how-to-open-a-non-individual-account-with-blinkx
  // https://blinkx.in/help-center/articles/can-i-open-a-blinkx-account-if-my-aadhaar-is-not-linked-to-my-mobile-number
  // https://blinkx.in/open-demat-account
  blinkx: { countries: ["IN"] },
  // The individual account form (v2.7) takes a resident, an NRI
  // (repatriable or not) and a foreign national, with an NRE or NRO bank
  // account and an RBI approval reference. A US person's account is
  // reported under FATCA. No countries are named. The online opening is in
  // English with a ten-digit mobile and no dial code, an Indian city list,
  // and money from the client's own Indian bank. The picker keeps IN.
  // https://www.nirmalbang.com/open-demat-trading-account-online
  // https://payment.nirmalbang.com/NEFT_RTGS.html
  // https://www.nirmalbang.com/customer-service.aspx
  // https://www.nirmalbang.com/files/supportpdf/NB_Combined_Ind_CDSL_Form_Ver_2.7_17-10-26.pdf
  nirmalbang: { countries: ["IN"] },
  // Support: NRI account opening is not available, and an NRE or NRO bank
  // account is not accepted for a resident Indian account. Opening needs
  // PAN, Aadhaar, an Indian address and an Indian bank account. The picker
  // is a country, so the country is IN.
  // https://stocko.in/support/can-i-open-nri-nro-account-with-stocko/
  stocko: { countries: ["IN"] },
  // The NRI demat page says the online opening serves residents and NRIs.
  // An NRI adds a passport, a visa, an overseas address and PIS documents;
  // a US or Canada NRI files a FATCA declaration. No countries are named.
  // The sign-up field fixes +91. The picker is a country, so the country is IN.
  // https://www.mastertrust.co.in/demat-account/nri-demat-account
  // https://www.mastertrust.co.in/open-demat-account
  mastertrust: { countries: ["IN"] },
  // FAQ: Nubra does not currently support NRI accounts. The picker is a
  // country, so the country is IN.
  // https://nubra.io/faq/account-opening
  nubra: { countries: ["IN"] },
  // Account notes: someone who does not live in Japan, or is only in Japan
  // for a short stay, cannot apply. A foreign national applies by post.
  // Nationality is not otherwise a criterion. The picker is residence, so
  // the country is JP.
  // https://kabu.com/apply/flow/kojinflow-bk.html
  // https://kabu.com/apply/
  mitsubishiufjesmart: { countries: ["JP"] },
  // FAQ: someone living abroad cannot open an account. The online service
  // takes no contract from a non-resident. A client who moves abroad
  // normally closes the account. Someone moving to Japan can open once they
  // have a Japanese address. A foreign national, or anyone with a tax
  // residence outside Japan, must phone instead of applying online. The
  // picker is residence, so the country is JP.
  // https://faq.sc.mufg.jp/faq/show/7?site_domain=default
  // https://faq.sc.mufg.jp/faq/show/1310?site_domain=default
  // https://faq.sc.mufg.jp/faq/show/3095?site_domain=default
  // https://faq.sc.mufg.jp/faq/show/3944?site_domain=default
  mitsubishiufjmorgan: { countries: ["JP"] },
  // Terms: the contract ends if the client has no address in Japan or
  // becomes a non-resident. A client leaving Japan must close the account.
  // A residence card is accepted as ID. No other country is named. The
  // picker is residence, so the country is JP.
  // https://www.connect-sec.co.jp/rule/sogo_yakkan.pdf
  // https://www.connect-sec.co.jp/account/
  daiwaconnect: { countries: ["JP"] },
  // FAQ: the applicant must hold only Japanese nationality and live in
  // Japan. A foreign national, even one living in Japan, cannot apply.
  // Someone living abroad cannot apply. The picker is residence, so the
  // country is JP.
  // https://secure.okbiz.jp/cheer-sec/faq/show/51?site_domain=default
  // https://secure.okbiz.jp/cheer-sec/faq/show/54?site_domain=default
  // https://secure.okbiz.jp/cheer-sec/faq/show/55?site_domain=default
  cheer: { countries: ["JP"] },
  // Online account rules: open to a resident of Japan of any nationality.
  // A Japanese national abroad is a non-resident and cannot apply. Living
  // abroad six months or more, or an open-ended posting or study abroad,
  // counts as non-resident. The trading rules require residence in Japan.
  // The picker is residence, so the country is JP.
  // https://www.ando-sec.co.jp/services/internet/rule/01-oa-kojin.html
  // https://www.ando-sec.co.jp/churanet24/clauses_pdf/10-churanet.pdf
  ando: { countries: ["JP"] },
  // The form takes a holder with no Hong Kong ID, using a national ID or
  // passport, a named country and any tax residence. It excludes a US
  // resident for FATCA. The bilingual English/Chinese form leaves the mobile
  // number free. But the money comes from a Hong Kong bank account: eDDA
  // requires one, and a remote applicant needs one plus a deposit of at
  // least HK$10,000. The deposit bank is Hong Kong, so the picker keeps HK.
  // https://enweb.bsgroup.com.hk/download/accopenform/
  // https://www.bsgroup.com.hk/download/individual_account/
  brightsmart: { countries: ["HK"] },
  // Help: for now Racional is only in Chile. Stocks needs a Chilean bank
  // account, and deposits must come from an account under a Chilean RUT. A
  // foreigner living in Chile opens with a current Chilean identity card.
  // Stocks also bars some nationalities (Afghanistan, Cambodia, Cuba,
  // Guinea-Bissau, Iran, Panama, Venezuela, Yemen). The picker is residence,
  // so the country is CL.
  // https://ayuda.racional.cl/es/articles/5563641-cuales-son-los-requisitos-para-invertir-por-racional-stocks
  // https://ayuda.racional.cl/es/articles/5863977-preguntas-frecuentes-sobre-creacion-de-tu-cuenta
  // https://ayuda.racional.cl/es/articles/8365396-puedo-depositar-desde-una-billetera-digital-o-banco-extranjero
  racional: { countries: ["CL"] },
  // Help centre (August 2026): you must live in the country you register
  // from, with a tax number and proof of address there. Citizenship is not
  // a test. Shares and ETFs are open in France, Belgium, Luxembourg,
  // Portugal, Italy, Germany, the Netherlands and Poland. Ireland, Denmark,
  // Sweden, Slovenia, Lithuania and Latvia get crypto only, so they cannot
  // trade this catalogue.
  // https://support.shares.io/en/articles/564-countries-currently-supported
  shares: { countries: ["FR", "BE", "LU", "PT", "IT", "DE", "NL", "PL"] },
  // The regulation asks a person for a valid identity document. The bureau
  // takes a tax-residence certificate from a non-resident, but it names no
  // country. The agreement is signed in front of a bank employee or in
  // BNP Paribas online banking. Foreign markets are not for UK clients.
  // The site is Polish only, so the picker keeps Poland.
  // https://www.bnpparibas.pl/_fileserver/item/1508570
  // https://www.bnpparibas.pl/biuro-maklerskie/rachunek-maklerski
  // https://www.bnpparibas.pl/biuro-maklerskie/rynki-zagraniczne
  bnpparibasbiuro: { countries: ["PL"] },
  // No residency list. Sign-up identifies with a Finnish bank ID, Danish
  // MitID, Norwegian BankID or Swedish BankID (or a passport), each issued
  // to residents of its country. The onboarding page is in Finnish,
  // Swedish, Estonian and English. Money comes by SEPA from the client's
  // own online bank, by Zimpler instant bank payment or by card; no bank
  // country is required. So the picker keeps Finland, Sweden, Denmark,
  // Norway and Estonia.
  // https://www.kvarnx.com/onboarding
  // https://help.kvarnx.com/en/articles/12597468-opening-an-account-and-identity-verification-kyc
  // https://help.kvarnx.com/en/articles/12597549-bank-transfer-sepa
  // https://help.kvarnx.com/en/articles/12597538-instant-deposit
  kvarnx: { countries: ["FI", "SE", "DK", "NO", "EE"] },
  // FAQ: any person aged 18 or over who is a tax resident of one of these
  // 29 countries. That is the EEA without Bulgaria, Greece and Romania, plus
  // Monaco and Switzerland. The Brokerage FAQ adds no other test.
  // https://www.portu.cz/o-nas/faq/jak-zacit
  // https://www.portu.cz/o-nas/faq/brokerage
  portu: {
    countries: [
      "BE", "CZ", "DK", "EE", "FI", "FR", "HR", "IE", "IS", "IT", "CY", "LI",
      "LT", "LV", "LU", "HU", "MT", "MC", "DE", "NL", "NO", "PL", "PT", "AT",
      "SK", "SI", "ES", "SE", "CH",
    ],
  },
  // You open a securities account in online banking or at a branch. Someone
  // without a Swedish ID number shows a foreign passport, and a non-EU/EEA
  // citizen also shows a residence permit. For clients living abroad the
  // bank names only the US and the UK as limited and names no allowed
  // country. The picker keeps Sweden. Norway, the UK and the Netherlands
  // are separate Handelsbanken sites.
  // https://www.handelsbanken.se/sv/privat/spara/bor-utanfor-sverige
  // https://www.handelsbanken.se/sv/privat/bli-kund/forbered-dig
  // https://www.handelsbanken.se/sv/privat/spara/depakonto-for-dina-fonder-aktier-och-andra-vardepapper
  handelsbankense: { countries: ["SE"] },
  // The online account is opened in the AAS PRO app with a chip Vietnamese
  // citizen card. No route for a foreign investor is published.
  // https://aas.com.vn/ekyc/
  aas: { countries: ["VN"] },
  // A domestic individual opens at the counter or online by eKYC with a
  // citizen card. A foreign individual opens only at an ABS counter, with a
  // notarised passport and an indirect-investment capital account.
  // https://www.abs.vn/huong-dan-hoi-dap/
  abs: { countries: ["VN"] },
  // The online account (s-eyes, ACBS Smart) takes an identity or citizen
  // card. ACBS also serves foreign investors, but their file is handed in
  // at an ACBS office.
  // https://acbs.com.vn/khach-hang-chu-dong/mo-tai-khoan
  // https://acbs.com.vn/faq/mo-tai-khoan-chung-khoan
  acbs: { countries: ["VN"] },
  // The eKYC guide photographs and NFC-reads a chip Vietnamese citizen
  // card. The counter takes an identity or citizen card. No route for a
  // foreign investor is published.
  // https://www.aisec.com.vn/guide-open-account
  // https://www.aisec.com.vn/pub/media/Upload/Huong_dan_mo_tai_khoan_eKYC.pdf
  // https://www.aisec.com.vn/faqs/
  ais: { countries: ["VN"] },
  // FAQ: a domestic individual may only use a chip citizen card. A
  // Vietnamese living abroad who kept Vietnamese nationality may use a
  // Vietnamese passport. No route for a foreign investor is published.
  // https://apsi.vn/faq
  apg: { countries: ["VN"] },
  // The eKYC in ART Mobi is chosen as an individual with domestic
  // nationality and takes an identity or citizen card (or military ID).
  // https://artex.vn/CustomerSupport/OpenAccountekyc
  // https://artex.vn/openaccount/register
  artex: { countries: ["VN"] },
  // No account-opening page or form is published: the web board's open-
  // account link goes back to the home page, and the help pages are the
  // online-service terms and a deposit guide. No route is stated, so the
  // country is the home country.
  // https://dvsc.com.vn/page/help
  // https://tradingonline.dvsc.com.vn/dvsctrade/priceboard
  dvsc: { countries: ["VN"] },
  // FAQ: the online account is opened in the EVS Trading app, the counter
  // takes a chip citizen card. A foreign individual brings a notarised
  // passport, a VSD trading code and an indirect-investment account.
  // https://eves.com.vn/wikibook/cau-hoi-thuong-gap/
  eves: { countries: ["VN"] },
  // FAQ: an individual opens at the Hanoi office, or remotely by posting
  // the signed contract with a copy of an identity card or passport. No
  // online opening. The 2025 offers exclude foreign clients.
  // https://gtht.com.vn/cau-hoi-thuong-gap/
  // https://gtht.com.vn/mo-tai-khoan-ngan-uu-dai-2025/
  gtjavn: { countries: ["VN"] },
  // The eKYC sign-up in HVS Trading asks for a citizen card number. No
  // route for a foreign investor is published.
  // https://hvsvn.com/huong-dan/tai-khoan/huong-dan-mo-tai-khoan-chung-khoan-eKYC-tai-HVS
  // https://hvsvn.com/mo-tai-khoan
  hvs: { countries: ["VN"] },
  // Support: the condition to open is a domestic individual aged 18 or
  // more with full civil capacity under Vietnamese law.
  // https://kafi.vn/support/detail?tab=dk_mtk
  // https://open.kafi.vn/x
  kafi: { countries: ["VN"] },
  // The online account is eKYC with a valid citizen card. The remote
  // (postal) guide is for domestic individual clients.
  // https://kirins.vn/mo-tai-khoan-chung-khoan/
  // https://vncsi.com.vn/huong-dan-chi-tiet-mo-tai-khoan-tu-xa-cho-khach-hang-trong-nuoc/
  kirin: { countries: ["VN"] },
  // The online form needs an original citizen card. A foreign individual
  // or a company is told to call or go to an LPS counter.
  // https://taikhoan.lpbs.com.vn/
  lpbs: { countries: ["VN"] },
  // The online account is for an individual of Vietnamese nationality
  // with a citizen card. Anyone else is told to call the hotline.
  // https://mbs.com.vn/mo-tai-khoan/
  mbs: { countries: ["VN"] },
  // The online account is eKYC with an identity or citizen card. The FAQ
  // mentions foreign clients but gives them no opening route.
  // https://www.phs.vn/mo-tai-khoan
  // https://www.phs.vn/hoi-dap
  phs: { countries: ["VN"] },
  // Online opening applies to a domestic individual with an identity or
  // citizen card. A foreign individual opens at the counter with a
  // passport, a trading-code mandate and an indirect-investment account.
  // https://www.psi.vn/vi/san-pham/khach-hang-ca-nhan/dich-vu-chung-khoan/mo-tai-khoan-truc-tuyen
  // https://www.psi.vn/vi/san-pham/khach-hang-ca-nhan/dich-vu-chung-khoan/mo-tai-khoan-truc-tiep
  psi: { countries: ["VN"] },
  // The online form photographs both sides of a citizen card. The counter
  // or postal file is a chip citizen card. No route for a foreign
  // investor is published.
  // https://sbsc.com.vn/mo-tai-khoan/
  // https://sbsc.com.vn/ho-tro/huong-dan-mo-tai-khoan-giao-dich-chung-khoan-tai-cong-ty-cp-chung-khoan-sbs/
  sbs: { countries: ["VN"] },
  // The online guide is for a Vietnamese individual with a citizen card.
  // A foreign individual opens at the counter with a passport and a VSD
  // trading code.
  // https://shinhansec.com.vn/vi/ho-tro-khach-hang/mo-tai-khoan-truc-tuyen.html
  // https://shinhansec.com.vn/vi/ho-tro-khach-hang/mo-tai-khoan-tai-quay.html
  shinhanvn: { countries: ["VN"] },
  // The account is opened by eKYC in the SH Smart app. The published file
  // guide is for domestic clients. No route for a foreign investor is
  // published.
  // https://shsmart.shs.com.vn/vi/ekyc
  // https://shs.com.vn/ho-tro/huong-dan-giao-dich
  shs: { countries: ["VN"] },
  // The online account in TCSC Smart needs a chip citizen card read by
  // NFC. A foreign individual is told to contact customer service.
  // https://tcsc.vn/vi/register
  // https://tcsc.vn/vi/support
  tcsc: { countries: ["VN"] },
  // The online account is eKYC with a citizen card. A foreign individual
  // opens at the counter with a passport and the bank's notice of an
  // indirect-investment account.
  // https://vixs.vn/ho-tro/mo-tai-khoan-truc-tuyen
  // https://vixs.vn/ho-tro/mo-tai-khoan-tai-quay
  vix: { countries: ["VN"] },
  // The open-account page is a call-back form: name, email and a phone
  // number that must be a Vietnamese one starting with 0. No other route
  // is published.
  // https://vts.com.vn/mo-tai-khoan.html
  vts: { countries: ["VN"] },
  // eKYC (app or web) takes an original citizen card. A foreign individual
  // files a passport, a VSD trading code and an indirect-investment
  // account at a linked bank.
  // https://support.yuanta.com.vn/support/cau-hoi-thuong-gap/huong-dan-mo-tai-khoan-tai-yuanta-viet-nam/
  // https://support.yuanta.com.vn/support/cau-hoi-thuong-gap/de-mo-tai-khoan-giao-dich-chung-khoan-tai-ysvn-can-chuan-bi-gi/
  yuantavn: { countries: ["VN"] },
  // A resident opens with PAN and an Aadhaar linked to a mobile number. The
  // NRI page takes an NRI, an OCI or a PIO with an NRE or NRO account, and
  // its FAQ answers which countries an NRI can open from: "Currently UAE
  // and India". The picker is residence, so the countries are IN and AE.
  // https://upstox.com/open-demat-account/
  // https://upstox.com/nri-demat-account/
  upstox: { countries: ["IN", "AE"] },
  // Help centre: Samco opens individual, joint, NRI (NRE or NRO) and
  // non-individual accounts. Online opening needs an Aadhaar linked to the
  // mobile number for the OTP. No country of residence is named for an NRI.
  // The picker is a country, so the country is IN.
  // https://www.samco.in/help-support/article/what-types-of-accounts-are-available-at-samco/
  // https://www.samco.in/help-support/article/can-i-open-an-account-in-samco-if-my-aadhaar-is-not-linked-with-my-mobile-number/
  samco: { countries: ["IN"] },
  // Online opening is PAN, an Indian bank account and an Aadhaar e-sign.
  // Support says an NRI can open a demat account, with a passport or OCI
  // card, proof of residence status, an overseas address and an NRE or NRO
  // account. No countries are named. The picker is a country, so the
  // country is IN.
  // https://flattrade.in/support/knowledge-base/how-can-i-open-an-account/
  // https://flattrade.in/support/knowledge-base/can-nri-open-a-demat-account/
  // https://flattrade.in/support/knowledge-base/what-are-the-documents-required-to-open-an-nri-demat-account/
  flattrade: { countries: ["IN"] },
  // The PSX page takes a CNIC, SNIC, NICOP, ARC, POC or passport. A
  // non-resident Pakistani first opens a Roshan Digital Account with a
  // partner bank. The countries where that person lives are not listed.
  // The picker is a country, so the country is PK.
  // https://www.kasb.com/invest-in-stock-market/
  // https://www.kasb.com/roshan-digital-account/
  ktrade: { countries: ["PK"] },
  // Nigerian citizens only, with a BVN and a Nigerian bank account; a
  // foreign bank account cannot fund it. The invest-from-abroad pages name
  // the UK, USA, Canada, Ireland, Germany, Netherlands, Spain, Italy,
  // Portugal, Switzerland, Finland, UAE, Australia and Ghana, plus "anywhere
  // in Europe" without a list. Only the named countries are kept, with NG.
  // https://sharessaver.com/invest-from-abroad
  // https://sharessaver.com/invest-in-nigeria-from-europe
  sharessaver: { countries: ["NG", "GB", "US", "CA", "IE", "DE", "NL", "ES", "IT", "PT", "CH", "FI", "AE", "AU", "GH"] },
  // Online opening verifies a South African individual automatically. A
  // foreign national qualifies if living and working in South Africa with
  // a work permit and SARS registration, or as a citizen of a Common
  // Monetary Area country (Namibia, Lesotho, Swaziland) with a foreign
  // address and bank account, e.g. Namibian. No other country is named.
  // https://support.satrixnow.co.za/support/solutions/articles/13000013533-satrixnow-fica-documents-foreign-nationals
  // https://support.satrixnow.co.za/support/solutions/articles/13000105760-satrixnow-fica-documents
  satrixnow: { countries: ["ZA", "NA", "LS", "SZ"] },
  // Product page: to register, the client fills in the forms and visits
  // the company in Amman to sign them with customer service. No residency
  // rule and no other country is named. The picker is a country, so the
  // country is JO.
  // https://www.safwabank.com/en/product/misc/
  misk: { countries: ["JO"] },
  // FAQ: Ndovu operates in Kenya and cannot accept U.S. citizens; other
  // nationalities are welcome with acceptable KYC. The KYC article takes a
  // Kenyan ID or any valid passport, and a KRA PIN or, for a resident of
  // another country, that country's tax certificate. No country of
  // residence is refused.
  // https://ndovu.co/ke
  // https://ndovu.zohodesk.com/portal/en/kb/articles/what-documents-do-i-need-for-kyc-verification
  ndovu: { all: true, except: ["US"] },
  // FAQ: the identity on file is the Kuwait civil ID, the minimum deposit
  // is 35 KWD and working days follow the Kuwaiti calendar. The app can be
  // used abroad once opened, but no non-resident opening is described. The
  // picker is a country, so the country is KW.
  // https://www.joinzad.com/en/faq/
  zad: { countries: ["KW"] },
  // A Trading Account opens for someone 18 or over and a UK tax resident.
  // Terms 14.3: the client is neither a resident of Canada nor a US person.
  // No other country of residence, and no Crown Dependency, is named.
  // https://www.ii.co.uk/application-share-dealing/what-you-need-to-know
  // https://media-prod.ii.co.uk/s3fs-public/pdfs/terms_of_service.pdf
  interactiveinvestor: { countries: ["GB"] },
  // FAQ: investing via willbe is limited to residents of Switzerland,
  // Liechtenstein, Austria and Germany. The tax-ID answers cover the same
  // four. "EU residence" in the CHF answer is a German or Austrian one.
  // https://mobilep.willbe-invest.com/en/about-willbe/faq
  willbe: { countries: ["CH", "LI", "AT", "DE"] },
  // Group terms 4-5 (2 Apr 2026): 18 or over, resident in the UK and tax
  // resident solely in the UK. US persons are refused. Leaving the UK, or
  // a second tax residence, closes the account.
  // https://cdn.prod.website-files.com/5d65390243727621f8413d93/69ce6de84085a80c5b50b23a_Group%20Terms%20of%20Business%20%5BApril-02-2026%5D.pdf
  chip: { countries: ["GB"] },
  // Terms: 18 or over and resident in the UK for tax purposes, living in
  // and using the service from the UK, and not a US tax resident. The
  // Griffin wallet also needs UK residence.
  // https://www.prosper.co.uk/documents/terms-and-conditions
  prosper: { countries: ["GB"] },
  // Support: a Danish CPR number, a Danish registered address and
  // permanent residence in Denmark, and 18 or over.
  // https://endavu.com/support
  endavu: { countries: ["DK"] },
  // Online opening takes only a DNI or a TIE, so residence in Spain. A
  // non-resident, Spanish or foreign, opens at a Renta 4 office with a
  // passport and a non-residence declaration. No countries are named.
  // The picker is a country, so the country is ES.
  // https://www.r4.com/hazte-cliente
  renta4es: { countries: ["ES"] },
  // Miraltabank FAQ: opening needs your DNI, the Spanish identity card,
  // and a mobile phone. The site and onboarding are Spanish only and name
  // no other residence, so the country is ES.
  // https://www.miraltabank.com/faqs/
  // https://www.bisontrade.com/portal/onboarding/broker
  bisontrade: { countries: ["ES"] },
  // About page: accounts open only for individuals with an official
  // address in the EU or Switzerland. The opening form's address country
  // lists the 27 EU states (and French overseas regions) plus Switzerland.
  // Narrower than WH SelfInvest's own entry (no UK, IS, LI, NO).
  // https://www.freestoxx.com/en-lu/commission-free-trading/the-best-online-brokers/about-freefutures-freestoxx
  // https://www.freestoxx.com/en-lu/commission-free-trading/free-stock-trading-broker/become-a-client-secure-online
  freestoxx: { countries: ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK", "CH"] },
  // Rulebook 3.0: art. 33 lets foreign persons use Nxchange where their
  // own law permits; art. 9 takes a foreign contra account. No country
  // is excluded by name, and the sign-up form asks for no country.
  // https://cdn.prod.website-files.com/6603ca52d62c204544f53351/66c8625c2f9d626e5d7e81f7_75df5613c3458622b6fe61b81b5076d5_Nxchange_Rulebook_ENG_v3.0_def.pdf
  // https://account.nxchange.com/open-account
  nxchange: { all: true },
  // FAQ: a valid ID and a current account in your name at an EU bank. A
  // US person cannot open. The opening form is in Dutch only; its fixed
  // account must be a payment account at a bank in the EU, and a
  // verification deposit closes it. The phone field is free text (+31
  // example) and the address lists every country, so the EU bank rule
  // decides: the countries are the 27 EU states.
  // https://www.npex.nl/en/veelgestelde-vragen/
  // https://www.npex.nl/openen-particuliere-rekening/
  npex: { countries: ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"] },
  // FAQ: a US citizen or permanent resident (green card), 18 or over,
  // with a current US residential address and a US phone number. M1 has
  // no plans to expand outside the US.
  // https://help.m1.com/en/articles/9331909-frequently-asked-questions-about-m1
  m1: { countries: ["US"] },
  // A US resident opens with an SSN. A non-US resident opens the
  // international account with a passport and a proof of address, and
  // funds by ACH or an international wire. Sign-up takes only a mobile
  // number, and its picker offers 40 country codes. The countries are
  // those codes, less South Africa, which the restricted list names.
  // https://client.lighthorse.io/login/signup
  // https://www.lighthorse.io/instructions/getting-started/restricted-countries
  // https://www.lighthorse.io/instructions/getting-started/opening-a-foreign-account
  // https://www.lighthorse.io/instructions/funding
  lighthorse: { countries: ["US", "CN", "IN", "GB", "SG", "CA", "BR", "ID", "IL", "MX", "MY", "SA", "AE", "DE", "FR", "IT", "NL", "ES", "DK", "TW", "HK", "MO", "KR", "TR", "AU", "JP", "PL", "AR", "TH", "CH", "PT", "BE", "GR", "CR", "FI", "TT", "EE", "NZ", "AT"] },
  // The US stocks page: CCM brokerage accounts are for US residents
  // only. The help centre adds a UK offer, stocks only (no funds), run
  // by CB Payments Ltd with GBP funding and rolling access. That is
  // another company and another price, so the country is US.
  // https://www.coinbase.com/stocks
  // https://help.coinbase.com/en/getting-started/stocks-onboarding
  // https://www.coinbase.com/en-gb/stocks
  coinbaseus: { countries: ["US"] },
  // The three opening guides are for users in Hong Kong: online with a
  // Hong Kong bank account in the same name, by third-party witness, or
  // by cheque. The client agreement allows a non-resident client, who
  // may have to name a process agent, but no country is named. The
  // picker is residence, so the country is HK.
  // https://longbridge.com/hk/en/support/topics/accountopeningguide/d5vhrx.md
  // https://longbridge.com/hk/en/support/topics/accountopeningguide/39id7vx.md
  // https://longbridge.com/hk/en/support/topics/accountopeningguide/pq7pcq.md
  longbridgehk: { countries: ["HK"] },
  // The opening guide is for users in Singapore: Myinfo with Singpass,
  // or by hand with an ID and a recent proof of residential address.
  // Singapore, Malaysia and Indonesia ID cards are taken, other
  // countries' passports only. No other residence is named. The picker
  // is residence, so the country is SG.
  // https://longbridge.com/sg/en/support/topics/account_opening/openanaccount.md
  longbridgesg: { countries: ["SG"] },
  // Long Bridge Securities Limited is an FSP-registered NZ company. The
  // help centre has no residency rule. Its deposit guides are in Chinese,
  // for Hong Kong banks or a USD/HKD wire to Singapore, and ask the
  // client to follow the law where they live, "including but not
  // limited to New Zealand, China". Sign-up takes any phone code. The
  // countries are NZ and CN.
  // https://longbridge.com/nz/en
  // https://longbridge.com/nz/en/support/topics/fundsoverview/qtrjzy.md
  // https://pub.lbkrs.com/files/202112/fXXjHiHqzNdKhdKg/LONGBRIDGE_Client_Agreement_.pdf
  longbridgenz: { countries: ["NZ", "CN"] },
  // Investment account: an integrated account holder, 18 or over, who
  // lives in Hong Kong, mainland China or Taiwan. A mainland investor
  // signs a declaration. The bank account itself opens from more
  // places, but the investment account does not. US stocks need a
  // W-8BEN and A-shares a non-US customer.
  // https://www.hsbc.com.hk/investments/account-opening/
  // https://www.hsbc.com.hk/investments/products/stocks/
  // https://www.hsbc.com.hk/ways-to-bank/mobile-apps/banking/account-opening/
  hsbchk: { countries: ["HK", "CN", "TW"] },
  // The web/app registration takes a chip citizen card (CCCD/CC), and Agriseco
  // then calls to sign the contract. A foreign individual files a passport copy
  // and a trading-code registration form, as a paper file.
  // https://agriseco.com.vn/Supports/OpenAccount/vi-VN
  agriseco: { countries: ["VN"] },
  // The eKYC account in the iTrade app takes a chip citizen card. A foreign
  // individual or an institution is told to contact the customer service
  // centre, and opens at the counter with notarised passport copies and a
  // trading-code form.
  // https://www.vbse.vn/dang-ky-tai-khoan-moi/
  // https://www.vbse.vn/khach-hang-ca-nhan/giao-dich-chung-khoan-2/
  vbse: { countries: ["VN"] },
  // The eKYC account in the BVSC app is opened with a CMND/CCCD, then a video
  // call. No passport route is described. BVSC's own site returned a block
  // page, so this rests on the launch report and the store listing.
  // https://www.bvsc.com.vn/en/category/services/individual-clients/support/service-manual/place-orders-by-phoneonline/
  // https://thitruongtaichinhtiente.vn/chung-khoan-bao-viet-ra-mat-dich-vu-mo-tai-khoan-truc-tuyen-ekyc-36701.html
  bvsc: { countries: ["VN"] },
  // The eKYC guide asks for a CMND or CCCD (the newer guide reads the chip by
  // NFC). A foreign individual opens at the counter with a passport copy and
  // a VSD trading code, filed through BIDV.
  // https://tpbs.com.vn/vi/san-pham-dich-vu/dich-vu-chung-khoan/mo-tai-khoan/huong-dan-mo-tai-khoan-truc-tuyen-ekyc?postId=2203
  // https://tpbs.com.vn/vi/san-pham-dich-vu/dich-vu-chung-khoan/mo-tai-khoan/huong-dan-mo-tkck-tai-quay?postId=2204
  tpbs: { countries: ["VN"] },
  // Nothing found: the support page sits behind a cookie check, and the app
  // listing only says "e-KYC". Home country by default.
  // https://support.tvsi.com.vn/QuestionPage?id=333
  tvsi: { countries: ["VN"] },
  // The online account takes a chip citizen card read by NFC. Foreign
  // investors with a passport and institutions open at the counter.
  // https://dsc.com.vn/kien-thuc/cach-mo-tai-khoan-chung-khoan
  dsc: { countries: ["VN"] },
  // Sign-up is for Vietnamese citizens of 18 and over with a valid CC/CCCD.
  // VFS does not open an account for a client who is abroad. Bank accounts
  // must be in the client's own name.
  // https://www.vfs.com.vn/dang-ky-mo-tai-khoan
  vfs: { countries: ["VN"] },
  // The SeaStock app's eKYC verifies a CCCD/CMND. A foreign individual opens
  // at the Hanoi or HCMC counter with two notarised passport copies.
  // https://www.aseansc.com.vn/mo-tai-khoan/
  // https://www.aseansc.com.vn/huong-dan-va-ho-tro/huong-dan-mo-tai-khoan/
  aseansc: { countries: ["VN"] },
  // Nothing readable on the online form: the eKYC guide is images only. The
  // paper contract takes a CMND/CCCD or passport, and cash moves through the
  // client's own bank account or BETA's account at BIDV. Home country by
  // default.
  // https://www.bsi.com.vn/public/upload/files/Huong%20dan%20mo%20tai%20khoan%20eKYC.pdf
  // https://www.bsi.com.vn/public/upload/files/Ph%C3%B2ng%20Giao%20d%E1%BB%8Bch/H%E1%BB%A2P%20%C4%90%E1%BB%92NG%20M%E1%BB%9E%20T%C3%80I%20KHO%E1%BA%A2N%20TT%20-%20BETA.pdf
  bsi: { countries: ["VN"] },
  // The online form page is down for maintenance. The FAQ handles a foreign
  // investor separately: a custodian bank opens an indirect-investment
  // account, which takes 5-7 working days. Deposits go to FNS accounts at
  // Vietnamese banks. The funding bank decides it, so the country is VN.
  // https://funan.com.vn/vi/tkonline-notification
  // https://funan.com.vn/vi/page/cau-hoi-thuong-gap.16659
  // https://funan.com.vn/vi/page/MoTK1.html
  funan: { countries: ["VN"] },
  // Online opening is for a domestic individual with a chip citizen card.
  // The counter page has a separate file for a foreign individual.
  // https://apsc.vn/khach-hang-ca-nhan/mo-tai-khoan-truc-tuyen
  // https://apsc.vn/khach-hang-ca-nhan/mo-tai-khoan-truc-tiep
  apsc: { countries: ["VN"] },
  // The account is opened in the Finhay app. The FAQ rejects any document
  // that is not an original chip citizen card. No foreign route is shown.
  // https://fhsc.com.vn/faq-mo-tai-khoan-finhay
  // https://invest.fhsc.com.vn/register
  finhay: { countries: ["VN"] },
  // The app scans the chip of a Vietnamese citizen card by NFC and links a
  // bank account in the client's own name. The guide and the site are in
  // Vietnamese only. The ID and the language decide it.
  // https://www.smartmind.vn/huong-dan-mo-tai-khoan/
  smartmind: { countries: ["VN"] },
  // The BMSmart app opens an account for a domestic individual aged 18 or
  // over who has a chip citizen card. The OTP goes to that mobile number.
  // https://www.bmsc.com.vn/tin-tuc/Tin-BMSC/huong-dan-mo-tai-khoan-truc-tuyen-tren-ung-dung-bmsmart-255322.html
  bmsc: { countries: ["VN"] },
  // Online eKYC (NHSV Pro, or ekyc.nhsv.vn) is "only for domestic individual
  // customers", using the Vietnamese ID card. Everyone else opens at an office.
  // https://nhsv.vn/page/huong-dan-mo-tai-khoan.html
  // https://ekyc.nhsv.vn/open-account
  nhsv: { countries: ["VN"] },
  // Online opening means photographing the citizen card and a face match.
  // A foreign individual has a separate guide. The funding account is at
  // Eximbank or another bank in Vietnam, and the site is in Vietnamese only.
  // https://www.maybank-kimeng.com.vn/securities/customer-support/faqs/16-0/vi
  // https://oap.maybanktrade.com.vn/
  maybankvn: { countries: ["VN"] },
  // The Finavi sign-up page (in the app or on the web) did not load, so it
  // could not be read. The site names no foreign route. This falls back to
  // the home country.
  // https://jbsv.com.vn/
  // https://finavi.com.vn/open-account
  jbsv: { countries: ["VN"] },
  // The online eKYC page and the deposit guide are in Vietnamese only.
  // Money goes to accounts Haseco names at its partner banks. No foreign
  // route is given. The language decides it, so the country is VN.
  // https://haseco.vn/mo-tai-khoan-truc-tuyen/
  // https://haseco.vn/huong-dan-nop-rut-chuyen-khoan-tien/
  haseco: { countries: ["VN"] },
  // The site is a TEA Computers e-trade portal. The "be a client" page is a
  // lead form with free-text name, job, phone, mobile and e-mail fields, and
  // its two contract PDFs are not served. No page names a document,
  // residency, foreigners, Egyptians abroad or a funding bank, and nothing
  // on the form limits the country: worldwide (owner's decision).
  // https://alrowadonline.com/BeAClient.aspx
  rowad: WORLD,
  // The online onboarding starts with a BVN and a date of birth, and a BVN
  // comes from a Nigerian bank (funding-bank test). The paper route takes a
  // non-resident with notarized ID and address proof, and foreign inflows
  // get a Certificate of Capital Importation, but no country is named. The
  // picker is a country, so the country is NG.
  // https://www.stanbicibtcstockbrokers.com/nigeriastockbroking/stockbroking/getting-started/how-to-register/individuals
  // https://brokerage.stanbicibtc.com/StockbrokingOnboarding/#/
  stanbicibtc: { countries: ["NG"] },
  // The online form picks a tax residence from about 197 countries and
  // takes a CNI, consular card or passport. Phone is free text, and
  // funding is cash at BDU CI or BSIC CI, a cheque or a transfer. The form
  // is French only (language test), so the countries are CI, the
  // French-speaking UEMOA states and the French list.
  // https://macafricansgi.com/devenir-client/
  // https://macafricansgi.com/nos-formules/la-gestion-sous-mandat/faq/
  macafrican: { countries: [...new Set(["CI", "BJ", "BF", "ML", "NE", "TG", ...FRENCH])] },
  // The live-account form has its own residence picker. 119 countries can
  // be chosen. The other 127 are greyed out (notAllow), among them the US,
  // Canada, the UK, Australia, Japan, Turkey, Ukraine, the Emirates, Qatar
  // and Russia. Spain stays selectable; only marketing is not aimed at it.
  // https://www.deltastock.com/english/accounts/open-account.asp
  // https://www.deltastock.com/english/includes/accounts/open-live-countries-list.asp
  deltastock: {
    groups: ["EEA"],
    countries: [
      "AL", "AM", "AN", "AR", "AZ", "BA", "BD", "BH", "BJ", "BL", "BO", "BR", "BT",
      "BV", "CC", "CG", "CH", "CL", "CN", "CO", "CV", "DJ", "DM", "EC", "EG", "FK",
      "FM", "GE", "GM", "GN", "GP", "GQ", "GS", "GT", "HM", "HN", "ID", "IL", "IN",
      "IO", "JO", "KG", "KI", "KM", "KR", "KW", "KZ", "LS", "MA", "MD", "ME", "MF",
      "MK", "MN", "MQ", "MR", "MW", "MX", "NE", "NF", "NZ", "PF", "PM", "PY", "RS",
      "RW", "SA", "SB", "SG", "SH", "SL", "SR", "ST", "SV", "SX", "TF", "TG", "TJ",
      "TK", "TL", "TM", "TO", "TV", "UZ", "VA", "WF", "XK", "YT", "ZM",
    ],
  },
  // Remote opening needs Turkish citizenship and the new chip identity
  // card. The customer form asks for a T.C. identity number. It asks a
  // foreign national why they are in Turkey and how long they have lived
  // there, so a foreigner is someone living in Turkey. The site is Turkish only.
  // https://www.gcmyatirim.com.tr/hesap-islemleri/uzaktan-kimlik-dogrulama
  // https://www.gcmyatirim.com.tr/wp-content/uploads/2026/07/03/02-07-2026-offline_1783060805.pdf
  gcm: { countries: ["TR"] },
  // IG Australia's share trading book. The help centre (26 Feb 2026) says
  // IG Share Trading is only offered in Australia and the UK. The UK is
  // the iguk book. The ASIC page sends a non-resident to other IG entities.
  // https://www.ig.com/au/help-and-support/investments/account-opening/what-countries-do-you-offer-share-dealing-in
  // https://www.ig.com/au/asic
  igau: { countries: ["AU"] },
  // An account is opened in person at the Buenos Aires office. The form
  // takes a foreigner's passport and a CDI, but money goes out only to a
  // bank account given by CBU, which is an Argentine account. The funding
  // bank decides it, so the country is AR.
  // https://www.navarroviola.com.ar/aperturadecuentacliente/
  // https://navarromediamanager.prod.ingecloud.com/MediaFiles/Files/2023/6_22/0/0/29/7621.pdf
  navarroviola: { countries: ["AR"] },
  // The site is Spanish (es-AR) and links to an online onboarding at
  // clientes.ldtbrokers.com, which does not resolve. No other page says who
  // can open. Nothing found, so this falls back to the home country.
  // https://www.ldtbrokers.com/
  ldt: { countries: ["AR"] },
  // The 3-in-1 page: 18 or older and a resident of India, with Aadhaar and
  // PAN. The sign-up field is fixed at +91. The NRI demat text on the demat
  // page is general and has no NRI signup. The picker is a country, so IN.
  // https://www.torusdigital.com/open-3-in-1-account
  // https://www.torusdigital.com/open-demat-account
  torus: { countries: ["IN"] },
  // The home page has a resident account and a non-resident account. The
  // non-resident one is opened through the depository's own portal (CDS),
  // not with LOLC, so only the broker's country is kept (owner's decision).
  // https://www.lolcsecurities.lk/
  lolc: { countries: ["LK"] },
  // The account-opening page has an individual non-resident account: a
  // passport, and a proof of address and a bank statement authenticated
  // by the local authority. The mobile field has the full dial-code picker
  // with Qatar first. The form is in English and Arabic. No country is named.
  // https://www.cbfs.com.qa/en-us/AOF
  cbfs: WORLD,
  // The individual form asks for a Qatari ID from a Qatari or a resident,
  // or a passport from a non-Qatari who does not live in Qatar. A
  // non-resident's documents are attested by the Qatari embassy. The bank
  // country is a free field. No country is named.
  // https://qatar-securities.com/en/application-forms/
  // https://qsc.expert.com.qa/wp-content/uploads/2026/02/trading-acount-opening-application-form-individual_compressed.pdf
  qsc: WORLD,
  // The online form takes any nationality but requires a 12-digit Kuwaiti
  // civil ID. The phone is fixed at 965 with 8 digits, and the bank is
  // picked from Kuwaiti banks only. E-trading is signed in person with the
  // civil ID. The ID, the phone and the bank all give Kuwait.
  // https://www.sharqetrade.com/%D8%A7%D9%84%D8%AE%D8%AF%D9%85%D8%A7%D8%AA/%D9%81%D8%AA%D8%AD-%D8%AD%D8%B3%D8%A7%D8%A8-%D8%AC%D8%AF%D9%8A%D8%AF
  // https://www.sharqetrade.com/%D8%A3%D8%B3%D8%A6%D9%84%D8%A9-%D8%B4%D8%A7%D8%A6%D8%B9%D8%A9
  sharq: { countries: ["KW"] },

  // Added 2026-10-19: brokers that had no entry. Where the broker states no
  // rule, the evidence is the deposit bank, the form's language, phone
  // prefix or identity document, as each comment says.
  // Help centre: 5paisa offers no NRO or NRI demat account and sends an NRI to
  // another provider. A resident who moves abroad must tell 5paisa of the
  // change. Opening asks for PAN, Aadhaar and an Indian bank account. The
  // picker is a country, so the country is IN.
  // https://forum.5paisa.com/portal/en/kb/articles/can-an-nri-account-be-opened-at-5paisa
  // https://forum.5paisa.com/portal/en/kb/articles/can-a-resident-5paisa-account-be-used-even-after-going-abroad
  // https://www.5paisa.com/open-demat-account-1
  "5paisa": { countries: ["IN"] },
  // The NRI guide, 25 Feb 2026: an NRI account opens offline only, with a PIS
  // account at Axis, HDFC, IDFC First, IndusInd or Yes Bank. Documents of a
  // client abroad are attested by an embassy or a notary. No countries are
  // named. The picker is a country, so the country is IN.
  // https://www.angelone.in/knowledge-center/demat-account/nri-need-to-open-nro-demat-account-for-stock-investing
  // https://www.angelone.in/open-trading-account-online
  angelone: { countries: ["IN"] },
  // Support: any Indian citizen over 18 can open an account. An NRI can open
  // only a custodian NRO account, which trades futures and options only, not
  // stocks. A resident account cannot be converted. The picker is a country,
  // so the country is IN.
  // https://dhan.co/support/account-opening/kyc-process/who-can-open-an-account-on-dhan-in-india/
  // https://dhan.co/support/account-opening/offline-kyc/are-nris-allowed-to-open-an-account-on-dhan/
  dhan: { countries: ["IN"] },
  // Support: an NRI opens a Non-PIS account linked to an NRO account. Opening
  // starts online and ends offline with physical documents and in-person
  // verification. No countries are named. The picker is a country, so the
  // country is IN.
  // https://firstock.in/support/non-resident-indian-nri/
  // https://firstock.in/support/pis-account/
  firstock: { countries: ["IN"] },
  // Support: an NRI can open an NRO Non-PIS account at any Indian bank, or an
  // NRE PIS account at HDFC, Axis, Federal or IDFC First. Documents are
  // attested in the country of residence. No countries are named. The picker
  // is a country, so the country is IN.
  // https://support.fyers.in/portal/en/kb/articles/can-nris-open-an-account-with-fyers
  // https://fyers.in/nri-account
  fyers: { countries: ["IN"] },
  // The open-account page asks for Indian nationality, 18 or older and a bank
  // account. The mobile field is fixed at +91. Its FAQ calls NRIs eligible in
  // general, but no NRI signup or country is shown. The picker is a country,
  // so the country is IN.
  // https://www.pocketful.in/open-demat-account
  // https://www.pocketful.in/pricing
  pocketful: { countries: ["IN"] },
  // FAQ: residents and non-residents open, including NRIs and persons of
  // Indian origin. ProStocks names NRIs who are tax residents of the USA and
  // Canada. The NRI page says they trade from anywhere in the world. The
  // online form takes Non Resident status and offers 250 dial codes. But
  // opening needs a PAN, an Indian tax number, so the client is an Indian
  // or Indian-origin investor, as at the other Indian brokers with NRIs.
  // The picker is a country, so the country is IN.
  // https://www.prostocks.com/faq/12-account-opening/17-who-can-open-account-with-prostocks.html
  // https://www.prostocks.com/nri-trading.html
  // https://digitalkyc.prostocks.com/
  prostocks: { countries: ["IN"] },
  // Support: only resident Indians can open an account with Rupeezy. An NRI or
  // NRO account cannot. The paperless opening uses PAN, Aadhaar and an Indian
  // bank statement with IFSC. The picker is a country, so the country is IN.
  // https://support.rupeezy.in/support/solutions/articles/2100044895-can-an-nri-nro-resident-open-an-account-
  // https://support.rupeezy.in/support/solutions/articles/2100044893-what-all-documents-are-required-for-paperless-account-opening-with-rupeezy-
  rupeezy: { countries: ["IN"] },
  // The online signup asks for a PAN and an Aadhaar, and signs with an Aadhaar
  // OTP. The mobile field is fixed at +91 and takes a ten-digit number
  // starting 6 to 9. The signup says online opening is not available for an
  // NRI. The NRI page names no country of residence. The picker is a country,
  // so the country is IN.
  // https://prism.shoonya.com/register
  // https://shoonya.com/blog/nri-demat-account/
  shoonya: { countries: ["IN"] },
  // The individual signup takes a ten-digit mobile starting 6 to 9, then PAN
  // and Aadhaar through Digilocker. An NRI is sent to a separate KYC form, and
  // no country of residence is named. The picker is a country, so the country
  // is IN.
  // https://zebuetrade.com/open-demat-account
  // https://oa.zebuetrade.com/
  // https://kyc.zebuetrade.com/zebuetrade/nri
  zebu: { countries: ["IN"] },
  // The signup is +91, with a PAN and an Aadhaar linked to the phone for the
  // OTP. The ₹0 delivery tariff is the resident book. An NRI has its own
  // tariff and is sent to a separate page. An NRI or a foreign national living
  // in an FATF blacklisted country cannot open, and a greylisted one needs
  // compliance approval. No other country of residence is named. The picker is
  // a country, so the country is IN.
  // https://zerodha.com/open-account/
  // https://zerodha.com/charges/
  // https://support.zerodha.com/category/account-opening/nri-account-opening/articles/how-to-open-an-account-as-a-nri
  // https://support.zerodha.com/category/account-opening/nri-account-opening/articles/what-is-the-procedure-for-a-foreign-national-to-open-an-account-at-zerodha
  zerodha: { countries: ["IN"] },
  // The brokerage account is opened from a PKO Bank Polski personal account. A
  // branch account must also be linked to one. Opening that personal account
  // online asks for a PESEL, a Polish identity card number and a mobile number
  // from a Polish operator. The brokerage page names no other country of
  // residence. The picker is a country, so the country is PL.
  // https://www.bm.pkobp.pl/oferta/rachunek-inwestycyjny
  // https://www.pkobp.pl/klient-indywidualny/oszczedzanie-inwestycje/rachunek-inwestycyjny
  // https://www.pkobp.pl/klient-indywidualny/konta/jak-otworzyc-konto-osobiste
  pkobp: { countries: ["PL"] },
  // The online form has a country of tax residence picker with every country,
  // France first. It asks for a foreign tax number when that country is not
  // France. A US person is told they cannot become a client. Funding is a
  // transfer from an IBAN in the client's name. No country list is published.
  // The site and the form are French only (language test), so the countries
  // are the French list.
  // https://www.boursedirect.fr/fr/bourse/ouvrir-un-compte
  // https://www.boursedirect.fr/fr/support/faq/compte-titres
  boursedirect: { countries: FRENCH },
  // The signup page says the services are available to UK residents only. A
  // non-UK resident is told not to apply.
  // https://www.idealing.com/en/signup/signup
  idealing: { countries: ["GB"] },
  // The help centre requires residence in a country where Wealthyhood
  // operates. It names the EEA and the UK. The UK is Wealthyhood Ltd, in
  // sterling, so it stays out. Terms 4.9 of the Greek AEPEY say selected EEA
  // countries and name none. Funding is SEPA.
  // https://wealthyhood.com/eu/help-centre/opening-your-wealthyhood-account-faq/
  // https://wealthyhood.com/uk/help-centre/opening-your-wealthyhood-account-faq/
  // https://wealthyhood.com/eu/terms/
  // https://wealthyhood.com/eu/help-centre/deposits-withdrawals/
  wealthyhoodgr: { groups: ["EEA"] },
  // Opening needs MitID; without it a person cannot become a client. The
  // abroad FAQ names two exceptions: someone living in the Faroe Islands or in
  // Greenland applies on a form with a passport and proof of address. A US
  // resident cannot open. No other residence is named.
  // https://www.nordnet.dk/faq/oprettelse-af-konto/for-privatperson/jeg-har-ikke-mitid-kan-jeg-stadig-blive-kunde
  // https://www.nordnet.dk/faq/oprettelse-af-konto/fra-udlandet/kan-jeg-som-er-bosat-og-betaler-skat-pa-froerne-oprette-et-depot
  // https://www.nordnet.dk/faq/oprettelse-af-konto/fra-udlandet/kan-jeg-som-er-bosat-og-betaler-skat-pa-gronland-oprette-et-depot
  // https://www.nordnet.dk/faq/oprettelse-af-konto/fra-udlandet/kan-jeg-som-er-bosat-og-betaler-skat-i-usa-oprette-depot
  nordnetdk: { countries: ["DK", "FO", "GL"] },
  // As a rule no account for someone living outside the EEA, and none for a US
  // resident or US taxpayer. A foreigner opens on a manual form with a
  // passport. Deposits from a foreign account are refused, and withdrawals go
  // to a Finnish linked account only. The picker keeps Finland.
  // https://www.nordnet.fi/faq/asiakkuuden-avaus/salkun-avaus/voiko-ulkomaalainen-tai-ulkomailla-asuva-avata-salkun
  // https://www.nordnet.fi/faq/rahan-ja-arvopapereiden-siirto/rahan-siirtaminen/miten-teen-talletuksen-salkkuuni
  // https://www.nordnet.fi/faq/rahan-ja-arvopapereiden-siirto/rahan-siirtaminen/miten-teen-noston-salkusta-tai-tililta-vastatililleni
  nordnetfi: { countries: ["FI"] },
  // A client signs up directly with BankID, the Norwegian bank ID. A US
  // resident or US taxpayer cannot open. The site names no other country of
  // residence; a client who moves abroad must document the new tax residence.
  // The picker keeps Norway.
  // https://www.nordnet.no/faq/kontospesifikt/opprette-konto/hvordan-blir-jeg-kunde-av-nordnet
  // https://www.nordnet.no/faq/kontospesifikt/opprette-konto/kan-jeg-apne-konto-i-nordnet-hvis-jeg-bor-eller-skatt-til-usa
  // https://www.nordnet.no/faq/kontospesifikt/endre-adresse/hvordan-endrer-jeg-min-adresse
  nordnetno: { countries: ["NO"] },
  // IBKR books an account with the entity of the holder's country of legal
  // residence. Interactive Brokers Canada carries Canadian residents and
  // checks their name and address as Canadian residents. A resident elsewhere
  // goes to another IBKR entity.
  // https://ibkb.interactivebrokers.com/es/node/1000
  // https://www.interactivebrokers.ca/en/accounts/individuals/canadianIndividualDocuments.php
  // https://www.interactivebrokers.ca/en/support/tax-ca-initial.php
  ibkrca: { countries: ["CA"] },
  // This row is the IBUK account of a Swiss resident. IBKR's Europe page: IBIE
  // serves EU and EEA residents, IBUK serves residents of the UK and
  // Switzerland. The UK is not this folder, and Liechtenstein is EEA, so IBIE.
  // The picker keeps Switzerland.
  // https://www.interactivebrokers.eu/en/home.php
  // https://ibkb.interactivebrokers.com/es/node/1000
  ibkrch: { countries: ["CH"] },
  // This row is a US resident's account at Interactive Brokers LLC. The
  // catalogue drops non-US ETFs ("U.S. residents are not allowed to trade
  // non-U.S. ETFs", IBKR FAQ 467097743) and the Lite plan is for US
  // residents only, so the other countries IB LLC carries (Latin America,
  // Africa, most of Asia: "If you are a resident of Asia, except India, Hong
  // Kong, Japan, Australia and Singapore ... your account will be opened with
  // Interactive Brokers LLC") are not this row.
  // https://www.interactivebrokers.com/lib/cstools/faq/#/content/467097743
  // https://www.interactivebrokers.com.hk/en/accounts/individual.php
  ibkrus: { countries: ["US"] },
  // Interactive Brokers LLC for everyone else: IBKR books an account with the
  // entity of the holder's residence, and IB LLC carries every country that
  // has no IBKR company of its own. "If you are a resident of Asia, except
  // India, Hong Kong, Japan, Australia and Singapore ... your account will be
  // opened with Interactive Brokers LLC"; the application opens a resident of
  // China with IB LLC, also from the Hong Kong site. The country picker sends
  // the EEA, the UK, Switzerland, Canada and the small European states to
  // their own companies. The application has no Afghanistan, Belarus, Iraq,
  // Myanmar, Nigeria, Venezuela or Zimbabwe. The US is the ibkrus row. The UAE
  // is uncertain: the picker sends it here, but IBUK has a DIFC branch.
  // https://www.interactivebrokers.com.hk/en/accounts/individual.php
  // https://www.interactivebrokers.com/en/choose-country-region.php
  // https://www.interactivebrokers.com/Universal/Application
  ibkrint: {
    all: true,
    except: [
      "US", ...EEA, "GB", "CH", "CA", "AU", "SG", "HK", "JP", "IN",
      "GG", "JE", "IM", "GI", "AD", "MC", "SM", "VA",
      "AF", "BY", "IQ", "MM", "NG", "VE", "ZW",
    ],
  },
  // IBKR's Europe page: IBUK serves "residents of non-EU/EEA European
  // countries (UK, Switzerland)". The country picker sends the UK, Switzerland,
  // Jersey, Guernsey, the Isle of Man, Gibraltar, Andorra, Monaco, San Marino
  // and the Holy See to IBUK. Other non-EU states such as Serbia and Ukraine go
  // to IB LLC. Switzerland is the ibkrch row, so it stays out of this one.
  // https://www.interactivebrokers.eu/en/home.php
  // https://www.interactivebrokers.com/en/choose-country-region.php
  ibkruk: { countries: ["GB", "GG", "JE", "IM", "GI", "AD", "MC", "SM", "VA"] },
  // Individual account page: "Accounts are accepted from residents of
  // Australia." A New Zealand resident goes to IB LLC.
  // https://www.interactivebrokers.com.au/en/accounts/individual.php
  // https://www.interactivebrokers.com/en/choose-country-region.php
  ibkrau: { countries: ["AU"] },
  // IBKR leaves Singapore out of the Asian residents that IB LLC carries.
  // Malaysia, Indonesia, Thailand, the Philippines and Vietnam go to IB LLC.
  // The country picker sends only Singapore to the Singapore site.
  // https://www.interactivebrokers.com.hk/en/accounts/individual.php
  // https://www.interactivebrokers.com/en/choose-country-region.php
  ibkrsg: { countries: ["SG"] },
  // IBKR leaves Hong Kong out of the Asian residents that IB LLC carries. The
  // application, on the Hong Kong site too, opens a resident of China with
  // Interactive Brokers LLC. Macau and Taiwan go to the US site, so IB LLC.
  // https://www.interactivebrokers.com.hk/en/home.php
  // https://www.interactivebrokers.com.hk/Universal/Application
  // https://www.interactivebrokers.com/en/choose-country-region.php
  ibkrhk: { countries: ["HK"] },
  // IBKR leaves Japan out of the Asian residents that IB LLC carries. The site
  // has "Important Account Information for Japan Residents" for the IBSJ
  // account. Only Japan is sent to the Japanese site.
  // https://www.interactivebrokers.co.jp/en/accounts/individual.php
  // https://www.interactivebrokers.com/en/choose-country-region.php
  ibkrjp: { countries: ["JP"] },
  // IBKR leaves India out of the Asian residents that IB LLC carries. The site
  // says Indian residents may trade all products on Indian markets and only
  // stocks, bonds and ETFs abroad. IB India offers only services allowed under
  // the NSE, NSDL and SEBI rules.
  // https://www.interactivebrokers.co.in/en/home.php
  // https://www.interactivebrokers.com/en/choose-country-region.php
  ibkrin: { countries: ["IN"] },
  // The online form asks whether the applicant is a Russian citizen. Yes needs
  // a verified Gosuslugi account and a Russian email address. No is sent to
  // the nearest ALOR office, and the offices are in Russia. No other country
  // of residence is named. The picker keeps Russia.
  // https://www.alorbroker.ru/open
  // https://web.archive.org/web/20250320012147/https://www.alorbroker.ru/open
  // https://www.alorbroker.ru/company/regions
  alor: { countries: ["RU"] },
  // A resident opens with a passport, online (Gosuslugi) or at a branch. A
  // foreign citizen needs a right to stay in Russia (residence permit or
  // temporary residence) and a Russian registration. No residence abroad is
  // named. The picker keeps Russia.
  // https://alfabank.ru/make-money/investments/help/faq/brokerskij-schet/
  alfainvest: { countries: ["RU"] },
  // Opening online asks for a phone, an identity card and a bank card at one
  // of the mainland custodian banks. The account takes renminbi only. Hong
  // Kong, Macau, Taiwan and foreign residents are not named online. The picker
  // keeps China.
  // https://kh.eastmoney.com/Account/Step1
  // https://zqhd.eastmoney.com/help.html
  eastmoney: { countries: ["CN"] },
  // The ordinary securities account is open to any adult of any nationality,
  // and the site says it serves the UEMOA and the diaspora. The online form
  // takes a CNI or a passport, picks the address country from 197 countries,
  // and takes any international phone number. The form is French only
  // (language test), so the countries are BF, the French-speaking UEMOA states
  // and the French list, as for macafrican.
  // https://www.coris-bourse.com/nos-services-produits/particuliers
  // https://www.coris-bourse.com/produits-services/devenir-client
  corisbourse: { countries: [...new Set(["BF", "BJ", "CI", "ML", "NE", "TG", ...FRENCH])] },
  // Opening needs an identity card or a passport, a proof of address and a
  // photo. The web form asks for the country of residence as free text and the
  // phone as free text. Cash deposits by wallet are paid from Senegal or Côte
  // d'Ivoire, and a bank card is also taken. The site and the form are French
  // only (language test), so the countries are SN, the French-speaking UEMOA
  // states and the French list, as for macafrican.
  // https://invictuscapfin.com/clients
  // https://invictuscapfin.com/depot-cash
  invictus: { countries: [...new Set(["SN", "BJ", "BF", "CI", "ML", "NE", "TG", ...FRENCH])] },
  // The web sign-up (the same service as the app) asks first whether you are a
  // Tanzanian citizen. A citizen chooses to live in Tanzania (NIDA check) or
  // abroad (diaspora). A non-citizen registers with a passport and picks the
  // country where they live, from a list of 250 countries. Opening still
  // needs a NIDA number, the Tanzanian national identity (user's check,
  // 2026-10-19), so the country is TZ.
  // https://investor.dse.co.tz/register
  // https://investor.dse.co.tz/onboarding/api/v1/lookup/countries
  dsehisa: { countries: ["TZ"] },
  // MCB Securities FAQ: foreign investors can trade on the SEM, but need an
  // MCB Ltd bank account and must visit the customer desk on appointment.
  // Online opening "only supports individual applicants having a Mauritian
  // NIC". The site shows what opens online, so the country is MU.
  // https://ipo.mcbcapitalmarkets.mu/faq
  // https://ipo.mcbcapitalmarkets.mu/
  mcbsecurities: { countries: ["MU"] },
  // The online opening form asks for a Myanmar National Registration Card (the
  // passport option is switched off), an AYA Bank account and an address in a
  // Myanmar state or region. A foreign non-resident can open on paper with a
  // passport and an overseas bank account, but that is not the online form.
  // The country is MM.
  // https://www.ayatrustsc.com/ac-opening
  // https://accountopening.ayatrustsc.com/
  // https://www.ayatrustsc.com/foreign-participation
  aya: { countries: ["MM"] },
  // The Khmer FAQ says you can apply to open an account from abroad. A
  // Cambodian uses the national ID; a foreigner uses a passport and a visa of
  // any type. Proof of work or a lease is asked only of Cambodian residents.
  // The bank account can be in Cambodia or abroad, and an application from
  // abroad needs a notarized copy. No country is named. The account
  // opening is in Khmer only (language test, user's check 2026-10-19), so
  // the country is KH.
  // https://www.sbiroyal.com.kh/kh/faq-kh/
  // https://www.sbiroyal.com.kh/jp/faq-jp/
  // https://www.sbiroyal.com.kh/faq/
  sbiroyal: { countries: ["KH"] },
  // The iDesk FAQ: a resident Bangladeshi or a non-resident Bangladeshi with a
  // valid NID or Smart ID card can open a BO account. The online form asks for
  // the NID and a bank account with a routing number. The NRB pages name no
  // countries of residence. The picker is a country, so the country is BD.
  // https://idesk.bracepl.com/auth/register/apply
  // https://www.bracepl.com/brokerage/products/item/nrb-brokerage-service
  bracepl: { countries: ["BD"] },
  // Terms 3.1: an adult who is not domiciled or ordinarily resident in a
  // country Tabadulat lists as restricted or high-risk. That list is not
  // published. The pricing page says UAE residents pay 5% VAT and non-UAE
  // residents pay none, so non-residents are taken. No country is named.
  // https://tabadulat.com/terms-conditions?tab=terms
  // https://tabadulat.com/pricing
  tabadulat: { all: true },
  // No stated list. The FAQ takes a foreign proof of residence and asks for
  // a foreign tax ID when tax residence is abroad, but the online opening,
  // the site and the documents are in German only (owner, 2026-10-20), so
  // the picker keeps the countries where German is an official language.
  // US persons are refused by the form's own country check.
  // https://www.consorsbank.de/web/Wissen/FAQ/stammdaten/Meldebescheinigung-einreichen
  // https://www.consorsbank.de/web/Produkteroeffnung/Wertpapierdepot/Einstieg
  consorsbank: { countries: GERMAN },
  // The Restrictions document refuses US citizens and residents, and the home
  // page says J2T stopped serving UK residents. The sign-up app
  // (open.j2t.com) uses one allowed list for citizenship, tax country and
  // address; these are that list less the US and the UK.
  // https://j2t.com/files/j2t/regulatorydocs/Restrictions.pdf
  // https://j2t.com/
  // https://open.j2t.com/?Market=MMA2
  just2trade: {
    countries: [
      "AD", "AE", "AG", "AI", "AM", "AR", "AT", "AU", "AW", "AZ", "BB", "BE", "BG", "BH", "BM", "BN", "BR", "BS",
      "BY", "BZ", "CH", "CK", "CL", "CM", "CN", "CO", "CR", "CY", "CZ", "DE", "DJ", "DK", "DM", "DZ", "EC", "EE",
      "EG", "ES", "FI", "FR", "GE", "GG", "GH", "GI", "GL", "GR", "GT", "HK", "HR", "HU", "ID", "IE", "IM", "IN",
      "IO", "IS", "IT", "JE", "JO", "JP", "KE", "KG", "KH", "KN", "KR", "KW", "KY", "KZ", "LB", "LC", "LI", "LK",
      "LR", "LT", "LU", "LV", "LY", "MC", "MD", "ME", "MF", "MH", "MS", "MT", "MU", "MV", "MX", "MY", "NC", "NL",
      "NO", "NR", "NU", "NZ", "OM", "PA", "PE", "PL", "PT", "PY", "QA", "RO", "RS", "RU", "SA", "SC", "SE", "SG",
      "SI", "SK", "SM", "SX", "TC", "TH", "TJ", "TM", "TN", "TO", "TR", "TW", "UA", "UY", "UZ", "VC", "VG", "VN",
      "WS", "ZA", "ZM",
    ],
  },
  // 18 or over with an SSN or ITIN, and a physical address in the 50 states,
  // DC or a military address. SoFi "cannot support individuals residing
  // outside the U.S., including U.S. citizens abroad and in U.S. territories".
  // https://support.sofi.com/hc/en-us/articles/360040122991-Who-may-open-a-SoFi-Invest-account
  sofi: { countries: ["US"] },
  // Accounts are in principle for people living in Japan; a non-resident
  // cannot open one online. Net & Call follows the branch rules. A foreign
  // national living in Japan opens with a residence card.
  // https://faq.nomura.co.jp/faq_detail.html?id=441
  // https://faq.nomura.co.jp/faq_detail.html?id=566
  nomurajp: { countries: ["JP"] },
  // Registration is limited to people living in Japan; people living abroad
  // cannot register. A residence card is an accepted ID.
  // https://kabu.dmm.com/support/faq/article/00017/
  // https://kabu.dmm.com/support/faqs/article/00029/
  dmm: { countries: ["JP"] },
  // Business terms 1.5.4: the service is not authorised outside the UK.
  // Online registration asks for a UK National Insurance number and a UK
  // driving licence or passport number.
  // https://www.charles-stanley.co.uk/help-and-contact/help/get-started
  // https://web.archive.org/web/20240214031029/https://www.charles-stanley-direct.co.uk/Home/Business-Terms
  charlesstanley: { countries: ["GB"] },
  // The sign-up "What country do you live in?" list. The United States opens
  // a state step where only Florida, New York and Connecticut go on; the
  // picker has no state, so the US is kept. Bolivia and Venezuela appear in
  // older help and legal text but not in today's list.
  // https://app.hapi.trade/signup
  // https://help.hapi.trade/en/articles/8950574-what-do-you-need-to-open-an-account-in-hapi
  hapi: {
    countries: ["AR", "BR", "CL", "CO", "CR", "DO", "EC", "SV", "GT", "HN", "JM", "MX", "PA", "PY", "PE", "ES", "TT", "UY", "US"],
  },
  // BenchMark Finance AD (Bulgaria). No accepted-country list on its pages.
  // BG Trader client money is held at UBB, Sofia, and BG Trader is offered
  // only on the Bulgarian sign-up form (the English form lists MetaTrader
  // 4/5 only); phone placeholder +359.
  // https://www.benchmark.bg/Внос-на-средства_545.html
  // https://www.benchmark.bg/real_account.php
  benchmark: { countries: ["BG"] },
  // Czech Asset Investments, a.s. (Investona). No country list. Client
  // money is held at CSOB (Prague); personal data include the rodne cislo;
  // identity via Bank iD or two ID documents.
  // https://www.investona.cz/static/bankovni_spojeni.pdf
  // https://www.investona.cz/static/zakladni_informace_pro_klienty.pdf
  investona: { countries: ["CZ"] },
  // Securities services only for clients with an account at the bank; the
  // account opens in George or at a branch with an obciansky preukaz. No
  // country list.
  // https://www.slsp.sk/content/dam/sk/slsp/www_slsp_sk/documents/zverejnenia/podmienky-investovania-do-cennych-papierov.pdf
  // https://www.slsp.sk/sk/ludia/ucty/space-ucet
  slsp: { countries: ["SK"] },
  // Regulations §4a: brokerage only for a person with a residential address
  // in Poland who is not a US Person.
  // https://unicredit.pl/dam/jcr:c4bf5152-a0f7-4fb7-a0b1-ec58853eb789/Regulamin%20%C5%9Bwiadczenia%20us%C5%82ug%20maklerskich%20(przyjmowanie,%20przekazywanie%20i%20wykonywanie%20zlece%C5%84,%20prowadzenie%20rachunku).pdf
  unicreditpl: { countries: ["PL"] },
  // NAGA Markets Europe LTD (CySEC 204/13), the entity on the real stocks
  // pages: "offers services to residents within the European Economic Area,
  // excluding Belgium".
  // https://naga.com/eu/investing/markets/real-stocks
  nagacy: { groups: ["EEA"], except: ["BE"] },
  // Capital Com Group Ltd (Cyprus, CySEC 463/25) sells the real stocks and
  // ETFs. Footer: the EEA without Belgium; BG, MT and SI get stocks, not ETFs.
  // https://capital.com/en-eu/ways-to-trade/stocks-and-etfs
  capitalcomcy: { groups: ["EEA"], except: ["BE"] },
  // The eKYC guide in NEO Invest is for domestic individuals with a chip
  // citizen card; a foreign individual calls the hotline. No country of
  // residence is named. Cash lands at VPBank or MB in Vietnam.
  // https://hdsd.vpbanks.com.vn/mo-tai-khoan/mo-tai-khoan-ekyc
  // https://hdsd.vpbanks.com.vn/giao-dich-tien/nap-tien
  vpbanks: { countries: ["VN"] },
  // Online opening is only in the TVS Mobile app, for identification. A
  // foreign individual opens on paper with a notarised passport, a VSD
  // trading code and a power of attorney to TVS. No country of residence
  // is named. Cash lands at Vietnamese banks.
  // https://acc.tvs.vn/
  // https://tvsstorageaccountlake.blob.core.windows.net/tvsstoragelakeweb/tvs_guides_and_forms/337_huong-dan-mo-tai-khoan-nha-dau-tu-ca-nhan.pdf
  tvs: { countries: ["VN"] },
  // The NRB page takes Bangladeshi citizens and institutions; an NRB sends
  // a passport, a residence permit and a foreign-currency account
  // certificate, but no country of residence is named.
  // https://www.islamibanksecurities.com/Services/NRBBrokerageService.php
  // https://www.islamibanksecurities.com/Services/documents/Individual%20or%20Joint%20Account%20Oppening%20From.pdf
  ibsl: { countries: ["BD"] },
  // A Russian citizen from 14; a non-resident needs a T-Bank card first and
  // a listed citizenship (AZ, AM, BY, KZ, KG, CN, MD, TJ, TM, UZ). The card
  // is handed over at a meeting in Russia against a migration card, visa or
  // residence permit, so the account needs presence in Russia (as vix).
  // https://www.tbank.ru/invest/help/brokerage/account/get-bs/requirements/
  // https://www.tbank.ru/cards/debit-cards/tinkoff-black/foreign/
  tinvest: { countries: ["RU"] },
  // The Chile site is XTB Agente de Valores SpA (CMF register no. 216). Its
  // terms cover accounts opened with that company from 2 July 2025, and
  // "Clientes residentes en Chile" who opened earlier stay with XTB
  // International. The country picker is residence ("El país de residencia
  // especificado no está disponible"), so the country is CL.
  // https://www.xtb.com/cl/centro-de-ayuda/cuenta-de-inversion/paises-con-restricciones-de-registro
  // https://www.xtb.com/cl/centro-de-ayuda/cuenta-de-inversion/que-tipo-de-cuentas-ofrecemos
  xtbcl: { countries: ["CL"] },
  // An individual account needs "an Australian Resident" with "a valid
  // Australian residential address". The picker is residence, so the
  // country is AU.
  // https://www.moomoo.com/au/support/topic6_323
  moomooau: { countries: ["AU"] },
  // A Malaysian citizen or PR opens with a MyKad. Any other nationality
  // opens with a passport, but must also prove a Malaysian address. The
  // picker is residence, so the country is MY.
  // https://www.moomoo.com/my/support/topic9_107
  // https://www.moomoo.com/my/support/topic9_108
  moomoomy: { countries: ["MY"] },
  // Sign-up needs a New Zealand resident (a citizen or a visa holder) with
  // a New Zealand bank account in their own name. Someone overseas must
  // meet the same criteria.
  // https://hellostake.com/nz/support/get-started/sign-up/26009032047897
  stakenz: { countries: ["NZ"] },
  // "Dodl is only available to UK residents". Every account needs a
  // permanent UK address and UK tax residence. A Crown employee abroad may
  // open only an ISA. US and Canadian citizens or tax residents are refused.
  // https://help.dodl.co.uk/en/articles/5830346-is-dodl-available-to-non-uk-residents
  // https://help.dodl.co.uk/en/articles/9273312-who-can-open-a-dodl-general-investment-account
  dodl: { countries: ["GB"] },
  // Terms 4.1 (Halifax Share Dealing, same text as Halifax): an individual
  // over 18, resident in the UK or, unless the account is an ISA, in Jersey,
  // Guernsey or the Isle of Man. A crown employee overseas may also open. A
  // US person and a resident of Canada cannot. The live PDF refuses
  // non-browser requests; it was read in the 20 Jan 2025 edition.
  // https://www.bankofscotland.co.uk/assets/pdf/sharedealing/filestore/bankofscotlandsharedealing_termsandconds.pdf
  bankofscotland: { countries: ["GB", "GG", "JE", "IM"] },
  // Terms 4.1 (24 Aug 2026, Halifax Share Dealing): an individual over 18,
  // resident in the UK or, unless the account is an ISA, in Jersey, Guernsey
  // or the Isle of Man. A crown employee overseas may also open. A US person
  // and a resident of Canada cannot.
  // https://www.scottishwidows.co.uk/assets/literature/docs/terms-and-conditions.pdf
  scottishwidows: { countries: ["GB", "GG", "JE", "IM"] },
  // Investment Account terms 1: at least 18 and "resident in the UK", or a
  // Crown Servant overseas. "The UK does not include the Channel Islands,
  // the Isle of Man or Gibraltar." The key features (09/2026) say the same.
  // https://static.aviva.io/content/dam/document-library/adviser/customerplatform/rd03003c.pdf
  // https://static.aviva.io/content/dam/document-library/adviser/customerplatform/rd03002c.pdf
  aviva: { countries: ["GB"] },
  // Someone living overseas cannot open ("海外にお住まいのお客様は口座開設を
  // 行うことができません"). Opening needs a My Number document, and a foreigner
  // shows a residence card.
  // https://bloomo.co.jp/support/account/海外に住んでいますが-口座開設はできますか
  // https://bloomo.co.jp/support/account/どのような本人確認書類が必要ですか
  bloomo: { countries: ["JP"] },
  // An account opens only by eKYC in the APEC Invest app, where the client
  // photographs a CMT/CCCD (Vietnamese identity card). No foreign-investor
  // path is published.
  // https://apec.com.vn/khach-hang-ca-nhan/dich-vu-chung-khoan/mo-tai-khoan-truc-tuyen/mo-tai-khoan-truc-tuyen-2/
  // https://apps.apple.com/vn/app/apec-invest/id1588347128?l=vi
  apec: { countries: ["VN"] },
  // The online form asks the client to prepare a chip citizen card ("CC/CCCD
  // gắn chip"). A foreign individual is a choice on the form, but it does not
  // replace the CCCD step. KBSV's guide routes foreigners through a trading
  // code and a BIDV capital account. Same as kisvn and pinetree, so VN.
  // https://kbopen.kbsec.com.vn/
  // https://www.kbsec.com.vn/pic/general/files/GUIDE%20TO%20SECURITIES%20TRADING-032019.pdf
  kbsvn: { countries: ["VN"] },
  // FAQ: "Ser mayor de 14 años" and "Tener domicilio en la Argentina", with
  // a DNI and a CUIT or CUIL.
  // https://www.comafi.com.ar/bursatil/json/apps/GetFaq.aspx?note=2694
  comafi: { countries: ["AR"] },
  // FAQ: a DNI, a CUIL/CUIT and a utility bill for the declared address.
  // Transfers in must come from the client's account at a bank in the
  // country authorised by the BCRA. The signature line takes "CUIT / L /
  // CDI", so a CDI foreigner can open, but the picker stays Argentina.
  // https://giobursatil.com.ar/preguntas-frecuentes/
  // https://giobursatil.com.ar/wp-content/uploads/2025/04/personafisica2025.pdf
  gio: { countries: ["AR"] },
  // Opening is online with a DNI or passport. A foreigner can open with a CUIT, CUIL, CDI or CIE (the key for foreign investors).
  // No list of countries is given, so the picker stays Argentina, as for ecovalores.
  // https://ayuda.max.capital/es/articles/11044662-como-abrir-una-cuenta-personal
  // https://ayuda.max.capital/es/articles/11044834-que-requisitos-aplican-para-personas-extranjeras-que-deseen-abrir-una-cuenta-personal
  maxcapital: { countries: ["AR"] },
  // The online opening on the site validates an Argentine DNI and looks up the person in the tax register (ValidarDNI, PadronSearch?dni=, ConsultarNosis?cuit=). No statement on foreign residents was found, so the picker is Argentina.
  // https://nacionbursatil.com.ar/
  nacionbursatil: { countries: ["AR"] },
  // FAQ requirements: be over 21, 'Tener domicilio en Argentina', have a bank account, and give a copy of the DNI. The FAQ also states 'Patrimonio mínimo para apertura de cuenta $USD 40.000'.
  // https://www.cohen.com.ar/preguntas-frecuentes/
  cohen: { countries: ["AR"] },
  // The individual account form asks for nationality, country of residence and a DNI. No statement on who can open was found, so the picker is the home country.
  // https://www.parakeetcapital.com.ar/Informe/Legales/FormularioAperturaDeCuentaPersonaHumana
  parakeet: { countries: ["AR"] },
  // Account opening needs a PAN card, an Aadhaar card (mobile linked to Aadhaar for the DigiLocker/e-Sign OTP) and an Indian bank account; individuals only. No NRI or foreign path is published.
  // https://univest.in/help-and-support/demat-account
  univest: { countries: ["IN"] },
  // The online opening (account.vdsc.com.vn, 4 steps, eContract/eSign) asks for the Vietnamese citizen card (CC/CCCD). No foreign-investor online path is published; same as kbsvn and kisvn.
  // https://account.vdsc.com.vn/
  vdsc: { countries: ["VN"] },
  // The individual form requires an 11-digit BVN, an 11-digit NIN, a State of Origin and an LGA, and a 10-digit Nigerian bank account. A BVN comes from a Nigerian bank (funding-bank test), so the country is NG.
  // https://atlassportfolios.com/individual-account/
  atlass: { countries: ["NG"] },
  // The online application takes any nationality but requires a 12-digit Kuwaiti civil ID (validator [0-9]{12}), and the FAQ says the unified contract must be signed in person at the broker's office in the Boursa Kuwait building. The civil ID gives Kuwait.
  // https://www.efghermesifa.com/Login/Registration.aspx
  // https://www.efghermesifa.com/Public/FAQsAr.aspx
  efghermeskw: { countries: ["KW"] },
  // GEK Capital states no residence rule: a person brings an identity document, a proof of address and a bank statement, at its Abidjan office or through its contact form; the phone is +225. As for macafrican, the countries are CI, the French-speaking UEMOA states and the French list. The site also has an English version, so the language test is weaker than for the French-only SGIs; WORLD would be the reading if the owner prefers it.
  // https://gekcapital.com/fr/devenir-client/
  // https://gekcapital.com/en/become-a-client/
  gekcapital: { countries: [...new Set(["CI", "BJ", "BF", "ML", "NE", "TG", ...FRENCH])] },
  // A person must give a cédula de identidad and/or passport, a RIF and a NIT (Venezuelan tax registrations), and open a sub-account at the Caja Venezolana de Valores; internet orders need a Banco Mercantil 'Llave Mercantil'. The RIF gives Venezuela.
  // https://www.mercantilmerinvest.com/documents/condicionados-generales-cuenta-corretaje.docx
  // https://www.mercantilmerinvest.com/productos
  merinvest: { countries: ["VE"] },
  // No residence statement found on targobank.de for the Direkt-Depot. Onboarding is German-only: online opening by VideoIdent or PostIdent (Deutsche Post) or in one of 300+ German branches, German-language forms, German Girokonto.
  // The products 'können nicht von US-Personen erworben werden' (Preisübersicht p. 19). Picker is residence: DE.
  // https://www.targobank.de/de/vermoegen/direkt-depot.html
  // https://www.targobank.de/de/download/Preisubersicht.pdf
  targobankde: { countries: ["DE"] },
  // No residence sentence on eqi.co.uk itself. Equiniti's Shareview online dealing (same firm) is 'only available to UK residents' (BT shareholder page); the EQi ISA declaration requires UK tax residence; the dealing application form asks for a UK National Insurance number and US Green Card status.
  // https://bt.com/about/investors/individual-shareholders/shareholder-administration/bt-group-easyshare-services/equiniti-shareview-dealing
  // https://eqi.co.uk/media/hkuhe5qk/eqi-isa-declaration-26-27.pdf
  // https://eqi.co.uk/media/2873/eqi-dealing-application-form.pdf
  eqi: { countries: ["GB"] },
  // The catalogue and cost file are MFI's offer to U.S. residents: "$0 commission trading is available only to U.S. residents trading in the U.S. markets through Moomoo Financial Inc."; a U.S. tax resident opens with an SSN and a U.S. address.
  // MFI also opens accounts for non-U.S. tax residents (passport plus a non-Mainland-China address; ID issuance countries are a picker in the app, not published) under a separate fee schedule ($0.0049/share min $0.99 commission plus a $0.005/share min $1 platform fee and $0.003/share settlement on US stocks). Not modelled here: it would need its own plan or folder.
  // https://www.moomoo.com/us/pricing
  // https://www.moomoo.com/us/support/topic4_277
  // https://www.moomoo.com/us/support/topic4_2
  // https://www.moomoo.com/us/support/topic4_65
  moomoous: { countries: ["US"] },
  // KYC needs "a copy of citizenship certificate in case of Nepali citizen, in case of citizen of other country, a copy of the passport", a Nepali bank account and a CDSC BOID (demat) number; FAQ: broker account needs a copy of the citizenship certificate.
  // Nepal only: the account needs a Nepali bank account, a CDSC demat (BOID) and Nepali KYC papers; no foreign residence route is described on the site (siprabi has no accepted.mjs line and falls back to NP).
  // https://www.kumarisecurities.com/pages/brokers/learn/register
  kumari: { countries: ["NP"] },
  // KYC needs "a copy of citizenship certificate in case of Nepali citizen, in case of citizen of other country, a copy of the passport", a Nepali bank account and a CDSC BOID (demat) number; FAQ: broker account needs a copy of the citizenship certificate.
  // Nepal only: the account needs a Nepali bank account, a CDSC demat (BOID) and Nepali KYC papers; no foreign residence route is described on the site (siprabi has no accepted.mjs line and falls back to NP).
  // https://premiersecurities.com.np/pages/procedure
  premiersecurities: { countries: ["NP"] },
  // FAQ: broker account needs the demat confirmation slip and a copy of the citizenship certificate; the trading page (Nepali) asks the client to visit the Kathmandu office in person with the KYC papers within two weeks of the online form.
  // Nepal only: the account needs a Nepali bank account, a CDSC demat (BOID) and Nepali KYC papers; no foreign residence route is described on the site (siprabi has no accepted.mjs line and falls back to NP).
  // https://mallastock.com/pages/brokers/learn/faq
  mallastock: { countries: ["NP"] },
  // Required documents for a TMS account: KYC form, online agreement, citizenship, photo, PAN, bank cheque-book copy and demat confirmation; no passport route printed.
  // Nepal only: the account needs a Nepali bank account, a CDSC demat (BOID) and Nepali KYC papers; no foreign residence route is described on the site (siprabi has no accepted.mjs line and falls back to NP).
  // https://aryatarasecurities.com/pages/services/brokerage
  aryatara: { countries: ["NP"] },
  // Digital account opening is offered to a Resident Pakistani and to a Non-Resident Pakistani (through a Roshan Digital Account). The countries where the non-resident lives are not listed. The picker is a country, so the country is PK.
  // https://abbasiandcompany.com/
  // https://abbasiandcompany.com/roshan-digital
  abbasi: { countries: ["PK"] },
  // Online opening asks for a scanned CNIC, a Pakistani IBAN and a mobile SIM in the applicant's name. A non-resident Pakistani opens through a Roshan Digital Account. The picker is a country, so the country is PK.
  // https://www.scstrade.com/documents/account%20opening%20requirments.pdf
  // https://www.scstrade.com/OnlineTrading/OT_OnlineTradingRoshanDigital.aspx
  standardcapital: { countries: ["PK"] },

  // ---- catalogues added 2026-10-21 (sources: each broker's own pages) ----
  // Both routes ask for a Kenya Revenue Authority PIN. The Dosikaa app,
  // which the FAQ names for remote opening, asks "Enter your Kenya Revenue
  // Authority PIN" before it creates the CDS account with ABC Capital
  // (screens seen by the owner on 2026-10-22). The ActiveTrader web sign-up
  // asks for a 'KRA PIN / Tax ID' too. A foreigner gets a KRA PIN only with a
  // Kenyan permit or a Kenyan tax obligation, so a resident abroad is not
  // served even though the web form has Foreign Individual and Non Resident
  // options. Funding is M-Pesa paybill 111220 or a deposit to ABC Bank.
  // Owner's choice (2026-10-22): Kenya only.
  // https://www.abccapital.co.ke/faqtwo/
  // https://abccapital.kenyaonlinetrading.com/ActiveTrader/#!/login/
  abccapital: { countries: ["KE"] },
  // Opening runs on LBO NET, in Spanish only. Sign-up takes just a CUIL, an
  // email and a password. The CUIL is checked against RENAPER, the Argentine
  // national register, then photos of both sides of a DNI and a selfie with
  // it are asked for. No passport or foreign ID is offered. The phone picker
  // starts at +54 and lists 16 other codes. The address step allows a
  // foreign residence, and an outside-Argentina USD account at Banco Nación
  // NY (SWIFT) exists. But pesos and local dollars come in by CVU or CBU
  // from an account in the client's own name, matched by CUIL. Without an
  // Argentine CUIL and DNI there is no account, and no page names another
  // country, so the picker stays Argentina.
  // https://www.acuantoesta.com.ar/tutoriales
  // https://acuantoesta.net.lbo.com.ar/register
  acuantoesta: { countries: ["AR"] },
  // Account types page: the account is opened online from anywhere, with
  // two exceptions. The USA, Canada, Australia, Hong Kong, Japan and
  // Singapore need a direct request by phone or e-mail, so there is no
  // online opening there. No account can be opened by anyone who lives or
  // was born in Burundi, Cuba, Crimea, Iran, Iraq, Lebanon, Libya, North
  // Korea, Russia, Somalia, South Sudan, Sudan and Darfur, Syria,
  // Venezuela, Belarus, Yemen or the Central African Republic. Crimea is
  // named, not Ukraine as a whole.
  // https://www.agora-direct.com/de/depot/depotarten/
  // https://www.agora-direct.com/de/depot/ablauf-voraussetzungen/
  agoradirect: { all: true, except: [...SANCTIONED, "BI", "CF", "IQ", "LB", "LY", "SD", "SO", "SS", "VE", "YE", "US", "CA", "AU", "HK", "JP", "SG"] },
  // The online application, in French only, is a request: the client then
  // gets an e-mail or a call to set an appointment. It asks for a tax
  // residence from a picker of 17 countries: Tunisia, France, Italy, the
  // Netherlands, the United States, Singapore, Algeria, Libya, Morocco,
  // Egypt, Syria, Lebanon, the Emirates, Saudi Arabia, Qatar, Kuwait and
  // Burkina Faso. The identity document is a national ID card, a passport
  // or a residence card. The phone is free text with no dial-code picker,
  // and the client file has a phone-abroad field and a non-resident
  // reference letter. Funds come in cash, by cheque or by transfer, and the
  // agreements ask for the client's bank RIB. No country is named as
  // refused.
  // https://ati.attijaribourse.com.tn/AttijariBourse/devenir-client
  // https://ati.attijaribourse.com.tn/Ebourse/WsAgonom/getByCnom
  // https://ati.attijaribourse.com.tn/AttijariBourse/assets/documents/KYC-Fiche%20Client%20Personne%20Physique.pdf
  // https://ati.attijaribourse.com.tn/AttijariBourse/assets/documents/CONVENTION_CEA_LIBRE.pdf
  attijaritn: { countries: ["TN", "FR", "IT", "NL", "US", "SG", "DZ", "LY", "MA", "EG", "SY", "LB", "AE", "SA", "QA", "KW", "BF"] },
  // Account opening: a local opens with a Lao identity card and a BCEL passbook,
  // on a paper form at the office or a BCEL branch. A foreigner, resident or not,
  // needs a passport, a BCEL kip account (alien card or work permit, or an LSX
  // foreign investor certificate) and "shall be present at BCEL-KT's office".
  // There is no online opening and no country is named, so the picker is Laos.
  // https://www.bcel-kt.com/index.php?r=site/display&id=10
  // https://www.bcel-kt.com/index.php?r=site/display&id=7
  bcelkt: { countries: ["LA"] },
  // The "Ouvrir un compte" button leads to an online request form, in
  // French only. Its "nationalité" and "pays de résidence fiscale" pickers
  // each list the same 197 countries, Tunisia by default, and the ID can be
  // a CIN, a residence card (CS), a passport or other, with its issuing
  // country from that list. No country is named as refused. The form ends
  // with a choice of agency, Tunis only. The phone is free text in
  // international format. The paper form asks for a bank and RIB; no
  // funding route is described. So the list is the picker's countries:
  // Bermuda, the Faroe Islands, Guernsey, Gibraltar, Greenland, Hong Kong,
  // the Isle of Man, Jersey, Macau, French Polynesia and Taiwan are not on
  // it. Owner's choice (2026-10-22), as for cdgcapital.
  // https://www.btkconseil.com/devenir-client/
  // https://www.btkconseil.com/nos-produits/compte-libres/
  // https://www.btkconseil.com/download/formulaire-douverture-de-comptes/
  btkconseil: { all: true, except: ["BM", "FO", "GG", "GI", "GL", "HK", "IM", "JE", "MO", "PF", "TW"] },
  // FAQ: "Cambodian investors are able open Trading Account online by Phsarhun app";
  // "Foreigner investors are required to visit at counter of Canadia Securities."
  // A foreigner opens with a passport and an SECC investor ID, in person only.
  // No country of residence is named, so the picker is Cambodia.
  // https://canasecurities.com.kh/faqs/
  // https://canasecurities.com.kh/investor-id/
  // https://canasecurities.com.kh/bank-account/
  canadia: { countries: ["KH"] },
  // Help centre, list of brokers by country for Triodos receipts: Captin
  // serves the Netherlands, Belgium, Germany and Spain. The United Kingdom
  // is sale only, and the funding page says UK holders cannot place buy
  // orders, so Britain stays out. The help centre is in Dutch, French
  // (Belgium), German, Spanish, Catalan and English. Since 18 June 2025
  // Captin opens no new trading account for Triodos receipts. Only holders
  // invited by an activation email can onboard, so there is no public form
  // or dial picker to read. Identity is a passport or ID card, or a driving
  // licence for UK residents only. Funding is a euro transfer to Captin's
  // ABN AMRO account, and the counter account must be in the holder's name.
  // https://support.captin.com/hc/en-gb/articles/27909898029085
  // https://support.captin.com/hc/en-gb/articles/11829486217245
  // https://support.captin.com/hc/en-gb/articles/27910100593949
  // https://support.captin.com/hc/en-gb/articles/11749704295453
  // https://support.captin.com/hc/en-gb/articles/7865821534493
  // https://support.captin.com/hc/en-gb/articles/13540650091421
  captin: { countries: ["NL", "BE", "DE", "ES"] },
  // Account opening is at the head office or a CB Bank branch, on a printed form.
  // A local needs an NRC and a CB Bank account. A foreigner needs a passport, a
  // visa and a CB Bank MMK account. The foreign-investor page cites the SECM rule
  // that admits non-residents but names no country, so the picker is Myanmar.
  // https://cbsecurities.com.mm/account-opening-2/
  // https://cbsecurities.com.mm/foreign-investor/
  cbsecurities: { countries: ["MM"] },
  // The opening page takes Moroccans, resident or not, with a national ID
  // card. It also takes foreigners living in Morocco with a residence card,
  // and foreigners living abroad with a passport. Each also needs a bank
  // RIB, with no country named for that bank. The request is made online,
  // then the client brings the documents to CDG Capital Bourse, which is not
  // a refusal. The site and form are in French and English. The phone and
  // mobile fields take any country code (+1 to +3 digits, no SMS check). The
  // first deposit is asked in MAD, and no funding route is named.
  // Nationality and residence pickers default to Morocco and use an old list
  // of about 220 countries. Andorra, Armenia, Azerbaijan, Bosnia, Estonia,
  // the Faroe Islands, Georgia, Guernsey, the Isle of Man, Jersey,
  // Kazakhstan, Latvia, Lithuania, Moldova, Montenegro, North Macedonia,
  // Serbia and Uzbekistan are not on it, so a resident there cannot be
  // entered. No country is named as refused.
  // https://www.cdgcapitalbourse.ma/OuvrirCompte
  // https://www.cdgcapitalbourse.ma/OuvrirCompte/FormStart
  // https://www.cdgcapitalbourse.ma/api/ (COUNTRIES)
  cdgcapital: { all: true, except: ["AD", "AM", "AZ", "BA", "EE", "FO", "GE", "GG", "IM", "JE", "KZ", "LT", "LV", "MD", "ME", "MK", "RS", "UZ"] },
  // FAQ: residents of India, NRIs, HUFs and firms can open a trading
  // account, but online opening is limited to Indian resident individuals.
  // A paperless account needs a valid Aadhaar and an Aadhaar-linked mobile
  // or email. The NRI route is offline and names no countries. The picker
  // is a country, so the country is IN.
  // https://www.cholasecurities.com/faq
  chola: { countries: ["IN"] },
  // Requirements sheet: the original ID is shown in person, plus a letter
  // from a Qatari bank with the IBAN and a QCSD investor statement.
  // "Regulatory requirements mandate availability of Qatari Bank account to
  // proceed with opening an account." A non-resident authenticates the
  // documents in the issuing country. Deposits come only by transfer from
  // the client's registered Qatari bank account. The online application
  // (English and Arabic) takes a Qatari ID or a passport and has world-wide
  // nationality and residence pickers, with a dial-code picker that
  // defaults to Qatar and lists the GCC first. Its bank list is Qatari
  // banks plus "Others". The app's "Open an Account" form starts with a
  // mandatory NIN (the QCSD investor number) and an "Upload National ID"
  // step (screen seen by the owner on 2026-10-22). No country of residence
  // is named, so the picker is Qatar.
  // https://www.dlalabroker.com/wp-content/uploads/2021/08/AOR.pdf
  // https://www.dlalabroker.com/wp-content/uploads/2021/08/Bank_Accounts_Con_EN.pdf
  // https://www.dlalabroker.com/en/about-us/faq/
  // https://dlalawebapp.dlalaholding.com/OpenAccountApplication_v2/PublicOpenAccount/OpenAccount/Wizard?applyType=individual
  dlala: { countries: ["QA"] },
  // Share trading is ordered online with BankID, the Norwegian bank ID.
  // Without BankID, a client applies on a form and then shows a passport
  // at a DNB branch. Someone new in Norway also needs a residence permit or
  // asylum card, or a Norwegian D-number. No other country of residence is
  // named. The site and form are in Norwegian and English. The form's dial
  // picker lists every country, with +47 by default and an SMS code, and it
  // has a 'Living abroad' status and a country field for an address outside
  // Norway. But its first field is the 11-digit Norwegian national identity
  // number or D-number, and identity is checked at a DNB office or by mail.
  // The trading account is funded only by transfer from the client's own
  // DNB accounts.
  // https://www.dnb.no/markets/aksjer/aksjehandel-privat
  // https://www.dnb.no/kundeprogram/bli-kunde
  // https://www.dnb.no/kundeprogram/bli-kunde/uten-bankid
  // https://www.dnb.no/kundeprogram/bli-kunde/ny-i-norge
  dnb: { countries: ["NO"] },
  // Who can open: 18 or older for a cash account, 21 for margin. The page
  // names no residency, but the application wants proof of address and a
  // bank account in the client's own name, and the help centre gives that
  // proof only for a Dutch or a Belgian bank. The tax pages are for clients
  // who live in the Netherlands or Belgium (form 8-3-6, Belgian TOB). No
  // other country of residence is named.
  // The site, help centre and form are in Dutch only (the /fr/support page is
  // empty). The form starts with a mobile number and an SMS code. Its dial
  // picker lists every country, with NL, BE, FR, DE and ZA first. Identity is
  // a valid passport or ID card. Proof of address is a bank or card statement
  // or a Dutch BRP extract. Funding is a bank transfer from an account in the
  // client's own name to Interactive Brokers Ireland (IBAN DE72...).
  // The open dial picker and passport do not widen the list, because no
  // page names a third country of residence.
  // https://www.easybroker.nl/support/kan-iedereen-een-rekening-openen-via-easybroker
  // https://www.easybroker.nl/start-aanvraag
  // https://accounts.easybroker.nl/view/form?formKey=onboard
  // https://www.easybroker.nl/support/wat-is-een-bewijs-van-adres
  // https://www.easybroker.nl/support/hoe-download-ik-een-bankafschrift-in-belgie
  // https://www.easybroker.nl/support/waarom-moet-ik-mijn-bankgegevens
  // https://www.easybroker.nl/support/hoe-maak-ik-geld-over-naar-mijn-easybroker-beleggers-rekening
  // https://www.easybroker.nl/support/waarom-formulier-8-3-6
  // https://www.easybroker.nl/blog/beleggen-vanuit-belgie-beurstaks
  easybroker: { countries: ["NL", "BE"] },
  // Opening is in Spanish only. The sign-up app's identity step takes a
  // cédula (checked at the Registro Civil) or a passport. A passport opens a
  // country-of-residence picker with a foreign tax number, and the phone
  // picker lists every dial code. But the app's own FAQ asks for a natural
  // person resident in Ecuador with a cédula and an Ecuadorian bank
  // account, also for foreigners. It also says INVIERTE needs an
  // Ecuadorian mobile line. Money comes in only by interbank transfer from
  // the client's own account, and the bank picker lists Ecuadorian banks
  // and cooperatives only. So the picker stays Ecuador.
  // https://clientes.futurocasadevalores.com/perfilInversionista/
  // https://www.futurocasadevalores.com/portafolio/
  // https://www.futurocasadevalores.com/terminos-y-condiciones-de-portafolio-app-de-casa-de-valores-futuro-futurocapital-s-a
  futuro: { countries: ["EC"] },
  // General terms 21.1(k): an individual client warrants, on every
  // transaction, that neither they nor their spouse is a non-resident of
  // Jamaica. The KYC sheet takes a TRN or a foreign number such as an SSN,
  // but no other residence is named. Opening is the paper form package.
  // https://gk-capital.com/forms/
  // https://gk-capital.com/wp-content/uploads/2023/07/gk-capital-general-terms-and-conditions-1.pdf
  // https://gk-capital.com/wp-content/uploads/2023/07/GKCM-KTC-Acceptable-Document-3.pdf
  gkcapital: { countries: ["JM"] },
  // Advisory agreement 1: the Program is for US citizens with a valid SSN
  // or tax ID. It is not offered outside the United States. The site's
  // disclaimer says the advisory services are only for US residents.
  // https://www.grifin.com/legal/advisory-agreement
  grifin: { countries: ["US"] },
  // Búho Bank FAQ, "¿Qué necesitás para dar de alta tu cuenta?": be over
  // 18, use the BH app, check your details with a DNI and a selfie, and
  // "Tener domicilio radicado en Argentina". The Cuenta Inversor comes in
  // the Búho Inversor package opened through that same channel.
  // https://www.hipotecario.com.ar/buhobank/
  // https://www.hipotecario.com.ar/buhobank/buho-inversor/
  hipotecario: { countries: ["AR"] },
  // Support FAQ: a UAE resident signs up with an Emirates ID, a UAE mobile
  // and a UAE address. An international client uses a passport, a mobile
  // number from the country of residence and an address. The user guide
  // checks the phone by SMS OTP and takes the address country from the
  // phone number. The FAQ says SMS does not yet reach international
  // numbers. The app is in English and Arabic. Trades go through xCube,
  // which takes a passport and proof of funds from non-residents. Funding
  // is a transfer to the client's own iVestor IBAN (Emirates NBD) or an
  // ENBD cash deposit, and at xCube a bank transfer or a UAE or foreign
  // card in the client's name. The features need an active iVestor card.
  // Because of regulatory restrictions it cannot be delivered to Vietnam,
  // Iran, Somalia, Egypt, Russia, China, Belarus, South Korea, Sudan,
  // Syria, Afghanistan, Australia, India and Ukraine, so those countries
  // stay out.
  // https://ivestor.ae/support/
  // https://ivestor.ae/wp-content/uploads/2026/06/iVestorUserGuideCompressed.pdf
  // https://www.xcube.ae/support/
  ivestor: { all: true, except: ["AF", "AU", "BY", "CN", "EG", "IN", "IR", "KR", "RU", "SD", "SO", "SY", "UA", "VN"] },
  // Individual accounts page and FAQ: a person residing outside Jamaica
  // opens with the same documents, notarised overseas, plus a bank
  // reference: a TRN, a driver's licence, passport or national ID, and a
  // proof of address. The site and the online application are in English
  // only. The application (answering 502 on 2026-10-22, read from its
  // February 2026 copy) takes a mobile number from any country, Jamaica
  // first, then the United States and the United Kingdom, and sends SMS
  // codes to it. Its country list puts Jamaica, Canada, the United Kingdom
  // and the United States above "All Countries", and its tax step asks for
  // a TRN, SSN, NIN or SIN. Overseas money is wired to Citibank New York
  // (US dollars from the USA, the UK or Canada), Citibank London (sterling)
  // or Scotiabank (Canadian dollars), or sent as a banker's cheque. The
  // treaty tax rates name the same three countries. No other residence is
  // named.
  // https://www.jnfunds.com/become-a-client/accounts-for-individuals/
  // https://www.jnfunds.com/resource-centre/faqs/
  // https://www.jnfunds.com/how-to-send-funds-to-your-investment-account-from-overseas/
  // https://www.jnfunds.com/wp-content/uploads/JNFM-Client_On-Boarding_Checklist-Revised-February-2024.pdf
  // https://onboarding.jnfunds.com/
  // https://onboarding.jnfunds.com/assets/js/bundle-5.5.2.min.js
  jnfund: { countries: ["JM", "US", "GB", "CA"] },
  // Opening is PAN, Aadhaar e-KYC through DigiLocker and an Aadhaar e-sign.
  // The KYC app asks the client to confirm "I'm an Indian Resident", not a
  // US person and not a tax resident of any other country. It refuses a
  // location outside India. The picker is a country, so the country is IN.
  // https://lemonn.co.in/open-delivery-trading-account
  // https://kyc.lemonn.co.in/
  lemonn: { countries: ["IN"] },
  // Moneybox is only available in the UK. Every account needs the client to
  // be a UK resident for tax purposes, and an ISA also needs a National
  // Insurance number. A client who stops being UK tax resident must tell
  // Moneybox. No other country of residence is named.
  // https://support.moneyboxapp.com/faqs/getting-started/availability-outside-uk/
  // https://support.moneyboxapp.com/faqs/category/registering-online/eligibility/
  // https://support.moneyboxapp.com/faqs/what-happens-if-i-move-abroad/
  moneybox: { countries: ["GB"] },
  // Every individual, TFSA and RRSP account needs a Canadian SIN and a
  // residential address in Canada (no mailbox). The address page lists the
  // provinces and territories it accepts, all thirteen. No non-resident
  // path is published, so the country is CA.
  // https://www.moomoo.com/ca/support/topic10_18
  // https://www.moomoo.com/ca/support/topic10_15
  moomooca: { countries: ["CA"] },
  // The online application, NCB's shared form on its Capital Markets
  // route, is in English only. It asks "Are you a Jamaican Resident?". A
  // "No" ends the online path: the page says to print and notarise the
  // documents abroad and mail them to Jamaica. Online it takes a TRN and a
  // driver's licence, voter ID or passport scanned by camera, and proof of
  // address from an NWC, JPS, Digicel or FLOW bill. The phone fields are
  // free text in North American format, with no dial-code picker. Equity
  // Online needs an NCB Jamaica internet banking profile, which also moves
  // the money. Since October 2026 the opening link sends to an appointment
  // scheduler. The paper form takes a non-resident with a passport and an
  // overseas bank reference, but names no country. So it stays Jamaica.
  // https://openaccount.jncb.com/select-subsidiary/cap
  // https://openaccount.jncb.com/static/js/main.f2fef795.chunk.js
  // https://ncbcapitalmarkets.com/research/informationcentre/articles/clientdocuments/432-application-form-for-individuals/file
  // https://www.ncbcapitalmarkets.com/wealthmanagement/products/buysellstocks
  ncbcm: { countries: ["JM"] },
  // The ESX launch notice says Neway lets an investor onboard remotely, for
  // "everyone across the country". The app is in English only and signs up
  // in the app. No public form shows a dial code or a residence picker. The
  // ESX investor guide says anyone "from every corner of Ethiopia" can
  // invest, including Ethiopians, foreigners of Ethiopian origin and foreign
  // nationals, subject to ECMA and NBE rules, with a copy of the national
  // identification. That is nationality, not another residence. Funds go to
  // the investor account through the ESX trading member, in birr, and no
  // foreign route is named. No other country is named.
  // https://esx.et/?p=9425
  // https://esx.et/wp-content/uploads/2025/04/Investor-Booklet-v7-edited.pdf
  // https://esx.et/equity-market/invest/
  // https://apps.apple.com/us/app/neway-esx/id6753160438
  neway: { countries: ["ET"] },
  // Terms 3.3: the platform is for individuals aged 18 or over who are UK
  // residents and not US persons. The ISA also opens for a UK Crown servant,
  // their spouse or civil partner, or a dependant. The FAQ says Quilter
  // Invest is only available in the UK, and a National Insurance number is
  // required. No other country of residence is named.
  // https://www.quilterinvest.com/site-terms/terms-and-conditions-app
  // https://www.quilterinvest.com/faq/can-i-use-quilter-invest-if-i-live-outside-the-uk
  // https://www.quilterinvest.com/faq/can-i-have-a-quilter-invest-account-if-i-dont-have-a-national-insurance-number
  quilter: { countries: ["GB"] },
  // Support: Raseed serves citizens and residents of GCC countries, Jordan
  // and Egypt, and plans more countries later. The same page lists the
  // countries it cannot onboard (sanctioned and not supported). No country
  // outside the GCC, Jordan and Egypt is open, so the list is those eight.
  // https://raseedcapital.com/en/support/is-raseed-available-for-citizens-of-all-countries
  raseed: { groups: ["GCC"], countries: ["JO", "EG"] },
  // Sbanken is a concept of DNB Bank ASA. A client signs up by entering a
  // Norwegian national identity number (fødselsnummer) and confirming with
  // BankID on dnb.no. Share trading runs on DNB's aksjehandel. No other
  // country of residence is named.
  // https://sbanken.no/bli-kunde
  // https://sbanken.no/bli-kunde/skjema
  // https://sbanken.no/spare/aksjer/aksjehandel
  sbanken: { countries: ["NO"] },
  // KYC needs a citizenship certificate for a Nepali citizen, or a passport
  // for a citizen of another country, plus a Nepali bank account and a CDSC
  // demat (BOID). The FAQ says verification may be in person. The pages
  // name no residence outside Nepal, so the country is NP.
  // https://www.siprabi.com/pages/brokers/learn/register
  // https://www.siprabi.com/pages/brokers/learn/faq
  siprabi: { countries: ["NP"] },
  // FAQ (site and app in Turkish and English): an account at Dinamik
  // Menkul Değerler needs Turkish Republic ID verification and a video
  // call. Opening is not supported for foreign nationals, nor for holders
  // of a foreigner ID or a Blue Card. Sign-up is in the app only. Funding
  // is a TRY transfer, free from partner banks, and US shares are bought
  // after converting TRY to USD in the app. No other residency is named,
  // so the country is TR. The separate "Slayz: Invest, Trade, Swap" app
  // belongs to Global Dynamic Markets (Mauritius FSC), not this entity.
  // https://slayz.app/sss
  // https://slayz.app/en/faq
  // https://slayz.app/destek
  // https://apps.apple.com/tr/app/id6761392541
  slayz: { countries: ["TR"] },
  // FAQ: open online through the KYC (kyc.sunsecurities.com) with a
  // citizenship certificate (both sides), a photo, Nepali bank details and a
  // signature. A CDSC demat is needed, and Sun opens it as the DP. No
  // passport, foreigner or NRN route is printed. The site is in English
  // only and prints only +977 numbers. Funding is a voucher for a payment
  // to Sun's accounts at Global IME Bank or Prabhu Bank in Kathmandu
  // (wallet, connectIPS, RTGS, cheque or cash), with no SWIFT or card route,
  // and withdrawals go only to the client's registered bank account. The
  // pages name no other residence, so the country is NP.
  // https://sunsecurities.com/faqs
  // https://sunsecurities.com/
  sunsecurities: { countries: ["NP"] },
  // The steps to get a bourse code start with registration in Sejam (the
  // central depository's customer system) and identity checks, then the
  // online sign-up (fardaregister.irbrokersite.ir). The code is given on a
  // shenasnameh or an Iranian national card, and the identity page offers
  // only the form for Iranian natural persons. The online trading page
  // asks for identity checks at a branch and a linked bank account. The
  // site is in Persian only and prints only Iranian numbers. Funding is in
  // rials to the broker's Iranian bank accounts (IR Sheba) or through its
  // payment gateway, with no foreign route. No page names foreign nationals
  // or non-residents, so the picker is Iran.
  // https://fardabroker.ir/bond
  // https://fardabroker.ir/ehraz
  // https://fardabroker.ir/barkhat
  // https://fardabroker.ir/banks
  // https://fardabroker.ir/questions
  tosee: { countries: ["IR"] },
  // Online opening has four steps: a form, uploaded documents, the agreement
  // signed with a DigiGO electronic ID from TunTrust (the Tunisian
  // certification agency; identity checked by video, ID sent by SMS), then
  // a first deposit. The account can also be opened at one of the eight
  // branches in Tunisia. The site is in French and English; the form itself
  // is in French. The mobile phone is free text with no dial-code picker,
  // and no nationality or residence picker is shown. The FAQ asks for a
  // water, power or landline bill as proof of address. Funds go by transfer
  // to a Tunisie Valeurs account at Amen Bank, and the client then brings
  // the transfer order to the branch; a bank RIB is added at the branch.
  // No residency is named as accepted or refused, so the country is TN.
  // https://www.tunisievaleurs.com/faq/
  // https://devenirclient.tunisievaleurs.com/ouverture-de-compte/
  // https://devenirclient.tunisievaleurs.com/demarrez-votre-ouverture-de-compte/
  tunisievaleurs: { countries: ["TN"] },
  // Nationality list is Zimbabwe only, and both client types read
  // "Individual retail investors (Zimbabwean)" / "(Zimbabwean)". Money comes
  // by FCA (Nostro) transfer from a commercial bank in Zimbabwe or by mobile
  // money, from USD 10. The FAQ lets a Zimbabwean living abroad buy, and the
  // residence picker lists about 69 usable countries, but the offer is for
  // Zimbabweans. Owner's choice (2026-10-22): Zimbabwe only.
  // https://d3u8q0mxu6epjj.cloudfront.net/api/v1/public/nationalities
  // https://d3u8q0mxu6epjj.cloudfront.net/api/v1/client-types
  // https://vfexdirect.vfex.exchange/
  // https://ds88jcmqc11je.cloudfront.net/api/faqs?exchange=VFEX
  vfexdirect: { countries: ["ZW"] },
  // The online opening form asks for a Vietnamese citizen card ("Số CCCD/ CMTND"),
  // its issue date and place, an address and a bank account; customer care then
  // calls to finish. The terms identify the client by CCCD/CC. No page names a
  // foreign-investor or non-resident path, so the picker is Vietnam, as for vdsc.
  // https://xtsc.vn/openaccount
  // https://xtsc.vn/dieu-kien-dieu-khoan
  xtsc: { countries: ["VN"] },
  // FAQ "What do I need to open an account?": you must live in
  // Switzerland, Austria or Liechtenstein and not be a US person. A foreign
  // national living in Switzerland also needs a residence permit. Onboarding
  // for residents of other countries is on hold. Austria and Liechtenstein
  // need an official proof of residence and a first deposit of at least
  // EUR 500 from a bank in that country.
  // https://www.yuh.com/en/help/faq/
  // https://www.yuh.com/en/help/fatca/
  yuh: { countries: ["CH", "AT", "LI"] },
  // Dosikaa asks "Enter your Kenya Revenue Authority PIN" before it creates
  // the CDS account with AIB-AXYS (screens seen by the owner on
  // 2026-10-22). The DigiTrader auto-opening terms, clause 3(i): "only
  // applicable to natural person of legal age , local citizens". The
  // ActiveTrader web sign-up requires a "KRA PIN / Tax ID" too. The paper
  // account form, filled at the Nairobi office (FAQ), asks for a KRA PIN
  // and a KRA PIN certificate, Foreign Individual box included. The
  // auto-opened account is funded by M-Pesa only. Kenya only.
  // https://ww2.aib-axysafrica.com/_files/ugd/af94b6_ae7307fe1f5c48e28a6215d816cf76d6.pdf
  // https://ww2.aib-axysafrica.com/_files/ugd/af94b6_07ac907c25f3494db14e7e9be84e07ed.pdf
  // https://ww2.aib-axysafrica.com/_files/ugd/af94b6_7132bbfc5dcc4d60a47245382c86f42c.pdf
  // https://aibaxys.kenyaonlinetrading.com/ActiveTrader/
  aibaxys: { countries: ["KE"] },
  // The Dosikaa app asks "Enter your Kenya Revenue Authority PIN" before it
  // creates the CDS account with Faida (screens seen by the owner on
  // 2026-10-22). Faida's own registration form asks for an ID or passport
  // number and a KRA PIN. Its nationality and country lists hold some 200
  // countries, but Faida names no route for non-residents. Funding is
  // M-Pesa paybill 888900 or a deposit to Faida's Co-operative Bank or
  // Stanbic accounts in Kenya. Kenya only, as for ABC Capital.
  // https://fib.co.ke/faqs/
  // https://fib.co.ke/registration-form/
  // https://web.archive.org/web/20260511234123/https://fib.co.ke/registration-form/
  faida: { countries: ["KE"] },
  // Dosikaa asks "Enter your Kenya Revenue Authority PIN" before it creates
  // the CDS account with Kingdom Securities (screens seen by the owner on
  // 2026-10-22). KSL's own self-onboarding link needs the original physical
  // National ID and a KRA PIN certificate. The FAQ's other routes are on
  // paper. A Kenyan abroad is introduced through Co-op Bank's diaspora
  // banking department, which stamps the forms; this is a nationality
  // route, not a residence one. A foreigner in Kenya brings a passport, an
  // embassy letter and an entry or work permit. Kenya only, as for
  // abccapital.
  // https://kingdomsecurities.co.ke/faqs/
  // https://kingdomsecurities.co.ke/wp-content/uploads/2026/04/Individual-CDS-Self-Onboarding-Link-1.pdf
  kingdomsecurities: { countries: ["KE"] },
};

// Names added on 2026-10-22 so that a broker's own country can be picked
// (BCEL-KT Laos, the Jamaican, Nepalese, Ethiopian and Iranian brokers,
// Attijari Intermédiation's diaspora list). A worldwide broker ({ all: true })
// is not read as taking these: its pages were checked against the earlier list.
const NAMED_ONLY = new Set(["LA", "JM", "NP", "ET", "IR", "LY", "SY"]);

const GROUPS = { EEA, EU, GCC };

export function expand(spec) {
  const set = new Set();
  if (!spec) return set;
  if (spec.all) {
    for (const code of Object.keys(COUNTRY_NAMES)) if (!NAMED_ONLY.has(code)) set.add(code);
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
  return { all: true };
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
  fillListIsins(rows);
  return rows;
}
