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

// Only where the broker's own page names these countries. A line that says
// "sanctions" or "where legal", without naming them, does not use this list.
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
  IL: "Israel", IM: "Isle of Man", IN: "India", IQ: "Iraq", IS: "Iceland", IT: "Italy",
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
  tradeup: { all: true, except: ["CN", "TW"] },
  // W-8 / non-resident alien on the application; no published block list.
  siebert: WORLD,
  // sogotrade.com/products/intaccout.aspx: any foreign citizen+resident,
  // plus ordinary US accounts.
  sogotrade: WORLD,
  webull: { countries: WEBULL },

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
  dbs: { countries: ["CN", "HK", "MO", "SG", "TW"] },
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
  standardchartered: { countries: ["TW"] },
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
  sinopac: { countries: ["TW"] },
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
  sbi: { countries: ["JP"] },
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
  rakutenma: { countries: ["MY"] },
  // Account page: anyone living in Japan may apply. A minor uses the minor
  // account. Foreign PEPs and US nationals cannot open. The picker is a
  // country of residence, so the country is JP.
  // https://www.paypay-sec.co.jp/account/
  paypay: { countries: ["JP"] },
  // Terms, 26 Aug 2025: a Nigerian citizen or a legal resident in Nigeria,
  // with a BVN. The picker is a country of residence, so the country is NG.
  // https://cowrywise.com/terms
  cowrywise: { countries: ["NG"] },
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
  degiro: { countries: DEGIRO },
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
  nordnet: { countries: ["SE"] },
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
  // It does not list Afghanistan, Nigeria, Venezuela or Zimbabwe. Russia is
  // on that page.
  interactivebrokers: { all: true, except: ["AF", "NG", "VE", "ZW"] },
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
  kis: { countries: ["VN"] },
  // The online form asks for a chip citizen card. A foreign investor or
  // an institution is told to call the hotline.
  // https://www.masvn.com/register
  // https://masvn.com/en/register
  mirae: { countries: ["VN"] },
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
  // The service is only for a person living in Japan. A foreign national
  // opens with a residence card. A US citizen, a green-card holder or a US
  // resident cannot open. The picker is residence, so the country is JP.
  // https://www.moomoo.com/jp/support/topic7_299
  // https://www.moomoo.com/jp/support/topic7_287
  moomoo: { countries: ["JP"] },
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
  return rows;
}
