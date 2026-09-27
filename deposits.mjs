// Currencies a broker can take as a deposit and leave unconverted: the cash
// the account already holds. A wire in any other currency is a conversion,
// so it is not listed. Each set is copied from that broker's *_cost.mjs,
// not from a guess about what the account might open.
//
// Where several companies share a folder, `byPlan` is the cash of the row
// the page actually shows. A plan omitted here uses the folder list.

const FOLDER = {
  // The trips on file are a USD account. The base is the client's choice
  // and no other base is named.
  "5paisa": ["INR"],
  admiral: ["USD"],
  angelone: ["INR"],
  alpaca: ["USD"],
  alramz: ["AED"],
  bitpanda: ["EUR", "USD", "GBP", "CHF", "HUF", "PLN", "RON", "CZK", "SEK", "DKK"],
  boursedirect: ["EUR"],
  boursobank: ["EUR"],
  // Foreign account, FAQ on the foreign-markets page: PLN, USD, EUR, GBP.
  bossa: ["PLN", "USD", "EUR", "GBP"],
  // Regulation of 27 June 2026: foreign trades settle in zlotys. The broker's
  // rate is mid-Reuters plus 0.1 %. EUR, USD and GBP belong to the paid
  // brokerage account, which is another product.
  // https://pdf.mbank.pl/mbankpl/of/gielda/emakler/regulamin_emakler_obowiazujacy_od_27.06.2026.pdf
  mBank: ["PLN"],
  // A bank transfer lands in yen. Dollars in the US-stock account are the
  // free exchange of that yen, not a currency the client deposits.
  // https://www.matsui.co.jp/service/money/deposit/
  // https://www.matsui.co.jp/us-stock/domestic/rule/
  matsui: ["JPY"],
  bunq: ["EUR"],
  bux: ["EUR"],
  century: ["EUR"],
  choicetrade: ["USD"],
  davy: ["EUR"],
  degiro: ["EUR"],
  // US stocks are funded by an INR transfer under LRS. The dollars are the
  // conversion, not a currency the client can deposit and leave as cash.
  dhan: ["INR"],
  easybourse: ["EUR"],
  easyequities: ["ZAR", "USD", "AUD", "GBP", "EUR"],
  efocs: ["EUR"],
  // The open Global Trader account is one euro account. BG Trader shows the same.
  elana: ["EUR"],
  firstrade: ["USD"],
  // Terms 10.3 and 11.8: the linked bank account and every deposit are pounds.
  // Help, 28 Mar 2024: cash can be held in GBP only.
  freetrade: ["GBP"],
  // Costs: the account deals in sterling and FX is free because every line
  // is already in pounds. Funding comes from a UK current account.
  // https://investengine.com/costs/
  // https://help.investengine.com/hc/en-gb/articles/31146506884893-How-do-I-add-funds
  investEngine: ["GBP"],
  // Help: every booking lands in euro on the settlement account. A payment
  // in another currency is converted to euro by Baader Bank.
  // https://support.finanzen-zero.net/hc/de/articles/36630083344157
  finanzen: ["EUR"],
  // Resident account, and an NRI account funded from NRE or NRO. Both are rupees.
  firstock: ["INR"],
  fortuneo: ["EUR"],
  fyers: ["INR"],
  freedom24: ["EUR", "USD"],
  ig: ["EUR"],
  labanquepostale: ["EUR"],
  // The account holds kronor. A foreign line is converted, so USD and EUR
  // are not cash the client can leave sitting.
  levler: ["SEK"],
  N26: ["EUR"],
  oanda: ["EUR", "PLN", "CZK", "RON", "USD"],
  // Communiqué 15/1 of 2 March 2026, point 2: a foreign trade settles in PLN
  // or in the listing currency. Those are the cash the account can hold.
  // https://www.bm.pkobp.pl/api/public/994a8c6c-d442-47a1-bded-4eb0d5a361a4.pdf
  pkobp: ["PLN", "EUR", "USD", "CHF", "GBP", "NOK", "HUF", "SEK", "CZK", "DKK"],
  // Account page: the account can invest in PLN and nine foreign currencies.
  // https://www.pekao.com.pl/biuro-maklerskie/nowy-klient/rachunek-inwestycyjny-w-bm-pekao.html
  pekao: ["PLN", "EUR", "USD", "GBP", "CHF", "CAD", "AUD", "SEK", "NOK", "DKK"],
  // Foreign-markets page: the brokerage account holds PLN and six foreign
  // currencies. A payment in one of them lands on that currency's sub-account.
  // https://www.aliorbank.pl/biuro-maklerskie/gielda/rynki-zagraniczne.html
  alior: ["PLN", "USD", "EUR", "GBP", "NOK", "SEK", "DKK"],
  // Account-opening criteria: Indian nationality. The linked bank account is rupees.
  pocketful: ["INR"],
  // Resident account, and an NRI account (NRE or NRO), including a US or Canadian tax resident. Both are rupees.
  prostocks: ["INR"],
  questrade: ["USD", "CAD"],
  quantfury: ["USD", "EUR", "GBP", "CHF", "TRY", "BRL", "MXN", "CLP", "COP", "ARS"],
  revolut: ["EUR", "USD"],
  // Support, 22 Jul 2026: only a resident Indian can open an account.
  rupeezy: ["INR"],
  sarwa: ["USD"],
  saxo: ["USD", "CAD", "EUR", "GBP", "NOK", "PLN", "CZK", "MYR", "CHF", "DKK", "SEK", "ZAR", "JPY", "HKD", "CNH", "SGD", "AUD"],
  scalablecapital: ["EUR"],
  shoonya: ["INR"],
  siebert: ["USD"],
  sogotrade: ["USD"],
  tastytrade: ["USD"],
  thndr: ["EGP", "USD", "AED"],
  bhmuae: ["AED", "USD"],
  tiger: ["USD", "HKD", "SGD", "AUD", "CNH"],
  traderepublic: ["EUR"],
  tradestation: ["USD"],
  tradeup: ["USD"],
  tradezero: ["USD"],
  tradier: ["USD"],
  trading212: ["GBP", "USD", "EUR", "CHF", "DKK", "NOK", "PLN", "SEK", "CZK", "RON", "HUF", "CAD", "AUD"],
  vested: ["USD"],
  vivid: ["EUR"],
  // Settlement currencies on the card. Conversion is a separate order, so a
  // balance in one of these is not converted when it arrives.
  interactivebrokers: ["AED", "AUD", "BRL", "CAD", "CHF", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "ILS", "INR", "JPY", "KRW", "MXN", "MYR", "NOK", "PLN", "RON", "SAR", "SEK", "SGD", "TWD", "USD"],
  lynx: ["AED", "AUD", "CAD", "CHF", "CNH", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "ILS", "JPY", "MXN", "NOK", "PLN", "RUB", "SEK", "SGD", "USD"],
  mexem: ["AUD", "CAD", "CHF", "CNH", "DKK", "EUR", "GBP", "HKD", "HUF", "ILS", "JPY", "MXN", "NOK", "PLN", "SEK", "SGD", "USD"],
  captrader: ["AUD", "CAD", "CHF", "CNH", "EUR", "GBP", "HKD", "HUF", "ILS", "JPY", "MXN", "NOK", "PLN", "RUB", "SEK", "SGD", "USD"],
  WHSelfInvest: ["AUD", "CAD", "CHF", "EUR", "GBP", "HKD", "JPY", "MXN", "NOK", "USD"],
  zerodha: ["INR"],
  // The KYC offers a resident account and an NRI account (NRE or NRO). Both are rupees.
  zebu: ["INR"],
};

const BY_PLAN = {
  etoro: {
    us: ["USD"],
    standard: ["USD", "GBP", "EUR", "AUD", "DKK"],
    anz: ["USD", "GBP", "EUR", "AUD", "DKK"],
    uk: ["USD", "GBP", "EUR", "AUD", "DKK"],
  },
  lightyear: {
    eu: ["EUR", "USD", "GBP", "HUF"],
    uk: ["EUR", "USD", "GBP"],
  },
  plum: {
    basic: ["GBP"],
    plus: ["GBP"],
    boost: ["GBP"],
    max: ["GBP"],
    eu: ["EUR"],
    pro: ["EUR"],
    "eu-boost": ["EUR"],
    premium: ["EUR"],
    "eu-max": ["EUR"],
  },
  robinhood: {
    us: ["USD"],
    uk: ["GBP", "USD"],
    eu: ["EUR"],
  },
  swissquote: {
    ch: ["AUD", "CAD", "CHF", "EUR", "GBP", "USD"],
    lu: ["EUR"],
  },
  webull: {
    us: ["USD"],
    "uk-go": ["GBP"],
    "uk-meridian": ["GBP"],
    eu: ["EUR"],
    sg: ["USD", "SGD"],
    ca: ["CAD", "USD"],
    au: ["AUD"],
    hk: ["HKD", "USD"],
  },
  xtb: {
    sa: ["PLN", "EUR", "USD"],
    uk: ["GBP", "EUR", "USD"],
    cy: ["EUR", "USD"],
    mena: ["USD"],
    int: ["USD"],
  },
};

function listOf(folder, plan) {
  const by = BY_PLAN[folder];
  const id = String(plan || "");
  if (by && id && by[id]) return by[id];
  if (by && id.endsWith("-ultra") && by[id.replace(/-ultra$/, "")]) return by[id.replace(/-ultra$/, "")];
  if (by && !id) {
    const all = new Set();
    for (const row of Object.values(by)) for (const ccy of row) all.add(ccy);
    return [...all];
  }
  return FOLDER[folder] || [];
}

export function splitByPlan(folder) {
  return Object.prototype.hasOwnProperty.call(BY_PLAN, folder);
}

/** True when this row can hold `dep` without converting it. Empty `dep` holds everyone. */
export function depositHas(folder, plan, dep) {
  const code = String(dep || "").trim().toUpperCase();
  if (!code) return true;
  return listOf(folder, plan).includes(code);
}

export function currencyOptions() {
  const all = new Set();
  for (const row of Object.values(FOLDER)) for (const ccy of row) all.add(ccy);
  for (const plans of Object.values(BY_PLAN)) {
    for (const row of Object.values(plans)) for (const ccy of row) all.add(ccy);
  }
  return [...all].sort().map((code) => ({ code }));
}
