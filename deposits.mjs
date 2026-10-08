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
  // The kit's bank line is a savings account, a current account, or an NRE
  // or NRO account. Those are rupee accounts. The client nodal accounts are
  // at Indian banks. No foreign-currency balance is named.
  // https://arrow.trade/bank-accounts
  // https://assets.arrow.trade/documents/compliance/Individual-KYC-form.pdf
  arrow: ["INR"],
  alpaca: ["USD"],
  alramz: ["AED"],
  bitpanda: ["EUR", "USD", "GBP", "CHF", "HUF", "PLN", "RON", "CZK", "SEK", "DKK"],
  boursedirect: ["EUR"],
  boursobank: ["EUR"],
  // Foreign account, FAQ on the foreign-markets page: PLN, USD, EUR, GBP.
  bossa: ["PLN", "USD", "EUR", "GBP"],
  // Four collection accounts, one per currency. A transfer into the matching
  // account is left in that currency. Paying a foreign order in zloty is a
  // conversion at KBC's mid-Reuters rate plus 0.1%. IKE and IKZE take zloty
  // only; that is another account.
  // https://www.bdm.pl/polecane/wplaty-na-rachunek-inwestycyjny
  // https://www.bdm.pl/rynki-zagraniczne
  bdm: ["PLN", "EUR", "USD", "GBP"],
  // Regulation of 27 June 2026: foreign trades settle in zlotys. The broker's
  // rate is mid-Reuters plus 0.1 %. EUR, USD and GBP belong to the paid
  // brokerage account, which is another product.
  // https://pdf.mbank.pl/mbankpl/of/gielda/emakler/regulamin_emakler_obowiazujacy_od_27.06.2026.pdf
  mBank: ["PLN"],
  // The cash account is zloty. A foreign-currency cash account is kept for
  // each currency the market order names, and that order is zloty and euro.
  // https://ipopemasecurities.pl/wp-content/uploads/2026/05/Regulaminmaklerskidlaklientowindywid_20260512.pdf
  // https://ipopemasecurities.pl/wp-content/uploads/2023/05/dkizarzadzenierynkizorganizowane171216.pdf
  ipopema: ["PLN", "EUR"],
  // A transfer to the client's RDN at BNI is the deposit, and the sale
  // proceeds land in the same account. The one-day-trade minimum is
  // printed in rupiah. No other currency is named.
  // https://help.bions.id/docs/cara-melakukan-deposit-dana-ke-rdn-bions-trading-mobile-android-ios/
  // https://help.bions.id/docs/one-day-trade/
  bni: ["IDR"],
  // The client cash account is the RDN: it pays for a purchase and receives
  // a sale. The idle balance is named in rupiah. No other currency is named.
  // https://www.brights.id/id/faq/apa-yang-dimaksud-dengan-rdn
  // https://www.brights.id/id/faq/berapa-minimum-dana-mengendap-yang-ada-di-rdn
  bri: ["IDR"],
  // A transfer to the client's CLABE at Finamex is the deposit, in pesos.
  // The peso-dollar line is a forward, not cash left in dollars. No other
  // currency is named.
  // https://www.finamex.com.mx/general/finamex-trading/
  // https://www.finamex.com.mx/servicios-de-inversion/guia-de-servicios-de-inversion
  finamex: ["MXN"],
  // The brokerage account is opened in Canadian dollars, and a US-dollar
  // account can be added and left there. A US line traded from that
  // account is not converted. Opening the US-dollar account requires the
  // Canadian one beside it.
  // https://www.disnat.com/en/platforms-and-fees/pricing
  // https://www.disnat.com/aide-contact/document-formulaire/DX01
  disnat: ["CAD", "USD"],
  // Bills payment at a Philippine bank credits pesos. An overseas
  // remittance is credited to the same account. No dollar balance is named.
  // https://www.colfinancial.com/ape/final2/home/open_an_account.asp
  // https://colfinancial.freshdesk.com/support/solutions/articles/6000054480-how-do-i-fund-my-col-account-through-online-banking-via-merchant-payment-
  col: ["PHP"],
  // The normal Independence account is funded only in lei. The Independence
  // EURO account is funded only in euro and left there. A lei account is
  // not credited in euro.
  // https://primet.ro/intrebari-frecvente
  // https://primet.ro/ce-oferim-alimentarea-contului-de-investitii
  prime: ["RON", "EUR"],
  // Cash, a check or an RCBC transfer credits one securities account.
  // Telemoney from abroad credits that same account. The fees are in
  // pesos. No other balance is named.
  // https://www.rcbcsec.com/corporate/faqs.html
  rcbc: ["PHP"],
  // A GCash top-up credits the trading wallet in pesos. A dollar deposit
  // is converted into pesos. A dollar withdrawal is paid out of that peso
  // balance. No other balance is left unconverted.
  // https://securities.abcapitalonline.com/frequently-asked-questions/
  abcapital: ["PHP"],
  // A bank transfer lands in yen. Dollars in the US-stock account are the
  // free exchange of that yen, not a currency the client deposits.
  // https://www.matsui.co.jp/service/money/deposit/
  // https://www.matsui.co.jp/us-stock/domestic/rule/
  matsui: ["JPY"],
  // A foreign-currency passbook holds one of these and leaves it there.
  // The renminbi account is printed CNY. The Hong Kong lines are quoted
  // CNH, the same unit. New Taiwan dollars are the domestic account.
  // https://www.megabank.com.tw/personal/savings/deposit-service/foreign-deposit/demand-deposit
  megabank: ["TWD", "USD", "EUR", "GBP", "AUD", "JPY", "CNY", "CNH", "HKD", "ZAR", "NZD", "SGD", "THB", "CAD", "CHF", "SEK"],
  // One foreign-currency account holds these fourteen and leaves each one
  // there. The renminbi account is printed CNY. The Hong Kong lines are
  // quoted CNH, the same unit. New Taiwan dollars are the domestic account.
  // A trade is debited in the listing currency. The client converts.
  // https://www.dbs.com.tw/treasures-zh/deposits/your-accounts/multi-currency-account
  dbs: ["TWD", "USD", "EUR", "GBP", "CAD", "AUD", "CHF", "NZD", "SGD", "CNY", "CNH", "HKD", "JPY", "THB", "SEK", "ZAR"],
  // One passbook holds these fifteen and leaves each one there. The
  // renminbi account is printed CNY. The shelf quotes it as CNH, the
  // same unit. New Taiwan dollars are the domestic account. A trade in
  // another currency is the client's conversion.
  // https://www.esunbank.com/zh-tw/personal/deposit/foreign-service/current-account
  "e.sun": ["TWD", "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "CHF", "SGD", "CNY", "CNH", "ZAR", "SEK", "HKD", "MXN", "THB", "JPY"],
  // One passbook holds these sixteen and leaves each one there. The
  // client may convert between them. That is not a conversion the
  // deposit is forced through. The page prints renminbi. The interest
  // board prints CNH and the shelf quotes CNH. New Taiwan dollars are
  // the domestic account. A stock order is debited from the
  // foreign-currency passbook, so a trade in another currency is the
  // client's conversion.
  // https://www.scsb.com.tw/content/dep/dep02_d1.jsp
  scsb: ["TWD", "USD", "JPY", "HKD", "GBP", "CHF", "AUD", "CAD", "SGD", "EUR", "SEK", "DKK", "THB", "NZD", "ZAR", "CNY", "CNH", "KRW"],
  // One passbook holds these thirteen and leaves each one there. New
  // Taiwan dollars are the domestic account. The page prints renminbi,
  // and the shelf quotes CNY. A trade is debited in the listing
  // currency. The client converts.
  // https://www.sc.com/tw/save/foreign-currency-current-account/
  // https://www.sc.com/tw/frequently-asked-questions/deposit/
  standardchartered: ["TWD", "USD", "HKD", "GBP", "AUD", "CAD", "CHF", "JPY", "EUR", "NZD", "SGD", "ZAR", "SEK", "CNY"],
  // One passbook holds these twelve and leaves each one there. The page
  // prints renminbi. The shelf quotes CNH, the same unit. New Taiwan
  // dollars are the domestic account. A trade is debited in the listing
  // currency. The client converts.
  // https://www.ubot.com.tw/foreign_deposit
  // https://www.ubot.com.tw/rates/foreign/deposit_rate
  unionbank: ["TWD", "USD", "JPY", "GBP", "AUD", "HKD", "CAD", "CNY", "CNH", "SGD", "ZAR", "CHF", "NZD", "EUR"],
  // One passbook holds these thirteen and leaves each one there. The
  // page prints renminbi. The shelf quotes CNH, the same unit. New
  // Taiwan dollars are the domestic account. A trade is debited in
  // the listing currency. The client converts.
  // https://bank.sinopac.com/sinopacBT/personal/desposit-forex/forex/demand-deposit.html
  sinopac: ["TWD", "USD", "JPY", "GBP", "AUD", "HKD", "CAD", "CNY", "CNH", "SGD", "ZAR", "CHF", "NZD", "EUR", "SEK"],
  // One passbook holds these fourteen and leaves each one there. The
  // page prints renminbi. The shelf quotes CNH, the same unit. New
  // Taiwan dollars are the domestic account. A trade is debited in
  // the listing currency. The client converts.
  // https://www.taishinbank.com.tw/TSB/personal/deposit/foreign-service/current-account/
  taishin: ["TWD", "USD", "JPY", "GBP", "AUD", "HKD", "CAD", "CNY", "CNH", "SGD", "ZAR", "CHF", "NZD", "EUR", "SEK", "THB"],
  // One passbook holds these fourteen and leaves each one there. The
  // page prints renminbi as CNY. The shelf quotes CNY. New Taiwan
  // dollars are the domestic account. A trade is debited in the
  // listing currency. The client converts.
  // https://www.ctbcbank.com/twrbo/zh_tw/dep_index/dep_product/dep_foreign_index/dep_foreign_demand.html
  ctbc: ["TWD", "USD", "JPY", "GBP", "AUD", "HKD", "CAD", "CNY", "SGD", "ZAR", "CHF", "NZD", "EUR", "SEK", "THB"],
  // Yen lands in the comprehensive account. These seven foreign currencies
  // can be paid in from a foreign-currency bank account and left as cash.
  // https://www.sbisec.co.jp/ETGate/WPLETmgR001Control?OutSide=on&getFlg=on&burl=search_home&cat1=home&cat2=service&dir=service&file=home_in_gaika.html
  sbi: ["JPY", "USD", "EUR", "AUD", "NZD", "CAD", "ZAR", "HKD"],
  // The online book settles on a SpareBank 1 bank account. A purchase is
  // debited there and a sale is credited there. The account is in kroner.
  // No other currency is named.
  // https://www.sb1markets.no/globalassets/alle-dokumenter-2025/general-terms--conditions/special-business-terms-for-trading-financial-instrument-via-online-platform-for-private-individuals.pdf
  // https://www.sparebank1.no/nb/bank/privat/sparing/investering/aksjehandel.html
  spare: ["NOK"],
  // A listed domestic share in the app settles in krónur. The worked
  // example is in ISK, and the online commission is charged in ISK.
  // A foreign-currency payment account is another product.
  // https://docs.arionbanki.is/themes/arionbanki/arionbanki/documents/05_Bankinn/Fleira/Vextir-og-verdskra/Verdskra/Verdskra-VL.pdf
  // https://docs.arionbanki.is/themes/arionbanki/arionbanki/documents/04_Markadir/Fleira/Fjarfestavernd/EN/Overview_of_Cost_and_Charges.pdf
  arion: ["ISK"],
  // A listed domestic share in the app settles in krónur. The online
  // commission and the processing fee are charged in ISK. Seeing the
  // portfolio in another currency is a display, not a cash balance.
  // A foreign-currency payment account is another product.
  // https://www.landsbankinn.is/uploads/documents/verdskra/verdskra-2026-08-25.pdf
  // https://www.landsbankinn.is/verdbrefavidskipti-a-netinu
  landsbankinn: ["ISK"],
  // Funds are added in rupees, by UPI or net banking, from the bank account
  // registered on the trading account. The pages name no other currency.
  // https://www.share.market/support/home/manage-your-funds/adding-funds/what-should-i-know-before-adding-funds-2/
  // https://www.share.market/support/home/manage-your-funds/addition-of-funds/other-related-questions/what-are-the-transaction-modes-using-which-i-can-add-funds/
  sharemarket: ["INR"],
  // Yen is the bank transfer into the comprehensive account. These five
  // can be paid in from a bank in Japan and left as cash. Pound, franc,
  // lira and rand are an IFA withdrawal, not a deposit. Hong Kong dollars,
  // yuan and the ASEAN currencies are converted into yen on the trade.
  // https://www.rakuten-sec.co.jp/web/account-flow/
  // https://www.rakuten-sec.co.jp/web/service/pay/forex_pay.html
  rakutenjp: ["JPY", "USD", "EUR", "AUD", "NZD", "CAD"],
  // A deposit is ringgit: online transfer, DuitNow, cheque or GIRO.
  // USD and HKD cannot be paid in. They appear only after converting
  // ringgit, and a withdrawal is ringgit again.
  // https://www.rakutentrade.my/faqs/foreign-equity-cash-portfolio-management/can-i-deposit-or-withdraw-funds-in-usd-or-hkd
  // https://www.rakutentrade.my/faqs/cash-deposits-and-withdrawals
  rakutenma: ["MYR"],
  // A bank transfer, PayPay Bank and PayPay Money are credited in yen and
  // left there. A US dividend arrives in dollars and is converted to yen
  // before it is credited. There is no dollar cash.
  // https://www.paypay-sec.co.jp/support/charge/
  // https://www.paypay-sec.co.jp/support/ca/
  paypay: ["JPY"],
  // A deposit and a withdrawal are naira, through a Nigerian bank account.
  // A dollar fund is bought with naira. There is no dollar cash.
  // https://help.cowrywise.com/en/articles/9148093-what-bank-can-i-use-to-receive-my-funds-on-cowrywise
  cowrywise: ["NGN"],
  // A current account can be opened in crowns, euros or dollars and the
  // money stays there. A purchase from a different currency is converted
  // at the rate in the order.
  // https://www.airbank.cz/co-vas-nejvic-zajima/cizomenove-ucty/
  // https://www.airbank.cz/file-download/4302-pravidla-provadeni-pokynu.pdf
  airbank: ["CZK", "EUR", "USD"],
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
  vanguardau: ["AUD"],
  // Key features: every investment is in pounds sterling. Terms: a withdrawal
  // to a UK bank is paid in sterling. No other currency is held.
  // https://www.vanguardinvestor.co.uk/content/dam/intl/uk-retail-direct/documents/key-features-isa-gia.pdf
  // https://www.vanguardinvestor.co.uk/content/dam/intl/uk-retail-direct/documents/vanguard-client-terms-conditions-feb-2025.pdf
  vanguarduk: ["GBP"],
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
  // A pay-in by NEFT, RTGS or IMPS goes to a client bank account in India
  // and is credited in rupees. No other currency is left unconverted.
  // https://profitmart.in/bank-details/
  profitmart: ["INR"],
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
  // The FAQ offers a resident account and an NRI account. The cash segment
  // settles in rupees. The page names no foreign-currency balance.
  // https://www.definedgesecurities.com/
  definedge: ["INR"],
  easybourse: ["EUR"],
  easyequities: ["ZAR", "USD", "AUD", "GBP", "EUR"],
  efocs: ["EUR"],
  // The open Global Trader account is one euro account. BG Trader shows the same.
  elana: ["EUR"],
  firstrade: ["USD"],
  // Terms: every payment in and out is sterling. The international-shares
  // page says no other currency is held. A foreign receipt is converted
  // into pounds, so it is not a deposit currency.
  // https://www.fidelity.co.uk/international-shares/
  // https://www.fidelity.co.uk/media/PI%20UK/pdf/legal/fidelity-client-terms.pdf
  fidelity: ["GBP"],
  // The account holds sterling only. A payment in, a dividend or a deal in
  // another currency is converted into pounds. That conversion is not a
  // deposit the client can leave as cash.
  // https://www.ajbell.co.uk/faq/can-i-hold-foreign-currency-my-account
  // https://www.ajbell.co.uk/faq/how-can-i-pay-money-my-account
  ajbell: ["GBP"],
  // A UK share settles in pounds. A US share settles in pounds too: the
  // order is a CDI, and the 0.95% FX converts the dollars. A dividend in
  // another currency is credited in pounds. Cash added from the nominated
  // bank is left in sterling.
  // https://www.bestinvest.co.uk/help/dealing
  // https://www.bestinvest.co.uk/us-shares
  // https://www.bestinvest.co.uk/help/adding-and-withdrawing-money
  bestinvest: ["GBP"],
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
  // Explore: the share range is traded in sterling, and there is one platform
  // cash account. A dollar price on a London line is the quote, not a balance
  // left in dollars.
  // https://www.willisowen.co.uk/explore/
  willisowen: ["GBP"],
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
  // A deposit is credited in the currency of the method and left there.
  // Sending another currency to that account is returned, not converted.
  // US residents can deposit dollars only. Texas and New Hampshire cannot
  // hold euros. The nine below are the methods on the cash page.
  // https://support.kraken.com/articles/360000381846-cash-deposit-options-fees-minimums-and-processing-times-
  // https://support.kraken.com/articles/where-is-kraken-licensed-or-regulated
  kraken: ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "ARS", "BRL", "MXN"],
  // A peso transfer from a Chilean bank is credited in pesos and left there.
  // A dollar deposit is credited in the dollar wallet and left there.
  // Pesos become dollars only if that wallet is set as the main one, or at
  // the moment of a US or crypto trade.
  // https://help.zestyfinance.com/es/articles/15937626-como-puedo-depositar-en-la-app
  zesty: ["CLP", "USD"],
  questrade: ["USD", "CAD"],
  quantfury: ["USD", "EUR", "GBP", "CHF", "TRY", "BRL", "MXN", "CLP", "COP", "ARS"],
  revolut: ["EUR", "USD"],
  // Support, 22 Jul 2026: only a resident Indian can open an account.
  rupeezy: ["INR"],
  // Funds are added by UPI or from a linked bank account, in rupees. The
  // page names no foreign-currency balance.
  // https://www.sahi.com/faq/adding-transfer-money/how-can-i-transfer-funds-to-my-sahi-account
  // https://www.sahi.com/faq/adding-transfer-money/what-is-the-maximum-amount-i-can-add-to-my-sahi-account-in-a-single-transfer
  sahi: ["INR"],
  // Indian cash is added by UPI or net banking and left in rupees. Dollars
  // in the US wallet are the bank's exchange of those rupees, not a
  // currency the client deposits.
  // https://www.indmoney.com/us-stocks
  // https://www.indmoney.com/blog/us-stocks/how-to-transfer-money-to-your-us-stocks-account
  indmoney: ["INR"],
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
  // Sale proceeds are paid into the ZSE Direct wallet. A deposit arrives by
  // Zipit, RTGS or EcoCash and is left there. Dollars are VFEX Direct, a
  // separate platform.
  // https://seczim.co.zw/capital-markets-in-zimbabwe/
  // https://www.zse.co.zw/zse-direct-terms-and-conditions/
  zsedirect: ["ZWG"],
  // A transfer to the client's virtual account at a linked Vietnamese
  // bank, or a QR from any Vietnamese bank, is credited to the securities
  // cash account and left there. The sheets name no other currency.
  // https://hdsd.dnse.com.vn/huong-dan-giao-dich-tien/huong-dan-nop-tien
  dnse: ["VND"],
  // A transfer to the virtual account at BIDV, a QR, or one of the
  // Vietnamese collection accounts is credited to the securities cash
  // account and left there. The sheets name no other currency. The
  // foreign-investor line at Vietcombank is the same dong account, so a
  // wire in another currency is converted before it is cash.
  // https://kisvn.vn/danh-sach-tai-khoan-tong
  // https://kisvn.vn/ho-tro/nop-tien
  kis: ["VND"],
  // A QR payment into Mirae Asset's account at BIDV is credited to the
  // securities cash account, the ordinary sub-account or the margin one,
  // and left there. The sheet names no other currency.
  // https://masvn.com/cate/nop-tienchuyen-tien-890
  mirae: ["VND"],
  // A linked BIDV securities account is credited in dong and left there.
  // A foreign investor's indirect-investment account is opened at a bank
  // that converts the wire before the cash is dong. The sheets name no
  // other currency that stays unconverted.
  // https://www.bsc.com.vn/lien-ket-tai-khoan-tien-ngan-hang/
  // https://www.bsc.com.vn/en/open-trading-account/
  bsc: ["VND"],
  // The Iraqi individual contract funds the account in dinar, by a cheque
  // from a central-bank bank or in cash. Zain Cash is the same dinar. A
  // non-Iraqi who wires from a foreign bank is paid back into that bank
  // account; the contract does not leave another currency as cash.
  // https://rs.iq/wp-content/uploads/2026/03/RS-Contract-Individual_-ARABIC.pdf
  // https://rs.iq/
  rabee: ["IQD"],
  // A transfer into one of VPS's Vietnamese bank accounts is credited to
  // the securities cash account and left there. The sheet names no other
  // currency. A foreign investor's indirect investment account is a dong
  // account, so a wire in another currency is converted before it is cash.
  // https://smartone.vps.com.vn/Templates/Huong_dan_nop_tien_tai_khoan_chung_khoan.pdf
  vps: ["VND"],
  // A transfer into one of the six collection accounts, or the VIB
  // identification account, is credited in dong and left there. The sheet
  // names no other currency. A foreign investor's indirect investment
  // account is a dong account, so a wire in another currency is converted
  // before it is cash.
  // https://pinetree.vn/en/post/dich-vu/deposit/
  pinetree: ["VND"],
  // A QR payment, a linked Vietnamese bank, or the VND01 account at BIDV
  // is credited to the securities cash account and left there. The sheets
  // name no other currency. A non-resident is sent to an indirect
  // investment account, which is a dong account, so a wire in another
  // currency is converted before it is cash.
  // https://support.vndirect.com.vn/hc/vi/articles/40896126440985
  // https://support.vndirect.com.vn/hc/en-us/articles/29870967103641
  vndirect: ["VND"],
  // A transfer into one of the Vietnamese bank accounts is credited to the
  // securities cash account and left there. The sheet names no other currency.
  // https://www.vietcap.com.vn/huong-dan-chung/ngan-hang-chi-nhanh-ho-chi-minh
  vietcap: ["VND"],
  // A transfer to the BIDV account printed on the sheet, or a QR from a
  // Vietnamese bank, is credited to the securities cash account and left
  // there. The sheet names no other currency.
  // https://www.ssi.com.vn/khach-hang-ca-nhan/huong-dan-nop-tien
  ssi: ["VND"],
  // A transfer to the euro clearing account is credited and left there.
  // The price list prices that one account. A coupon in another currency
  // is credited in euros unless the customer already holds an account in
  // that currency, and no such account is offered.
  // https://www.visualvest.de/wissen/faq
  visualvest: ["EUR"],
  // Yen can be paid in by a realtime transfer or a bank transfer and left
  // as yen. Dollars can be paid in by a bank transfer from a bank in Japan
  // and left as dollars. No other currency can be paid in.
  // https://www.moomoo.com/jp/manual/topic-deposit-withdrawal-12-78
  // https://www.moomoo.com/jp/support/topic7_81
  moomoo: ["JPY", "USD"],
  // Rupiah lands by a BCA transfer, a virtual account, an e-wallet or
  // QRIS and is left in rupiah. Dollars land by a USD transfer into the
  // USD balance and are left in dollars. The minimum is $10,000. Pluang
  // charges nothing on that transfer. Converting rupiah into dollars is
  // a separate 0.25% fee, so it is not a deposit.
  // https://pluang.com/biaya/biaya-lainnya
  // https://pluang.com/faq/top-up/usd-direct-deposit/langkah-langkah-top-up-deposit-menggunakan-usd-direct-pada-aplikasi-pluang
  pluang: ["IDR", "USD"],
  // Cash that can be paid in and left: euro, dollar, pound, Australian
  // dollar, Norwegian krone, Canadian dollar, yen. A franc, a Danish
  // krone or a Swedish krona is not one of those balances. A fixed-term
  // deposit is not this cash.
  // https://www.medirect.com.mt/pay/account/
  medirect: ["EUR", "USD", "GBP", "AUD", "NOK", "CAD", "JPY"],
  // The KYC offers a resident account and an NRI account (NRE or NRO). Both are rupees.
  zebu: ["INR"],
  // A dirham account and a convertible-dirham account are both dirhams.
  // The foreign-currency account leaves a transfer in euro, dollar, Swiss
  // franc, pound or Canadian dollar. Any other currency is "nous consulter",
  // so it is not a published balance. The securities account is attached
  // to one of these and does not convert the deposit.
  // https://www.cfgbank.com/particuliers/notre-offre/banque-quotidien/les-comptes/
  // https://www.cfgbank.com/wp-content/uploads/2024/01/LIVRET-TARIFICATION-JANVIER-2024.pdf
  cfgbank: ["MAD", "EUR", "USD", "CHF", "GBP", "CAD"],
  // The agency opens a cash account beside the securities account. The
  // minimum is 500 dirhams, paid by cheque, cash or a transfer. The FAQ
  // names no other currency.
  // https://www.wafabourse.com/fr/faq
  wafabourse: ["MAD"],
  // The cheque account and the convertible-dirham account are dirhams.
  // A foreign-currency account exists, and the guide does not name its
  // currencies, so they are not listed.
  // https://www.cihbank.ma/particuliers/nos-offres/gerer-mes-comptes
  // https://www.cihbank.ma/themes/ciht/pdf/Tarification_particuliers_VF.pdf
  cih: ["MAD"],
  // An Australian resident settles in a Macquarie cash management account.
  // A non-resident sends money through OFX into the Openmarkets trust
  // account, which the guide says is in Australian dollars. A transfer
  // in another currency is a conversion at OFX.
  // https://marketech.com.au/financial-services-guide/
  // https://marketech.com.au/focus/pricing/
  marketech: ["AUD"],
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
