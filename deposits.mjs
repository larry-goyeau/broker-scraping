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
  // Yen lands in the comprehensive account. These seven foreign currencies
  // can be paid in from a foreign-currency bank account and left as cash.
  // https://www.sbisec.co.jp/ETGate/WPLETmgR001Control?OutSide=on&getFlg=on&burl=search_home&cat1=home&cat2=service&dir=service&file=home_in_gaika.html
  sbi: ["JPY", "USD", "EUR", "AUD", "NZD", "CAD", "ZAR", "HKD"],
  // Yen is the bank transfer into the comprehensive account. These five
  // can be paid in from a bank in Japan and left as cash. Pound, franc,
  // lira and rand are an IFA withdrawal, not a deposit. Hong Kong dollars,
  // yuan and the ASEAN currencies are converted into yen on the trade.
  // https://www.rakuten-sec.co.jp/web/account-flow/
  // https://www.rakuten-sec.co.jp/web/service/pay/forex_pay.html
  rakuten: ["JPY", "USD", "EUR", "AUD", "NZD", "CAD"],
  // The Cash Wallet is funded by bank transfer or Osko from an Australian
  // bank account. The PDS states every amount in Australian dollars.
  // https://www.betashares.com.au/direct/faq
  // https://public-files.wealth.betashares.com.au/legal/product-disclosure-statement.pdf
  betashares: ["AUD"],
  // AU Cash is funded by PayID or an Australian bank transfer and stays in
  // AUD. US Cash takes an ACH or a wire from a US bank and stays in USD.
  // Buying a US share out of AUD cash converts; that conversion is not a
  // deposit.
  // https://pearler.com/help/transactions/5035921-how-do-i-make-deposits-into-pearler-to-be-invested
  // https://pearler.com/help/transactions/5155285-what-cash-accounts-do-i-have-on-pearler
  pearler: ["AUD", "USD"],
  // The cash account takes Australian dollars from an Australian bank
  // account and leaves them in dollars. No other currency is accepted.
  // https://fund-docs.vanguard.com/AU-Vanguard_Personal_Investor_Guide_Part_A.pdf
  vanguard: ["AUD"],
  // Rupees added by UPI, net banking or a bank transfer stay in the stock
  // balance. Dollars sent to Apex Clearing stay in the US-stocks balance.
  // Changing rupees into dollars is a conversion, not a deposit.
  // https://groww.in/help/payments-&-withdrawals/deposit/how-do-i-add-transfer-money-to-groww-balance--13
  // https://groww.in/help/us-stocks/funding-usd-balance/what-is-apex-clearing--is-it-safe-to-transfer-money-to-them--51
  groww: ["INR", "USD"],
  // A pay-in from the linked bank, by UPI or a transfer, is credited to the
  // rupee ledger. An NRE or NRO account is also rupees. No other currency
  // is left unconverted.
  // https://www.nuvamawealth.com/cas/pdf/Xtreme-Trader-Guide.pdf
  // https://www.nuvamawealth.com/ewwebimages/webfiles/disclaimer/KYC-Individual.pdf
  nuvama: ["INR"],
  // A pay-in by UPI or a bank transfer is credited in rupees. An NRE or NRO
  // transfer is also rupees. No other currency is left unconverted.
  // https://choiceindia.com/blog/how-to-transfer-money-from-a-demat-account-to-a-bank-account
  // https://choiceindia.com/nri-demat-account
  choice: ["INR"],
  // A pay-in by UPI, net banking, IMPS, NEFT or RTGS is credited to the
  // rupee trading ledger. No other currency is left unconverted.
  // https://www.mstock.com/pricing
  // https://www.mstock.com/articles/how-to-transfer-money-from-demat-account-to-bank-account
  "m.stock": ["INR"],
  // A pay-in by UPI, net banking, IMPS, NEFT or RTGS is an INR transfer
  // from an Indian bank account. An NRE or NRO transfer is also rupees.
  // An international remittance is not accepted.
  // https://aliceblueonline.com/support/adding-funds-fund-deposit
  // https://aliceblueonline.com/support/failed-transactions-issues
  aliceblue: ["INR"],
  // A pay-in by UPI, the payment gateway, NEFT, RTGS or a cheque comes from
  // the registered bank account and is credited in rupees. An NRE or NRO
  // transfer is also rupees. No other currency is left unconverted.
  // https://www.arihantcapital.com/fund-transfer
  arihant: ["INR"],
  // A pay-in comes from a bank account registered with GoPocket, by the
  // payment gateway, NEFT, RTGS or IMPS, into an HDFC or ICICI nodal
  // account. It is credited in rupees. No other currency is left unconverted.
  // https://www.gopocket.in/funds-policy
  gopocket: ["INR"],
  // A pay-in by UPI or net banking is credited in rupees. The account must
  // be an Indian savings account. An NRI bank account is not accepted.
  // https://tradesmartonline.in/open-demat-account/
  // https://tradesmartonline.in/help/demat-account-queries/which-documents-are-required-to-be-attached-with-the-account-opening-form/
  tradesmart: ["INR"],
  // A deposit in one of these twelve is credited to that currency's cash
  // account and left there. The cash page calls the renminbi account CNH.
  // https://secure.fundsupermart.com/fsm/advice-services/faq/0/9021/
  // https://fsm.global/sg/cash
  FSMOne: ["SGD", "USD", "AUD", "CAD", "EUR", "GBP", "CNH", "HKD", "NZD", "JPY", "CHF", "MYR"],
  // Won is the cash account. Dollars can be transferred in through the Hana
  // virtual account and left as dollars.
  // https://www.yna.co.kr/view/AKR20241230044400008
  toss: ["KRW", "USD"],
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
  // Online terms: a deposit, transfer, dividend or corporate-action payment
  // that is not in pounds is converted into sterling, plus a 1% spread.
  // https://www.hl.co.uk/__data/assets/pdf_file/0015/37122/Online-Ts-and-Cs.pdf
  hargreaveslansdown: ["GBP"],
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
  // A payment that stays as cash is francs. The account is at
  // Hypothekarbank Lenzburg, and every neon invest line is already a
  // BX Swiss price in CHF, so nothing is converted on the way in.
  // https://www.neon-free.ch/en/faq/why-are-the-prices-for-shares-and-etfs-displayed-in-chf-in-the-app
  neon: ["CHF"],
  // A pay-in is K-net, or a transfer from the client's account at the
  // bank, and the opening minimum is KD 1,000. Dollars, pounds and euros
  // on the fee sheet are a transfer into that market, done with customer
  // service, so they are a conversion. Cash the account already holds in
  // another currency is a sale proceed.
  // https://boubyancapital.com/who-we-are/news/global-stock-markets-pr/
  // https://boubyancapital.com/media/filer_public/b8/45/b8450fda-4958-44f5-813c-3323ddee73f6/china_market_web-a2.pdf
  boubyan: ["KWD"],
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
