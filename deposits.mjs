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
  // The RDN is rupiah and settles Indonesian shares. The USD pocket
  // settles US shares and options and is left in dollars. Moving rupiah
  // into that pocket is a conversion. A direct dollar transfer is not.
  // https://ajaib.co.id/pusat-bantuan/cash/apa-perbedaan-rdn-rekening-alpha-idr-rekening-alpha-usd-dan-tabungan-ajaib
  // https://ajaib.co.id/rekening-usd
  // https://ajaib.co.id/usd-otc
  ajaib: ["IDR", "USD"],
  // Invest.MT5 "Account Balance Currencies … EUR, USD, RON", chosen at
  // opening; several accounts in different base currencies may be held. A
  // deposit in another currency "will be converted to the base currency".
  // https://admiralmarkets.com/start-trading/account-types
  // https://admiralmarkets.com/start-trading/deposits-and-withdrawals
  admiralcy: ["EUR", "USD", "RON"],
  // A cheque or an interbank transfer from the client's own account lands
  // in a rupee client account. The Roshan equity account is a rupee
  // account, funded by a remittance that is converted on the way in.
  // A dollar price on the commodity desk is converted at the State Bank
  // rate. No dollar balance is left.
  // https://www.akdsl.com/Files/Equities/FUNDS_TRANSFER_PROCEDURE.pdf
  // https://akdsl.com/Services/RDA
  akd: ["PKR"],
  // Raast from a bank in Pakistan lands in the brokerage account in
  // rupees. Nafa takes the same transfer, and the order is entered in
  // rupees. A non-resident funds a Roshan equity account, and that
  // remittance is converted on the way in. No dollar balance is left.
  // https://chasesecurities.com/raast-integration/
  // https://nafa.com.pk/
  // https://chasesecurities.com/open-your-account/
  chase: ["PKR"],
  // An NPSB transfer from the client's own bank lands in the taka
  // account at Motijheel. The FAQ asks for the value of the shares
  // plus the commission, in taka. A branch takes cash in taka. No
  // dollar balance is left.
  // https://www.lbsbd.com/Platforms?platform=ibroker&tab=open-bo-account
  // https://www.lbsbd.com/Faq
  lankabangla: ["BDT"],
  // A BEFTN transfer lands in the portfolio account. The named banks
  // are Standard Chartered, BRAC and EXIM, all in Dhaka. No foreign
  // currency account is named.
  // https://idlc.com/securities/knowledgebase/faq
  idlc: ["BDT"],
  // A transfer lands in the rupee account at Seylan Bank, Millennium
  // branch, in the name of Capital Alliance Securities. JustPay moves
  // rupees from the client's bank, up to 150,000 a time. The cash
  // balance in Atrad is that same money. No foreign-currency account
  // is named.
  // https://cal.lk/equities/
  capitalalliance: ["LKR"],
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
  // A bills payment, Instapay, PESONet or an e-wallet credit stays pesos.
  // A dollar deposit into the dollar-securities account stays dollars.
  // The two accounts do not convert into each other. A bank transfer fee
  // is not a conversion.
  // https://new.bpitrade.com/fund-your-account/
  // https://new.bpitrade.com/faq/i-have-received-an-email-confirmation-that-my-dds-account-has-been-approved-how-do-i-fund-my-account/
  bpi: ["PHP", "USD"],
  // InstaPay, PESONet and a bills payment credit the cash account. Those
  // rails are pesos. No dollar balance is named.
  // https://dragonfi.ph/contact-us
  dragonfi: ["PHP"],
  // A Pix transfer, or the Santander current account, credits the
  // brokerage account. Guarantees are preferably in the national currency.
  // No dollar balance is named.
  // https://blog.toroinvestimentos.com.br/investimentos/plataforma-aberta-de-investimentos/
  // https://cdn.toroinvestimentos.com.br/corretora/documents/contrato-de-intermediacao-e-custodia-toro-investimentos.pdf
  toro: ["BRL"],
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
  dbstw: ["TWD", "USD", "EUR", "GBP", "CAD", "AUD", "CHF", "NZD", "SGD", "CNY", "CNH", "HKD", "JPY", "THB", "SEK", "ZAR"],
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
  standardcharteredtw: ["TWD", "USD", "HKD", "GBP", "AUD", "CAD", "CHF", "JPY", "EUR", "NZD", "SGD", "ZAR", "SEK", "CNY"],
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
  sinopactw: ["TWD", "USD", "JPY", "GBP", "AUD", "HKD", "CAD", "CNY", "CNH", "SGD", "ZAR", "CHF", "NZD", "EUR", "SEK"],
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
  sbijp: ["JPY", "USD", "EUR", "AUD", "NZD", "CAD", "ZAR", "HKD"],
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
  // Yen is the securities-account transfer. Dollars are paid into a
  // separate foreign-currency account and withdrawn in dollars. Any other
  // currency is sent back.
  // https://www.click-sec.com/corp/guide/nskin/deposit.html
  // https://www.click-sec.com/corp/guide/foreign_currency/nskin/
  gmoclick: ["JPY", "USD"],
  // A deposit is ringgit: online transfer, DuitNow, cheque or GIRO.
  // USD and HKD cannot be paid in. They appear only after converting
  // ringgit, and a withdrawal is ringgit again.
  // https://www.rakutentrade.my/faqs/foreign-equity-cash-portfolio-management/can-i-deposit-or-withdraw-funds-in-usd-or-hkd
  // https://www.rakutentrade.my/faqs/cash-deposits-and-withdrawals
  rakutenmy: ["MYR"],
  // A bank transfer, PayPay Bank and PayPay Money are credited in yen and
  // left there. A US dividend arrives in dollars and is converted to yen
  // before it is credited. There is no dollar cash.
  // https://www.paypay-sec.co.jp/support/charge/
  // https://www.paypay-sec.co.jp/support/ca/
  paypay: ["JPY"],
  // Yen is a bank transfer into the securities account and is left in yen.
  // These nine can be paid in from an SBI Shinsei account and left as cash.
  // A dollar wire of at least 10,000 is the same dollar balance. The lira
  // is printed トリコリラ. Hong Kong dollars are a conversion of yen.
  // https://info.monex.co.jp/service/deposit/bank.html
  // https://faq.monex.co.jp/faq/show/1203?site_domain=default
  // https://info.monex.co.jp/service/payment/shinsei/index.html
  monexjp: ["JPY", "USD", "EUR", "AUD", "NZD", "CNY", "TRY", "ZAR", "CAD", "GBP"],
  // A pay-in by UPI, net banking, NEFT, IMPS or RTGS comes from the linked
  // Indian bank and is credited in rupees. An NRE, NRO or NRI account
  // cannot be added. No other currency is left unconverted.
  // https://www.paytmmoney.com/blog/reality-check-why-you-cant-use-credit-cards-for-stocks-investing/
  // https://www.paytmmoney.com/blog/ready-trade-verify-bank-account-first/
  paytmmoney: ["INR"],
  // The 3-in-1 account allocates cash from the linked ICICI Bank savings
  // account. An NRI account allocates from an NRE or an NRO account. Those
  // are rupee accounts. A remittance from abroad, or a transfer out of an
  // FCNR account, is credited in rupees. Global Invest is an LRS conversion,
  // not a balance left in the foreign currency.
  // https://www.icicidirect.com/open-a-demat-account
  // https://www.icicidirect.com/faqs/nri-account/i-want-to-buy-shares-but-i-do-not-have-any-money-in-my-bank-account-what-do-i-do
  icici: ["INR"],
  // Add funds is UPI or net banking from the client's own Indian bank, and
  // the money is credited in rupees. An NRI account is linked to an NRE or
  // an NRO account. A foreign-currency deposit into those accounts is
  // converted into rupees. Global Investing is an LRS conversion, not a
  // balance left in dollars.
  // https://hdfcsky.com/blogs/share-market/sebi-validated-upi-framework-enhanced-security-for-hdfc-sky-customers-with-advanced-upi-verification
  // https://hdfcsky.com/sky-learn/demat-account/what-is-an-nro-account
  // https://hdfcsky.com/global-investing
  hdfcsky: ["INR"],
  // Add funds blocks rupees in the client's own savings account, through
  // the SEBI UPI handle, or takes them by net banking. An NRI account is
  // linked to an NRE or an NRO account. A foreign-currency deposit into
  // those accounts is converted into rupees.
  // https://beta.iiflcapital.com/demat
  // https://www.indiainfoline.com/knowledge-center/demat-account/eligibility-criteria-to-open-demat-account
  iifl: ["INR"],
  // A deposit is credited in Hong Kong dollars, dollars, offshore yuan or
  // yen and stays in that currency until the client exchanges it. Singapore
  // dollars and won can be exchanged into, and are not a deposit.
  // https://www.futuhk.com/en/support/topic2_30
  // https://www.futuhk.com/en/support/topic2_83
  futuhk: ["HKD", "USD", "CNH", "JPY"],
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
  // Nigeria and Ghana each have a local wallet and a dollar wallet. A naira
  // or cedi deposit is left in the local wallet. A dollar card or a dollar
  // wire is left in the dollar wallet. Moving local cash into the dollar
  // wallet is a conversion. South Africa funds by card and the partner
  // converts that money; no rand balance is left.
  // https://faq.investbamboo.com/en/articles/6881975-what-is-the-ngn-ghs-wallet
  // https://faq.investbamboo.com/en/articles/6888706-what-payment-options-are-available
  // https://investbamboo.co.za/
  bamboo: ["NGN", "GHS", "USD"],
  // AU Cash is funded by PayID or an Australian bank transfer and stays in
  // AUD. US Cash takes an ACH or a wire from a US bank and stays in USD.
  // Buying a US share out of AUD cash converts; that conversion is not a
  // deposit.
  // https://pearler.com/help/transactions/5035921-how-do-i-make-deposits-into-pearler-to-be-invested
  // https://pearler.com/help/transactions/5155285-what-cash-accounts-do-i-have-on-pearler
  pearler: ["AUD", "USD"],
  // A deposit is an AUD transfer from an Australian bank account, and it
  // stays in dollars. A direct USD deposit is refused. Funding the Wall St
  // wallet converts those dollars, and that conversion is not a deposit.
  // https://hellostake.com/au/support/funding-and-withdrawal/funding/52905017357209
  // https://hellostake.com/au/support/funding-and-withdrawal/funding/52906816466201
  stakeau: ["AUD"],
  // Stake refuses direct USD funding: a deposit is New Zealand dollars from
  // a local bank. The NZ account is Wall St only and the pricing page takes
  // the 1% FX fee at the time of funding, so the money lands as US dollars.
  // No NZD balance is kept, so no currency stays as sent.
  // https://hellostake.com/nz/support/funding-and-withdrawal/funding/26011875001881
  // https://hellostake.com/nz/support/funding-and-withdrawal/funding/26013092023961
  // https://hellostake.com/nz/pricing/wall-st
  stakenz: [],
  // A transfer into the multiproducto account is a PSE payment or the
  // Bancolombia button, in pesos. Local shares and the MGC settle in pesos.
  // No other currency is left unconverted.
  // https://www.bancolombia.com/centro-de-ayuda/preguntas-frecuentes/como-transferir-para-comprar-acciones-bancolombia-etrading
  // https://valores.bancolombia.com/productos-servicios/acciones
  valores: ["COP"],
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
  // A pay-in by UPI, net banking, NEFT, IMPS or RTGS is credited in rupees.
  // An NRE or NRO transfer is rupees too. Rupees moved to the US wallet are
  // converted to dollars, so that is not a deposit that stays.
  // https://www.motilaloswal.com/faq/for-investors
  // https://www.motilaloswal.com/us-stocks
  motilaloswal: ["INR"],
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
  // A pay-in by UPI, net banking, NEFT, RTGS or IMPS is credited to the
  // Groww balance in rupees and left there. An NRE account is not accepted.
  // An NRO transfer is also rupees. No other currency is left unconverted.
  // https://groww.in/help/payments-&-withdrawals/deposit/how-do-i-add-transfer-money-to-groww-balance--13
  // https://groww.in/help/my-account/ma-bank-accounts/what-payment-methods-are-supported-on-groww-2
  groww: ["INR"],
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
  fsmonesg: ["SGD", "USD", "AUD", "CAD", "EUR", "GBP", "CNH", "HKD", "NZD", "JPY", "CHF", "MYR"],
  // Each of these ten has its own cash account and its own receiving
  // account. A transfer into the matching account is left in that currency.
  // The page prints renminbi; the shelf quotes CNH.
  // https://www.fsmglobal.hk/cash-account/interest-rate
  // https://www.fsmglobal.hk/support/cash-solutions/making-payment
  fsmonehk: ["HKD", "USD", "CNH", "AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "SGD"],
  // Cash balances are held in these currencies. A sale is credited in the
  // currency of the product. Auto-sweep is a fund in MYR, USD or SGD, not
  // another cash balance. Yen is a stamp-duty rate, not a cash account.
  // https://www.fsmone.com.my/cash/cash-solutions
  // https://www.fsmone.com.my/important-notes-for-transacting-stock-etf
  fsmonemy: ["MYR", "SGD", "HKD", "USD", "CNY", "AUD", "EUR", "GBP"],
  // A wire is a direct dollar deposit and stays dollars. A local-currency
  // payment through Rapyd is converted on the way to the United States.
  // The cash that trades is USD. The FX fee is that conversion.
  // https://help.heygotrade.com/en/articles/10182686-wise-termination
  // https://help.heygotrade.com/en/articles/5977626-who-is-rapyd
  // https://www.heygotrade.com/legal/gotrade-fees.pdf
  gotradeglobal: ["USD"],
  // A rupiah transfer is converted to dollars on the way in. A dollar
  // deposit is free and stays dollars. The cash that trades is USD.
  // https://www.heygotrade.com/id/fee/
  // https://help.heygotrade.com/id/articles/9804644-kemudahan-baru-dalam-deposit-di-gotrade-indonesia
  gotradeid: ["USD"],
  // Won is the cash account. Dollars can be transferred in through the Hana
  // virtual account and left as dollars.
  // https://www.yna.co.kr/view/AKR20241230044400008
  toss: ["KRW", "USD"],
  bunq: ["EUR"],
  bux: ["EUR"],
  // Terms of Business §14.4: the Account Currency is "one of the currencies
  // offered by us and selected by you when opening the Account"; the live
  // account form offers USD, EURO and GBP. AED is accepted but converted.
  // https://www.century.ae/custom_scripts/pdfs/web/cfc-terms-of-business.pdf
  // https://www.century.ae/en/open-live-account/
  century: ["USD", "EUR", "GBP"],
  choicetrade: ["USD"],
  davy: ["EUR"],
  degironl: ["EUR"],
  // US stocks are funded by an INR transfer under LRS. The dollars are the
  // conversion, not a currency the client can deposit and leave as cash.
  dhan: ["INR"],
  // The FAQ offers a resident account and an NRI account. The cash segment
  // settles in rupees. The page names no foreign-currency balance.
  // https://www.definedgesecurities.com/
  definedge: ["INR"],
  easybourse: ["EUR"],
  easyequities: ["ZAR", "USD", "AUD", "GBP", "EUR"],
  // "You can maintain balances in different currencies in your EuroFinance
  // account, including BGN, EUR, USD, GBP, and CHF", with no automatic
  // conversion unless a trade lacks the cash, and "You can deposit and
  // withdraw in one of the following currencies – BGN, EUR, USD, CHF, or
  // GBP". The deposit page prints IBANs for EUR, USD and GBP only, so a CHF
  // transfer rests on the FAQ. BGN ended with the euro.
  // https://eurofinance.bg/en/faqs/can-i-have-different-currencies-in-my-eurofinance-account/
  // https://eurofinance.bg/en/faqs-categories/deposits-withdrawals-and-currency-conversion/
  // https://payments.eurofinance.bg/en
  efocs: ["EUR", "USD", "GBP", "CHF"],
  // Client contract Art. 2(1): accounts "in U.S. dollars, Euro, British Pounds
  // or Swiss Francs, at Client's choice"; Art. 8(c): a deposit in another
  // currency is converted into the account's.
  // https://webupload.elana.net/docs/elana-trading-dogovor-global-meta-trader-en.pdf
  // https://globaltrader.elana.net/en/live-account-deposit-and-withdrawal/
  elana: ["EUR", "USD", "GBP", "CHF"],
  firstrade: ["USD"],
  // The account is dollars. An ACH or a domestic wire stays dollars. A
  // deposit in another currency is converted, plus 0.30%.
  // https://public.com/disclosures/fee-schedule
  public: ["USD"],
  // The brokerage is funded from a US bank and the cash stays dollars.
  // A deposit in another currency is not accepted.
  // https://cdn.stash.com/disclosures/Stash_Wrap_Fee_Program_Brochure_12.pdf
  // https://cdn.stash.com/disclosures/stride-deposit-account-agreement.pdf
  stash: ["USD"],
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
  // Terms 4.2 and section 8: every payment to or from the nominated bank
  // is pounds, and the account settles in pounds. A receipt in another
  // currency is converted. The nominated bank is in the UK, Jersey,
  // Guernsey or the Isle of Man.
  // https://www.lloydsbank.com/assets/media/pdfs/investments/direct-investments/terms_conditions.pdf
  lloyds: ["GBP"],
  // Terms 4.2 and section 8: every payment to or from the nominated bank
  // is pounds, and the account settles in pounds. A receipt in another
  // currency is converted. The nominated bank is in the UK, Jersey,
  // Guernsey or the Isle of Man.
  // https://www.halifax.co.uk/assets/pdf/filestore/halifaxsharedealing_termsandconds.pdf
  halifax: ["GBP"],
  // Terms 7.1 and 7.6: a top-up comes from a UK, Channel Island or Isle of
  // Man current account, and a withdrawal is a sterling amount. No other
  // currency is left as cash. The costs page charges no FX because every
  // line is already quoted in pounds.
  // https://investengine.com/terms/
  // https://investengine.com/costs/
  investEngine: ["GBP"],
  // Platform terms (February 2025): a contribution is a debit card payment or
  // a Direct Debit, and a withdrawal is a sterling amount to a UK bank. There
  // is one cash account. A dollar or euro figure on a line is the London quote.
  // https://www.willisowen.co.uk/documents/Willis_Owen_Platform_Terms_and_Conditions_February_2025.pdf
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
  igue: ["EUR"],
  // Investing card: manual conversion lets a deposit stay in the currency
  // you send, and that trade then has no FX fee. The currencies named there
  // are pounds, dollars, euros and Australian dollars. The cash-interest
  // note names the same four balances. A deposit in another currency is
  // converted, so it is not listed. Instant conversion is the other setting.
  // https://www.ig.com/uk/charges
  // https://www.ig.com/uk/help-and-support/articles/682755-earning-interest-on-cash-faqs-and-exclusions
  iguk: ["GBP", "USD", "EUR", "AUD"],
  labanquepostale: ["EUR"],
  // A deposit is Swish, Bankgiro, or a transfer started inside Levler. There
  // is no clearing number and no foreign-currency balance. A share in another
  // currency is converted at 0.19% a time.
  // https://levler.se/kundservice/insattningar-och-uttag/hur-gor-jag-en-insattning/vilket-clearingnummer-har-levler/
  // https://levler.se/om-oss/prislista/
  levler: ["SEK"],
  N26: ["EUR"],
  oandapl: ["EUR", "PLN", "CZK", "RON", "USD"],
  // Communiqué 15/1 of 2 March 2026, point 2: a foreign trade settles in PLN
  // or in the listing currency. Those are the cash the account can hold.
  // https://www.bm.pkobp.pl/api/public/994a8c6c-d442-47a1-bded-4eb0d5a361a4.pdf
  pkobp: ["PLN", "EUR", "USD", "CHF", "GBP", "NOK", "HUF", "SEK", "CZK", "DKK"],
  // Account page: the account can invest in PLN and nine foreign currencies.
  // https://www.pekao.com.pl/biuro-maklerskie/nowy-klient/rachunek-inwestycyjny-w-bm-pekao.html
  pekao: ["PLN", "EUR", "USD", "GBP", "CHF", "CAD", "AUD", "SEK", "NOK", "DKK"],
  // The brokerage cash account is zlotys. Foreign markets open accounts in
  // euro, dollars, pounds, francs and kronor and leave each currency there.
  // Settling a foreign order in zlotys is a conversion at KBC's rate, not a
  // deposit.
  // https://www.erste.pl/klient-indywidualny/oszczednosci-i-inwestycje/rachunki-dla-gield-zagranicznych
  erstepl: ["PLN", "EUR", "USD", "GBP", "CHF", "SEK"],
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
  // A transfer from a Chilean bank arrives in pesos and stays pesos until
  // it is assigned. Buying dollars is that assignment, at 4 pesos per
  // dollar, not a deposit. A dollar transfer is not accepted.
  // https://ayuda.fintual.cl/es/articles/6458430-puedo-depositar-o-retirar-en-dolares-desde-mis-acciones
  // https://ayuda.fintual.cl/es/articles/6960455-como-compro-dolares
  fintual: ["CLP"],
  // The cash management account is New Zealand dollars and stays
  // dollars. A foreign-currency account for share trading holds one of
  // the nine currencies the bank publishes, and a payment in that
  // currency stays in it. Converting between them is a separate
  // exchange. An Australian order can settle online in NZD, AUD or USD.
  // https://www.asb.co.nz/asb-securities/foreign-currency-account-for-share-trading.html
  // https://www.asb.co.nz/foreign-exchange/foreign-currency-account.html
  // https://www.asb.co.nz/help/settle-in-usd-or-any-other-currency-for-a-nzx-trade.html
  asb: ["NZD", "AUD", "USD", "GBP", "EUR", "CAD", "CHF", "HKD", "JPY", "SGD"],
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
  saxofr: ["USD", "CAD", "EUR", "GBP", "NOK", "PLN", "CZK", "MYR", "CHF", "DKK", "SEK", "ZAR", "JPY", "HKD", "CNH", "SGD", "AUD"],
  scalablecapital: ["EUR"],
  // One euro clearing account at Sutor Bank. A transfer in or out is a
  // SEPA payment in euros. There is no foreign-currency balance.
  // https://www.justtrade.com/fileadmin/Formulare/Preis-und-Leistungsverzeichnis.pdf
  justtrade: ["EUR"],
  // The euro clearing account stays euros. Up to three more accounts, in
  // dollars, francs and pounds, stay in that currency so a trade in it is
  // not converted. Any other currency is an FX pair, not a balance.
  // https://www.tradersplace.de/service/service-tools/waehrungskonten
  // https://tradersplace.de/konditionen/deine-konditionen
  tradersplace: ["EUR", "USD", "CHF", "GBP"],
  shoonya: ["INR"],
  siebert: ["USD"],
  sogotrade: ["USD"],
  tastytradeus: ["USD"],
  thndr: ["EGP", "USD", "AED"],
  bhmuae: ["AED", "USD"],
  // A dollar transfer stays in the USD wallet. Dirhams deposited into the
  // GCC wallet stay dirhams. The two wallets do not convert into each
  // other. A UAE transfer into the dollar wallet is 0.75% and is not a
  // deposit that stays dollars.
  // https://getbaraka.com/gcc-stocks-overview
  // https://getbaraka.com/terms
  baraka: ["AED", "USD"],
  // Euros arrive by SEPA and stay euros. Any other currency paid into
  // that account is converted, plus 0.30%. Dollars paid into the dollar
  // account stay dollars. Opening it needs Premium, and it stays linked
  // to the euro account.
  // https://myinvestor.es/ayuda/preguntas-frecuentes/transferencias/
  // https://myinvestor.es/cuentas-tarjetas/cuentas-dolares/
  // https://myinvestor.es/premium/
  myinvestor: ["EUR", "USD"],
  // Pesos paid to the peso account stay pesos. Dollars paid to the dollar
  // account stay dollars. Each has its own CBU, and both transfers are
  // free. Another currency is not a deposit that stays.
  // https://www.invertironline.com/como-ingresar-dinero-cuenta
  // https://www.invertironline.com/tarifas
  iol: ["ARS", "USD"],
  // Pesos paid to a peso account stay pesos. MEP dollars paid to a dollar
  // account stay dollars. A wire to Citibank New York or Bank of New York
  // Mellon is cable dollars and stays cable dollars. Cash is not accepted.
  // Another currency is not a deposit that stays. Taking cable dollars out
  // costs 10 dollars plus IVA.
  // https://cms.balanz.com/PFS/055928_cuentas_balanz_2021nuevo.pdf
  // https://balanz.com/comisiones/
  balanzar: ["ARS", "USD"],
  // A peso transfer into the local peso account stays pesos. A dollar
  // transfer into the local dollar account stays dollars. A cable wire
  // is dollars too, and it stays dollars. Buying MEP or cable with bonds
  // is a conversion, not a deposit. Another currency is not a deposit
  // that stays.
  // https://www.ecovalores.com.ar/tarifario.php
  // https://www.ecovalores.com.ar/preguntas-frecuentes.php
  ecovalores: ["ARS", "USD"],
  // A bank transfer in soles stays soles. A bank transfer in dollars
  // stays dollars. Both are free. Changing one into the other is
  // triicambios, inside the app, not a deposit. Another currency is
  // not a deposit that stays.
  // https://trii.pe/faq
  // https://trii.pe/
  triipe: ["PEN", "USD"],
  // Securities cash is euros, paid to the client-money account. A purchase
  // in another currency is converted at the bank's commercial rate. Dollars
  // and pounds can sit on a payment account. That account is not this cash.
  // https://www.bksbank.si/mbxs8qn54zwj/6Tfee0Dh8W1oOK69bJj9oo/52dab9f27dccc41a506f4417cc5b64eb/Splo%C3%85_ni_pogoji_poslovanja_s_finan%C3%84_nimi_instrumenti_Marec2026_final.pdf
  bkssi: ["EUR"],
  // A payment that stays as cash is francs. The account is at
  // Hypothekarbank Lenzburg, and every neon invest line is already a
  // BX Swiss price in CHF, so nothing is converted on the way in.
  // https://www.neon-free.ch/en/faq/why-are-the-prices-for-shares-and-etfs-displayed-in-chf-in-the-app
  neon: ["CHF"],
  // A transfer from a Swedish bank is left in the currency it arrives in.
  // SEK is every account. USD, EUR, NOK, DKK and CAD can be paid into a
  // share-and-fund currency account and left there. An ISK, an endowment,
  // a savings account and a pension take SEK only. Nothing arrives from
  // abroad. GBP and CHF have no account.
  // https://www.nordnet.se/faq/insattningar-uttag/insattningar/hur-gor-jag-insattningar-i-utlandsk-valuta
  // https://www.nordnet.se/faq/handel-vardepapper/valutakonto/valutakonto-pa-aktie-och-fondkonto-af
  // SEK is the account. A deposit in a currency that already has a
  // currency account is credited there and left. Those accounts are
  // CAD, CHF, DKK, EUR, GBP, NOK and USD. Any other currency is
  // converted before it becomes cash.
  // https://www.avanza.se/avanzabank/hem/konton/blanketter/aktie-och-fondkonto/allmanna_villkor_for_kontotjanster.pdf
  // https://www.avanza.se/kundservice.html/3747/hur-fungerar-manuell-valutavaxling/
  avanza: ["SEK", "USD", "EUR", "GBP", "CHF", "NOK", "DKK", "CAD"],
  nordnetse: ["SEK", "USD", "EUR", "NOK", "DKK", "CAD"],
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
  tradestationus: ["USD"],
  // "You may fund your TradeUP account via ACH or Wire … only supports the
  // linkage of U.S. domestic bank accounts." No HKD or CNY deposit is named;
  // an HKD balance only arises from Hong Kong trading or margin.
  // https://www.tradeup.com/help/detail?parentId=23&contentId=53
  tradeup: ["USD"],
  tradezero: ["USD"],
  tradier: ["USD"],
  trading212: ["GBP", "USD", "EUR", "CHF", "DKK", "NOK", "PLN", "SEK", "CZK", "RON", "HUF", "CAD", "AUD"],
  vested: ["USD"],
  vivid: ["EUR"],
  // Settlement currencies on the card. Conversion is a separate order, so a
  // balance in one of these is not converted when it arrives.
  interactivebrokersie: ["AED", "AUD", "BRL", "CAD", "CHF", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "ILS", "INR", "JPY", "KRW", "MXN", "MYR", "NOK", "PLN", "RON", "SAR", "SEK", "SGD", "TWD", "USD"],
  lynxnl: ["AED", "AUD", "CAD", "CHF", "CNH", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "ILS", "JPY", "MXN", "NOK", "PLN", "RUB", "SEK", "SGD", "USD"],
  // A payment in a currency the bank quotes is credited in that currency
  // and left. A currency it does not quote is converted into the main
  // currency of the account. Foreign payments quote AUD, CAD, CHF, CZK,
  // DKK, EUR, GBP, HKD, HUF, JPY, NOK, PLN, RON, SEK and USD. Transfers
  // between the client's own accounts also leave RUB and NZD.
  // https://www.lhv.ee/en/payments
  // https://www.lhv.ee/en/conditions-of-payment-services-agreement
  // https://www.lhv.ee/en/faq/trader/
  lhvpank: ["AUD", "CAD", "CHF", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "JPY", "NOK", "NZD", "PLN", "RON", "RUB", "SEK", "USD"],
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
  kisvn: ["VND"],
  // A QR payment into Mirae Asset's account at BIDV is credited to the
  // securities cash account, the ordinary sub-account or the margin one,
  // and left there. The sheet names no other currency.
  // https://masvn.com/cate/nop-tienchuyen-tien-890
  miraevn: ["VND"],
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
  // A transfer into the client's Vietcombank identification account is
  // credited to the securities cash account and left there. The sheet
  // names no other currency. A foreign client pays in at the counter;
  // that payment is the same dong account.
  // https://www.vcbs.com.vn/chi-tiet-ho-tro-giao-dich/nop-tien-chung-khoan
  vietcombank: ["VND"],
  // A transfer to the euro clearing account is credited and left there.
  // The price list prices that one account. A coupon in another currency
  // is credited in euros unless the customer already holds an account in
  // that currency, and no such account is offered.
  // https://www.visualvest.de/wissen/faq
  visualvest: ["EUR"],
  // The settlement account is a giro account or an Extra-Konto, in euro.
  // A foreign-currency securities amount is converted into euro. No
  // balance is left in another currency.
  // https://www.ing.de/sparen-anlegen/direkt-depot/
  // https://www.ing.de/sparen-anlegen/direkt-depot/kundenservice/abrechnung-steuer/
  ingde: ["EUR"],
  // A transfer into the euro settlement account is credited in euro and
  // stays there. A transfer in dollars into the currency account is
  // credited in dollars. The other twelve currencies are bought and sold
  // through euro, at 1 %, so they are not a deposit.
  // https://www.comdirect.de/geldanlage/waehrungsanlagen.html
  comdirect: ["EUR", "USD"],
  // Yen can be paid in by a realtime transfer or a bank transfer and left
  // as yen. Dollars can be paid in by a bank transfer from a bank in Japan
  // and left as dollars. No other currency can be paid in.
  // https://www.moomoo.com/jp/manual/topic-deposit-withdrawal-12-78
  // https://www.moomoo.com/jp/support/topic7_81
  moomoojp: ["JPY", "USD"],
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
  // The folders below have no *_cost.mjs yet. Their lists come from each
  // broker's own funding pages, quoted under each entry.
  // Add funds is UPI or net banking from the client's own registered Indian
  // bank, credited in rupees. NRE and NRO accounts fund only by net banking;
  // those are rupee accounts. The US wallet is funded in rupees from the same
  // bank: the app shows the INR-to-USD rate and the money goes to GIFT City
  // under LRS. That is a conversion, not a dollar deposit; no direct dollar
  // transfer is offered.
  // https://upstox.com/help-center/how-to-add-funds-to-your-us-wallet-264394/
  // https://upstox.com/us-stocks/
  // https://upstox.com/help-center/250454/
  upstox: ["INR"],
  // Add Funds in the app or the Star back office is UPI, net banking, IMPS,
  // NEFT or RTGS from the client's registered bank account. Those rails are
  // rupees. Samco sells no foreign shares and names no other currency.
  // https://www.samco.in/help-support/article/how-do-i-add-funds-to-my-samco-trading-account/
  samco: ["INR"],
  // UPI from the trading app, or IMPS, NEFT or RTGS to Flattrade's HDFC
  // virtual accounts, credits the ledger. Those are rupee rails into an Indian
  // current account. No foreign-currency balance is named.
  // https://flattrade.in/fund-transfer
  // https://flattrade.in/support/knowledge-base/category/funds/add-funds-payin/
  flattrade: ["INR"],
  // A cheque, IBFT, draft or pay order goes to a KASB or KTrade rupee account
  // (Askari, Faysal, HabibMetro, UBL, Meezan IBANs). Raast to the client's own
  // Raast IBAN lands in the KTrade wallet; the minimum is Rs. 5,000. HBL and
  // Alfalah pay in from their apps. A non-resident invests through a Roshan
  // Digital Account at a partner bank; the page names no dollar balance at
  // KTrade.
  // https://www.kasb.com/bank-transfer-details/
  // https://www.kasb.com/raast/
  // https://www.kasb.com/roshan-digital-account/
  ktrade: ["PKR"],
  // Misk trades only Amman Stock Exchange shares, and the ASE trades in
  // dinars. The product page gives the commission only as a rate (0.002 plus
  // levies) and says the online service shows the client's cash balance. No
  // page says how a deposit is made or names any currency for it. The evidence
  // is thin.
  // https://www.safwabank.com/en/product/misc/
  // https://www.safwabank.com/ar/product/misc/
  misk: ["JOD"],
  // The account is funded only from a Nigerian bank account, in naira. A GBP,
  // USD, EUR or AED account abroad cannot be used. Someone abroad sends money
  // to a naira account first. The fee table lists an FX spread for converting
  // another currency into naira, so nothing else is left unconverted.
  // https://sharessaver.com/invest-from-abroad
  // https://sharessaver.com/fees-and-charges
  sharessaver: ["NGN"],
  // Money comes in by EFT, debit order or a credit or debit card. The card
  // charge is R1.60 plus 2.2% of the rand value. Interest is paid on free
  // cash, and every fee is set in rand. No other currency is named.
  // http://resources.satrixnow.co.za/satrixnow_Cost_Profile.pdf
  // https://satrix.co.za/platform
  satrixnow: ["ZAR"],
  // A deposit is entered in KES or USD and paid by M-Pesa or bank transfer.
  // Shillings paid into a USD fund, share or ETF are converted by the banking
  // partner at its rate plus a spread. To avoid that, USD can be sent straight
  // to Ndovu's USD bank account. Bank transfer is the default for a USD
  // investment. A USD bank withdrawal costs USD 9.
  // https://ndovu.zohodesk.com/portal/en/kb/articles/how-does-currency-conversion-work-when-i-invest-in-usd-funds
  // https://ndovu.zohodesk.com/portal/en/kb/articles/how-do-i-fund-my-investment
  // https://ndovu.co/ke/fee-structure
  ndovu: ["KES", "USD"],
  // The trading account holds dollars: commission is $3 or 0.15%, $3 of cash
  // must stay in the account, and both withdrawal routes have a $100 minimum.
  // Deposits are a local transfer, an international transfer, K-Net, a card,
  // Apple Pay or a standing order, with a 35 KWD minimum. K-Net and a local
  // transfer are dinars, so they are converted. No page names a dinar balance,
  // or says outright that a dollar wire is left unconverted.
  // https://www.joinzad.com/en/faq/
  zad: ["USD"],
  // A bank transfer from abroad lands in one of nine NatWest IBANs, one per
  // currency: sterling, euros, US, Canadian, Australian, Hong Kong and
  // Singapore dollars, Swedish krona and Swiss francs. The cash page shows a
  // balance for each currency held, and a trade can settle in any of them. An
  // ISA, a Junior ISA and a SIPP take sterling only, and an ISA holds no
  // foreign currency.
  // https://www.ii.co.uk/help/adding-and-withdrawing-cash/adding-cash/adding-cash-from-an-overseas-bank
  // https://www.ii.co.uk/help/trading/international-trading/foreign-currency-exchange
  // https://www.ii.co.uk/help/adding-and-withdrawing-cash/adding-cash/cash-balance-page
  interactiveinvestor: ["GBP", "EUR", "USD", "CAD", "AUD", "HKD", "SGD", "SEK", "CHF"],
  // The reference currency is CHF or EUR, picked at registration and fixed.
  // ETFselect buys from a cash account in CHF, EUR, USD or GBP, and a
  // distribution lands in the cash account of the fund's currency without
  // conversion. Cash accounts also open in NOK, SEK, PLN, CZK and HUF, but
  // nothing in ETFselect is bought from them. Deposits come only from an IBAN
  // in the client's name in the EU, EEA or Switzerland.
  // https://mobilep.willbe-invest.com/en/about-willbe/faq
  willbe: ["CHF", "EUR", "USD", "GBP"],
  // A deposit is a charge to the payment card linked to the Chip app, pooled
  // and sent to the Seccl custody account. The platform terms say payments
  // must be made in sterling. A fund priced in dollars is bought from that
  // sterling, with any FX cost passed through.
  // https://cdn.prod.website-files.com/5d65390243727621f8413d93/6978ce4cc764ff5c3d2f1de5_investments_platform_terms_chip_29_jan.pdf
  chip: ["GBP"],
  // Money comes in by Faster Payments or Open Banking from a UK account in the
  // client's name and lands in the Prosper Wallet at Griffin Bank. The terms
  // say the Wallet holds only pounds sterling, and foreign-currency payments
  // are not accepted. The ISA, GIA and SIPP are funded from that Wallet. A
  // fund in another currency is bought from sterling.
  // https://www.prosper.co.uk/documents/terms-and-conditions
  // https://www.prosper.co.uk/help/en/articles/11667907-what-is-the-prosper-wallet
  prosper: ["GBP"],
  // Money comes in by Nemoverførsel or Straksoverførsel from a Danish bank,
  // and both are kroner. The price list charges 399 DKK to handle and return a
  // foreign payment, so a wire in another currency is sent back, not credited.
  // A trade in another currency is converted from kroner automatically at
  // 0.07%.
  // https://endavu.com/priser
  // https://endavu.com/support
  // https://cdn.endavu.com/documents/market-and-exchange-specific-terms.pdf
  endavu: ["DKK"],
  // A multi-currency account (cuenta multidivisa) has one IBAN with a balance
  // in each of EUR, USD, GBP, SEK, JPY and CHF. The fee sheet prices a
  // received SWIFT transfer in each of these, charged in that currency. NYSE,
  // Nasdaq, AMEX, London, Stockholm, Switzerland and Japan settle against the
  // balance in their own currency. In the plain euro account, and for any
  // other market such as Canada, a foreign trade is converted to euros with a
  // 0.30% spread.
  // https://www.r4.com/centro-de-ayuda/articulo/servicio-de-liquidacion-multidivisa
  // https://www.r4.com/resources/pdf/tablonanuncios/hoja_tarifas.pdf
  renta4es: ["EUR", "USD", "GBP", "SEK", "JPY", "CHF"],
  // BisonTrade has one account, funded in euros. A USD sub-account is opened
  // on request and holds dollars, so a US asset is bought from it without
  // converting on each trade. The fee sheet takes incoming USD transfers free
  // and charges 0.375% on outgoing USD transfers. Any other conversion is the
  // real-time rate plus or minus 0.35%.
  // https://www.bisontrade.com/blog/accede-a-los-mercados-globales-con-la-subcuenta-en-usd-de-bisontrade/
  // https://www.miraltabank.com/wp-content/uploads/2025/02/Tarifas-BisonTrade-2025.pdf
  // https://www.bisontrade.com/blog/que-tipos-de-cuentas-ofrecen-en-bisontrade/
  bisontrade: ["EUR", "USD"],
  // Freestoxx is WH SelfInvest's US-share account. An incoming transfer must
  // come from the client's reference account, is free, and is converted to
  // dollars if it is in any other currency. The cost disclosure charges the
  // depositary bank's conversion fee plus 0.3% on that conversion. Even the
  // 9.99 EUR Full Services fee is converted to USD.
  // https://www.freestoxx.com/en-lu/commission-free-trading/broker-platform-service/useful-information-for-clients
  // https://www.freestoxx.com/docs/freestoxx-freefutures-ex-ante-fees-disclosure-en.pdf
  freestoxx: ["USD"],
  // Money comes in by bank transfer or iDEAL from the client's contra account
  // to a collective account at ABN AMRO, and is credited to the cash account.
  // The rulebook holds that cash in euros: euros in the CTA, and euros or
  // money-market units in the UTA, always shown in euros. Opening needs a 0.01
  // euro validation deposit. No other currency is named.
  // https://cdn.prod.website-files.com/6603ca52d62c204544f53366/67fe42945dca68275f516796_rulebook-nxchange-ENG.pdf
  // https://www.nxchange.com/how-it-works
  nxchange: ["EUR"],
  // Money goes from the client's contra account to the single ING account of
  // Stichting NPEX Bewaarbedrijf, and is booked to the NPEX cash account. Only
  // an EU bank account in the client's name is accepted, and a payment from
  // outside the EU is sent back. The account is verified with a 1 euro
  // deposit. The venue trades in euros. No other currency is named, so the
  // evidence for euros only is thin.
  // https://www.npex.nl/faq_category/mijn-npex-rekening/
  // https://www.npex.nl/wp-content/uploads/2024/11/NPEX-Reglement-per-11-november-2024.pdf
  npex: ["EUR"],
  // An ACH transfer or a wire funds the Invest account in US dollars. Account
  // holders need a US residential address and phone number. The cash products
  // take wires from US banks only. No foreign-currency balance or
  // international wire is named for the Invest account, so the evidence beyond
  // USD is thin.
  // https://help.m1.com/en/articles/9331996
  // https://help.m1.com/en/articles/11331081-how-to-create-a-wire-transfer-for-my-m1-earn-account
  // https://help.m1.com/en/articles/9332043-open-my-account
  m1: ["USD"],
  // ACH comes from a linked US bank. A domestic or SWIFT wire goes to Apex
  // Clearing at BMO Harris. The wire page says funds must be sent in US
  // dollars, and a wire in another currency is returned.
  // https://www.lighthorse.io/instructions/funding/wires.md
  // https://www.lighthorse.io/instructions/funding/deposit.md
  lighthorse: ["USD"],
  // US stocks sit in a Coinbase Capital Markets brokerage account for US
  // residents, cleared by Apex. Stocks may only be bought with settled USD.
  // USDC belongs to the Coinbase Inc. crypto account, and a stablecoin is not
  // a currency. UK users pay in GBP, which is converted to USD at each buy.
  // Their sale proceeds come back as USDC.
  // https://www.coinbase.com/stocks
  // https://help.coinbase.com/en/coinbase/getting-started/getting-started-with-coinbase/available-balance
  // https://www.coinbase.com/en-gb/stocks
  coinbaseus: ["USD"],
  // Long Bridge HK Limited takes deposits in HKD and USD only. FPS, eDDA and
  // bank-securities transfers are HKD; online, ATM, cheque and wire transfers
  // can be HKD or USD. A wire lands in the HKD or USD account at ICBC (Asia).
  // In-app exchange is between USD and HKD only. Mainland China bank cards are
  // refused.
  // https://longbridge.com/hk/en/support/topics/depositfunds/41fajdm.md
  // https://longbridge.com/hk/en/support/topics/depositfunds/hk-telegraphictransfer.md
  // https://longbridge.com/hk/en/support/topics/conversion/hk-exchange.md
  longbridgehk: ["HKD", "USD"],
  // Long Bridge Securities Pte. Ltd. takes SGD, USD and HKD deposits into its
  // DBS account. DDA and PayNow are SGD only. A telegraphic or bank transfer
  // in SGD, HKD or USD is credited as received. In-app conversion is between
  // SGD, USD and HKD.
  // https://longbridge.com/sg/en/support/topics/depositfunds/Deposit.md
  // https://longbridge.com/sg/en/support/topics/depositfunds/internetbankingtransfer.md
  // https://longbridge.com/sg/en/support/topics/currencyexchange/FAQs.md
  longbridgesg: ["SGD", "USD", "HKD"],
  // Deposits go to the custodian, Phillip Securities Pte Ltd. It has a USD and
  // an HKD account at HSBC Hong Kong and at Standard Chartered Singapore. No
  // NZD account is named. In-app exchange lists USD, HKD, SGD, CNH, AUD, JPY,
  // GBP and EUR. The deposit pages only take USD and HKD.
  // https://longbridge.com/nz/en/support/topics/fundsoverview/qtrjzy.md
  // https://longbridge.com/nz/en/support/topics/fundsoverview/4481v6r.md
  // https://longbridge.com/nz/en/support/topics/conversion/1boirpz.md
  longbridgenz: ["USD", "HKD"],
  // Stock Trading debits a savings account under the integrated investment
  // account. Hong Kong shares settle in HKD; RMB-traded counters are charged
  // in RMB. US shares settle in USD from the USD savings account. China
  // A-shares settle in RMB from the RMB savings account, which is required to
  // trade them. Other currencies the savings account holds settle no stock
  // trade. The renminbi is the Hong Kong offshore unit, written CNH as for
  // futu.
  // https://www.hsbc.com.hk/content/dam/hsbc/hk/docs/investments/stocks/top-trader-club/us-stocks-product-fact-sheet.pdf
  // https://www.hsbc.com.hk/content/dam/hsbc/hk/docs/investments/stocks/china-a-shares/product-fact-sheet.pdf
  // https://www.hsbc.com.hk/content/dam/hsbc/hk/docs/investments/stocks/hk-trading/local-securities-product-fact-sheet.pdf
  // https://www.hsbc.com.hk/investments/products/stocks/
  hsbchk: ["HKD", "USD", "CNH"],
  // A transfer to the client's identification account at Techcombank or BIDV
  // is credited to the securities cash account and left there. An ordinary
  // transfer to AAS's collection account is the other route. The pages name no
  // other currency.
  // https://aas.com.vn/ho-tro-aas/huong-dan-chuyen-nop-tien-chung-khoan-aas-qua-tai-khoan-dinh-danh-techcombank-bidv/
  // https://aas.com.vn/aas-ho-tro/huong-dan-giao-dich/
  aas: ["VND"],
  // A transfer to the identification account at BIDV, VPBank or ABBank, from a
  // banking app or at a branch, is credited to the securities cash account and
  // left there. The sheet names no other currency.
  // https://www.abs.vn/huong-dan-chuyen-tien-truc-tuyen-vao-tai-khoan-chung-khoan-abs/
  abs: ["VND"],
  // A transfer to the client's identification account at ACB, VPBank,
  // Techcombank or BIDV, or into one of ACBS's collection accounts at ACB,
  // Vietcombank, BIDV or Techcombank, is credited to the securities cash sub-
  // account and left there. The daily online limit is in dong. The sheet names
  // no other currency.
  // https://acbs.com.vn/san-pham/ttgd/nop--chuyen-tien-vao-tai-khoan-giao-dich-chung-khoan-co-so-1163-P6E7D2DA6
  acbs: ["VND"],
  // A VietQR, a transfer to the identification account at BIDV or VPBank, a
  // linked bank app, or cash at a BIDV or VPBank counter is credited to the
  // ordinary, margin or derivatives sub-account and left there. The sheet
  // names no other currency.
  // https://www.aisec.com.vn/transactions-money/
  ais: ["VND"],
  // A transfer to the identification account, through the BIDV or VPBank app,
  // or into one of APG's collection accounts at BIDV, Vietcombank or VPBank,
  // is credited to the securities account and left there. The sheet names no
  // other currency.
  // https://apsi.vn/deposit-guidelines
  apg: ["VND"],
  // Cash or a transfer from any bank in Vietnam into one of Artex's accounts
  // at VietinBank, MB and other Vietnamese banks is credited to the securities
  // account and left there. The sheet names no other currency.
  // https://artex.vn/CustomerSupport/MoneyTransactionGuide
  artex: ["VND"],
  // Cash or a transfer from a bank in Vietnam into DVSC's account at BIDV, OCB
  // or Techcombank is credited to the securities account and left there. The
  // one-page sheet names no other currency.
  // https://dvsc.com.vn/files/dvsc/54b53072540eeeb8f8e9343e71f28176/HD-KH-NT.pdf
  dvsc: ["VND"],
  // A QR, a transfer to the identification account at BIDV, or cash or a
  // transfer into a collection account at BIDV, Techcombank, Vietcombank, NCB
  // or MBV is credited to the securities cash sub-account and left there.
  // Foreign investors pay into a separate BIDV line from their indirect-
  // investment account, which is dong, so a wire in another currency is
  // converted first.
  // https://eves.com.vn/media/ywpnmvqb/190826-huong-dan-nop-tien-vao-tai-khoan.pdf
  // https://eves.com.vn/wikibook/cau-hoi-thuong-gap/
  eves: ["VND"],
  // A transfer to the GTJA identification account at BIDV, or cash or a
  // transfer into one of the collection accounts at BIDV, VietinBank,
  // Techcombank, Eximbank, Vietcombank or Woori, is credited to the securities
  // cash sub-account and left there. The sheets name no other currency.
  // https://gtht.com.vn/support/huong-dan-nop-tien-qua-tai-khoan-dinh-danh-new/
  // https://gtht.com.vn/support/huong-dan-nop-tien-vao-tai-khoan-giao-dich-chung-khoan/
  gtjavn: ["VND"],
  // A transfer to the HVS identification account at BIDV, or cash or a
  // transfer into one of HVS's collection accounts, is credited to the
  // ordinary or margin sub-account and left there. The sheet names no other
  // currency.
  // https://hvsvn.com/huong-dan/tien
  hvs: ["VND"],
  // A transfer from a Vietnamese banking app or bank counter to the
  // identification code or QR shown in Kafi X is credited to the securities
  // cash account. The page names no bank list and no other currency; evidence
  // is thin.
  // https://kafi.vn/support/detail?tab=ntdd_app
  kafi: ["VND"],
  // A transfer with the CSI identification code to Kirin's BIDV account, or
  // cash or a transfer into one of its accounts at BIDV, Techcombank,
  // Vietcombank, ACB or VietABank, is credited to the securities account and
  // left there. The sheet names no other currency.
  // https://kirins.vn/nop-rut-tien/
  kirin: ["VND"],
  // A QR, a transfer to the identification account at LPBank, BIDV, VPBank,
  // Vietcombank, VIB or Sacombank, or a transfer into a collection account is
  // credited to the cash or margin sub-account and left there. Foreign
  // investors (103F accounts) pay into a separate BIDV line, which is the same
  // dong account, so a wire in another currency is converted first.
  // https://lpbs.com.vn/nop-tien-chung-khoan-tu-cac-ngan-hang-vao-tai-khoan-chuyen-dung-support17
  // https://lpbs.com.vn/mo-tai-khoan-cho-nha-dau-tu-nuoc-ngoai-support9
  lpbs: ["VND"],
  // A transfer to the MBS identification account at MB or BIDV, a linked BIDV
  // transfer, or a transfer into one of MBS's collection accounts is credited
  // to the ordinary, margin or MBSLink sub-account and left there. The sheet
  // names no other currency.
  // https://mbs.com.vn/huong-dan-giao-dich-tien/
  mbs: ["VND"],
  // A transfer to the identification account, a QR, a linked bank, an e-wallet
  // (MoMo, ZaloPay, Viettel Money) or a transfer into a collection account is
  // credited to the securities cash account and left there. The sheet names no
  // other currency.
  // https://www.phs.vn/san-pham-dich-vu/huong-dan-nop-tien-vao-tai-khoan-giao-dich-chung-khoan/50
  phs: ["VND"],
  // A transfer through BIDV's collection service, or into one of PSI's
  // accounts at Vietcombank, PVcomBank, BIDV, SHB and others, is credited to
  // the securities cash account and left there. The sheet names no other
  // currency.
  // https://www.psi.vn/vi/cau-hoi-thuong-gap/huong-dan-giao-dich/huong-dan-nop-tien-vao-tai-khoan
  // https://www.psi.vn/uploads/huong-dan-su-dung/tai-lieu/HDSD%20Nop%20tien%20qua%20tai%20khoan%20chung%20khoan-26.11.pdf
  psi: ["VND"],
  // A transfer from Sacombank Pay, or cash or a transfer into one of SBS's
  // accounts at Sacombank, BIDV, Vietcombank or Eximbank, is credited to the
  // securities cash account and left there. The sheet names no other currency.
  // https://sbsc.com.vn/ho-tro/huong-dan-nop-tien-vao-tai-khoan-chung-khoan/
  sbs: ["VND"],
  // A transfer to the SSV identification account at BIDV, through Shinhan
  // Bank's SOL app, or into one of SSV's collection accounts is credited to
  // the securities cash account and left there. The sheet names no other
  // currency. The QR route is closed to a foreign investor's IICA, which is a
  // dong account at a Vietnamese bank.
  // https://shinhansec.com.vn/vi/ho-tro-khach-hang/huong-dan-su-dung-dich-vu/nop-rut-tien.html
  // https://shinhansec.com.vn/vi/ho-tro-khach-hang/huong-dan-giao-dich.html
  shinhanvn: ["VND"],
  // A transfer from SHB SAHA, a Napas 247 transfer to the SHS identification
  // account at SHB, or cash at an SHB or other bank counter is credited to the
  // securities cash sub-account and left there. The Napas limit is in dong.
  // The sheet names no other currency.
  // https://shs.com.vn/MoneyTradingGuide.aspx
  shs: ["VND"],
  // A QR or a transfer to the TCSC identification account at Techcombank is
  // credited to the securities cash account and left there. The sheets name no
  // other currency.
  // https://tcsc.vn/vi/support
  // https://tcsc.vn/uploads/documents-website/policy/HDSD_082026/HDSD_Huong%20dan%20nop%20tien_CKCS_082026.pdf
  tcsc: ["VND"],
  // A QR, a transfer to the 072C identification account at Techcombank or
  // VietinBank, or cash into one of VIX's collection accounts is credited to
  // the securities cash sub-account and left there. The sheet names no other
  // currency.
  // https://vixs.vn/ho-tro/nop-tien
  vix: ["VND"],
  // A transfer into VTS's account at BIDV, Eximbank or Vietcombank, with the
  // 089C account number in the note, is credited to the securities account and
  // left there. The sheet names no other currency.
  // https://vts.com.vn/upload/files/Huong%20dan%20giao%20dich%20tien.pdf
  // https://vts.com.vn/huong-dan-giao-dich.html
  vts: ["VND"],
  // A transfer to the YSVN identification account at BIDV, Vietcombank,
  // Sacombank, ACB or Eximbank, or into a collection account at those banks,
  // VietinBank or Techcombank, is credited to the ordinary, margin or
  // derivatives sub-account and left there. The sheet names no other currency.
  // https://support.yuanta.com.vn/en/support/cau-hoi-thuong-gap/huong-dan-nop-tien-vao-tai-khoan-giao-dich-tai-yuanta-viet-nam/
  // https://support.yuanta.com.vn/en/support/huong-dan-giao-dich-tien/huong-dan-nop-tien-dinh-danh/
  yuantavn: ["VND"],
  // Net banking, UPI, NEFT, RTGS, IMPS or a cheque pays rupees in from the
  // client's own linked bank account. An NRI moves rupees from an NRE or
  // NRO savings account into the matching PINS account at Kotak Mahindra
  // Bank. Global Investing is a separate Interactive Brokers account funded
  // by an LRS remittance, not a balance in this account.
  // https://www.kotakneo.com/support/how-can-i-transfer-funds-to-kotak-securities-trading-account
  // https://www.kotakneo.com/support/types-of-nri-account-faqs/
  // https://www.kotakneo.com/global-investment/
  kotak: ["INR"],
  // A pay-in by UPI or net banking comes from the client's bank in rupees.
  // BlinkX is open to resident Indians only, so an NRE or NRO account or a
  // bank outside India cannot be linked. No foreign-currency balance is
  // named.
  // https://blinkx.in/assets/pdf/Final-terms-for-DIY-account-opening.pdf
  // https://blinkx.in/help-center/articles/which-banks-can-nris-link-to-their-blinkx-account
  blinkx: ["INR"],
  // NEFT, RTGS or IMPS goes to a collection account at Axis Bank, numbered
  // NBSP plus the client code. UPI goes to a SEBI-validated UPI ID. Payment
  // is taken only from the client's own linked bank account. An NRI links
  // an NRE or NRO account, both rupee accounts. No foreign-currency balance
  // is named.
  // https://payment.nirmalbang.com/NEFT_RTGS.html
  // https://payment.nirmalbang.com/
  // https://www.nirmalbang.com/files/supportpdf/CDSL_Individual_Acct_Open.pdf
  nirmalbang: ["INR"],
  // UPI, the payment gateway, NEFT, RTGS or a cheque pays in from a bank
  // account mapped in the back office. NRI accounts are not offered, and an
  // NRE or NRO account is not accepted. No foreign-currency balance is
  // named. (stocko.in was down on 18 October 2026; read from the archived
  // copies of these pages.)
  // https://stocko.in/support/stocko-trading-guide/
  // https://stocko.in/support/can-i-open-nri-nro-account-with-stocko/
  stocko: ["INR"],
  // UPI or net banking in the Agnik app pays in from the registered bank
  // account. An NRI account sits on an NRE or NRO bank account, both rupee
  // accounts. No foreign-currency balance is named.
  // https://mastertrust.co.in/blog/agnik-app-walkthrough-explore-how-to-place-your-first-trade
  // https://www.mastertrust.co.in/blog/what-happens-to-your-demat-accounts-when-you-become-an-nri
  mastertrust: ["INR"],
  // UPI, net banking, IMPS or NEFT pays rupees in from the one registered
  // primary bank account. A transfer from any other account is refunded.
  // NRI accounts are not offered. No foreign-currency balance is named.
  // https://nubra.io/faq
  nubra: ["INR"],
  // A yen transfer lands in the securities account. A foreign-currency
  // transfer from a bank in Japan is credited as 外貨預り金 in the same
  // currency, in these six. A transfer from abroad, or yen sent as foreign
  // currency, is not accepted. US shares need the dollars moved into
  // 外国株預り金（米ドル）, which is still dollars.
  // https://kabu.com/item/payment_cashout/default.html
  // https://kabu.com/item/payment_cashout/forex/default.html
  mitsubishiufjesmart: ["JPY", "USD", "EUR", "AUD", "NZD", "ZAR", "MXN"],
  // Yen is a transfer into the client's own transfer-only account at MUFG
  // Bank. Foreign currency is paid in by a 外貨送金 to the firm's receiving
  // account at MUFG Bank head office and held as 外貨お預かり金. The FAQ
  // gives the receiving currencies only on request from the branch; the
  // list is the currencies the account holds, the rouble left out. The
  // renminbi account is printed CNY. The Hong Kong RMB counters are
  // quoted CNH, the same unit.
  // https://www.sc.mufg.jp/service/nyushukkin/gonyukin/index.html
  // https://faq.sc.mufg.jp/faq/show/1872
  // https://faq.sc.mufg.jp/faq/show/451
  // https://www.sc.mufg.jp/trade/deal/gaika/index.html
  mitsubishiufjmorgan: ["JPY", "USD", "EUR", "GBP", "CHF", "AUD", "NZD", "CAD", "HKD", "SGD", "SEK", "MXN", "TRY", "CNY", "CNH", "ZAR"],
  // A transfer into the client's deposit-only account at Daiwa Next Bank,
  // Quick Deposit or a direct debit lands in yen. US shares (ひなカブUSA)
  // are bought and sold in yen at the firm's exchange rate. There is no
  // dollar cash.
  // https://www.connect-sec.co.jp/service/deposit/choice.html
  // https://www.connect-sec.co.jp/service/hinakabu_usa/
  daiwaconnect: ["JPY"],
  // A transfer into the client's deposit-only account takes 日本円のみ, and
  // only from a bank in Japan. US shares are an over-the-counter trade
  // settled entirely in yen. There is no dollar cash.
  // https://www.cheer-sec.co.jp/start/pay.html
  // https://www.cheer-sec.co.jp/service/us-stock.html
  cheer: ["JPY"],
  // Online and call-centre deposits are a transfer from a bank in Japan,
  // and only yen is accepted. A branch client also pays by bank transfer.
  // US shares can be settled in yen or dollars, but no page describes a
  // dollar deposit.
  // https://www.ando-sec.co.jp/services/internet/rule/09-nyusyukkin.html
  // https://www.ando-sec.co.jp/services/callcenter/furikomi.html
  // https://www.ando-sec.co.jp/spot-stock/trading-guide/us_stocks.html
  ando: ["JPY"],
  // A transfer from the client's own account lands in euros. The help
  // centre says deposits can only be made in euros. A transfer from an
  // account in another currency is converted by the client's bank before
  // it arrives.
  // https://support.shares.io/en/articles/18958-in-what-currency-can-i-deposit-funds
  // https://support.shares.io/en/articles/21601-how-do-i-make-a-regular-bank-transfer
  // https://support.shares.io/en/articles/18960-are-there-any-deposit-fees
  shares: ["EUR"],
  // The brokerage account is funded by a zloty transfer to the number in
  // the agreement. Foreign markets settle in USD, EUR and GBP, held in the
  // client's currency account in that currency. The brokerage does not
  // exchange currency, so the cash for an order must already be in the
  // instrument's currency.
  // https://www.bnpparibas.pl/biuro-maklerskie/rynki-zagraniczne
  // https://www.bnpparibas.pl/_fileserver/item/1537059
  // https://www.bnpparibas.pl/biuro-maklerskie/rachunek-maklerski
  bnpparibasbiuro: ["PLN", "USD", "EUR", "GBP"],
  // A SEPA transfer or an instant deposit lands in euros in the
  // securities account. The account is held at Interactive Brokers, and
  // dollar or krona shares need a currency order placed first. No other
  // currency is named for a deposit.
  // https://help.kvarnx.com/en/articles/12665206-kvarn-x-investment-services-general-information
  // https://help.kvarnx.com/en/articles/13578356-getting-started-with-stock-and-etf-trading-on-kvarn-x
  // https://www.kvarnx.com/fi/hinnasto
  kvarnx: ["EUR"],
  // Crowns or euros sent by transfer stay in that currency in the
  // Brokerage wallet. Dollars cannot be deposited or withdrawn. They come
  // only from a 0.4% exchange, a sale or a dividend.
  // https://magazin.portu.cz/pruvodce-obchodovanim-na-portu-v-brokerage-rezimu/
  // https://app.portu.cz/documents/download/generaldocument/cs/PriceList
  portu: ["CZK", "EUR"],
  // Trades settle through the krona account linked to the depå. A
  // foreign purchase is exchanged automatically at 0.25% unless the
  // client has a separate valutakonto. No page offers such an account to
  // private clients. An ISK cannot hold foreign currency.
  // https://www.handelsbanken.se/sv/ekonomi-i-livet/privatekonomi/spara-klokt/aktiehjalpen/kom-igang-med-aktier
  // https://www.handelsbanken.se/sv/privat/spara/investeringssparkonto
  // https://www.handelsbanken.se/sv/om-oss/juridiska-dokument/prislistor-privat/prislista-spara/prislista-vardepappershandel
  handelsbankense: ["SEK"],
  // The securities account has its own receiving bank account for Hong
  // Kong dollars, renminbi, dollars and yen. The account holds several
  // currencies, and the client exchanges them before settlement. US
  // shares need dollars by the settlement date. A 2021 form put AUD, GBP
  // and SGD on the yen account; the current page names yen only.
  // https://www.bsgroup.com.hk/fund/deposit/
  // https://www.bsgroup.com.hk/sec/majormarket/us/
  // https://enweb.bsgroup.com.hk/media/12209/cak1c-23acknowledgementbyclient.pdf
  brightsmart: ["HKD", "USD", "CNH", "JPY"],
  // Only pesos can be deposited or withdrawn, from a bank tied to a
  // Chilean RUT. Pesos sent to the stocks wallet are converted to dollars
  // and sent to the US account. A dollar deposit is not accepted, and
  // a foreign bank or wallet cannot fund the account.
  // https://ayuda.racional.cl/es/articles/6433441-puedo-depositar-dolares-a-mi-billetera
  // https://ayuda.racional.cl/es/articles/6173553-como-puedo-comprar-dolares-para-mi-billetera
  // https://ayuda.racional.cl/es/articles/8365396-puedo-depositar-desde-una-billetera-digital-o-banco-extranjero
  racional: ["CLP"],
  // A transfer to one of Agriseco's accounts at Agribank, BIDV or
  // Vietcombank, or cash at the Agribank counter inside each Agriseco office,
  // is credited to the securities account and left there. A client may
  // instead trade from a dedicated Agribank account. The sheet names no other
  // currency.
  // https://agriseco.com.vn/Supports/MoneyTransactions/vi-VN
  // https://agriseco.com.vn/ProductsServices/SecuritiesBroker/InvestorMoneyManagement/vi-VN
  agriseco: ["VND"],
  // Cash at a VBSE counter, a transfer to the identification account at
  // VietinBank, BIDV, Techcombank or Vietcombank, or a transfer into VBSE's
  // accounts at VietinBank or PGBank is credited to the ordinary, margin or
  // derivatives sub-account and left there. The sheet names no other currency.
  // https://www.vbse.vn/huong-dan-giao-dich/
  vbse: ["VND"],
  // Cash at a BIDV counter or a 24/7 transfer to the 963388 identification
  // account, or a payment into one of BVSC's bank accounts, is credited to
  // the N1, M1 or CB1 sub-account and left there. Foreign clients fund from
  // their indirect-investment capital account under Circular 05/2014, which
  // is dong, so a wire in another currency is converted first.
  // https://www.bvsc.com.vn/danhmuc/dich-vu/khach-hang-ca-nhan/ho-tro/huong-dan-su-dung-dich-vu/nopchuyen-tien-vao-tk-gdck/
  bvsc: ["VND"],
  // A transfer to TPS's accounts at BIDV or TPBank, to the identification
  // account at BIDV or TPBank, or through TPBank Mobile is credited to the X1
  // or M1 sub-account and left there. Foreign investors pay into a separate
  // BIDV line for 048F accounts. The guide names no other currency.
  // https://web-api.tpbs.com.vn/static/uploads/HUONG_DAN_GIAO_DICH_TIEN_NAP_TIEN.pdf
  // https://tpbs.com.vn/vi/san-pham-dich-vu/dich-vu-chung-khoan/truc-tuyen/huong-dan-giao-dich-truc-tuyen?postId=2205
  tpbs: ["VND"],
  // A transfer from any bank app to one of TVSI's bank accounts, to the
  // identification account at BIDV or VPBank, or by the account's QR code is
  // credited to the ordinary (1) or margin (6) sub-account and left there.
  // The FAQ names no other currency.
  // https://support.tvsi.com.vn/QuestionPage?id=71
  tvsi: ["VND"],
  // A 24/7 transfer to the 963369 or DSC identification account at BIDV, or
  // cash or a transfer into one of DSC's accounts at BIDV, Vietcombank, VIB,
  // Techcombank or VietinBank, is credited to the ordinary (1) or margin (6)
  // sub-account and left there. The sheet names no other currency.
  // https://www.dsc.com.vn/huong-dan/nop-tien
  dsc: ["VND"],
  // A transfer to the VFS identification account at BIDV, or into one of
  // VFS's accounts at Vietcombank, Techcombank, BIDV or ACB, is credited to
  // the ordinary (01) or margin (10) sub-account and left there. The sheet
  // names no other currency.
  // https://www.vfs.com.vn/ho-tro/giao-dich-chuyen-tien-vao-tai-khoan-chung-khoan
  // https://www.vfs.com.vn/ho-tro/thu-chi-ho-dien-tu-qua-ngan-hang-bidv
  vfs: ["VND"],
  // A NAPAS 24/7 or BIDV Smart Banking transfer to the SSA identification
  // account at BIDV, a payment into one of ASEAN's accounts at SeABank, BIDV
  // or Vietcombank, or a top-up from Viettel Money is credited to the
  // ordinary (1) or margin (6) sub-account and left there. The pages name no
  // other currency.
  // https://www.aseansc.com.vn/huong-dan-va-ho-tro/huong-dan-giao-dich-tien/huong-dan-nop-tien/
  // https://www.aseansc.com.vn/huong-dan-va-ho-tro/cau-hoi-thuong-gap/giao-dich-tien/
  // https://www.aseansc.com.vn/huong-dan-va-ho-tro/aseansc-viettelmoney-faq/nap-rut-tien-dau-tu/
  aseansc: ["VND"],
  // A transfer to the BETA identification account at BIDV, or cash or a
  // transfer into one of BETA's accounts at BIDV, ACB, Vietcombank, Ban Viet,
  // Eximbank, Sacombank, VietinBank or MB, is credited to the securities
  // account and left there. The sheet names no other currency.
  // https://www.bsi.com.vn/vn/ho-tro/huong-dan-bieu-mau
  // https://www.bsi.com.vn/public/upload/files/HUONG%20DAN%20NOP%20TIEN%20TK%20DINH%20DANH.pdf
  bsi: ["VND"],
  // A transfer or cash at any bank into one of FNS's accounts at Sacombank,
  // ACB, BIDV or Vietcombank, a QR code, or the Sacombankpay securities gateway
  // is credited to the ordinary or margin sub-account and left there. A foreign
  // client funds an indirect-investment account at the custodian bank, which is
  // dong, so a wire from abroad is converted first.
  // https://funan.com.vn/vi/page/huong-dan-giao-dich.16841
  funan: ["VND"],
  // A transfer to the identification account 963636036C at BIDV, from the BIDV
  // app, another bank's app or a counter, or into one of APSC's accounts at
  // BIDV, SHB, VietinBank or Eximbank, is credited to the ordinary or margin
  // sub-account and left there. The linked BIDV account is a dong account. The
  // sheet names no other currency.
  // https://apsc.vn/huong-dan-giao-dich/huong-dan-nop-tien-vao-tai-khoan
  apsc: ["VND"],
  // A transfer from any banking app to the client's identification account at
  // VPBank, Techcombank or VietinBank, or into FHSC's accounts at Vietcombank,
  // Viet A Bank, Eximbank or ABBank, is credited to the ordinary or margin
  // sub-account. Old Finhay cash-account balances move across in dong. The
  // guide names no other currency.
  // https://fhsc.com.vn/huong-dan-nap-rut-tien-va-chuyen-tien-tu-finhay-sang-fhsc
  finhay: ["VND"],
  // A QR or transfer to the identification account at KienlongBank or VPBank,
  // a transfer into SMDS's accounts at KienlongBank or BIDV, or BIDV Smart
  // Banking is credited to the securities account and left there. Transfers are
  // capped at 500 million dong a time. Foreign clients get separate KienlongBank
  // and BIDV lines. The sheet names no other currency.
  // https://www.smartmind.vn/huong-dan-nop-tien-vao-tkck/
  smartmind: ["VND"],
  // A transfer to the BMSC identification account at BIDV, or into one of its
  // accounts at BIDV, Nam A Bank, Vietcombank or VietinBank, is credited to the
  // X1 ordinary or M1 margin sub-account and left there. The sheet names no
  // other currency.
  // https://www.bmsc.com.vn/ho-tro/Huong-dan-chuyen-tien-vao-tai-khoan.html
  bmsc: ["VND"],
  // A QR from NHSV Pro, a transfer to the identification account at Woori or
  // BIDV, or a transfer into one of NHSV's accounts at BIDV, Vietcombank, Woori,
  // BaoViet, VPBank, Techcombank, ACB or LPBank is credited to the 00 or 01
  // sub-account and left there. Foreign investors use separate BIDV, Shinhan,
  // Woori and ACB lines. The sheet names no other currency.
  // https://nhsv.vn/page/huong-dan-nop-tien.html
  nhsv: ["VND"],
  // A transfer or cash at any bank to the 079C identification account at
  // Techcombank, Eximbank or BIDV, or into one of MSVN's accounts at ACB,
  // Sacombank, Vietcombank, MB or Indovina, is credited to the general, margin or
  // derivatives account and left there. The foreign-client sheet lists the same
  // Vietnamese banks. Neither sheet names another currency.
  // https://www.maybank-kimeng.com.vn/securities/customer-support/faqs/8-0/vi
  // https://www.maybank-kimeng.com.vn/securities/customer-support/faqs/8-0/en
  maybankvn: ["VND"],
  // JBSV publishes no deposit guide. Finavi's funding steps sit inside the app,
  // and BIDV is the bank that receives client data until the contract ends. The
  // fee schedule and trading guide are written in dong only. Evidence is thin.
  // https://wts.finavi.com.vn/s3/files/static/Bieu_phi_JBSV.pdf
  // https://jbsv.com.vn/huong-dan-giao-dich-chung-khoan-1001?id=1001
  jbsv: ["VND"],
  // A transfer to the HPS identification account at BIDV, a QR from HAC Mobile
  // or Webtrading, or a transfer into Haseco's account at BIDV or Sacombank is
  // credited to the 01 ordinary or 06 margin sub-account and left there. The
  // sheet names no other currency.
  // https://haseco.vn/huong-dan-nop-rut-chuyen-khoan-tien/
  // https://haseco.vn/wp-content/uploads/2025/11/Huong-dan-nop-tien-tong-1.jpg
  haseco: ["VND"],
  // The site has a login, a price board and an account-opening form, but no
  // page on how money arrives. The capital is stated in pounds. The evidence
  // is thin, so the list is the local trading currency.
  // https://alrowadonline.com/About.aspx
  // https://alrowadonline.com/BeAClient.aspx
  rowad: ["EGP"],
  // A Stanbic IBTC bank client pays from the Super App. Another bank's
  // client adds funds on eTrade, or sends a cheque or a transfer to the
  // firm's account. A foreign inflow gets a Certificate of Capital
  // Importation, so it is converted to naira. No dollar product is offered.
  // https://www.stanbicibtcstockbrokers.com/nigeriastockbroking/stockbroking/about-us/regulatory/Stockbroking-FAQs
  // https://www.stanbicibtcstockbrokers.com/nigeriastockbroking/stockbroking/getting-started/how-to-register/individuals
  // https://www.stanbicibtcstockbrokers.com/nigeriastockbroking/stockbroking
  stanbicibtc: ["NGN"],
  // The account takes cash at a BDU CI or BSIC CI counter into a dedicated
  // bank account, a cheque, or a transfer to that account. The minimums are
  // in FCFA. The FAQ names no other currency.
  // https://macafricansgi.com/nos-formules/la-gestion-sous-mandat/faq/
  macafrican: ["XOF"],
  // The stocks account is opened in euros or dollars, one account per
  // currency under its own agreement. A wire in the account's currency to
  // Fibank, UniCredit Bulbank or another listed bank stays that currency.
  // Dollar shares need a dollar balance, and a move between the two is a
  // conversion. Any other currency, and every card payment, is converted.
  // https://www.deltastock.com/english/investments/stocks.asp
  // https://www.deltastock.com/english/my-account/deposit-withdraw.asp
  // https://www.deltastock.com/english/accounts/open-account.asp
  deltastock: ["EUR", "USD"],
  // A havale or EFT goes to GCM's TL account at Garanti, İş Bankası, Akbank
  // and six other banks. The USD and EUR accounts on the same pages are the
  // margin ("teminat") accounts of the leveraged desk. The Borsa İstanbul
  // trading conditions are all in lira, so a dollar or euro paid in is
  // converted before it buys a BIST share.
  // https://www.gcmyatirim.com.tr/hesap-islemleri/para-guvenligi-ve-transferi/para-yatirma-islemleri
  // https://www.gcmyatirim.com.tr/hesap-islemleri/para-guvenligi-ve-transferi/banka-hesap-bilgileri
  // https://www.gcmyatirim.com.tr/sirket-profili/sikca-sorulan-sorular
  gcm: ["TRY"],
  // PayID, BPAY, a bank transfer or a card funds the account in Australian
  // dollars. Manual conversion can keep balances in other currencies for
  // the US, UK, German and Irish markets, but those are converted from
  // the deposit. No AU page names a deposit in another currency that stays.
  // https://www.ig.com/au/share-trading/charges
  // https://www.ig.com/usermanagement/customeragreements?igCompany=igau&agreementType=share_trading_product_details&locale=en_GB
  // https://www.ig.com/au/shares/how-to-buy-trade-shares/buy-us-shares-in-australia
  igau: ["AUD"],
  // The standing transfer form has a peso CBU and a dollar CBU, and the
  // comitente account holds pesos and dollars. MEP dollars are local
  // dollars. A US-dollar wire is received and sent at up to 195 dollars
  // in bank costs, and it stays dollars. Another currency is not a
  // deposit that stays.
  // https://navarromediamanager.prod.ingecloud.com/MediaFiles/Files/2023/6_22/0/0/29/7620.pdf
  // https://www.navarroviola.com.ar/Informe/Nuestros-Aranceles
  navarroviola: ["ARS", "USD"],
  // A deposit or transfer goes into one of LDT's bank current accounts.
  // The fee sheet has a peso transfer line and no dollar line. No dollar
  // account is named, so the evidence is thin.
  // https://www.ldtbrokers.com/faqs
  // https://www.ldtbrokers.com/Informe/Legales/Aranceles
  ldt: ["ARS"],
  // UPI or net banking from the registered bank account is credited at
  // once. An IMPS, NEFT or RTGS payment to Torus as payee is credited
  // after it is checked. Cards are not accepted. All of these are rupee
  // payments, and no foreign-currency balance is named.
  // https://www.torusdigital.com/faqs/funds/add-funds/how-can-i-transfer-funds-to-my-torus-digital-account-oOK8bt
  // https://www.torusdigital.com/faqs/funds/add-funds/how-to-transfer-funds-to-my-torus-account-using-imps-neft-or-rtgs-aDmhtx
  torus: ["INR"],
  // The client agreement asks for cleared funds by 9:00 on settlement
  // day, and sale proceeds can be held for later purchases. No bank
  // details or currency are named, so the evidence is thin.
  // https://www.lolcsecurities.lk/images/site-specific/downloads/client-agreement.pdf
  // https://www.lolcsecurities.lk/images/site-specific/downloads/sales-proceeds-authorization-form.pdf
  lolc: ["LKR"],
  // A transfer through Commercial Bank's digital channels, a telex
  // transfer from any bank, or a cheque or cash at a Commercial Bank ATM
  // goes to the trading account (4998-…-039) at Commercial Bank. The page
  // names no other currency.
  // https://www.cbfs.com.qa/en-us/AOF
  cbfs: ["QAR"],
  // The buying order form debits the client's account, and payment is by
  // certified cheque. No bank details or currency are named, so the
  // evidence is thin.
  // https://qatar-securities.com/wp-content/uploads/2026/07/buying_order_form.pdf
  qsc: ["QAR"],
  // The client adds Al Sharq as a beneficiary in their bank app and pays
  // into its NBK, KFH or ABK account for the official market. A dividend
  // in a currency other than the dinar is collected at the Kuwait Clearing
  // Company, not through this account. The page names no other currency.
  // https://www.sharqetrade.com/%D8%A3%D8%B3%D8%A6%D9%84%D8%A9-%D8%B4%D8%A7%D8%A6%D8%B9%D8%A9
  sharq: ["KWD"],
  // A transfer from a Danish bank lands in kroner. SEK, NOK, USD, EUR and
  // CAD can be paid in to a matching currency account and are left there.
  // Each has its own SEB IBAN. Only a share depot has currency accounts; a
  // pension depot and an aktiesparekonto always convert. Nordnet takes no
  // transfer from a bank abroad.
  // https://www.nordnet.dk/faq/overforsel-af-kontanter/indbetaling/hvordan-indbetaler-jeg-penge-til-mit-nordnet-depot-i-udenlandsk-valuta
  // https://www.nordnet.dk/faq/valuta/valutakonti/hvilke-valutaer-kan-jeg-have-valutakonto-i
  // https://www.nordnet.dk/faq/overforsel-af-kontanter/indbetaling/hvordan-indbetaler-jeg-penge-til-mit-nordnet-depot-fra-udlandet
  nordnetdk: ["DKK", "SEK", "NOK", "USD", "EUR", "CAD"],
  // Euros are the account. SEK, NOK, DKK, USD and CAD each have a currency
  // account that is opened on request, and a deposit in that currency goes
  // to its own SEB IBAN and is left there. A currency deposit must come
  // from a Finnish IBAN account. No other currency has an account.
  // https://www.nordnet.fi/faq/rahan-ja-arvopapereiden-siirto/rahan-siirtaminen/miten-teen-talletuksen-valuuttatililleni
  // https://www.nordnet.fi/faq/korot-ja-valuuttatilit/valuuttatilit/mita-valuuttatilit-ovat
  nordnetfi: ["EUR", "SEK", "NOK", "DKK", "USD", "CAD"],
  // Kroner are every account. On an Aksje- og fondskonto, SEK, DKK, EUR,
  // CAD and USD currency accounts can be activated, and a transfer in that
  // currency to its SEB IBAN is left there. It must come from a Norwegian
  // bank; a payment from a bank abroad is sent back.
  // https://www.nordnet.no/faq/innskudd-og-uttak/sett-inn-penger/hvordan-foretar-jeg-innskudd-og-uttak-i-annen-valuta-til-fra-min-valutakonto
  // https://www.nordnet.no/faq/belaning-og-kreditt/valutakonto/hvilke-valutaer-kan-jeg-aktivere-valutakonto-i
  // https://www.nordnet.no/faq/innskudd-og-uttak/sett-inn-penger/hvordan-setter-jeg-inn-penger-fra-utlandet
  nordnetno: ["NOK", "SEK", "DKK", "EUR", "CAD", "USD"],
  // The funding tool on the .ca site, for a Canadian resident, lists these
  // 20 deposit currencies under the Canadian entity. Wire routing is set per
  // currency, and a correctly routed deposit is credited in that currency;
  // conversion is a separate FX order. CAD also takes EFT and bill payment.
  // https://www.interactivebrokers.ca/en/support/fund-my-account.php
  // https://www.interactivebrokers.ca/aces/Funding/Methods/Currencies?type=DEPOSIT&colr=CAN
  ibkrca: ["AUD", "CAD", "CHF", "CNH", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "ILS", "JPY", "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "USD", "ZAR"],
  // The funding tool, for a Swiss resident, lists these 25 deposit
  // currencies, with CHF as the domestic one. It files that resident under
  // the UK entity and shows no separate Swiss company. Wire routing is set
  // per currency and the deposit is credited in it; conversion is a
  // separate FX order.
  // https://www.interactivebrokers.com/en/support/fund-my-account.php
  // https://www.interactivebrokers.ch/aces/Funding/Methods/Currencies?type=DEPOSIT&colr=CHE
  ibkrch: ["AED", "AUD", "CAD", "CHF", "CNH", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "IDR", "ILS", "JPY", "MXN", "MYR", "NOK", "NZD", "PLN", "RON", "SEK", "SGD", "TRY", "USD", "ZAR"],
  // The funding tool, for a US resident, files the client under Interactive
  // Brokers LLC and lists 29 currencies. Wire routing is set per currency and
  // the deposit is credited in it; conversion is a separate FX order. ARS, CLP
  // and COP come only through SafetyPay, which converts to dollars, and IDR,
  // MYR, PHP and RON only through Wise, which converts, so they are left out.
  // https://www.interactivebrokers.com/en/support/fund-my-account.php
  // https://www.interactivebrokers.com/aces/Funding/Methods/Currencies?type=DEPOSIT&colr=USA
  // https://www.interactivebrokers.com/am.webapp/i18n/Acct_Mgmt_en.json
  ibkrus: ["AED", "AUD", "CAD", "CHF", "CNH", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "ILS", "JPY", "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "TRY", "USD", "ZAR"],
  // IB LLC for a non-US resident: the funding tool answers ibEntity "LLC"
  // with the same wire currencies as for a US resident (colr=BRA, MEX, ZAF,
  // ARE, CHN, MYS, NZL, read 2026-10-21; Brazil adds BRL). The same ones are
  // left out as for ibkrus: ARS, CLP and COP come only through SafetyPay,
  // which converts to dollars, IDR, MYR, PHP and RON only through Wise, which
  // converts, and BRL only through a local method that converts.
  // https://www.interactivebrokers.com/aces/Funding/Methods/Currencies?type=DEPOSIT&colr=BRA
  // https://www.interactivebrokers.com/am.webapp/i18n/Acct_Mgmt_en.json
  ibkrint: ["AED", "AUD", "CAD", "CHF", "CNH", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "ILS", "JPY", "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "TRY", "USD", "ZAR"],
  // The funding tool on the .co.uk site, for a UK resident, files the client
  // under the UK entity, with GBP as the domestic currency, and lists 25
  // currencies. Wire routing is set per currency and the deposit is credited
  // in it; conversion is a separate FX order. IDR, MYR and RON come only
  // through Wise, which converts them, so they are left out.
  // https://www.interactivebrokers.co.uk/en/support/fund-my-account.php
  // https://www.interactivebrokers.co.uk/aces/Funding/Methods/Currencies?type=DEPOSIT&colr=GBR
  // https://www.interactivebrokers.com/am.webapp/i18n/Acct_Mgmt_en.json
  ibkruk: ["AED", "AUD", "CAD", "CHF", "CNH", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "ILS", "JPY", "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "TRY", "USD", "ZAR"],
  // The funding tool on the .com.au site, for an Australian resident, files
  // the client under the Australian entity, with AUD as the domestic currency,
  // and lists only these five deposit currencies. Each is taken by wire (AUD
  // also by PayID) and credited in that currency; conversion is a separate
  // FX order.
  // https://www.interactivebrokers.com.au/en/support/fund-my-account.php
  // https://www.interactivebrokers.com.au/aces/Funding/Methods/Currencies?type=DEPOSIT&colr=AUS
  ibkrau: ["AUD", "EUR", "GBP", "HKD", "USD"],
  // The funding tool on the .com.sg site, for a Singapore resident, files the
  // client under the Singapore entity, with SGD as the domestic currency, and
  // lists ten currencies. These eight are taken by wire (SGD also by PayNow
  // and eGIRO) and credited in that currency. IDR and MYR come only through
  // Wise, which converts them, so they are left out.
  // https://www.interactivebrokers.com.sg/en/support/fund-my-account.php
  // https://www.interactivebrokers.com.sg/aces/Funding/Methods/Currencies?type=DEPOSIT&colr=SGP
  // https://www.interactivebrokers.com/am.webapp/i18n/Acct_Mgmt_en.json
  ibkrsg: ["AUD", "CNH", "EUR", "GBP", "HKD", "JPY", "SGD", "USD"],
  // The funding tool on the .com.hk site, for a Hong Kong resident, files the
  // client under the Hong Kong entity and lists 23 currencies. These 20 are
  // taken by wire (HKD and CNH also by FPS and eDDA) and credited in that
  // currency; conversion is a separate FX order. IDR, MYR and RON come only
  // through Wise, which converts them, so they are left out.
  // https://www.interactivebrokers.com.hk/en/support/fund-my-account.php
  // https://www.interactivebrokers.com.hk/aces/Funding/Methods/Currencies?type=DEPOSIT&colr=HKG
  // https://www.interactivebrokers.com/am.webapp/i18n/Acct_Mgmt_en.json
  ibkrhk: ["AUD", "CAD", "CHF", "CNH", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "ILS", "JPY", "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "USD", "ZAR"],
  // IBSJ takes deposits in four currencies only: JPY, USD, EUR and GBP.
  // The base currency is JPY. A multi-currency account holds each of them
  // as it is paid in, and the funding tool for a Japanese resident lists the
  // same four. Other currencies can be held only after a trade or conversion,
  // so they are not a deposit.
  // https://www.interactivebrokers.co.jp/aces/Funding/Methods/Currencies?type=DEPOSIT&colr=JPN
  // https://ibkb.interactivebrokers.com/node/4858
  // https://www.interactivebrokers.com/am.webapp/i18n/Acct_Mgmt_en.json
  ibkrjp: ["EUR", "GBP", "JPY", "USD"],
  // Two accounts. The NSE account is with IB India: INR only (the funding
  // tool for an Indian resident answers ibEntity "IN", INR alone; "Accounts
  // opened via IBKR (India) Pvt. Ltd can only use INR as the base currency").
  // Overseas trading is a separate Interactive Brokers LLC account paid in by
  // an LRS remittance, which the bank converts from rupees "to US$ or another
  // currency such as EUR or JPY". It is credited in that currency and held
  // there, as in any IB LLC account (same wire currencies as ibkrus).
  // https://www.interactivebrokers.co.in/aces/Funding/Methods/Currencies?type=DEPOSIT&colr=IND
  // https://www.interactivebrokers.com/en/accounts/configuring-your-account.php
  // https://www.interactivebrokers.com/webinars/2020-WB-3329-InvestinginGlobalMarketsthroughInteractiveBrokersforIndianResidents.pdf
  // https://www.interactivebrokers.com/webinars/2017-WB-2760DemystifyInvestinginGlobalMarketsforIndianResidents.pdf
  ibkrin: ["AED", "AUD", "CAD", "CHF", "CNH", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "ILS", "INR", "JPY", "MXN", "NOK", "NZD", "PLN", "SEK", "SGD", "TRY", "USD", "ZAR"],
  // Money comes in by SEPA transfer to an IBAN Wealthyhood gives, by debit
  // card, or by Apple Pay and Google Pay. Plans are priced in euros. An order
  // in another currency is converted from the account's currency at an FX
  // spread. No second cash currency is named.
  // https://wealthyhood.com/eu/help-centre/deposits-withdrawals
  // https://wealthyhood.com/eu/help-centre/plans-pricing-faq
  wealthyhoodgr: ["EUR"],
  // The minimum first deposit is printed for sterling and for euros. Cash
  // is held in cash accounts in the relevant currency, and euros are paid
  // out by SEPA. No other deposit currency is named.
  // https://www.idealing.com/en/help/account_operations
  // https://www.idealing.com/en/help/terms/view?terms=TERMS_AND_CONDITIONS_06APR2026
  // https://www.idealing.com/en/help/services_and_prices
  idealing: ["GBP", "EUR"],
  // The bank details of 1 September 2026 are rubles only, at NSD. The rules
  // let foreign currency in under a list posted on alorbroker.ru; that site
  // did not answer and the list was not read. Cash at the desk is rubles
  // only. USD, EUR, CNY and CHF on the 2022 sheet are no longer printed.
  // https://storage.alorbroker.ru/openinfo/%D0%A0%D0%B5%D0%BA%D0%B2%D0%B8%D0%B7%D0%B8%D1%82%D1%8B.pdf
  // https://storage.alorbroker.ru/openinfo-reglaments/%D0%A0%D0%B5%D0%B3%D0%BB%D0%B0%D0%BC%D0%B5%D0%BD%D1%82%20%D0%B1%D1%80%D0%BE%D0%BA%D0%B5%D1%80%D1%81%D0%BA%D0%BE%D0%B3%D0%BE%20%D0%BE%D0%B1%D1%81%D0%BB%D1%83%D0%B6%D0%B8%D0%B2%D0%B0%D0%BD%D0%B8%D1%8F_02.09.2026.pdf
  alor: ["RUB"],
  // A brokerage account opens in rubles, dollars and euros. Yuan, Hong Kong
  // dollars, pounds, francs, Turkish lira and Belarusian rubles can also be
  // paid in. The account must be open in the currency of the deposit, so it
  // is left there. The help article is dated 21 October 2022.
  // https://alfabank.ru/help/articles/investments/kak-popolnit-brokerskij-schet/
  alfainvest: ["RUB", "USD", "EUR", "CNY", "HKD", "GBP", "CHF", "TRY", "BYN"],
  // The account is funded in the My Coris Bourse app by mobile money (Orange
  // Money, Moov Money, Wave) or by a bank transfer from any UEMOA bank to
  // Coris Bourse's account. The minimum is 50,000 FCFA. No other currency
  // is named.
  // https://www.coris-bourse.com/nos-services-produits/particuliers
  // https://www.coris-bourse.com/nos-services-produits/digital
  corisbourse: ["XOF"],
  // The cash-deposit page funds the securities account by wallet (Orange
  // Money, Wave) or bank card, paid from Senegal or Cote d'Ivoire. The
  // page's payment script sets the currency to XOF. No other currency is
  // named.
  // https://invictuscapfin.com/depot-cash
  invictus: ["XOF"],
  // The DSE FAQ says an order on the mobile trading platform is paid with a
  // control number that is valid for 24 hours. The investor web front prints
  // amounts in TZS. No page names a deposit currency or a foreign-currency
  // balance. The only evidence is the local exchange and its local payment
  // system, so the list is shillings. The evidence is thin.
  // https://dse.co.tz/faqs
  // https://investor.dse.co.tz/
  dsehisa: ["TZS"],
  // MCB Securities settles every trade through the client's MCB Ltd account
  // ("only MCB Ltd accepted for trade settlements"); the online form takes
  // an MCB account in MUR, USD, EUR, GBP and ZAR. The CDS settles in the
  // security's currency and never converts it (MCBSL "shall not be held
  // responsible for any currency conversions").
  // https://ipo.mcbcapitalmarkets.mu/documents/Documents%20to%20bring%20along.pdf
  // https://stockexchangeofmauritius.com/cds/clearing-settlement-services
  mcbsecurities: ["MUR", "USD", "EUR", "GBP", "ZAR"],
  // A local client opens the account with an AYA Bank account. A
  // non-resident gives a bank account abroad and N-KAS and N-FAS numbers,
  // the bank's non-resident kyat and foreign-currency accounts. Every amount
  // on the broker's pages is in kyat (a block trade is MMK 30 million). No
  // foreign-currency balance at the broker is named.
  // https://www.ayatrustsc.com/equity
  // https://www.ayatrustsc.com/ac-opening
  // https://www.ayatrustsc.com/foreign-participation
  aya: ["MMK"],
  // A cash deposit or a transfer goes to the SBI Royal cash collection
  // account at Canadia Bank. The FAQ still says trading and settlement are
  // in riel. SBI Royal's notice of 16 January 2024 says the CSX now lets a
  // trade priced in riel settle in dollars, so a dollar balance pays for a
  // trade without first being turned into riel. No other currency is named.
  // https://www.sbiroyal.com.kh/faq/
  // https://www.sbiroyal.com.kh/new-trading-mechanism-with-usd-settlement/
  sbiroyal: ["KHR", "USD"],
  // Money comes in by bank transfer "in multiple currencies". The terms
  // convert any funding that is not in the account's base currency and keep
  // the rest in that base currency. The terms do not name it, but the
  // account-closure floor (USD 5), dividend rounding (USD 0.01) and every fee
  // are in dollars, and only US shares and ETFs are sold. Other currencies
  // are converted on arrival.
  // https://tabadulat.com/terms-conditions?tab=terms
  // https://tabadulat.com/
  // https://tabadulat.com/pricing
  tabadulat: ["USD"],
  // An account is opened with a mainland ID card and a bank card, and cash
  // moves through a third-party custody bank. Idle cash can sit in
  // Tiantianbao, a money fund. B-shares are not traded, and no page names a
  // foreign-currency balance. The only evidence is the mainland bank link,
  // so the list is renminbi.
  // https://kh.eastmoney.com/Account/Step1
  eastmoney: ["CNY"],
  // Money arrives by BEFTN, EFTN or RTGS, or by bKash, all taka rails. A
  // non-resident Bangladeshi funds the BO account from a Non-Resident
  // Investor's Taka Account (NITA) at BRAC Bank, so foreign money becomes
  // taka before it reaches the broker. No foreign-currency balance is named.
  // https://www.bracepl.com/brokerage/products/item/eft-bftn-rtgs
  // https://www.bracepl.com/brokerage/products/item/besl-probashi-biniyog
  // https://www.bracepl.com/brokerage/products/item/nrb-brokerage-service
  bracepl: ["BDT"],
  // Euros are paid in by transfer and held on the Verrechnungskonto. A free
  // Fremdwährungskonto can be opened in USD, GBP, CAD, AUD, NOK, SGD, TRY,
  // ZAR, JPY or SEK and picked as the settlement account for an order on a
  // foreign exchange quoted in that currency; the price list charges for
  // foreign-currency credits, so a payment in that currency lands as is.
  // CHF is not on the product page and is left out.
  // https://www.consorsbank.de/web/Sparen-Anlegen/Anlegen/Fremdwaehrungskonto
  // https://www.consorsbank.de/t5/H%c3%a4ufige-Fragen/Wie-er%c3%b6ffne-ich-ein-Fremdw%c3%a4hrungskonto-und-welche-W%c3%a4hrungen-sind/ta-p/143
  consorsbank: ["EUR", "USD", "GBP", "CAD", "AUD", "NOK", "SGD", "TRY", "ZAR", "JPY", "SEK"],
  // The MT5 Global account is opened in USD or EUR, and a bank transfer,
  // card or Skrill payment in that currency is credited as is. The pages
  // also name RUB, but no Russian share is sold (see just2trade_scraping),
  // so it is left out.
  // https://j2t.com/en/solutions/mt5globaldescription/
  // https://j2t.com/solutions/mt5global/deposit/
  just2trade: ["USD", "EUR"],
  // ACH or a wire from the client's own US account, in dollars; an
  // international wire is not accepted. The account holds dollars only.
  // https://support.sofi.com/hc/en-us/articles/4408300652813-How-do-I-send-a-wire-to-my-SoFi-Invest-account
  sofi: ["USD"],
  // Yen is paid in by transfer and held as yen. Dollars, euros and
  // Australian dollars can be wired in from another bank and kept as
  // foreign currency, and online foreign shares settle in their own
  // currency from that balance. Hong Kong dollars can be held but no page
  // says they can be wired in, so HKD is left out.
  // https://www.nomura.co.jp/onlineservice/help/rule/deal_inquiry/fstock_rule.html
  // https://www.nomura.co.jp/service/f_exchange
  // https://www.nomura.co.jp/support/procedure/service/f_refund/
  nomurajp: ["JPY", "USD", "EUR", "AUD"],
  // Yen is paid in by quick deposit or transfer. DMM does not accept a
  // foreign-currency deposit ("外貨による入金は承っておりません"): dollars are
  // held only from a sale or a yen-to-dollar exchange in the account.
  // https://kabu.dmm.com/support/faqs/article/00084/
  // https://kabu.dmm.com/us/settlement/
  dmm: ["JPY"],
  // The Direct service quotes a sterling cash rate only; money in another
  // currency is converted, and an overseas trade carries an FX charge. No
  // official page says "sterling only" in so many words.
  // https://www.charles-stanley.co.uk/services/invest/terms-conditions
  charlesstanley: ["GBP"],
  // A SWIFT transfer must be in dollars ("Transfers must be in dollars
  // (USD)"), as are ACH and the local USD routes; a local-currency transfer
  // is converted to dollars. The account is held in dollars.
  // https://help.hapi.trade/en/articles/8945476-how-can-i-fund-my-account
  // https://hapi.trade/en/blog/how-to-make-deposits-and-withdrawals-on-hapi
  hapi: ["USD"],
  // BG Trader: one EUR and one USD IBAN at UBB; the account currency is the
  // client's choice (BGN gone with the euro on 1 Jan 2026). A deposit in
  // another currency than the account's is converted at BenchMark's rate.
  // https://www.benchmark.bg/Внос-на-средства_545.html
  // https://www.benchmark.bg/real_account.php
  // https://www.benchmark.bg/online_form/General_terms_2026_BG.pdf
  benchmark: ["EUR", "USD"],
  // Every deposit account (shares/ETF, wallet) is a CZK account at CSOB.
  // Base currency is CZK (terms, "Zakladni mena"); Investona converts for
  // a foreign title itself ("O prevod men se postarame my").
  // https://www.investona.cz/static/bankovni_spojeni.pdf
  // https://www.investona.cz/static/obchodni_podminky.pdf
  // https://www.investona.cz/cenik
  investona: ["CZK"],
  // SPACE ucet MINI, free when used only for securities, is held in EUR or
  // in USD, CZK, GBP, HUF or PLN. An order settles on the account it names;
  // a security in another currency is converted at the bank's rate.
  // https://www.slsp.sk/sk/ludia/ucty/space-ucet-mini
  // https://www.slsp.sk/content/dam/sk/slsp/www_slsp_sk/documents/zverejnenia/zverejnenie-spotrebitel-ucty.pdf
  // https://www.slsp.sk/content/dam/sk/slsp/www_slsp_sk/documents/zverejnenia/podmienky-investovania-do-cennych-papierov.pdf
  slsp: ["EUR", "USD", "CZK", "GBP", "HUF", "PLN"],
  // Regulations §7d: cash accounts in PLN, EUR, USD, GBP and CHF ("inwestycje
  // w 5 walutach").
  // https://unicredit.pl/indywidualni/inwestycje/inwestowanie-samodzielne
  // https://unicredit.pl/dam/jcr:c4bf5152-a0f7-4fb7-a0b1-ec58853eb789/Regulamin%20%C5%9Bwiadczenia%20us%C5%82ug%20maklerskich%20(przyjmowanie,%20przekazywanie%20i%20wykonywanie%20zlece%C5%84,%20prowadzenie%20rachunku).pdf
  unicreditpl: ["PLN", "EUR", "USD", "GBP", "CHF"],
  // Up to two live MT5 accounts, each with its own base currency: EUR, USD,
  // GBP, PLN, RON. Real stocks are bought on the MT5 account. A deposit in
  // another currency than the base is converted.
  // https://nagamarkets.zendesk.com/hc/en-gb/articles/13801518527516-How-can-I-add-a-trading-account
  // https://nagamarkets.zendesk.com/hc/en-gb/articles/13994925749916-I-deposited-funds-and-the-amount-that-I-received-differs-from-what-I-sent
  nagacy: ["EUR", "USD", "GBP", "PLN", "RON"],
  // Share-dealing terms: base currency USD, EUR or GBP; the stocks fee page
  // gives a minimum deposit of "20 USD/EUR/GBP or 100 PLN".
  // https://capital.com/en-eu/ways-to-trade/fees-and-charges/stocks
  // https://capital.com/terms-and-conditions-share-dealing-cceu
  capitalcomcy: ["EUR", "USD", "GBP", "PLN"],
  // A linked bank account in NEO Invest or a transfer to the 0116C… account
  // at VPBank or MB116C… at MB. The guide names no other currency.
  // https://hdsd.vpbanks.com.vn/giao-dich-tien/nap-tien
  vpbanks: ["VND"],
  // Cash at the counter, a fast transfer to the 042C… account at VPBank, or
  // a transfer to TVS's accounts at Vietnamese banks. No other currency.
  // https://www.tvs.vn/api/files/Update-huong-dan-nop-tien-vao-tai-khoan.pdf
  tvs: ["VND"],
  // No page names a currency; fees are in taka, the form asks for a local
  // bank account with a routing number, and an NRB's foreign currency is
  // converted to taka through a NITA before it reaches the broker.
  // https://www.islamibanksecurities.com/Services/NRBBrokerageService.php
  // https://www.islamibanksecurities.com/Services/documents/NRB%20Guidelines.pdf
  ibsl: ["BDT"],
  // From a T-Bank debit card or savings account: roubles, US dollars, yuan,
  // Turkish lira, tenge and Belarusian roubles. Another bank's card or SBP
  // pays in roubles. Euros and drams are not on the deposit list.
  // https://www.tbank.ru/invest/help/brokerage/account/trade-on-bs/insert-money/
  tinvest: ["RUB", "USD", "CNY", "TRY", "KZT", "BYN"],
  // A trading account is opened in dollars or euros, and up to four can
  // be held side by side. The currency cannot be changed later. A peso
  // transfer is free but lands converted, since no peso account exists.
  // A transfer between accounts in two currencies is an FX order at 0.5%.
  // https://www.xtb.com/cl/centro-de-ayuda/cuenta-de-inversion/puedo-cambiar-la-divisa-de-mi-cuenta-de-inversiones
  // https://www.xtb.com/cl/cuenta-y-tarifas
  // https://www.xtb.com/cl/centro-de-ayuda/tarifas-y-comisiones/puedo-transferir-fondos-entre-mis-cuentas-de-trading
  xtbcl: ["USD", "EUR"],
  // A deposit is Australian dollars from an Australian bank, by PayID or
  // BSB transfer, and stays in dollars. International transfers are
  // refused. US dollars are a Currency Exchange inside the app; the help
  // page sends a client who wants to pay in dollars to customer service.
  // https://www.moomoo.com/au/support/topic6_344
  // https://www.moomoo.com/au/support/topic6_418
  // https://www.moomoo.com/au/support/topic6_333
  moomooau: ["AUD"],
  // FPX, GXBank Express Deposit and bank transfer are each listed with
  // ringgit as the only currency, and a withdrawal is ringgit only.
  // Dollars and Hong Kong dollars come from a Currency Exchange inside
  // the account, not from a deposit.
  // https://www.moomoo.com/my/support/topic9_585
  // https://www.moomoo.com/my/support/topic9_113
  // https://www.moomoo.com/my/support/topic9_332
  moomoomy: ["MYR"],
  // Terms 3.1 and 4.1: a payment in is pounds sterling and all cash is
  // held in pounds. Dealing term 1.16: a deal or a dividend in another
  // currency is converted to or from sterling.
  // https://dodl.co.uk/terms-and-conditions
  // https://help.dodl.co.uk/en/articles/6655200-what-are-foreign-exchange-fx-charges
  dodl: ["GBP"],
  // Terms 4.2 and section 8 (effective 24 August 2026): every payment to
  // or from the nominated bank is pounds, and the account settles in
  // pounds. A receipt in another currency is converted. The nominated
  // bank is in the UK, Jersey, Guernsey or the Isle of Man.
  // https://www.bankofscotland.co.uk/assets/pdf/sharedealing/filestore/bankofscotlandsharedealing_termsandconds.pdf
  bankofscotland: ["GBP"],
  // Terms 4.2 and section 8 (effective 24 August 2026): every payment to
  // or from the nominated bank is pounds, and the account settles in
  // pounds. A receipt in another currency is converted. The nominated
  // bank is in the UK, Jersey, Guernsey or the Isle of Man.
  // https://www.scottishwidows.co.uk/assets/literature/docs/terms-and-conditions.pdf
  scottishwidows: ["GBP"],
  // The ISA and Investment Account terms (06/2025): all payments must be
  // made in sterling, and all orders and valuations are in sterling only.
  // A non-sterling holding from a corporate action is sold and paid into
  // the cash account in sterling.
  // https://static.aviva.io/content/dam/document-library/adviser/customerplatform/rd02002c.pdf
  // https://static.aviva.io/content/dam/document-library/adviser/customerplatform/rd03003c.pdf
  aviva: ["GBP"],
  // Bloomo takes no deposit in dollars or any other foreign currency;
  // money is paid in as yen (FAQ of 6 November 2025). Dollars for a US
  // trade are bought with that yen, which is a conversion.
  // https://bloomo.co.jp/support/deposit/ドルなどの外貨で入金することはできますか
  // https://bloomo.co.jp/support/deposit/sub-category/入金
  bloomo: ["JPY"],
  // A transfer to the client's VPBank identification account, by Napas
  // 247 from any Vietnamese bank, or to APS's VPBank collection account
  // is credited to the ordinary or margin sub-account and left there.
  // The page names no other currency.
  // https://apec.com.vn/ho-tro/nop-rut-tien-co-phieu/
  apec: ["VND"],
  // A transfer through the securities tab of a VCB, BIDV, VietinBank,
  // VPBank, MSB or Techcombank app, or to the KBSV identification account
  // at BIDV, is credited to the SA or MA sub-account and left there. The
  // page names no other currency.
  // https://www.kbsec.com.vn/vi/giao-dich-tien.htm
  // https://www.kbsec.com.vn/vi/huong-dan-giao-dich-tien.htm
  kbsvn: ["VND"],
  // Pesos paid to the peso CBU stay pesos. Dollars paid to the dollar CBU
  // at Banco Comafi stay dollars (local MEP dollars). Nothing published
  // takes a wire from abroad, so there is no cable balance. An account
  // needs an address in Argentina.
  // https://www.comafi.com.ar/bursatil/json/apps/GetFaq.aspx?note=2694
  // https://www.comafi.com.ar/bursatil/dolar-mep.aspx
  comafi: ["ARS", "USD"],
  // Terms clause 2: cash is booked in sub-accounts kept apart by currency.
  // Pesos and local dollars come by transfer from the client's own bank in
  // Argentina. The fee sheet charges u$s 100 for a money transfer received
  // from abroad, and clause 7 lets cash go to the client's bank abroad, so
  // cable dollars can be paid in and held as dollars. The FAQ names only
  // local banks, so the cable route is the less certain part.
  // https://giobursatil.com.ar/wp-content/uploads/2024/03/Términos-y-condiciones-de-cuenta-Vigente-2023.pdf
  // https://giobursatil.com.ar/wp-content/uploads/2021/09/Comisiones-y-Aranceles-092021.pdf
  // https://giobursatil.com.ar/preguntas-frecuentes/
  gio: ["ARS", "USD"],
  // One folder per Webull entity (the plans the single "webull" folder had).
  webullus: ["USD"],
  webulluk: ["GBP"],
  webulleu: ["EUR"],
  // Webull SG telegraphic transfer: SGD, USD, HKD (https://www.webull.com.sg/blog/1).
  webullsg: ["SGD", "USD", "HKD"],
  webullca: ["CAD", "USD"],
  // Webull AU: PayTo in AUD (FAQ 1553), USD deposits (FAQ 1987); no CNH (FAQ 1548).
  webullau: ["AUD", "USD"],
  // Webull HK deposit notes: HKD, RMB and USD (https://www.webull.hk/en/hc/categories/fq1134-Deposit-Notes).
  webullhk: ["HKD", "CNH", "USD"],

  // ---- catalogues added 2026-10-21 (sources: each broker's own pages) ----
  // A deposit goes by M-Pesa to paybill 111220, with the CDSC number as
  // the account, or by a bank deposit to ABC Capital's account at ABC
  // Bank, Koinange branch. Fees, the minimum and the purchase and sale
  // forms are all in shillings. The NSE's two dollar REITs are on the
  // board, but no dollar account is named.
  // https://www.abccapital.co.ke/faqtwo/
  // https://www.abccapital.co.ke/wp-content/uploads/2023/10/Purchase-instruction-request-form.pdf
  // https://www.abccapital.co.ke/wp-content/uploads/2026/06/Account-Opening-Forms-Individuals.pdf
  abccapital: ["KES"],
  // Pesos paid to the client's CVU stay pesos. Dollars paid by the option
  // "U$S Dolar Local" to LBO S.A.'s account stay dollars (local MEP
  // dollars). Both must come from an account in the client's own name, and
  // both are withdrawn to a CBU/CVU free of charge. No route takes a wire
  // from abroad, so there is no cable balance. Another currency is not a
  // deposit that stays.
  // https://www.acuantoesta.com.ar/tutoriales
  // https://www.acuantoesta.com.ar/tarifario-comisiones
  acuantoesta: ["ARS", "USD"],
  // Every depot is a multi-currency account at IBIE: cash balances in
  // several currencies are held "und werden nicht automatisch umgewandelt";
  // only the client converts. The payment FAQ names the deposit and
  // withdrawal currencies: EUR, DKK, ILS, NOK, GBP, PLN, SEK, CHF, CZK, HUF
  // and USD. A balance in another currency must be exchanged first.
  // https://www.agora-direct.com/de/lerncenter/zahlungshinweise/
  // https://www.agora-direct.com/de/depot/ablauf-voraussetzungen/
  agoradirect: ["EUR", "USD", "CHF", "GBP", "CZK", "DKK", "HUF", "ILS", "NOK", "PLN", "SEK"],
  // The ordinary account holds the client's shares and cash. Spare cash
  // is put into Attijari Obligataire SICAV, a dinar fund, and sold back
  // to pay for purchases. Fees are in dinars. No other currency is named.
  // https://ati.attijaribourse.com.tn/AttijariBourse/documents-utiles
  // https://ati.attijaribourse.com.tn/AttijariBourse/assets/documents/CONVENTION_ORDINAIRE_LIBRE.pdf
  attijaritn: ["TND"],
  // Before buying, the client moves money from a savings account at BCEL
  // into BCEL-KT's account, through BCEL One, i-bank or a BCEL counter.
  // The account-opening page says that bank account is in kip only (opening
  // fee 10,000 kip, minimum 50,000 kip), for Lao and foreign clients alike.
  // Every LSX price is in kip. No other currency is named.
  // https://www.bcel-kt.com/index.php?id=10&r=site%2Fdisplay
  // https://www.bcel-kt.com/index.php?id=11&r=site%2Fdisplay
  // https://www.bcel-kt.com/index.php?id=12&r=site%2Fdisplay
  bcelkt: ["LAK"],
  // The free account is one securities and cash account, opened by the
  // convention. Fees are taken from it in dinars, and idle cash may be
  // put into BTK SICAV, a dinar fund. No other currency is named.
  // https://www.btkconseil.com/nos-produits/compte-libres/
  // https://www.btkconseil.com/download/convention-compte-libre-cea/
  btkconseil: ["TND"],
  // A cash deposit or a transfer at Canadia Bank, a KHQR payment or a
  // SWIFT wire to the CANA SEC. (CASH COLLECTION) account credits the
  // trading account. The FAQ says clients deposit KHR or USD into the
  // trading account before they place an order, and the cash account at
  // Canadia Bank opens with KHR 40,000 or USD 10. Shares trade in riel, and
  // the withdrawal forms ask for the amount in riel. No other currency is
  // named.
  // https://canasecurities.com.kh/faqs/
  // https://canasecurities.com.kh/bank-account/
  // https://canasecurities.com.kh/cash-deposit-withdrawal-instruction/
  // https://canasecurities.com.kh/securities-trading/
  canadia: ["KHR", "USD"],
  // Money for a buy order is wired to the Captin deposit account at ABN
  // AMRO (NL89ABNA0143959956), with the Captin account number. Fees are in
  // euro, and every title, on the MTF and on Euronext Amsterdam, trades in
  // euro. Captin is not a bank: unused funds go back to the contra account
  // after five days. No other currency is named.
  // https://support.captin.com/api/v2/help_center/en-gb/articles/11829486217245.json
  // https://support.captin.com/api/v2/help_center/en-gb/articles/11730586678941.json
  // https://support.captin.com/api/v2/help_center/en-gb/articles/10470045920541.json
  captin: ["EUR"],
  // A deposit at a CB Bank branch, or through CB Mobile Banking or CB Pay,
  // goes to the CB Securities trust account at CB Bank. Withdrawals go back
  // to the client's CB Bank account. A foreign client must also give a CB
  // Bank account in MMK. Every fee and price is in kyat. No foreign-currency
  // balance is named.
  // https://cbsecurities.com.mm/deposit-withdraw-funds/
  // https://cbsecurities.com.mm/account-opening-2/
  // https://cbsecurities.com.mm/trading-fees/
  cbsecurities: ["MMK"],
  // The account opened is a securities and cash account. The opening
  // form asks for the first deposit in MAD, and the tariff is in
  // dirhams. Non-residents also give a bank RIB. No other currency is
  // named.
  // https://www.cdgcapitalbourse.ma/OuvrirCompte
  // https://www.cdgcapitalbourse.ma/Produits/Tarifications
  cdgcapital: ["MAD"],
  // Money is transferred from the client's registered bank account to the
  // trading account. A payment from a third-party or unregistered account is
  // refunded to its source. A withdrawal goes to the default bank. Charges
  // are in rupees. An NRI can open an account, but only offline, and no
  // foreign-currency balance is named.
  // https://www.cholasecurities.com/faq
  // https://www.cholasecurities.com/pricing
  chola: ["INR"],
  // A deposit is a bank transfer from the client's Qatari bank account
  // registered with Dlala to one of its accounts at QNB, CBQ, Masraf Al
  // Rayan or QIB, quoting the shareholder number. Every QSE line trades in
  // riyals. No other currency is named.
  // https://www.dlalabroker.com/en/about-us/faq/
  // https://www.dlalabroker.com/wp-content/uploads/2021/08/Bank_Accounts_Con_EN.pdf
  dlala: ["QAR"],
  // Share trading is settled on a krone bank account. A foreign trade is
  // converted to kroner straight after execution, buy or sell, and the
  // sale proceeds are credited in kroner: "all transfers to your account
  // are in Norwegian kroner". No currency account is used for trading.
  // https://www.dnb.no/markets/aksjer/utenlandske-aksjer
  // https://www.dnb.no/dnbnyheter/no/bors-og-marked/kjope-aksjer-utlandet
  dnb: ["NOK"],
  // The account at IBIE is a multi-currency account: "Je kunt er geld op
  // hebben in verschillende munten, zoals euro's en dollars." A deposit
  // can be made in another currency than euro, e.g. dollars, picked in the
  // portal. A balance is converted only by the client ("Convert Currency")
  // or by AutoFX when a trade needs a currency the account lacks. The
  // "Zelf valuta wisselen" table lists the 26 balances the account holds.
  // https://www.easybroker.nl/support/wat-is-een-multivalutaaccount
  // https://www.easybroker.nl/support/geld-storten-in-andere-valuta
  // https://www.easybroker.nl/support/waarom-heb-ik-een-negatief-vreemd-valuta-saldo
  // https://www.easybroker.nl/tarieven
  easybroker: ["EUR", "USD", "AED", "AUD", "BGN", "CAD", "CHF", "CNH", "CZK", "DKK", "GBP", "HKD", "HUF", "ILS", "JPY", "KRW", "MXN", "NOK", "NZD", "PLN", "RON", "SAR", "SEK", "SGD", "TRY", "ZAR"],
  // Ecuador uses the US dollar. Portafolio says to transfer funds and pays
  // withdrawals to the client's registered bank account, but it names no
  // currency for either. Every title on the list is priced in dollars,
  // the approved tariff charges a minimum of US$ 20.00 per equity trade,
  // and the first investment starts at $500. So the cash is dollars.
  // https://www.futurocasadevalores.com/portafolio
  // https://www.futurocasadevalores.com/assets/documentos/resolucion-aprobacion/TARIFAS_APROBADAS_FCV_2024.pdf
  futuro: ["USD"],
  // A Jamaican-dollar payment (RTGS, internal transfer) lands in the
  // client's JMD account. GK prices an incoming wire in US$ and pays out
  // US$ cheques and wires, and its terms say a share traded in a currency
  // other than JMD settles in that currency, so a USD Market trade is paid
  // from and into dollars. A GBP draft is a payment service; no other cash
  // currency is named.
  // https://gk-capital.com/pricing-commission-fees/
  // https://gk-capital.com/wp-content/uploads/2023/07/gk-capital-general-terms-and-conditions.pdf
  gkcapital: ["JMD", "USD"],
  // The only deposit is a weekly ACH debit from the one linked US bank
  // account, in dollars, held as cash or spent on stock at Apex. The
  // program is for US citizens only and is not offered outside the
  // United States.
  // https://www.grifin.com/legal/advisory-agreement
  // https://help.grifin.com/knowledge/how-many-banks-or-cards-can-i-connect-to-grifin
  grifin: ["USD"],
  // The Cuenta Inversor settles against the client's own savings
  // accounts ("Todas las operaciones liquidan contra tu Caja de Ahorro"),
  // one in pesos and one in dollars, both free. Pesos stay pesos. Dollars
  // paid to the dollar account, or produced by an MEP sale, stay dollars.
  // Euros are only bought in cash at a branch and settle nothing. Another
  // currency is not a deposit that stays.
  // https://www.hipotecario.com.ar/buhobank/buho-inversor/
  // https://www.hipotecario.com.ar/personas/comisiones-cargos-y-tasas/
  hipotecario: ["ARS", "USD"],
  // Money comes in by bank transfer to the iVestor IBAN at Emirates NBD,
  // or as cash at an ENBD ATM (from AED 100) or branch. It is moved from
  // the card account to the trading fund account at xCube, the daily
  // top-up limit being AED 150,000. Commission and every DFM line are in
  // dirhams. Card use abroad is at forex rates. No other balance is named.
  // https://ivestor.ae/support/
  // https://www.xcube.ae/pricing/
  ivestor: ["AED"],
  // A US$ wire to JN's account at Citibank New York is credited to the
  // client's account in dollars. Repo, bond and equity money in Jamaican
  // dollars comes by ACH or RTGS to JN Bank. The fee schedule treats local
  // and foreign accounts separately (a stop payment costs J$1,000 or US$30),
  // and repo rates are quoted in both. Wire fees are also priced in CAD,
  // GBP and EUR, but no account in those currencies is named.
  // https://www.jnfunds.com/wp-content/uploads/Incoming-Funds-Information-sheet-October-2025.pdf
  // https://www.jnfunds.com/wp-content/uploads/JNFM-Fee-Schedule-Updated-2025.pdf
  // https://www.jnfunds.com/rates/
  jnfund: ["JMD", "USD"],
  // Funds are added by net banking, UPI or a bank transfer from the bank
  // account given at KYC, with PAN and Aadhaar. Every charge and order is in
  // rupees. The pages name no other currency and no foreign-currency balance.
  // https://lemonn.co.in/open-delivery-trading-account
  // https://lemonn.co.in/blog/faq/how-can-i-add-money-to-a-trading-account/
  lemonn: ["INR"],
  // Terms 3.6.1: every contribution is pounds sterling, and only from the
  // linked personal bank account. Terms 5.5: an investment, proceeds or a
  // corporate action in another currency is converted to sterling. US
  // shares carry a 0.45% conversion on the sterling value. No dollar
  // balance is left.
  // https://support.moneyboxapp.com/terms-and-conditions/
  // https://support.moneyboxapp.com/fees-and-charges
  moneybox: ["GBP"],
  // EFT and wire take CAD or USD into a cash, margin or TFSA account, and
  // each is kept in its own currency: a deficit in one currency is netted
  // against the other in buying power, and moving between them is a
  // Currency Exchange at the moomoo rate. Interac e-Transfer and bill
  // payment are CAD only, and an RRSP takes CAD only.
  // https://www.moomoo.com/ca/support/topic10_94
  // https://www.moomoo.com/ca/support/topic10_96
  // https://www.moomoo.com/ca/support/topic10_16
  // https://www.moomoo.com/ca/support/topic10_125
  moomooca: ["CAD", "USD"],
  // An NCB Capital Markets account is linked to NCB bank accounts, and
  // cash moves between them only in the same currency ("JMD to USD
  // transfers are not allowed"), so a Jamaican-dollar or US-dollar
  // balance is left as it is. The base currency is JMD. Wealth Access
  // repos also come in EUR, CAD and GBP, but a repo is an investment,
  // not a cash balance for shares.
  // https://www.ncbcapitalmarkets.com/images/NCBCM_Online_Client_Manual.pdf
  // https://www.ncbcapitalmarkets.com/wealthmanagement/products/moneymarketsecurities
  // https://www.ncbcapitalmarkets.com/wealthmanagement/products/stocks
  ncbcm: ["JMD", "USD"],
  // Neway is the ESX app. The investor adds funds to the investor account
  // as the trading member directs, and no page names a deposit currency or
  // a foreign-currency balance. Every ESX line is quoted in birr and the
  // ESX fee schedule is in ETB, so the list is the market's currency. The
  // evidence is thin.
  // https://esx.et/equity-market/invest/
  // https://esx.et/wp-content/uploads/2025/09/ESX-Fees.pdf
  neway: ["ETB"],
  // App terms 5.1 and 5.4: every cash payment is sterling, from a UK bank
  // or EMI account in the client's name. The order execution policy says
  // the cash account is GBP. A non-UK share is ordered in pounds and
  // Winterflood makes the FX trade, so no other currency is held.
  // https://www.quilterinvest.com/site-terms/terms-and-conditions-app
  // https://www.quilterinvest.com/site-terms/order-execution-policy
  // https://www.quilterinvest.com/pricing
  quilter: ["GBP"],
  // The platform runs in US dollars only. A deposit in another currency,
  // by card or by bank transfer from a Gulf bank, is converted to dollars
  // on arrival. No AED or SAR balance is kept.
  // https://raseedcapital.com/en/support/what-is-the-currency-that-is-used-on-raseed
  // https://raseedcapital.com/en/support/how-can-i-fund-my-account
  raseed: ["USD"],
  // Sbanken's share trading is DNB's aksjehandel, on a krone trading
  // account (handlekonto for aksjer). DNB converts a foreign trade to
  // kroner right after execution, buy or sell, so no other currency is
  // left on the account.
  // https://sbanken.no/priser
  // https://sbanken.no/spare/aksjer/aksjehandel
  // https://www.dnb.no/markets/aksjer/utenlandske-aksjer
  sbanken: ["NOK"],
  // Payments are made through the bank account linked to the trading
  // account, and collateral is loaded online in TMS (the site links
  // connectIPS and eSewa). Every brokerage slab, the SEBON fee and the DP
  // charge are in rupees. No foreign-currency account is named.
  // https://www.siprabi.com/pages/brokers/learn/faq
  // https://www.siprabi.com/pages/services/brokerage
  siprabi: ["NPR"],
  // The account holds a lira balance and a dollar balance. US shares are
  // bought from the dollar balance only. Lira is turned into dollars by a
  // conversion inside Slayz, and the dollars can be held, earn yield or be
  // withdrawn. Dinamik Menkul Değerler publishes TRY and USD collection
  // accounts at each of its banks, so a dollar transfer arrives as dollars.
  // It also lists EUR accounts, but Slayz shows no euro balance, so euros
  // are not listed.
  // https://slayz.app/sss/abd-borsalari
  // https://slayz.app/sss/doviz-al-sat
  // https://slayz.app/urunler/dolar-nemalandirma
  // https://www.dinamikmenkul.com.tr/page/hesap-ac/hesap-iban-bilgileri
  slayz: ["TRY", "USD"],
  // A deposit goes into the broker's settlement bank account, with the
  // voucher and the client code sent in. Collateral is loaded in TMS before
  // buying. Sale proceeds and withdrawals go to the registered bank account
  // only. Commission, the SEBON fee and the DP charge are in rupees. No
  // foreign-currency account is named.
  // https://sunsecurities.com/faqs
  // https://sunsecurities.com/fees
  // https://sunsecurities.com/services/securities-trading
  sunsecurities: ["NPR"],
  // Money is paid into one of the broker's accounts at Iranian banks, given
  // by account number and Sheba, with one set for each of the securities,
  // energy and commodity exchanges. The pages name no currency for these
  // accounts, but every board price is in rials and the FAQ amounts are in
  // rials and tomans. Sale proceeds stay in the online account at the broker
  // until a payment request sends them to the client's bank account. No
  // foreign-currency account is named.
  // https://fardabroker.ir/banks
  // https://fardabroker.ir/questions
  // https://fardabroker.ir/mliveboard
  tosee: ["IRR"],
  // A transfer goes to one of Tunisie Valeurs' accounts at Amen Bank and
  // is then credited to the securities account. Branches take cash and
  // cheques. The tariff is stated in dinars. No other currency is named.
  // https://www.tunisievaleurs.com/faq/
  // https://www.tunisievaleurs.com/nos-conditions-tarifaires/
  tunisievaleurs: ["TND"],
  // The trading cash account is funded by an FCA (Nostro) bank transfer
  // from any Zimbabwean bank, or by mobile money, from USD 10. Sale proceeds
  // and dividends are paid into the same wallet. VFEX trades, settles and
  // pays dividends only in US dollars. ZWG is ZSE Direct, a separate
  // platform.
  // https://vfexdirect.vfex.exchange/
  // https://vfexdirect.vfex.exchange/terms-and-conditions
  // https://ds88jcmqc11je.cloudfront.net/api/faqs?exchange=VFEX&category=General
  // https://ds88jcmqc11je.cloudfront.net/api/notices/19/download
  vfexdirect: ["USD"],
  // A deposit into the securities trading account is free and is held at
  // XTSC or at the designated payment bank. The account terms say a
  // deposit in a foreign currency is converted into dong at Vietcombank's
  // buying rate on the day, so no other currency is left as cash.
  // https://xtsc.vn/dieu-kien-dieu-khoan
  // https://xtsc.vn/bieu-phi
  xtsc: ["VND"],
  // One IBAN with 13 currency pockets: CHF, USD, EUR, GBP, JPY, AUD, CAD,
  // SEK, HKD, NOK, DKK, AED and SGD. A payment in one of these "will land
  // exactly in their dedicated place" and is not exchanged. Any other
  // currency is converted into the main currency (CHF) at 0.95%.
  // https://www.yuh.com/en/yuhlearn/what-heck-multi-currency-account-and-why-do-i-all-people-need-it/
  // https://www.yuh.com/en/pricing
  yuh: ["CHF", "EUR", "USD", "GBP", "JPY", "AUD", "CAD", "SEK", "HKD", "NOK", "DKK", "AED", "SGD"],
  // Pesos come in and go out through a linked peso savings account and stay pesos.
  // Dollars come in and go out through a linked dollar account (MEP dollars) or from a bank abroad (cable dollars), and stay dollars.
  // Euros cannot be traded in the account; euro income has to be withdrawn or converted ("Retiro/Conversión de euros").
  // https://ayuda.max.capital/es/articles/11044783-en-que-monedas-se-puede-operar-desde-la-cuenta-comitente
  // https://www.max.capital/cargos-y-comisiones/
  maxcapital: ["ARS",  "USD"],
  // The fee table lists free local transfers in and out, in pesos and in dollars ("Transferencias recepción-emisión en cuentas locales ($ y U$S) Sin Cargo"). Both stay in their currency.
  // Cable settlement is priced too ("Liquidaciones por Dólar Cable (por transacción) Hasta U$S 50"), so cable dollars are handled as dollars.
  // https://nacionbursatil.com.ar/assets/pdf/Tabla-de-Aranceles-y-Comisiones-2025_aprobados-Directorio-09-04-2025.pdf
  nacionbursatil: ["ARS",  "USD"],
  // The 'Depósitos y transferencias' page gives a Banco de Valores peso account (COHEN.PESOS), a Banco de Valores 'Dólar Mep' account (COHEN.DOLARES) and a Santander Bank N.A. 'Dólar Cable' account (Swift SVRNUS33). Pesos stay pesos. MEP and cable dollars stay dollars.
  // Transfers have to come from an account in the client's name. Cheques are taken at the office. Cash is not accepted.
  // https://www.cohen.com.ar/depositostransferencias/
  cohen: ["ARS",  "USD"],
  // The standing instructions give a Banco de Valores peso account (PARAKEET.PESOS), a Banco de Valores dollar account (PARAKEET.USD) and, under 'TRANSFERENCIAS BANCARIAS EN EL EXTERIOR (CABLE)', a Citibank NA account (Swift CITIUS33). Pesos stay pesos. MEP and cable dollars stay dollars.
  // The fee list charges up to USD 150 for transfers of dollars abroad (in or out) and up to USD 1.5 for local dollar transfers out.
  // https://www.parakeetcapital.com.ar/Informe/Legales/Instrucciones-Permanentes
  // https://www.parakeetcapital.com.ar/Informe/Legales/Comisiones
  parakeet: ["ARS",  "USD"],
  // Funds are added only by UPI or net banking from one of up to three Indian bank accounts linked and verified against the client's KYC; money from an unlinked account is refunded. No other currency is named; the catalogue is NSE/BSE in rupees.
  // https://univest.in/help-and-support/funds-or-ledger
  // https://univest.in/pricing
  univest: ["INR"],
  // Money is paid in by transfer from Vietnamese banks (BIDV, Eximbank, Sacombank, Techcombank virtual accounts; Vietcombank, VietinBank, ACB company accounts) to the client's 033C… sub-account; no other currency is named.
  // https://www.vdsc.com.vn/ho-tro/huong-dan-nha-dau-tu/danh-sach-ngan-hang-nop-tien--chuyen-khoan-g1
  vdsc: ["VND"],
  // The account form takes a Nigerian bank account (10-digit NUBAN), a BVN and a NIN. Cash paid in and retained sale proceeds stay in the stockbroking account, which buys only NGX lines in naira. No other currency is named.
  // https://atlassportfolios.com/individual-account/
  // https://atlassportfolios.com/
  atlass: ["NGN"],
  // The e-trade application asks for a bank, branch and account number (free text) and the requested purchase limit in dinars (د.ك); a withdrawal is requested as a cheque (FAQ). The broker trades Boursa Kuwait only, in dinars, and names no other currency.
  // https://www.efghermesifa.com/Login/Registration.aspx
  // https://www.efghermesifa.com/Public/FAQsAr.aspx
  efghermeskw: ["KWD"],
  // An Abidjan SGI on the BRVM: every line and every tariff amount is in FCFA, and the account opening asks for a bank statement. No other currency is named.
  // https://gekcapital.com/fr/devenir-client/
  // https://gekcapital.com/fr/simulateur/
  gekcapital: ["XOF"],
  // Merinvest holds no free cash (clause 12 b): trades settle from the client's bank account named for each currency it trades, and it takes no order on a dollar-denominated security unless a dollar account is named (clause 6). The BVC quotes most shares in bolívares and a few (GZL.A, GZL.B) in dollars, so both settle without conversion.
  // https://www.mercantilmerinvest.com/documents/condicionados-generales-cuenta-corretaje.docx
  merinvest: ["VES",  "USD"],
  // The Direkt-Depot settles against a euro Girokonto/Verrechnungskonto; the Preisübersicht prints no securities currency account.
  // Every catalogue line is a German place; a foreign-currency payment is converted at TARGOBANK's own rates (Preisübersicht 1.9, Anhang Fremdwährungsgeschäfte).
  // https://www.targobank.de/de/download/Preisubersicht.pdf
  // https://www.targobank.de/de/vermoegen/direkt-depot.html
  targobankde: ["EUR"],
  // Pricing page: 'When you deal, the share price is converted into pounds at the prevailing interbank exchange rate, by a UK-based market maker.' and 'Interest is only paid to cash balances held in pound sterling.' No currency account is offered.
  // https://eqi.co.uk/info/how-it-works/pricing
  eqi: ["GBP"],
  // Deposit and withdrawal are dollars only: "Currently, only USD is supported." (Which currency can I deposit? / withdraw?).
  // HKD and CNH are reached by an in-account exchange at the "Moomoo US comprehensive rate" (no spread printed), or by unified buying power borrowing that currency on margin.
  // https://www.moomoo.com/us/support/topic4_295
  // https://www.moomoo.com/us/support/topic4_296
  // https://www.moomoo.com/us/support/topic4_40
  // https://www.moomoo.com/us/support/topic4_475
  moomoous: ["USD"],
  // Payments go through the Nepali bank account linked to the trading account; collateral is loaded online in TMS (ConnectIPS / bank transfer / QR). Every brokerage band, the SEBON fee and the DP charge are in rupees. No foreign-currency account is named. Same as siprabi.
  // https://www.kumarisecurities.com/pages/services/brokerage
  // https://www.kumarisecurities.com/pages/brokers/learn/register
  // https://www.kumarisecurities.com/pages/brokers/learn/faq
  kumari: ["NPR"],
  // Payments go through the Nepali bank account linked to the trading account; collateral is loaded online in TMS (ConnectIPS / bank transfer / QR). Every brokerage band, the SEBON fee and the DP charge are in rupees. No foreign-currency account is named. Same as siprabi.
  // https://premiersecurities.com.np/pages/services/brokerage
  // https://premiersecurities.com.np/pages/procedure
  // https://premiersecurities.com.np/pages/faq/trading
  premiersecurities: ["NPR"],
  // Payments go through the Nepali bank account linked to the trading account; collateral is loaded online in TMS (ConnectIPS / bank transfer / QR). Every brokerage band, the SEBON fee and the DP charge are in rupees. No foreign-currency account is named. Same as siprabi.
  // https://mallastock.com/pages/brokers/services/trading
  // https://mallastock.com/pages/brokers/services/online
  // https://mallastock.com/pages/brokers/learn/faq
  mallastock: ["NPR"],
  // Payments go through the Nepali bank account linked to the trading account; collateral is loaded online in TMS (ConnectIPS / bank transfer / QR). Every brokerage band, the SEBON fee and the DP charge are in rupees. No foreign-currency account is named. Same as siprabi.
  // https://aryatarasecurities.com/pages/services/brokerage
  // https://aryatarasecurities.com/pages/services/online
  // https://aryatarasecurities.com/pages/blog/posts/FAQ
  aryatara: ["NPR"],
  // The shares account is in rupees; a non-resident funds it from a Roshan Digital Account through the CDC-designated bank account, which reaches the trading account in rupees.
  // https://abbasiandcompany.com/roshan-digital
  // https://abbasiandcompany.com/Documents/important_links/Fee%20Structure.pdf
  abbasi: ["PKR"],
  // Deposits are cheques or pay orders to 'Standard Capital Securities (Pvt) Ltd C/A' or transfers to its rupee accounts (PK IBANs at eleven banks). A non-resident uses a Roshan Digital Account. No other currency is named.
  // https://www.scstrade.com/OnlineTrading/OT_FundTransferPro.aspx
  // https://www.scstrade.com/OnlineTrading/OT_OnlineTradingRoshanDigital.aspx
  standardcapital: ["PKR"],
  // The online account (opened in Dosikaa, the AIB DigiTrader app or the
  // ActiveTrader web platform) is funded by M-Pesa: the DigiTrader terms,
  // clause 3(vi), say "All deposits and disbursements for investment
  // purposes shall be restricted to Mpesa" until a regular account is
  // opened at the office. The FAQ and the funding sheet give M-Pesa paybill
  // 548800 (CDSC number as the account) and bank deposits at Equity Bank
  // and Stanbic, with no dollar account. Fees, levies and the tariff are in
  // shillings. A US-dollar account at Bank of Africa is named only for
  // funding Global Markets orders, which go through the team, not online.
  // https://ww2.aib-axysafrica.com/_files/ugd/af94b6_ae7307fe1f5c48e28a6215d816cf76d6.pdf
  // https://ww2.aib-axysafrica.com/_files/ugd/af94b6_7132bbfc5dcc4d60a47245382c86f42c.pdf
  // https://ww2.aib-axysafrica.com/_files/ugd/af94b6_bfa5b97f20f94f27bc2c74b5e915accf.pdf
  // https://ww2.aib-axysafrica.com/_files/ugd/af94b6_1bd1a2fa6c9e403cac4ffe5e561c58f0.pdf
  // https://ww2.aib-axysafrica.com/global-markets
  aibaxys: ["KES"],
  // A deposit goes by M-Pesa to paybill 888900, with the CDS number as
  // the account, or to Faida's accounts at Co-operative Bank (Moi Avenue)
  // or Stanbic Bank (Kenyatta Avenue). The fee table is in shillings. The
  // NSE's two dollar REITs are on the board, but no dollar account is
  // named. fib.co.ke did not answer on 2026-10-22; read in the Wayback
  // copy of 12 Oct 2026.
  // https://fib.co.ke/faqs/
  // https://web.archive.org/web/20261012143757/https://fib.co.ke/faqs/
  faida: ["KES"],
  // A deposit goes by M-Pesa to paybill 400222, account 11170#<CDS number>,
  // or as cash at any Co-operative Bank branch or agent, or by MCo-opCash,
  // RTGS, EFT, SWIFT or PesaLink to KSL's single collection account at
  // Co-operative Bank (A/C 01136186729201). The terms define "Foreign
  // Currency" as any currency other than Kenya shillings, and the fee table
  // and stamp duty are in shillings. The NSE's two dollar REITs are on the
  // board, but no dollar account is named.
  // https://kingdomsecurities.co.ke/faqs/
  // https://kingdomsecurities.co.ke/how-to/
  // https://kingdomsecurities.co.ke/wp-content/uploads/2022/09/HOW-TO-BUY-SHARES-AND-ADD-FUNDS-THROUGH-YOUR-CDS-AC-AT-KINGDOM-SECURITIES..pdf
  // http://kingdomsecurities.co.ke/wp-content/uploads/2021/09/KSL-TERMS-AND-CONDITIONS.pdf
  kingdomsecurities: ["KES"],
  // A yen transfer lands in the account. The foreign-currency settlement
  // service holds 22 currencies "外貨のままで保有・管理・決済", Blue Trade included.
  // A wire from a bank in Japan goes to the firm's 外貨普通預金 at Mizuho
  // Kabutocho. Accounts are printed for these eight and the rouble; the
  // rouble is left out as for mufg. The other held currencies (GBP, CAD, CHF,
  // CNY, KRW, TWD, SGD, IDR, THB, PHP, MYR, ILS, VND) have no receiving
  // account, so they are only reached by converting yen.
  // https://www.aizawa.co.jp/service/convenience/f_exchange/
  // https://www.aizawa.co.jp/service/convenience/f_exchange/pay.html
  // https://www.aizawa.co.jp/service/convenience/f_exchange/notes.html
  aizawa: ["JPY", "USD", "HKD", "EUR", "AUD", "NZD", "TRY", "MXN", "ZAR"],
  // Yen lands in the account. The FAQ allows a foreign-currency transfer
  // ("外貨をFFG証券の口座に送金する際にかかる手数料") but names no currency
  // and no foreign balance. US shares are dealt over the counter at the
  // firm's price and exchange rate, and the commission is charged on the
  // yen amount ("外貨受渡金額 × 為替").
  // https://www.ffg-sec.co.jp/faq/category10/
  // https://www.ffg-sec.co.jp/service/commission
  // https://www.ffg-sec.co.jp/goods/stock/us/
  ffg: ["JPY"],
  // Yen lands in the comprehensive account and is put into an MRF. The FAQ
  // says a foreign-currency transfer to the firm's designated account is
  // credited to the securities account. The fee table has a 外貨 deposit row
  // at Hyakugo Bank or another bank. The currencies are those of the firm's
  // FX spread table. The real is left out because Brazilian real is not
  // deliverable abroad.
  // https://www.105sec.co.jp/contact/
  // https://www.105sec.co.jp/service/commission/
  hyakugo: ["JPY", "USD", "EUR", "AUD", "CAD", "NZD", "TRY", "ZAR"],
  // Yen only. The US-share rules: "米ドルでの入金は承っておりません。米ドル残高を
  // 追加する場合は、為替振替にて円から米ドルに振替を行ってください。"
  // A dollar balance only comes from converting yen. The site has been in
  // maintenance since 2026-10-21, so the archive copy is cited.
  // https://web.archive.org/web/20260810163607/https://www.iwaicosmo.net/products/foreign/us/rule.html
  iwaicosmo: ["JPY"],
  // Yen lands in the account. A foreign-currency wire from a bank in Japan
  // goes to the firm's 外貨普通預金 at SMBC Shinjuku and pays foreign shares,
  // bonds, MMFs and FX in that currency. These nine are the 対象通貨 of the
  // remittance page. The internet channel itself trades domestic shares only.
  // https://www.jtg-sec.co.jp/camp/gaika.htm
  // https://www.jtg-sec.co.jp/bond/kessai.htm
  jtrust: ["JPY", "USD", "AUD", "GBP", "EUR", "TRY", "CAD", "MXN", "NZD", "ZAR"],
  // A yen transfer goes to the branch's bank account. The FAQ only says
  // "外貨の振込手数料はお取引店にお問合せください", with no currency and no
  // foreign balance named. Foreign shares are branch-only and carry an FX
  // spread on each trade.
  // https://www.marusan-sec.co.jp/faq/deposits_withdrawals/index.html
  // https://www.marusan-sec.co.jp/torihiki/fee/fee_03/
  marusan: ["JPY"],
  // Yen is a transfer to the client's Mizuho Best Receiver account. A wire in
  // foreign currency is accepted at the client's cost ("外貨によるお振込…ご入金").
  // Since 2019 the 外貨決済サービス settles foreign shares in dollars and keeps
  // them as dollars. No other currency is named as a balance.
  // https://www.mito.co.jp/service/payment/cash.html
  // https://www.mito.co.jp/service/commissions/
  // https://www.mito.co.jp/corporate/information/659edff856e2015bf9975b69e4173c842dcf6874.pdf
  mito: ["JPY", "USD"],
  // The internet account is funded by a yen transfer to the firm's current
  // accounts at Mizuho, Resona, MUFG and SMBC, or through Japan Post Bank.
  // Online trading is Tokyo only. Foreign shares and foreign bonds are
  // face-to-face only. No foreign-currency deposit is named.
  // https://web.archive.org/web/2026/https://www.secjp.co.jp/service/net/payment/deposit/
  // https://web.archive.org/web/2025/https://www.secjp.co.jp/service/comparison/
  okasanbt: ["JPY"],
  // Quick deposit, or a transfer to the client's own receiving account, in
  // yen. Foreign shares are not handled.
  // https://www.sbineotrade.jp/stock/money/
  sbineotrade: ["JPY"],
  // Yen is put into an MRF. A foreign-currency transfer, from Iyo Bank or any
  // other bank, "入金されたご資金は、そのまま預り金となります", after the client
  // asks the branch for the receiving account. Online trading covers domestic
  // products only. The currencies are those of the firm's FX spread table.
  // https://www.shikoku-alliance-sec.co.jp/faq/synthesis.html
  // https://www.shikoku-alliance-sec.co.jp/service/commission_charges.html
  shikokualliance: ["JPY", "USD", "EUR", "AUD", "GBP", "CAD", "NZD"],
  // The only deposit is a bank transfer to the client's own receiving account
  // at Mizuho, in yen. There is no online or instant deposit. e支店 sells no
  // foreign shares.
  // https://www.e-shiten.jp/TorihikiRule/rule/payment_1.html
  tachibana: ["JPY"],
  // Yen comes in by quick deposit or bank transfer. Dollars can be wired from
  // a bank in Japan to the firm's own account (FAQ "米ドル入金の方法") and are
  // held as the dollar balance that pays US trades. A dollar withdrawal is not
  // offered ("米ドル出金には対応をしておりません").
  // https://www.webull.co.jp/help/faq/1655
  // https://www.webull.co.jp/pricing
  webulljp: ["JPY", "USD"],
  // A peso transfer to RCBC, or a bills payment at BDO, BPI, Security
  // Bank or UnionBank, credits the account. The only bank account listed
  // is of the type "Peso Deposit". The opening minimum is PHP 25,000. No
  // dollar balance is named.
  // https://www.2tradeasia.com/faqs
  "2tradeasia": ["PHP"],
  // A deposit to the Landbank or BDO account, iAccess, GCash, PayMaya or
  // InstaPay credits MyStocks. Those rails are pesos. The minimum to buy
  // is P500. No dollar balance is named.
  // https://www.landbanksec.com/login/includes/faqs.asp
  landbanksec: ["PHP"],
  // "Fund the account via UPAY or bills payment". Add fund on the
  // dashboard picks the payment method. The fees are in Php. No dollar
  // account is named.
  // https://www.mercantilesec.com/
  // https://www.mercantilesec.com/main.dart.js
  mercantilesec: ["PHP"],
  // A deposit slip at BDO, BPI, Metrobank, UnionBank or RCBC, a bills
  // payment or coins.ph credits the account. Online banking, a cheque and
  // a telegraphic transfer are also taken. The transfer's currency is
  // not named, and no dollar balance is named.
  // https://www.mytrade.com.ph/getting-started/
  // https://www.mytrade.com.ph/faqs/
  mytrade: ["PHP"],
  // A merchant payment at BDO, Metrobank or BPI credits the account,
  // net of the bank's fee in pesos. A client overseas deposits to one
  // BDO account, and no dollar account is named. The opening minimum is
  // PHP5,000.
  // https://www.timson.com.ph/faq/how-do-i-fund-my-timson-trade-account/
  // https://www.timson.com.ph/faq/what-is-the-minimum-initial-deposit-to-open-an-account/
  timson: ["PHP"],
  // The funding list names a "Savings-PHP" account and a "Dollar" account,
  // both at BDO Ayala Triangle, and peso accounts at UnionBank, BPI,
  // Chinabank, EastWest and AUB. A wire from abroad goes to the peso
  // accounts. The page does not say whether a dollar deposit stays in dollars.
  // https://utradeph.com/faqs/
  utrade: ["PHP", "USD"],
  // The opening deposit is "Rp0", and interest is paid on funds from
  // Rp5,000,000. The RDN forms are for BCA, CIMB Niaga and Mandiri. No
  // dollar or other foreign-currency account is named.
  // https://www.cgsi.co.id/help/faq-opening-account
  // https://www.cgsi.co.id/cgsi/api/v1/GetHelpCenterByID?lang=2&id=faq-opening-account
  cgsid: ["IDR"],
  // "Untuk menyetor dana, Anda hanya perlu transfer ke RDN". The RDN is
  // at Panin, Mandiri, BCA, CIMB Niaga or BSI. The opening deposit is
  // Rp 3.000.000, and sale proceeds land in the same RDN. No foreign-
  // currency account is named.
  // https://www.facsekuritas.co.id/pedoman
  fac: ["IDR"],
  // A 3-in-1 account links trading, demat and a savings account at an
  // Indian bank. Funds move by net banking, a payment gateway, a lien on
  // the savings balance or a broking QR code. Those are rupee accounts.
  // No foreign-currency balance is named.
  // https://www.idbidirect.in/FAQ-Inner.aspx?Option=ao
  // https://www.idbidirect.in/FAQ-Inner.aspx?Option=ft
  idbicapital: ["INR"],
  // Payment partners are ConnectIPS, fonepay and eSewa, all moving rupees
  // from a Nepali bank or wallet. Collateral is loaded online in TMS. Every
  // brokerage band and depository charge is in rupees. No foreign-currency
  // account is named.
  // https://garimasecurities.com.np
  // https://garimasecurities.com.np/post/pricing
  garima: ["NPR"],
  // The site names no payment route of its own. Clients trade on the
  // exchange's TMS (tms72), where collateral is loaded through connectIPS
  // into the broker's account and withdrawn to the client's bank. Every
  // brokerage band is in rupees. No foreign-currency account is named.
  // https://hatemalo.com.np/brokerage-services.html
  // https://connectips.com/index.php/component/content/article/38-nepal-stock-exchange
  hatemalo: ["NPR"],
  // Payments go to the rupee account at Global IME Bank, Kamaladi, in the
  // name of Kalash Stock Market, or through ConnectIPS, eSewa, Fonepay,
  // Khalti, NepalPay or the QR code. Every brokerage band is in rupees. No
  // foreign-currency account is named.
  // https://kalashstock.com.np/payment
  // https://kalashstock.com.np/services/stock-brokerage-services
  kalash: ["NPR"],
  // The site links only to Connect IPS and its TMS (tms47), where
  // collateral is loaded through connectIPS into the broker's account and
  // withdrawn to the client's bank. No bank details and no
  // foreign-currency account are named.
  // https://neevsecurities.com
  // https://connectips.com/index.php/component/content/article/38-nepal-stock-exchange
  neev: ["NPR"],
  // The footer gives the current account at Global IME Bank, Kamaladi, in
  // the name of Sagarmatha Securities, "Via: GBIME CIPS", with a QR code
  // to pay. Every brokerage band and the DP charge are in rupees. No
  // foreign-currency account is named.
  // https://sagarmathasecurities.com
  // https://sagarmathasecurities.com/services
  sagarmatha: ["NPR"],
  // Collateral goes to the account at Prabhu Bank, Putalisadak, in the
  // name of SharePro Securities; the home page has a separate
  // "Accounts- Collateral" desk. Every brokerage band is in rupees. No
  // foreign-currency account is named.
  // https://shareprosecurities.com
  // https://shareprosecurities.com/services/brokerage-services
  sharepro: ["NPR"],
  // "How to load collateral from TMS?": Fund Management > Collateral
  // Management, load from bank, then sign in to Connect IPS and pick the
  // debit account. A purchase made offline is paid the same way. No
  // foreign-currency account is named.
  // https://swetasecurities.com/
  // https://swetasecurities.com/services
  sweta: ["NPR"],
  // Payments go to the rupee account at Global IME Bank, Kamaladi, in the
  // name of Thrive Brokerage House ("compulsorily include your client
  // code"), or through Connect IPS (Brokers Payment, broker no. 13),
  // Fonepay or eSewa. Every brokerage band is in rupees. No
  // foreign-currency account is named.
  // https://thrivebrokerage.com/pages/bank-account-detail
  // https://thrivebrokerage.com/
  // https://thrivebrokerage.com/pages/fee-comission
  thrive: ["NPR"],
  // A havale or EFT goes to Ahlatcı's accounts at Takasbank, Akbank, Garanti
  // and seven other banks. Each bank has TL, USD and EUR IBANs, but the page
  // calls them margin ("teminat") accounts of the leveraged desk: "Kaldıraçlı
  // piyasa işlemlerinde (Forex) teminatınız hesabınızda Dolar ($) bazında
  // tutulmaktadır". No eurobond or foreign share is offered, so dollars or
  // euros are converted before buying a BIST share.
  // https://www.ahlatciyatirim.com.tr/hakkimizda/para-yatirma-cekme
  // https://www.ahlatciyatirim.com.tr/hakkimizda/bilmeniz-gerekenler
  ahlatci: ["TRY"],
  // TL, USD and EUR IBANs at Takasbank, Garanti, Akbank and six other banks,
  // headed "MENKUL KIYMET, DÖVİZ VE TL İŞLEMLERİNDE": not limited to the
  // leveraged desk. Tera sells dollar and euro eurobonds, held at Euroclear
  // through Takasbank, so a dollar or euro transfer stays as it is.
  // https://www.terayatirim.com/kurumsal/banka-bilgileri/4
  // https://www.terayatirim.com/yatirim-araclari/eurobond/5
  tera: ["TRY", "USD", "EUR"],
  // Money comes from the client's Ziraat Bankası current account through the
  // bank's internet branch ("ZRY (Borsa) hesabına para yatır"). No USD or EUR
  // IBAN is published, and every amount on the cash and fee pages is in TL.
  // Eurobonds are sold by Ziraat Bankası, not the broker. The evidence is thin.
  // https://www.ziraatyatirim.com.tr/nakit-islemleri
  // https://www.ziraatyatirim.com.tr/komisyon-ve-masraflar
  ziraat: ["TRY"],
  // Cash, a draft or a transfer goes to Al-Hekma's account at Jordan
  // Commercial Bank, with the slip faxed in. Cash up to JD 10,000 can be paid
  // at the office. Only dinar amounts appear and no dollar account is named.
  // The evidence is thin.
  // https://hekma-fs.com/page/15/FAQ
  alhekma: ["JOD"],
  // The eTrade page says only "Fund your account", after a branch opens the
  // eTrading account. It names no linked account or currency. The bank keeps
  // USD savings accounts, but no page ties one to eTrade, and the eTrade fee
  // is in dinars ("Minimum BD 3 or 0.20%"). The evidence is thin.
  // https://khaleeji.bank/pages-sidebar-nav/khaleeji-etrade/
  // https://khaleeji.bank/wp-content/uploads/2026/09/Khaleeji-Service-Charges-SEP26B.pdf
  khaleeji: ["BHD"],
  // The client account is kept in forint and in foreign currency ("A Bank az
  // ügyfélszámlát forintban és devizában vezeti"). A trade settles in its
  // market's currency, and conversion is only on the client's order. The
  // tariff minimums are "349 Ft/1EUR/1USD".
  // https://granitbank.hu/tajekoztatok-es-nyilatkozatok/befektetesi-szolgaltatasok
  granit: ["HUF", "EUR", "USD"],
  // Cover is paid into one cash account (Račun novčanih sredstava). e-trader
  // reaches ZSE only, in euro. Foreign trades by phone are "izvršava u stranim
  // valutama", but nothing says the cash account keeps a non-euro balance.
  // The evidence is thin.
  // https://www.otpbanka.hr/globalna-trzista/dokumenti-globalnih-trzista
  // https://www.otpbanka.hr/sw/static/file/Cjenikbrokerskihuslugauprimjeniod01.01.2026..pdf
  otpbankahr: ["EUR"],
  // mTrader uses dedicated purpose accounts ("namenski račun") "u valutama RSD,
  // EUR i USD", funded by internal transfer from the current account. A buy
  // needs cash "u valuti trgovanja", so a dollar trade is paid from the
  // dollar account, unconverted.
  // https://help.raiffeisenbank.rs/knowledge-base/korisnicko-uputstvo-o-koriscenju-mtrader-a/
  // https://www.raiffeisenbank.rs/sr/stanovnistvo/digitalne-usluge/mtrader.html
  raiffeisenrs: ["RSD", "EUR", "USD"],
  // Two client-money accounts are published, both "IBAN EUR", at Texim Bank
  // and Central Cooperative Bank. The tariff has been in euro since
  // 1 December 2025. Only the BSE and its MTF are offered. No dollar account.
  // https://ugmarket.com/contacts/
  // https://ugmarket.com/wp-content/uploads/2026/09/2_Тарифа_01122025-EUR.pdf
  ugmarket: ["EUR"],
  // The brokerage account holds som and dollars. The tariff has a "Вывод
  // средств (USD)" line and a USD/KGS conversion at 0.1%, so a dollar balance
  // stays dollars until converted. Dollar bonds are traded too.
  // https://zamaninvest.kg/assets/docs/pravovaya/tarify-i-komissii.pdf
  // https://zamaninvest.kg/assets/docs/pravovaya/prilozhenie-3-poruchenie-na-vyvod-sredstv.pdf
  zaman: ["KGS", "USD"],
  // A lump sum or a debit order comes from a South African bank account,
  // "from R300 per ETP". Every product is a JSE listing in rand, and no
  // foreign-currency deposit is named.
  // https://etfsa.co.za/product/diy/
  // https://etfsa.co.za/wp-content/uploads/2024/04/Investor-Hub-brochure-v1-June2024.pdf
  etfsa: ["ZAR"],
  // Payment is online, by transfer, or at a BCI or Consorcio branch, all in
  // pesos. The "Caja Dólar" is filled only by a purchase inside the account:
  // "para comprar dólares debes tener dinero disponible en Caja Peso". No
  // dollar transfer in is published.
  // https://www.ccbolsa.cl/apps/static/informaciones/Manual_de_Abonos.pdf
  // https://www.ccbolsa.cl/apps/static/informaciones/ManualCVDolar.pdf
  ccbolsa: ["CLP"],
  // Online orders are in pesos only: "La operativa a través de nuestro sitio
  // web Banchileinversiones.cl y nuestra app Mi Inversión solo se realiza en
  // pesos, por tanto, si desea comprar acciones mundo en dólares, deberá
  // hacerlo a través de un ejecutivo de inversión". Dollars bought in the
  // app go to the Banco de Chile account or a branch, not to the broker.
  // https://sitiospublicos.bancochile.cl/banchileinversiones/preguntas-frecuentes/como-comprar-y-vender-acciones
  // https://sitiospublicos.bancochile.cl/banchileinversiones/moneda-extranjera
  banchile: ["CLP"],
  // Fees and the worked example are in pesos ("$2.500 por día", a
  // "$1.000.000" purchase). The broker's "Moneda Extranjera" product is a
  // cash exchange of dollars and euros at BancoEstado Express offices, not a
  // currency balance in the account.
  // https://www.bancoestado.cl/content/bancoestado-public/cl/es/home/home/productos-/ahorro-e-inversiones-/compra-y-venta-de-acciones.html
  // https://www.bancoestado.cl/content/bancoestado-public/cl/es/home/home/productos-/ahorro-e-inversiones-/corredora-de-bolsa---bancoestado-personas/productos-corredora-de-bolsa---bancoestado-personas/moneda-extranjera-corredores-de-bolsa---bancoestado-personas.html
  bancoestado: ["CLP"],
  // The online share page and its fact page price everything in pesos
  // ("$ 18.000 + IVA", "$ 7.000 + IVA"); no dollar balance is published.
  // Bci's dollar offer is mutual funds (Carteras Dólar) and offshore custody
  // at Pershing, not this account.
  // https://www.bci.cl/inversiones/soluciones-de-inversion/acciones
  // http://www.bci.cl/empresarios/inversiones/acciones/conozcamassobreacciones.html
  bciinversiones: ["CLP"],
  // Local equities online in pesos. Dollar products (New York shares and
  // ETFs, "Monto mínimo: $10.000 USD") go through an investment manager or
  // e-mail, not online; the dollar current account is the bank's.
  // https://banco.santander.cl/personas/corredores-de-bolsa
  santandercl: ["CLP"],
  // Local fees in pesos ("$5.000 + IVA"). USD: the platform sells dollars
  // ("Invierte en acciones, dólares, fondos o ETFs"); no dollar transfer in
  // is published, but a dollar balance bought in the account counts as cash
  // (owner, 2026-10-28, as for SMC, Rico and XP).
  // https://www.mbi.cl/landing-corredora/landing01/index.html
  mbicorredores: ["CLP","USD"],
  // Web orders "en pesos (CLP)" (step-by-step guide). USD: Vector buys and
  // sells foreign currency for clients ("invertir en dólares"); a dollar
  // balance bought in the account counts as cash (owner, 2026-10-28, as for
  // SMC, Rico and XP).
  // https://vectorcapital.cl/wp-content/uploads/2024/05/Paso-a-paso-para-comprar-y-vender-acciones.pdf
  // https://vectorcapital.cl/productos/
  vectorcapital: ["CLP","USD"],
  // The bank is the ALyC, and trades go from Home Banking with a peso and a
  // dollar savings account. The tariff has peso and dollar columns and a fee
  // for trades "con liquidación en moneda extranjera (dólar MEP)", so MEP
  // dollars stay dollars. No cable route. Settlement against the savings
  // accounts is not spelled out.
  // https://www.bancoentrerios.com.ar/personas/inversiones/mercado-de-capitales
  // https://assets.ctfassets.net/e7eu92ue673r/392uCSfw9HyWTmt9g5GZDY/9b4137d909570a762152bd44b631cb7b/TARIFARIO_WEB_1092026.pdf
  bancoentrerios: ["ARS", "USD"],
  // Same Grupo Petersen setup: a Cuenta Comitente traded from Home Banking,
  // with the client's free dollar savings account. Tariff note (20) covers
  // trades "con liquidación en moneda extranjera (dólar MEP)". No cable route.
  // Settlement against the savings accounts is not spelled out.
  // https://www.bancosantafe.com.ar/personas/inversiones/mercado-de-capitales
  // https://assets.ctfassets.net/e7eu92ue673r/2hY5ulIda9r4MzQGDQjCZF/113234cef55b9ebc0e03b38defc0add3/6b56ead2-d786-4ce5-93c7-1829ccc55170.pdf
  bancosantafe: ["ARS", "USD"],
  // Grupo Petersen again: "podés operar todos los productos que se
  // encuentren listados en el mercado" from a Cuenta Comitente, with peso and
  // dollar columns in the individuals' tariff; dollar settlement is MEP only.
  // https://www.bancosanjuan.com/personas/inversiones/mercado-de-capitales
  // https://assets.ctfassets.net/e7eu92ue673r/3TPVnRodZS14IgLyrdPQbu/e637f552e03ad759cdb059506d9d5cd0/8e2dd0ee-8d7a-45ec-ba69-2dfd04f1254a.pdf
  bancosanjuan: ["ARS", "USD"],
  // Same setup and tariff layout as Banco San Juan (MEP dollar, no cable).
  // https://www.bancosantacruz.com/personas/inversiones/mercado-de-capitales
  // https://assets.ctfassets.net/e7eu92ue673r/a8PmGbsl5CjUwfClFT4jW/7631f0f16ea0f209506224f626068bf7/WEB_BSC_Nota_Aumento_de_Comisiones_Todos_lo_productos__01-08-2026___clientes_CCPJ_Aclaraciones.pdf
  bancosantacruz: ["ARS", "USD"],
  // "Deposits and withdrawals in both USD and SAR are supported": SAR for
  // the Saudi account, USD for the US one.
  // https://www.sahmcapital.com/support/detail/x?articleId=121
  sahm: ["SAR", "USD"],
  // Every band of the pricing plan is in rupees and no foreign-currency
  // account is named.
  // https://www.venturasecurities.com/exclusive-pricing-plan/
  ventura: ["INR"],
  // The account and every fee are in dong; no foreign-currency balance.
  // https://www.fpts.com.vn/ho-tro-khach-hang/dich-vu-tai-chinh/bieu-phi-dich-vu/giao-dich-chung-khoan-co-so/
  fpts: ["VND"],
  // Borsa Istanbul only, priced and settled in lira; the commission is a
  // lira rate plus BSMV. A foreign-currency deposit is converted first.
  // https://www.hsbc.com.tr/hsbc/urun-ve-hizmet-ucretleri
  // https://www.hsbcyatirim.com.tr/hizmetlerimiz/pay-senetleri-piyasasi/hsbc-pay-senetleri-piyasasi
  hsbctr: ["TRY"],
  // The account form lets Sigma cover a debit "من حساباته الدائنة الأخرى وإن
  // كانت بعملات مختلفة" (from the client's other credit accounts, even in
  // other currencies) at the Central Bank rate: balances are kept per
  // currency, and EGX quotes some lines in dollars.
  // https://www.sigma-cap.com/main/system_forms.download?file=Consolidated+Account+Opening+Form+AR.pdf&form_code_p=102
  sigmacap: ["EGP", "USD"],
  // One deposit account at NLB Banka in Montenegro, a euro country; the fee
  // schedule is in euros.
  // https://www.vipbroker.net/docs/commissions_and_fees.pdf
  vipbroker: ["EUR"],
  // mySEM orders go through the client's SEM stockbroker and settle in the
  // CDS, which settles MUR, USD, EUR, GBP and ZAR (as mcbsecurities).
  // https://stockexchangeofmauritius.com/cds/clearing-settlement-services
  mysem: ["MUR", "USD", "EUR", "GBP", "ZAR"],
  // The Nepal brokers below: NEPSE settles in rupees through connectIPS and
  // every brokerage band is in rupees. No foreign-currency account is named.
  // https://connectips.com/index.php/component/content/article/38-nepal-stock-exchange
  // https://www.sunrisesecurities.com.np/services/
  sunrisesec: ["NPR"],
  // https://www.sumerusecurities.com/faqs
  sumeru: ["NPR"],
  // https://www.nabilstockdealer.com.np/commission-rate/
  nabilsd: ["NPR"],
  // https://naasasecurities.com.np/pricing/1
  naasa: ["NPR"],
  // https://himalayanbroker.com/services/brokerage-service
  himalayan: ["NPR"],
  // https://displtd33.com/broker-services/
  dakshinkali: ["NPR"],
  // https://ddkc.com.np/share-calculator
  ddkc: ["NPR"],
  // https://magnetsecurities.com.np/pricing
  magnet: ["NPR"],
  // Yen is moved from the client's Daishi Hokuetsu Bank account by the
  // らくらく口座振替サービス, or wired to the firm account named for the
  // client's branch ("店舗ごとの第四北越証券指定の振込先金融機関口座"). The home
  // trade is domestic shares and funds only. US shares go through the branch,
  // and the fee page says "円決済の場合は、スプレッド（為替手数料）も必要", so a
  // foreign settlement exists there. No page names a foreign-currency deposit
  // route or a foreign-currency balance, so the account is left in yen.
  // https://www.dh-sec.co.jp/inquiry/home_trade.php
  // https://www.dh-sec.co.jp/home_trade/rakufuri.php
  // https://www.dh-sec.co.jp/fee/
  daishihokuetsu: ["JPY"],
  // Yen is a transfer to the firm's designated bank account. The 外貨決済
  // サービス handles nine currencies, "外貨でのご入金・ご出金も可能", each wired
  // to its own account at North Pacific Bank or SMBC Sapporo; after the
  // credit is seen it lands in "お客さまの外貨預り金勘定". A foreign withdrawal
  // is paid "外貨預り金の範囲内". Online orders are domestic only, but these
  // balances belong to the same securities account.
  // https://www.hokuyo-sec.co.jp/product/settlement/
  // https://www.hokuyo-sec.co.jp/online/
  hokuyo: ["JPY", "USD", "EUR", "AUD", "NZD", "CAD", "GBP", "TRY", "MXN", "ZAR"],
  // Yen goes in by Yu-cho ATM card, by a transfer to the client's own
  // receiving account at Bank of Yokohama Kamome branch, or by a real-time
  // debit from Bank of Yokohama. The page also takes "外貨送金でのご入金" and
  // refunds the sending fee in yen. It names no currency for such a
  // remittance and no foreign-currency balance. The terms let foreign-security
  // money pass "円貨または外貨（当社が応じ得る範囲内で申込者が指定する外貨に限ります。）",
  // and the bond page says some foreign bonds cannot be paid in foreign
  // currency. No currency is named, so only yen is listed.
  // https://www.hamagintt.co.jp/service/payment.html
  // https://www.hamagintt.co.jp/common/pdf/agreement.pdf
  // https://www.hamagintt.co.jp/products/bond.html
  hamagin: ["JPY"],
  // The settlement account is the client's own Bank of Taiwan deposit
  // account in New Taiwan dollars: "交割銀行僅限臺灣銀行新臺幣存款帳戶". The FAQ
  // asks for that passbook at opening ("臺灣銀行存款帳戶之存摺及印鑑"). Trades
  // are debited from it at T+2. No foreign-currency settlement is offered.
  // https://www.twfhcsec.com.tw/Activity/BusinessIntro
  // https://www.twfhcsec.com.tw/Home/faq
  banktaiwan: ["TWD"],
  // The settlement account must be at Union Bank: "目前本公司只使用聯邦銀行的
  // 帳戶作為證券交割帳戶". Purchases are debited from it at T+2 and sale
  // proceeds paid into it. The firm sells Taiwan shares only and offers no
  // foreign-currency settlement account.
  // https://www.usot.com.tw/faq.htm
  unionsec: ["TWD"],
  // Funds arrive by BPAY or a direct debit from a bank account in the
  // client's name. The FAQ, asked about other currencies: "No, I am sorry
  // but you can only transfer AUD at this point."
  // https://www.sharetrading.netwealth.com.au/Public/Trading/AustralianShares.aspx
  netwealth: ["AUD"],
  // The cash equities account is funded by a bank wire to the TF Global
  // Securities (Aust) Trust Account at the Commonwealth Bank (BSB 063-000).
  // The equities terms put the account in one base currency and convert "any
  // money received from you in a non-Base Currency". The rate card is in
  // Australian dollars, and an order under "$500 AUD" is rejected. No other
  // balance is named. thinkmarkets.com refuses scripts: the support pages
  // were read from the Internet Archive (funding January 2026, trading fees
  // 2026), and the terms from the PDF of July 2024.
  // https://www.thinkmarkets.com/au/support/funding/
  // https://www.thinkmarkets.com/au/support/trading-fees/
  // https://www.thinkmarkets.com/tfxmain/media/img/pdf/TF-Global-Markets-Equities-(Aust)-Pty-Ltd-Terms-and-Conditions.pdf
  thinkmarketsau: ["AUD"],
  // The trading wallet is filled from the GCash wallet: "add money to your
  // GStocks PH trading wallet from your GCash wallet first", up to PHP
  // 50,000 on a Basic account. A cash-out goes back to the GCash wallet.
  // GCash is a peso wallet. No other balance is named.
  // https://help.gcash.com/hc/en-us/articles/17542490721689-How-to-cash-in-to-GStocks-PH-Trading-Wallet
  // https://help.gcash.com/hc/en-us/articles/31210579108633-How-to-cash-out-from-GStocks-PH-Trading-Wallet
  gstocks: ["PHP"],
  // "You can fund your account instantly from your GoTyme Bank wallet",
  // up to Php 500,000 a transfer. Withdrawals go back to the GoTyme Bank
  // account, and the portfolio is shown in pesos. No dollar balance is
  // named for PH Stocks. The bank's multi-currency product is a time
  // deposit, not the stocks account.
  // https://www.gotyme.com.ph/help/ph-stocks/guide-on-investing-in-ph-stocks-with-gotyme
  // https://www.gotyme.com.ph/api/1/services/help-center.json (what the help page reads)
  gotyme: ["PHP"],
  // "Fund Account" moves money from the client's BDO savings or checking
  // account (the Beneficiary Account) into the Settlement Account. The
  // account terms say both can be "Philippine Peso, US Dollar and/or other
  // foreign currency": BDO opens a Settlement Account "(Philippine Peso, US
  // Dollar, and/or other foreign currency)" as a regular savings account.
  // A dollar Beneficiary Account therefore fills a dollar Settlement Account
  // without conversion. That is the balance for Dollar Denominated
  // Securities: NoCD accounts are opened "for its clients with dollar
  // denominated accounts". No other foreign currency is named for the PSE.
  // bdo.com.ph hangs for scripts; read on the Wayback Machine copies of
  // 21 May 2026 (FAQ) and 2 December 2025 (terms).
  // https://www.bdo.com.ph/bdo-securities/faqs
  // https://www.bdo.com.ph/content/dam/bdounibank/en-ph/wealth/securities/Documents/1060J-MPM_SEC_TC_for_Online_TradingInvestment_Facility_Form.pdf
  bdosec: ["PHP", "USD"],
  // A bills payment through China Bank Online, or over the counter at a
  // China Bank branch in cash or cheque, credits the online account. A
  // client whose settlement account is at another bank puts up "a minimum
  // initial deposit of Php 50,000". Dollar securities are "not
  // accommodated under the online trading platform". No dollar balance is
  // named.
  // https://www.chinabankseconline.ph/CBSEC_DATA/downloadjson/cms3.json (FAQ faq1-6, faq2-1, faq3-1)
  chinabanksec: ["PHP"],
  // "Setoran dana dapat dikirimkan ke RDN yang telah dibuatkan oleh IPOT
  // atas nama kamu." The RDN is at Permata, BCA or Mandiri, or BCA Syariah
  // for the Sharia account. No dollar or other foreign-currency account
  // is named.
  // https://www.indopremier.com/app/js/constant.js (FAQ)
  indopremier: ["IDR"],
  // The client transfers to the RDN, at BCA, Panin or Maybank (BCA Syariah
  // for the Sharia account): "setoran dana awal maupun penambahan dana
  // langsung ke rekening RDN tersebut". The minimum withdrawal is
  // Rp50.000. No foreign-currency account is named.
  // https://www.rhbtradesmart.co.id/faq
  rhbid: ["IDR"],
  // The dashboard takes a card payment or a payment from the client's
  // bank, and "having a Nigerian bank account is a statutory requirement".
  // Withdrawals go to that bank account. The margin threshold is
  // N1,000,000. No dollar balance is named.
  // https://meritrade.com/faq
  meristem: ["NGN"],
  // "To deposit fund to your account, you need to deposit cheques or
  // transfer money to Al Wathbah Account with one of our recognized banks
  // i.e. FAB, ADIB, Emirates NBD." Fees and minimums are in dirhams, and no
  // foreign-currency account is named. The site answers only at the stage
  // host that www.alwathbah.ae redirects to.
  // https://stage.alwathbah.ae/faqs
  alwathbah: ["AED"],
  // Rubles go by transfer to the NSD/USOFR details in the notice sent at
  // opening. The terms of 06.10.2026 add that "Платежи в иностранных
  // валютах осуществляются по реквизитам, указанным на интернет-сайте
  // Банка", for the currency and OTC portfolios only, and the IIS takes
  // rubles only. sberbank.ru blocks scripts, and Wayback holds only the
  // block page, so that list of currencies was not read. The undated memo
  // says a currency card can pay in, but names no currency. The USD/EUR
  // requisites sheets still served are pre-2022 (BNY Mellon and J.P. Morgan
  // correspondents), so they are not used. Only rubles are certain.
  // https://www.sberbank.com/common/img/uploaded/broker/brokerage_agreement.pdf
  // https://www.sberbank.com/common/img/uploaded/broker/broker_pamyatka.pdf
  sber: ["RUB"],
  // Rubles from any bank. "Как пополнить брокерский счет в валюте?": in VTB
  // Online and at a branch, yuan, Belarusian rubles, Turkish lira, tenge,
  // drams and rand; in the VTB My Investments app, yuan only. "Зачисление
  // остальной иностранной валюты на брокерский счет временно недоступно."
  // Dollars and euros can still be withdrawn, but only to a VTB account.
  // They are not paid in.
  // https://www.vtb.ru/personal/investicii/help/popolneniya-perevodi-vivodi/denejnie-perevodi/
  vtb: ["RUB", "CNY", "BYN", "TRY", "KZT", "AMD", "ZAR"],
  // The rules in force from 02.09.2026 say "Перечисление иностранной валюты
  // на Брокерский счет осуществляется Клиентом со счета в соответствующей
  // валюте, открытого на имя Клиента в Банке либо иной кредитной
  // организации". The web app's guide says money can be withdrawn "в 4-х
  // валютах: рубли, доллары, евро, китайские юани", each to a Sovcombank
  // account in the same currency. Those four are the balances. No page
  // names a narrower list for deposits.
  // https://prod-api.sovcombank.ru/documents/19253
  // https://cdn.invest.sovcombank.ru/MPI._Rukovodstvo_polzovatelya_Web.pdf
  sovcombank: ["RUB", "USD", "EUR", "CNY"],
  // A transfer to the client's brokerage account at Avangard, or cash at
  // its desk. The minimum first deposit is 30,000 rubles. The broker "без
  // заявления КЛИЕНТА, открывает КЛИЕНТУ брокерские счета в иных валютах"
  // only when it needs to. Avangard offers the Moscow Exchange stock market
  // only, and publishes no foreign-currency details.
  // https://www.avangard.ru/rus/private/securities/brokerage_service/pdf/dogovor_fiz_112023.pdf
  avangard: ["RUB"],
  // "Переведите деньги на свой счет из любого российского банка." The rules
  // (ed. 15, from 08.10.2026) send money to a special brokerage account "в
  // соответствующей валюте", with the details "на Сайте Компании". The two
  // published sheets (with and without the right of use, at NSD and
  // Raiffeisenbank) list RUR accounts only. No foreign-currency account is
  // given.
  // https://trinfico.ru/
  // https://trinfico.ru/upload/iblock/9a2/w8jutl7395wy1c0kvpylxdtuk4p8z7ac/Брокерский%20регламент%20(для%20физических%20лиц)%20ред.%2015.pdf
  // https://trinfico.ru/upload/iblock/1c4/iapzvwwfp3e8lyncnx8ltntsj6pdbd5x/SBS_Bank_requisites_BPI.doc
  // https://trinfico.ru/upload/iblock/bf1/5e41a4vuf24d57p0lvjwlceehmw8f1lp/SBS_Bank_requisites_SPI.doc
  trinfico: ["RUB"],
  // "Брокерский счет можно пополнить только в рублях и юанях. ИИС пополнить
  // валютой нельзя." Rubles come by card, SBP or transfer. Yuan come by
  // transfer to Newton Investments' yuan account 40701156700000000040 at
  // Bank GPB (correspondent Bank of China (Russia)).
  // https://gazprombank.investments/help/popolnenie-scheta/kak-popolnit-schet-valyutoy/
  // https://gazprombank.investments/help/popolnenie-scheta/kak-popolnit-schet/
  gazprombank: ["RUB", "CNY"],
  // Somoni by any bank card, by Alif and DC wallets, or by transfer from
  // any bank ("Возможность инвестировать в сомони и других валютах"). The
  // dollar products say "Пополняете счёт в долларах" and "В какой валюте? В
  // долларах США." The tariff charges a fee on withdrawals "в долларах США и
  // евро", but no page says euros can be paid in. No tenge or dirham deposit
  // is named. The KASE, AIX and Nasdaq Dubai lines are bought by
  // converting.
  // https://broker.tj/services/broker-account
  // https://broker.tj/investments/currency-deposits
  // https://broker.tj/
  birzhevoy: ["TJS", "USD"],
  // BCSE: the brokerage account is filled by a free-form transfer from any
  // Belarusian bank. Every bank instruction (Paritetbank, Belarusbank,
  // Alfa, BSB, Oplati) is in rubles. MOEX: "Пополнять счёт можно только в
  // белорусских рублях (BYN)." The trust account at Paritetbank is in BYN,
  // and Russian rubles are bought in the app. Withdrawals are "только в
  // белорусских рублях (BYN)". So RUB is a conversion, not a deposit.
  // https://aigenis.by/help/popolnenie-brokerskogo-scheta/
  // https://aigenis.by/rossijskij-fondovyj-rynok/
  aigenis: ["BYN"],
  // "Пополните брокерский счет путем безопасного SWIFT-перевода." The money
  // goes "с вашего банковского текущего счета в долларах на ваш
  // персональный брокерский счет" at Alpaca. No other currency is named.
  // https://investlink.kz/stocks/
  // https://investlink.kz/reliability/
  investlink: ["USD"],
  // "You can only deposit money with THB and then convert to USD/HKD/CN¥."
  // Deposits are by automatic debit from SCB, BAY, BBL or KBANK. FAQ 388
  // says to convert THB to USD under "Currency Exchange" before trading.
  // Transfers from a Webull account in another country are not accepted.
  // https://www.webull.co.th/en/help/faq/360
  // https://www.webull.co.th/en/help/faq/393
  // https://www.webull.co.th/en/help/faq/375
  webullth: ["THB"],
  // Rubles from BCS Bank or any other bank. The FAQ "Какая валюта доступна
  // для вывода и пополнения?": "Пополнить брокерский счет со счета в БКС
  // Банке (без комиссии) можно иностранной валютой: доллары США, евро,
  // дирхамы ОАЭ, белорусские рубли, китайские юани, киргизские сомы", and
  // other foreign currencies are temporarily refused from any bank. Read in
  // a browser on 2026-10-24 (bcs.ru answers scripts with a bot check).
  // https://bcs.ru/faq
  bcs: ["RUB", "USD", "EUR", "AED", "BYN", "CNY", "KGS"],
  // Rubles by SBP, card, transfer or at the Finam Bank desk. The FAQ: "0%
  // при пополнении счета в белорусских рублях, китайских юанях и
  // американских долларах". The tariff's tenge line is "временно
  // недоступно". Read in a browser on 2026-10-24 (finam.ru answers scripts
  // with a bot check).
  // https://broker.finam.ru/landing/faq/category/operacii-i-upravlenie-aktivami/popolnenie-perevody/
  // https://broker.finam.ru/landing/tariffs-n3-investor/
  finam: ["RUB", "BYN", "CNY", "USD"],
  // The trading account is funded in rupees "via UPI, NetBanking, or
  // NEFT/RTGS" or through the payment gateway. US shares are bought in a
  // separate Vested account ("The account opening process will be carried
  // out on Vested platform"). That account holds dollars. Besides the LRS
  // transfer from an Indian bank, Vested takes an "International Wire
  // Transfer ... from your non-US bank account", and clients can "directly
  // transfer US dollars from RSUs, ESOPs, and ESPPs". So dollars sent in
  // are kept as dollars.
  // https://www.bajajbroking.in/blog/transfer-funds-into-trading-account
  // https://www.bajajbroking.in/us-stocks
  // https://vestedfinance.com/blog/us-stocks/how-to-transfer-funds-to-your-us-brokerage-account-on-vested/
  bajaj: ["INR", "USD"],
  // Bigul: UPI, net banking, IMPS, NEFT or RTGS, only from the registered
  // bank, credited in rupees. The US account is at Bonanza IFSC (GIFT
  // City): "You can fund your account in USD and other IFSCA-permitted
  // foreign currencies", and "NRIs can fund their account by transferring
  // funds from their overseas bank account or NRE/NRO account in USD". No
  // other foreign currency is named.
  // https://bigul.co/customer-support/detail/how-can-i-add-funds-to-my-bigul-account
  // https://bonanzaifsc.com/faqs
  bonanza: ["INR", "USD"],
  // UPI from the registered bank, net banking (ICICI, HDFC, Federal, Axis,
  // PNB) or NEFT/RTGS/IMPS, credited in rupees. The US account is with
  // Geojit IFSC's Global Access Provider (View Trade IFSC): "USD-Denominated
  // Investments", "Funds are credited directly to the investor's account
  // with the Global Access Provider", open to residents under LRS, NRIs and
  // foreign investors. The tariff charges "Fund Withdrawal USD 10".
  // https://support.geojit.com/support/solutions/articles/89000007479-how-can-i-add-transfer-funds-to-my-trading-account-
  // https://www.geojitifsc.com/invest_in_global_stocks.html
  geojit: ["INR", "USD"],
  // The online account is BlinkX, funded by UPI or net banking from the
  // client's Indian bank in rupees. US shares are bought in a Stockal
  // (Borderless) account held at DriveWealth. Stockal's help gives "U.S.
  // bank details for adding funds": a wire to DriveWealth LLC at JPMorgan
  // Chase with a beneficiary account number unique to each client. The
  // dollars stay in that account.
  // https://www.jmfinancialservices.in/invest-in-us-investing
  // https://help.stockal.com/portal/en/kb/articles/what-are-the-u-s-bank-details-for-adding-funds-to-my-investment-account
  jmfinancial: ["INR", "USD"],
  // Rupees by UPI, the payment gateway, NEFT, RTGS or IMPS from a linked
  // bank account. The global account is funded "via net banking using the
  // Liberalised Remittance Scheme (LRS). We partner with major Indian
  // banks". That is a rupee debit the bank converts. No direct dollar
  // transfer is offered.
  // https://lakshmishree.com/support/knowledgebase/articles/do-i-need-to-deposit-funds-before-investing-or-trading-through-lakshmishree
  // https://www.lakshmishree.com/global-investing
  lakshmishree: ["INR"],
  // Rupees from the linked bank account. An NRI moves rupees from an SBI
  // NRE account into the NRE PIS account. US investing (powered by
  // Appreciate) says "Transfer funds with one click from your linked bank
  // account". Appreciate is for Indian residents only and sends the money
  // through an AD1 bank under LRS. That is a conversion. No direct dollar
  // transfer is named.
  // https://www.sbisecurities.in/
  // https://appreciatewealth.com/us-stocks/
  sbisecurities: ["INR"],
  // The Indian account is funded by online fund transfer from the client's
  // bank, in rupees. Foreign shares go through a Saxo Bank account with SMC
  // as introducing broker. SMC's page names no funding currency and says
  // only "All transactions are based on 100% Cash-N- Carry basis". No SMC
  // page on funding the Saxo account was found. The Saxo account's cash is
  // added as it is for ../saxofr (same bank, Saxo Bank A/S): its currency
  // sub-accounts (owner, 2026-10-26: "ajoute les devises du cash").
  // https://smcindiaonline.com/international-broking/
  smcglobal: ["INR", "USD", "CAD", "EUR", "GBP", "NOK", "PLN", "CZK", "MYR", "CHF", "DKK", "SEK", "ZAR", "JPY", "HKD", "CNH", "SGD", "AUD"],
  // The securities account settles through the client's multi-currency
  // savings account at the bank ("以多貨幣儲蓄帳戶作為結算帳戶"). US shares
  // settle in dollars ("結算貨幣 美元"), Stock Connect shares "以人民幣進行
  // 交易及交收", and HKEX RMB counters are served ("設有人民幣計價證券服務").
  // The renminbi is the Hong Kong offshore unit, written CNH as for hsbchk.
  // https://www.hk.bankcomm.com/hk/shtml/hk/tw/2004980/2005004/2008355/2503715.shtml?channelId=2004980
  // https://www.hk.bankcomm.com/hk/shtml/hk/tw/2004980/2005004/5005300/9040415.shtml?channelId=2004980
  // https://www.hk.bankcomm.com/hk/shtml/hk/tw/2004980/2005004/2008353/list.shtml?channelId=2004980
  bocomhk: ["HKD", "USD", "CNH"],
  // The settlement-bank page (交收銀行) gives a multi-currency account at CCB
  // (Asia), and at Standard Chartered a "港元帳戶號碼", "人民幣帳戶號碼" and
  // "美元帳戶號碼". Withdrawals by CHATS are priced "港元300/人民幣250/美元38".
  // https://www.ccbintl.com.hk/Big5/securities4.html
  // https://www.ccbintl.com.hk/Big5/securities6.html
  ccbi: ["HKD", "USD", "CNH"],
  // The app guide: the opening deposit is "HKD 10,000 or USD 1,500" from
  // the client's own bank account, and Currency Exchange is "USD to HKD or
  // HKD to USD". No renminbi deposit or balance is named. The site has no
  // separate funding page.
  // https://www.cswsec.com.hk/wp-content/uploads/2026/06/APP-user-guide.pdf
  cswealth: ["HKD", "USD"],
  // The deposit page (存取款) gives securities receiving accounts at BOCHK,
  // HSBC and Wing Lung, each with "收款人帳戶號碼(港元)", "(人民幣)" and
  // "(美元)". No other currency is named for securities.
  // https://www.ccnew.com.hk/tc/customer-service/access-fund
  centralchinahk: ["HKD", "USD", "CNH"],
  // The stock account settles through linked bank accounts. The fee
  // leaflet charges "從客戶之港元結算戶口中扣除" and says "若客戶之證券戶口只
  // 連結於美元或人民幣戶口，有關服務費將從該戶口中扣除". US shares are priced
  // in USD and China Connect in CNY, each from its own settlement account.
  // https://www.citibank.com.hk/english/investment/pdf/Stock_fees_and_charges_leaflet.pdf
  citibankhk: ["HKD", "USD", "CNH"],
  // Deposit FAQ: "支持存入港元、美元、離岸人民幣、日圓、新加坡元" and
  // "資金存入本公司交易賬戶後，支持不同貨幣實時兌換". Securities receiving
  // accounts: HSBC (港元), BOCHK (美元, 人民幣) and DBS (日圓/新加坡元).
  // https://www.eddid.com.hk/sf/deposit-and-withdrawal/
  eddid: ["HKD", "USD", "CNH", "JPY", "SGD"],
  // The bank takes eleven currencies by remittance, but the stock account is
  // filled from the savings account (銀證轉賬) and trades in two: "購買港股，
  // 使用港幣；購買美股，使用美元 … 跨市場交易不會涉及到貨幣兌換". No page
  // names a renminbi balance in the stock account.
  // https://support.platform.elebank.com/personal/zh-hk/topic15_758
  // https://support.platform.elebank.com/personal/zh-hk/topic15_272
  // https://support.platform.elebank.com/personal/zh-hk/topic15_269
  elebank: ["HKD", "USD"],
  // The deposit page (资金存入) gives two BOCHK client accounts: "存入货币
  // 港元" and "存入货币 美元", plus FPS. No renminbi account is named.
  // https://www.austrax.com/customer-service/fund-deposit
  innovax: ["HKD", "USD"],
  // Mox Invest takes no outside money: "Mox currently does not support
  // deposit or withdrawal of funds". Cash comes from the Mox bank account,
  // and the invest page says "switch between HKD and USD with ease". The
  // transfer FAQ: "You can only transfer USD internally to your own
  // accounts (i.e. USD invest account)."
  // https://mox.com/faqs/mox-invest/
  // https://mox.com/features/mox-invest/
  // https://mox.com/faqs/faq-transfer/
  mox: ["HKD", "USD"],
  // The deposit FAQ for the shares account gives a "Designated Hong Kong
  // Dollar Segregated Deposit Account" at Standard Chartered, bill payments
  // and a BOCHK account. The eDDA FAQ: "Can I transfer USD or CNY via eDDA?
  // Currently, only HKD is supported." A USD deposit is named only for the
  // futures account. Withdrawals can be paid in USD and CNY (CHATS
  // "HKD100 / USD12 / CNY86"), but no USD or RMB deposit route is given
  // for shares.
  // https://www.ebshkdirect.com/en/help/2/
  // https://www.ebshkdirect.com/en/help/99/
  // https://www.ebshkdirect.com/en/help/107/
  // https://download.ebshk.com/fees/pricing-table-os-en.pdf
  // The account switches between 11 currencies at its own rates and pays
  // out USD and RMB, so it holds them: USD and CNH are listed as its cash
  // (owner, 2026-10-26).
  shkdirect: ["HKD", "USD", "CNH"],
  // A bank: trades settle from the client's own deposit accounts, and the
  // Integrated Deposits Account holds "HKD, RMB as well as a full range of
  // foreign currencies". The securities pages give the settlement currency
  // per market: SEHK "HKD, RMB and USD", US "USD", and China Connect cash
  // in RMB. The other deposit currencies (AUD, EUR, GBP...) settle no share
  // trade, so they are left out.
  // https://www.sc.com/hk/investment/securities-services/hong-kong-securities-services/
  // https://www.sc.com/hk/investment/securities-services/us-securities-services/
  // https://www.sc.com/hk/deposits/integrated-deposits-account/
  standardcharteredhk: ["HKD", "USD", "CNH"],
  // "華盛支持港幣、美元及離岸人民幣入金", and "存入港幣默認為存入港股賬戶，存入美元
  // 默認為存入美股賬戶". FPS takes HKD and CNH; offshore yuan goes to the
  // A-share Connect account. eDDA is HKD only. Other currencies are bought
  // in the app.
  // https://www.vbkr.com/help/topic100322
  // https://www.vbkr.com/help/topic100469
  valuable: ["HKD", "USD", "CNH"],
  // The deposit guide: 銀證轉賬 and FPS "存入幣種為港元/美元/人民幣", e-banking
  // "港元/美元", cheques "港元/美元、人民幣". eDDA is HKD only. Home page:
  // "一個賬戶，多個幣種".
  // https://www.wlsec.com/post/立橋入金流程指引-通用
  welllink: ["HKD", "USD", "CNH"],
  // The receiving-account page lists HKD, USD and CNY accounts at Bank of
  // China (HK), HSBC, CMB Wing Lung and ICBC Asia, for "uSmart Securities
  // Limited". eDDA is HKD only. SGD appears only as an in-app conversion
  // currency, not as a deposit.
  // https://hk.usmartglobal.com/en/help-centre/48/detail/10539
  // https://hk.usmartglobal.com/en/help-centre/48/detail/10669
  usmarthk: ["HKD", "USD", "CNH"],
  // A bank: trades settle from the client's deposit account (月供股票計劃
  // debits the "證券結算賬戶"). Fees are "按交易貨幣計算及處理", with commission
  // in "港幣/人民幣" (min HK$/RMB100) for HK shares and A-shares. No USD or SGD
  // settlement is named for the share accounts (the Singapore fee line was
  // not read: the PDF could not be opened).
  // https://www.chiyubank.com/cyb/index/tzlc/zq/zqmmfw/index.shtml
  // https://www.chiyubank.com/cyb/index/tzlc/zq/zqhjjh/index.shtml
  chiyu: ["HKD", "CNH"],
  // Yen by bank transfer. "外貨" deposits (both courses) go to Daiwa's
  // foreign-currency accounts at Citibank Tokyo, one per currency, after a
  // 外貨預金口座届出書: USD, EUR, GBP, AUD, CAD, HKD, SGD, CHF, NZD, ZAR, TRY,
  // MXN, HUF, NOK, CNY.
  // https://www.daiwa.jp/service/pay/bank_pay/
  daiwa: ["JPY", "USD", "EUR", "GBP", "AUD", "CAD", "HKD", "SGD", "CHF", "NZD", "ZAR", "TRY", "MXN", "HUF", "NOK", "CNY"],
  // Yen through the Ogaki Kyoritsu Bank link or a transfer. "外貨の入出金のお手
  // 続きについては、事前にOKB証券までご連絡ください", and the fee page prices a
  // foreign-currency deposit (client pays) and withdrawal (4,950円). No page
  // names the currencies taken. USD is listed as the currency of its US
  // shares (min fee "11米ドル"). The FX spread table (EUR, AUD, NZD, HKD,
  // ZAR, TRY, MXN, BRL, INR) is for foreign bonds and is not proof of a
  // deposit.
  // https://www.okb-sec.co.jp/service/payment/
  // https://www.okb-sec.co.jp/service/fee/
  okb: ["JPY", "USD"],
  // Yen to the SMBC Nikko branch account. "以下の銀行口座からのお振り込みで15
  // 通貨を証券口座にご入金いただくことができます": SMBC Tokyo (domestic, one
  // account for all) or Citibank Tokyo (one per currency, from abroad too):
  // USD, GBP, AUD, NZD, CAD, EUR, ZAR, CHF, HKD, SGD, DKK, MXN, NOK, SEK,
  // TRY.
  // https://www.smbcnikko.co.jp/service/payment/nyukin/bank/index.html
  smbcnikko: ["JPY", "USD", "GBP", "AUD", "NZD", "CAD", "EUR", "ZAR", "CHF", "HKD", "SGD", "DKK", "MXN", "NOK", "SEK", "TRY"],
  // Won only. The fee page prices a conversion ("환전수수료 ... 스프레드 1%")
  // for US shares. Neither it nor the FAQ names a foreign-currency deposit.
  // https://www.kakaopaysec.com/guide/feeGuide/dynamicPage.do
  // https://www.kakaopaysec.com/customer/faq/dynamicPage.do
  kakaopay: ["KRW"],
  // Won only. The overseas service steps are account, trading application,
  // then "외화환전 환전통화 : 미국달러(USD)" in the MTS, or the 원화증거금
  // service. No page names a direct dollar deposit.
  // https://fundsupermarket.wooriib.com/fmc/FMC3090031/main.do
  woori: ["KRW"],
  // TWD through the 口袋錢包 sub-account. For US shares the firm offers
  // "台幣結算 與 美元結算": in USD the buy is debited and the sale credited
  // to the client's foreign-currency account, "不進行台幣換匯".
  // https://www.pocket.tw/school/articles/3294/
  // https://www.pocket.tw/school/articles/3276/
  pocketsec: ["TWD", "USD"],
  // "Selfwealth does not support direct transfers to or from international
  // currency bank accounts. All funds must be deposited and withdrawn in
  // Australian Dollars through your Selfwealth AUD cash account." The USD
  // cash account is funded only by an in-app transfer from the AUD one,
  // which is a conversion.
  // https://help.selfwealth.com.au/hc/en-au/articles/4539607797133-Can-I-transfer-international-currencies-directly-to-Selfwealth
  selfwealth: ["AUD"],
  // Funding is by PayID, PayTo, bank transfer or BPAY, all in dollars of
  // Australia. The USD wallet is filled by "in-app currency conversion
  // between AUD and USD" (minimum A$100), and "funds can only be withdrawn
  // in AUD". No USD deposit route is given.
  // https://www.superhero.com.au/support/articles/17153156115471-deposits/
  // https://www.superhero.com.au/product/fund-your-superhero-account/
  superhero: ["AUD"],
  // The fees page prices only naira deposits: bank deposits ("1.25%,
  // capped at ₦300") and "Naira card deposits". No page (home, fees, FAQ,
  // terms) names a dollar wallet or a dollar deposit; US trades are funded
  // from the naira wallet.
  // https://yochaa.com/fees
  // https://yochaa.com/faqs
  yochaa: ["NGN"],
  // The SAR wallet takes a wire or Sarie transfer to anb capital. "To fund
  // your USD wallet, you must first deposit SAR into your SAR wallet via
  // wire transfer ... Then convert it to USD directly in the app", and
  // "You cannot withdraw USD directly". So no dollar comes in unconverted.
  // https://help.investsky.com/en/articles/10260386-how-do-i-deposit-money-into-my-account
  // https://help.investsky.com/en/articles/10260526-how-do-i-withdraw-my-money
  investsky: ["SAR"],
  // The approved client accounts at Palestine Investment Bank and Arab Bank
  // are in JOD and USD, "the only channels through which client deposits
  // for trading are accepted"; "Match your account currency". The local
  // market trades "JOD or USD, depending on the share". No shekel account
  // is given.
  // https://gsc.ps/en/content/customer-relations/الحسابات-البنكية.html
  // https://gsc.ps/en/content/accounts/حسابات-السوق-المحلي.html
  globalsecurities: ["JOD", "USD"],
  // Deposit page, with the Bank Hapoalim account and SWIFT code "להעברות
  // מט"ח": "ניתן להפקיד שקל, דולר או אירו". Shekels are converted to
  // dollars or euros only by an in-app FX order or the end-of-day
  // auto-conversion of a negative dollar balance.
  // https://www.as-invest.co.il/trade/deposit/
  // https://www.as-invest.co.il/trade/currency_exchange/
  altshuler: ["ILS", "USD", "EUR"],
  // General terms, part D: "כל סכום שיופקד במטבע חוץ, יופקד בחשבון עובר
  // ושב במטבע חוץ" (any foreign-currency amount goes to a foreign-currency
  // current account). The tariff's value-date table names incoming
  // transfers in US dollars, Canadian dollars, sterling, euros and Swiss
  // francs ("ומטבעות אחרים" also, unnamed). Foreign securities are priced
  // in dollars.
  // https://www.mercantile.co.il/media/otun30gb/part_d.pdf
  // https://www.mercantile.co.il/media/5sgkpskc/taarifon_private_full.pdf
  mercantile: ["ILS", "USD", "EUR", "GBP", "CAD", "CHF"],
  // "Τραπεζικοί λογαριασμοί διαθεσίμων πελατείας": client-money IBANs in
  // EURO, USD, GBP and NOK (Alpha Bank), EURO, USD and GBP (Piraeus),
  // EURO, USD, GBP and BGN (Eurobank), EURO only at NBG and Optima. Wires
  // "πρέπει να πιστώνεται, αποκλειστικά" to these accounts. Foreign-market
  // orders are routed abroad; no page says a deposit is converted. The BGN
  // account is left out: Bulgaria has used the euro since 1 January 2026.
  // https://www.hellenicamerican.gr/ενημέρωση-πελατών/τραπεζικοι-λογαριασμοι/
  hellenicamerican: ["EUR", "USD", "GBP", "NOK"],
  // Lira for Borsa Istanbul. The US account at Alpaca is dollars only:
  // "Yurt dışı yatırım hesabınızda sadece Amerikan Doları (USD) cinsinden
  // işlem yapılabilmektedir." Dollars come free from an Aktif Bank USD
  // current account through N Kolay Mobil, or by SWIFT from another bank
  // ("Banka hesabınız üzerinden yapacağınız USD transfer işlemleri"). No
  // euro or other currency account is named.
  // https://www.aktifyatirim.com.tr/sikca-sorulan-sorular
  // https://www.aktifyatirim.com.tr/komisyon-ucretler
  aktifyatrm: ["TRY", "USD"],
  // The "Hesabıma Nasıl Para Yatırırım?" page gives a Takasbank IBAN "TL
  // GÖNDERİLERİ İÇİN" and Garanti IBANs "EURO GÖNDERİLERİ İÇİN" and "USD
  // GÖNDERİLERİ İÇİN". The US page: "Mevcut USD hesabınızla işlem yapmaya
  // başlayabilirsiniz"; a lira balance can also be turned into dollars in
  // AtaOnline.
  // https://atayatirim.com.tr/yatirimci-olun/hesabima-nasil-para-yatiririm
  // https://atayatirim.com.tr/landingpages/yurt-disi-borsalar
  atayatrm: ["TRY", "USD", "EUR"],
  // Lira for Borsa Istanbul through Fibabanka Mobil's Borsa Market. The US
  // account at Alpaca is funded by first sending "Fibayatırım Hesabına USD
  // döviz cinsinde para transferi", then moving it to the US account. No
  // euro account or foreign-currency IBAN is published.
  // https://www.fibayatirim.com.tr/urun-ve-hizmetler/yurt-disi-piyasalar
  // https://www.fibayatirim.com.tr/platformlarimiz/fibabanka-mobil
  fibayatrm: ["TRY", "USD"],
  // "Kolay Para Transferi" lists a "TL HESABI", a "USD HESABI" and a "EURO
  // HESABI" at Garanti, Akbank and Yapı Kredi: "TL, USD ve Euro
  // transferlerden ücret alınmamaktadır." The foreign-share account
  // (Osmanlı Global) is funded by EFT/SWIFT to the details its Client
  // Portal gives; the page names no currency for it.
  // https://www.osmanlimenkul.com.tr/hisse-ve-viop/hesap-acilis-islemleri/para-transferleri-
  // https://www.osmanlimenkul.com.tr/hisse-ve-viop/hisse-ve-viop-urunlerimiz/hisse/yabanci-hisse-
  osmanlyatrm: ["TRY", "USD", "EUR"],
  // Piapiri's FAQ "ÜNLÜ Menkul'deki hesabıma nasıl para gönderebilirim?"
  // links ÜNLÜ Menkul's IBAN list: TRY, USD and EUR at ten or so banks,
  // AUD at Garanti, HSBC and TEB, CAD at Garanti and TEB, CHF and GBP at
  // TEB. Piapiri also sells eurobonds. The US page only shows lira turned
  // into dollars in the app ("TL bakiyeni dolara çevir").
  // https://www.piapiri.com/bize-sor/transferler/
  // https://www.piapiri.com/assets/piapiri/upload/files/Unlu_Menkul_IBAN_Listesi-2197.pdf
  // https://www.piapiri.com/urunlerhizmetler/abd-borsalari/
  piapiri: ["TRY", "USD", "EUR", "AUD", "CAD", "CHF", "GBP"],
  // Lira for Borsa Istanbul. The bank-details page lists TL, USD, EUR and
  // GBP accounts (Akbank, Garanti, İş Bankası, Yapı Kredi). The Rally US
  // account is "sadece Amerikan Doları (USD)": dollars are sent from a USD
  // bank account to Tacirler's USD accounts, and "Tacirler Yatırım Cari
  // hesabınızda bulunan diğer para birimlerinizi" are converted to USD
  // before the transfer.
  // https://tacirler.com.tr/banka-hesap-bilgileri
  // https://tacirler.com.tr/rally-hakkinda-sikca-sorulan-sorular
  tacirleryatrm: ["TRY", "USD", "EUR", "GBP"],
  // The account is funded "transfiriendo Pesos a las cuentas de Argentina
  // Valores S.A.". The opening form asks for the "CBU de las cuentas desde
  // donde va a transferir fondos": a peso account and, optionally, a
  // dollar account. The tariff prices "Transferencias USD" and "$" to the
  // client, and Wall Street assets are held "en dólares" in the same
  // account. No other currency is named.
  // https://www.avsa.com.ar/abrir-cuenta-comitente-titular/
  // https://www.avsa.com.ar/dolar-argentina-valores/
  // https://www.avsa.com.ar/wp-content/uploads/2019/10/AVSA_TABLA-ARANCELES_2019-10.pdf
  argentinavalores: ["ARS", "USD"],
  // The tariff (May 2026) lists, under "Ingreso de Dinero", "Transferencia
  // Pesos" and "Transferencia USD Local" free, and "Ingreso USD Exterior"
  // at USD 100. Pesos stay pesos, local and cable dollars stay dollars.
  // No other currency is named.
  // https://s3-sa-east-1.amazonaws.com/bmb.s3.webbucket/System/Files/Tarifario.pdf
  // https://bullmarket.com.ar/inversion/dolar-ccl/
  bullmarket: ["ARS", "USD"],
  // The opening form asks for "Cuenta 1 - Pesos" and an optional "Cuenta
  // 2 - Dólar" (bank and CBU) for the comitente account, which trades
  // NYSE and Nasdaq and LETES "en dólares". No funding page or fee line
  // names a currency, so the dollar side rests on the form.
  // https://cafsecurities.com.ar/abrir-cuenta-temp/
  // https://cafsecurities.com.ar/productos-y-servicios/inversion/
  cafsecurities: ["ARS", "USD"],
  // "Para ingresar dinero, copiá el CBU de IEB+, transferí desde una cuenta
  // a tu nombre". "¿Puedo transferir desde una cuenta comitente del
  // exterior? Si!", by SWIFT, credited to the IEB+ account. MEP needs "una
  // cuenta bancaria en dólares a tu nombre" linked to the account. No
  // other currency is named.
  // https://www.iebmas.com.ar/preguntas-frecuentes/
  ieb: ["ARS", "USD"],
  // "Elegí la moneda que querés ingresar": "Pesos (ARS): usá el CVU",
  // "Dólar Local (USD): usá el CBU o alias", "Dólar Exterior (USD): se
  // acredita mediante transferencias internacionales". A dollar
  // withdrawal costs U$S 5. No other currency is named.
  // https://www.lbo.com.ar/guias-de-uso
  // https://www.lbo.com.ar/listado-de-comisiones
  lbo: ["ARS", "USD"],
  // The tariff: "Transferencias en pesos y dólares Sin Cargo" and
  // "Transferencia USD Cable", bank costs passed on. The home page sells
  // MEP and cable "con liquidación en dólares ... desde una sola cuenta".
  // No other currency is named.
  // https://cinqcapital.com/Tarifario_CINQ.pdf
  // https://www.cinqcapital.com/
  lescinq: ["ARS", "USD"],
  // No funding page and no money-transfer line in the fee list. The home
  // page says "Colocá tu liquidez en pesos o dólares" in funds, and it
  // opens a US account for Wall Street. The dollar side rests on that, so
  // the evidence is thin.
  // https://www.optionsecurities.com.ar/
  // https://www.optionsecurities.com.ar/Listado-de-comisiones.pdf
  optionsecurities: ["ARS", "USD"],
  // "¿De qué forma puedo depositar dinero para empezar a operar? A través
  // de transferencias bancarias, en pesos o dólares", from an account in
  // the client's name. No other currency is named.
  // https://pgavalores.com.ar/faqs/
  pgavalores: ["ARS", "USD"],
  // "Podés transferir a la cuenta comitente asociada a tu cuenta." "¿Se
  // puede invertir en pesos y/o dólares? Podés invertir en cualquiera de
  // las dos monedas." The tariff charges "Mandatos del exterior". No
  // other currency is named.
  // https://psec.com.ar/herramientas/preguntas-frecuentes.html
  // https://psec.com.ar/aranceles-y-comisiones.html
  psec: ["ARS", "USD"],
  // The money goes to Rava's bank accounts shown under "Billetera". The
  // tariff: "Transferencia de pesos y dólares Sin cargo". The offer is
  // "Pesos o dólares · ... Argentina y el exterior". No other currency is
  // named.
  // https://www.rava.com/centro-de-ayuda/preguntas-frecuentes
  // https://www.rava.com/nuestros-servicios/aranceles
  rava: ["ARS", "USD"],
  // Funds come "a través de una transferencia bancaria a nuestras cuentas
  // habilitadas". The tariff: "Transferencias Locales en ARS y UDS Sin
  // Cargo" and "Transferencias Internacionales de USD" at bank cost
  // (from 50 USD). No other currency is named.
  // https://www.sailinginversiones.com/preguntas-frecuentes/
  // https://www.sailinginversiones.com/operar/aranceles/
  sailing: ["ARS", "USD"],
  // The tariff image: "Transferencias en pesos y U$S" and "Transferencia
  // USD Cable" (bank costs plus up to $100), with peso and dollar
  // cauciones. No other currency is named.
  // https://www.vetacapital.com.ar/aranceles-y-comisiones
  // https://static.wixstatic.com/media/135c82_9f1879735982404abbc085ce57aea5e6~mv2.png
  veta: ["ARS", "USD"],
  // The Inter account in Brazil takes reais. The Conta Global de
  // Investimentos (Inter Securities) is funded only in the app: "Você pode
  // realizar o câmbio da reais para dólares ou realizar a transferência de
  // dólares da sua Global Account". The Global Account receives money from
  // abroad: the app gives "IBAN, SWIFT, Routing Number (para dólar) e
  // Account Number". So a dollar wire to the Global Account reaches the
  // US account still in dollars.
  // https://ajuda.inter.co/investimentos/em-quanto-tempo-o-deposito-da-minha-conta-inter-securities-e-concluido
  // https://blog.inter.co/como-receber-em-dolar-no-inter-entendendo-a-global-account/
  interbr: ["BRL", "USD"],
  // The B3 account takes reais. The Conta Investimento Global (XP
  // International) is filled by "remessas no valor mínimo de R$ 100" from
  // the Rico account. The help centre: "transferências externas diretas
  // para a Conta Investimento Global não são aceitas. Todo processo de
  // envio ou recebimento de recursos deve ser realizado via conta nacional
  // (Brasil)." No dollar deposit is left as dollars, but the global
  // account holds its cash in dollars, so USD is listed as its cash
  // (owner, 2026-10-26: "ajoute les devises du cash").
  // https://atendimento.rico.com.vc/artigo/51834020792347-consigo-transferir-recursos-de-fora-do-brasil-para-a-minha-conta-investimento-global
  // https://riconnect.rico.com.vc/blog/conta-global-rico/
  rico: ["BRL", "USD"],
  // A deposit to the Conta Investimento Global goes from the Conta
  // Investimento, Conta Digital or Investimento Brasil through the "tela de
  // Câmbio", and "o valor será convertido e creditado". "Por enquanto,
  // transferências externas diretas para a Conta Investimento Global não
  // são aceitas." The Conta Global XP card account does not receive wires
  // either ("ainda não está disponível"). Only reais come in, but the
  // global account holds its cash in dollars, so USD is listed as its cash
  // (owner, 2026-10-26: "ajoute les devises du cash").
  // https://atendimento.xpi.com.br/artigo/51839749965467-como-faco-um-deposito-na-minha-conta-de-investimento-global-xp
  // https://atendimento.xpi.com.br/artigo/51839750158747-consigo-transferir-recursos-de-fora-do-brasil-para-a-minha-conta-investimento-global
  // https://atendimento.xpi.com.br/artigo/3323-posso-receber-dinheiro-na-minha-conta-global-xp-via-wire-transfer
  xpbr: ["BRL", "USD"],
  // The BVC account is funded in pesos. For US shares: "Deposita en pesos
  // desde PSE de manera segura y pásalos a dólares", the exchange done by
  // Acciones & Valores as an IMC. The dollars then sit in the Alpaca
  // wallet, but no page offers a dollar transfer in.
  // https://trii.co/acciones-estados-unidos
  // The Alpaca wallet holds dollars, so USD is listed as cash although it
  // is reached by converting (owner, 2026-10-26: "ajoute les devises du
  // cash").
  triico: ["COP", "USD"],
  // Money comes in by transfer to the Smart Cash CLABE (a peso SPEI
  // account). "La única forma de fondear o depositar a Trading USA es con
  // una transferencia desde Smart Cash." No dollar CLABE or dollar
  // transfer in is published; Smart Cash Dólares is a fund bought from
  // pesos.
  // https://gbm.com/faqs/como-y-cuando-puedo-depositar-a-smart-cash/
  // https://gbm.com/faqs/como-ingreso-dinero-a-mi-cuenta-de-trading-usa
  // Trading USA holds dollars, so USD is listed as cash although it is
  // reached by converting (owner, 2026-10-26).
  gbm: ["MXN", "USD"],
  // The fee schedule is in two columns, "J$" and "FX-USD", with US dollar
  // fees for overseas wires and foreign-currency cheques, and the stocks
  // page trades "JMD and USD stocks". The US (IB) desk is charged in USD.
  // VM Group's diaspora page says investments can be funded in "USD, CAD,
  // GBP, or JMD", but no CAD or GBP account column is printed for VM
  // Wealth, so those are left out.
  // https://vmwealth.myvmgroup.com/wp-content/uploads/2026/06/Schedule-of-Fees-Charges-March-2026.pdf
  // https://vmwealth.myvmgroup.com/personal-solutions/stocks/
  // https://vmdiaspora.myvmgroup.com/faqs/
  vmwealth: ["JMD", "USD"],
  // The price list: "All deposits which need to be converted from the base
  // currency (EUR) in a foreign currency are subject to a currency
  // conversion fee of 0,25%". The company's accounts are at Hipotekarna
  // and Zapad Banka in Montenegro. Only the CFD accounts name "EUR or USD";
  // no dollar deposit is named for the TF Trader (Alpaca) account.
  // https://s3proxy-production-68ee.up.railway.app/roomy-cube-0loizvqps2pu-0/regulativa/tfcapital-pricing.pdf
  // https://tfcapital.me/en/pricing
  tfcapital: ["EUR"],
  // 2026-10-26: the single-place catalogues that got cost files that day.
  // USD only. A US bank brokerage with dollar cash, no multi-currency wallet
  // on the fee page.
  // https://www.wellsfargoadvisors.com/services/online/fees-expanded.htm
  wellstrade: ["USD"],
  // USD only. The account and all lines are in dollars; the schedule's 'FX up
  // to 1.00%' is for currency conversions, which this place does not need.
  // https://www.citi.com/investorinfo/assets/docs/CPWM-Annual-Account-Fees.pdf
  citiself: ["USD"],
  // USD only. A domestic US bank brokerage; the fee page prices everything in
  // dollars.
  // https://www.usbank.com/investing/online-investing/self-directed-investing/fees.html
  usbancorpadvisor: ["USD"],
  // USD only. The fee summary and the agreement price everything in dollars,
  // and foreign securities are not accepted.
  // https://www.tiaa.org/public/pdf/BrokerageAccountCustomerAgreement.pdf
  tiaa: ["USD"],
  // USD only. The app is funded from a linked US bank account; the fee
  // schedule names no other currency.
  // https://www.plynkinvest.com/disclosures/fee-schedule
  plynk: ["USD"],
  // USD only. US bank brokerage account for current Truist clients, funded
  // from Truist/US checking, savings or investment accounts (
  // https://www.truist.com/investing-retirement/self-directed-investing
  truisttrade: ["USD"],
  // USD only. US brokerage cleared by Pershing; no FX facility for cash (
  // https://www.americancentury.com/invest/accounts/brokerage/commissions-and-fees/
  americancentury: ["USD"],
  // USD only. Navy Federal Credit Union members fund the account from US
  // accounts (
  // https://www.navyfederal.org/investment-services/investments.html
  navyfederaldigit: ["USD"],
  // USD only. Deposits by ACH/wire from domestic US bank or brokerage accounts
  // in the client's name (
  // https://support.wealthfront.com/hc/en-us/articles/15967641307924-Send-or-receive-money-with-wires
  wealthfront: ["USD"],
  // USD only. Requires a checking account at a US bank (Betterment Help
  // Center, quoted via third-party sites;
  // https://www.betterment.com/help/tag/common-questions
  betterment: ["USD"],
  // USD. Funded from a linked US bank account or a MoneyLion account; all
  // lines are in USD (help article, ADV)
  moneylion: ["USD"],
  // USD (US self-directed brokerage account at Ameriprise; USD lines only)
  huntington: ["USD"],
  // USD (funded from the member's credit union checking account; $1 to
  // $250,000 per transaction)
  midminnesotafede: ["USD"],
  // USD ("Buy and sell transactions and dividends paid are only able to be
  // posted to a checking account at Bluestone"; $1.00 USD minimum)
  bluestonefederal: ["USD"],
  // USD (funded from the Day Air checking account inside online banking and
  // the app)
  dayaircreditunio: ["USD"],
  // USD - member funds trades from Element checking account (
  // https://www.elementfcu.org/invest/
  elementfederalcr: ["USD"],
  // USD - 'Fund security purchases directly from your FCU checking account' (
  // https://frankenmuthcu.org/invest/
  frankenmuthcredi: ["USD"],
  // USD - funded from the member's PFCU account (
  // https://www.peninsulafcu.com/investing-securities
  peninsulafederal: ["USD"],
  // USD - TRU FCU account in dollars (
  // https://tru-fcu.org/investment-portal/
  trufederalcredit: ["USD"],
  // USD - ACH bank transfers in and out at $0, dollar account (
  // https://help.albert.com/hc/en-us/articles/16795407078423
  albert: ["USD"],
  // USD - US account funded from a US bank; page says Apex is registered in 53
  // U.S. states and territories (
  // https://busykid.com/investing-for-kids/
  busykid: ["USD"],
  // USD - ACH and domestic wires only (
  // https://docs.frec.com/pricing-fee-schedule.pdf
  frec: ["USD"],
  // USD - US self-directed account at StoneX Financial Inc. (
  // https://www.stonex.com/en-us/business/self-directed-services/self-directed-accounts/
  stonexone: ["USD"],
  // USD - linked US bank account (
  // https://www.acorns.com/pricing/
  acorns: ["USD"],
  // USD - HSBC Premier checking account in the US (
  // https://www.us.hsbc.com/investments/products/self-directed-brokerage/
  hsbcus: ["USD"],
  // USD. US-only introducing broker cleared by IBKR, every line in USD.
  // Source:
  // https://www.tc2000.com/brokerage/formcrs
  tc2000: ["USD"],
  // USD. Pershing-carried US account, all lines in USD. Source: brochure
  // https://www.saturna.com/sites/saturna.com/files/files/sbs-brochure.pdf
  saturna: ["USD"],
  // USD. First Citizens Bank's US broker-dealer, every line in USD. Source:
  // https://www.firstcitizens.com/personal/investments/self-directed-investing
  firstcitizens: ["USD"],
  // USD. US brokerage and IRA account at Pershing, every line in USD. Source:
  // https://www.empower.com/products-solutions/brokerage-accounts
  empower: ["USD"],
  // USD. The help article says "Stocks Cash refers to the USD balance in your
  // Stocks brokerage account". Source:
  // https://help.crypto.com/en/articles/10153377-stock-and-etf-trading-via-the-crypto-com-app
  cryptocom: ["USD"],
  // USD. Evidence: the schedule says all amounts are charged in U.S. dollars;
  // equities are funded in USD, and crypto converted to USD is optional, so it
  // is not in the trip.
  // https://uphold.com/legal/security-disclosures
  uphold: ["USD"],
  // USD. Evidence: a US broker-dealer with USD accounts only; every fee is in
  // USD.
  // https://www.tradingblock.com/pricing-policies
  tradingblock: ["USD"],
  // USD. Evidence: a US bank brokerage account; all fees are in USD and trades
  // are executed through NFS.
  // https://www.umb.com/wealth-management/investing/self-direct-investing
  umb: ["USD"],
  // USD. Evidence: 'a Chime Checking Account' is required as 'how you fund
  // your investments' (a USD account).
  // https://www.chime.com/invest/
  chimeus: ["USD"],
  // USD. Evidence: a US bank account linked to a BOKFA brokerage account at
  // Pershing; all fees are in USD.
  // https://www.bokfinancial.com/personal/products-and-services/personal-banking/checking-accounts/premier-checking
  bok: ["USD"],
  // USD. Evidence: ACH and US domestic wires are the only rails ('ACH Deposits
  // and Withdrawals $0', 'Domestic Wire Outbound $30').
  // https://opencash.com/ocs_fee_schedule_updated_march_2026.pdf
  opencash: ["USD"],
  // USD. Evidence: the cash is the Step Spend account, a USD account ('The
  // Step Visa Card and Account is issued by Evolve Bank & Trust, Member
  // FDIC').
  // https://help.step.com/en/articles/6967968-how-do-i-buy-and-sell-stocks
  stepus: ["USD"],
  // USD. Evidence: US brokerage account with a daily sweep into money market
  // funds, checkwriting and ACH.
  // https://www.bny.com/content/dam/im/documents/manual/brochures/bny-mellon-brokerage-account.pdf
  bny: ["USD"],
  // USD. Evidence: FAQ says 'Account funding must be made in US Dollars.'
  // https://www.mondeumcapital.com/faq/
  mondeum: ["USD"],
  // USD. Evidence: US-only LPL Financial brokerage account; every fee in the
  // schedule is in USD.
  // https://www.lpl.com/content/dam/edam/practice-management/fees/fs07-ctd.pdf
  lpltradedirect: ["USD"],
  // USD. The Access Direct account at Morgan Stanley Smith Barney LLC is a US
  // brokerage account in dollars; the page lists only USD wires ("Wire
  // Transfer USD (Outgoing) $25").
  // https://www.morganstanley.com/what-we-do/wealth-management/morgan-stanley-access-direct/pricing-details
  morganstanleyacc: ["USD"],
  // USD. Online trading is a feature of J.P. Morgan full-service brokerage
  // accounts at J.P. Morgan Securities LLC, and "Online trading requires
  // sufficient cash to trade" (USD accounts).
  // https://www.jpmorgan.com/wealth-management/wealth-partners/online-tools/how-to-pages/trade-online
  jpmorganwealthpa: ["USD"],
  // USD. The account at Alpaca is in dollars. The Excluded Fee Schedule prints
  // an "FX Fee: 1% of Notional Amount" for funding wallets, and local
  // withdrawals "Varies by FX", so other currencies are converted.
  // https://musaffa.com/trading-service-fee-schedule/
  musaffa: ["USD"],
  // USD. Trades are funded from the member's credit union checking or savings
  // account in dollars.
  // https://www.thinkwisecu.org/invest
  thinkwisecreditu: ["USD"],
  // USD. Trades are funded "through your Checking or Savings accounts" at the
  // credit union, in dollars.
  // https://www.myhorizoncu.com/cryptocurrency-and-securities/
  horizonutahfeder: ["USD"],
  // USD. Purchases are funded from the member's Summit Choice CU checking
  // account: "Fund your investment purchases directly from your Summit Choice
  // CU checking account in near real time" (
  // https://www.summitchoice.org/Accounts/Invest/Securities-ETFs
  summitchoicecred: ["USD"],
  // USD. The account is held at Apex and funded from the member's CCU accounts
  // (
  // https://www.ccutx.org/invest/wealth-management/online-investing
  capitolcredituni: ["USD"],
  // USD. Unifimoney's Cash Account is held at First Fidelity Bank: "The cash
  // balance in the Cash Account is eligible for FDIC insurance" (
  // https://www.ffb.com/unifimoney
  firstfidelity: ["USD"],
  // USD. The $3.50 fee and funding come from the linked Desert Financial
  // deposit account (
  // https://www.desertfinancial.com/en/invest-and-insure/digital-investing
  desertcreditunio: ["USD"],
  // USD. "you can transfer funds from your connected checking or savings
  // account", and funding is also possible via Plaid from other US banks (
  // https://www.ecu.com/digital-services/online-stock-trading/
  educatorscreditu: ["USD"],
  // USD — a US bank's platform funded from the eBank account, all lines in
  // dollars (
  // https://www.extracobanks.com/digital-banking/online-banking/easyinvest-extraco
  extracobanks: ["USD"],
  // USD — funded from Casco FCU accounts by ACH in dollars; deposits and
  // withdrawals are "free of charge" (cascofcu.com CascoINVEST FAQ)
  cascofederalcred: ["USD"],
  // USD — funded from the Crews Bank account, all lines in dollars (
  // https://www.crews.bank/digital-investing
  crewstrust: ["USD"],
  // USD — a credit-union portal funded from One Nevada accounts, all lines in
  // dollars (
  // https://www.onenevada.org/onenvest
  onenevadacreditu: ["USD"],
  // USD — "Your ACH transfers in Digital Investing will be from Alpaca
  // Securities", all in dollars (
  // https://www.lakecitybank.com/personal/digital-banking/digital-investing/
  lakecity: ["USD"],
  // ["USD"]: dollar Digital Investing account funded from a Central National
  // Bank (Kansas) account; every catalogue line is USD.
  // https://centralnational.com/whycentral/digital-investing.asp
  centralnational: ["USD"],
  // ["USD"]: Unifimoney dollar cash account funded from the Parda account; the
  // catalogue is all USD.
  // https://www.parda.com/invest
  pardafederalcred: ["USD"],
  // ["USD"]: Unifimoney cash account funded from the FB&T account; the
  // catalogue is all USD.
  // https://www.myfarmers.bank/unifimoney
  farmerstrust: ["USD"],
  // ["USD"]: Unifimoney cash account funded from the Dirigo account; the
  // catalogue is all USD.
  // https://www.dirigofcu.com/personal/online-services/dirigo-investing/
  dirigofederalcre: ["USD"],
  // ["USD"]: Unifimoney cash account funded from the Sea Air account; the
  // catalogue is all USD.
  // https://www.seaairfcu.org/online-investing
  seaairfederalcre: ["USD"],
  // USD. Radiant member's dollar account; amounts in $, SSN/TIN asked at
  // enrolment.
  // https://www.radiantcu.org/online-investing
  radiantcredituni: ["USD"],
  // GBP. Fees are quoted in £, and terms 6.4/8.2 talk about converting the
  // client's base currency into the instrument's currency (the 0.99% FX is
  // rebated).
  // https://www.investa.co.uk/terms-of-service
  investa: ["GBP"],
  // EUR, USD. The reference currency is EUR unless the client chooses another;
  // the bank 'may ... open one or more foreign currency accounts' (general
  // terms 1.2.3.1).
  // https://luxembourg.ca-indosuez.com/en/pdfPreview/45073
  caindosuezwealth: ["EUR","USD"],
  // USD, EUR, CHF. The account currency is picked at opening (FAQ); the fee
  // minimum is quoted in 'USD/EUR/CHF'.
  // https://www.privatebrokers.eu/faq/
  privatebrokers: ["USD","EUR","CHF"],
  // EUR. 'the relevant amount in euros from your Fundvest account will be
  // converted'; the FX fee applies to anything not traded in euro.
  // https://fundvest.eu/fee-schedule/
  fundvest: ["EUR"],
  // ["USD"]. The DriveWealth trading account is in USD, and Mashreq NEO offers
  // USD accounts (the NEO CASA KFS lists USD among its digital
  // foreign-currency accounts). The page's 'preferential exchange rates' for
  // https://www.mashreq.com/en/uae/neo/investments/investments-us-stocks-etf/
  mashrequsetfs: ["USD"],
  // ["USD"]. The deposits FAQ says the card provider or bank 'will convert the
  // funds to USD ($) in order to be accepted by Nemo'.
  // https://nemo.money/faq/deposits-and-withdrawals
  nemomoney: ["USD"],
  // ["ILS"]. Every deposit route is charged in shekels ('החיוב מתבצע בשקלים')
  // and is converted automatically to USD at Blink's rate. There is no
  // conversion commission, but the tariff PDF lists a 'מרווח המרה' (conversion
  // https://heyblink.com/support-category/withdrawals-and-deposits/
  blinkil: ["ILS"],
  // ["USD"]. International EFT deposits are in US$ (US$1 partner-bank fee),
  // and withdrawals 'must be USD'. Rand bank transfers carry the 'FX Transfer
  // Fee 50BP'.
  // https://www.webull.co.za/pricing
  webullsouthafric: ["USD"],
  // ["USD"]. The app trades in dollars ('add a dollar') and is funded from a
  // chosen bank account; the bank keeps USD accounts. JOD funding pays
  // 'Deposit or exchange foreign currencies fee: Based on the declared
  // https://websitev3-cms-cdn.bankaletihad.com/2026/10/fees-and-charges-manual-oct-7-2026-en-1.pdf
  aletihad: ["USD"],
  // MXN, USD. 'Con Webull Financial LLC, puedes tener una cuenta en la que
  // depositas tus dólares'; pesos are held at Vifaru Casa de Bolsa, which
  // converts them at an unpublished 'tipo de cambio competitivo'.
  // https://www.webull.com.mx/
  webullmexico: ["MXN","USD"],
  // MXN only. FAQ: 'En la app de Ualá siempre operas en pesos mexicanos (MXN),
  // aunque las acciones coticen en dólares (USD). La conversión se realiza
  // automáticamente al comprar y al vender'; the rate is 'el vigente al
  // https://www.uala.mx/acciones
  ualamexico: ["MXN"],
  // ARS, USD (held as 'dólares digitales' / USDC). Product page: 'una comisión
  // del 0,5% por operación, ya sea que entres con pesos o dólares digitales'.
  // ; dollar deposits:
  // https://help.lemon.me/es/articles/14979916-que-es-el-producto-de-acciones-de-lemon
  lemonar: ["ARS","USD"],
  // USD, UYU. Tariffs are in USD; local transfers out cost 'USD 1 o el
  // equivalente en UYP'.
  // https://cms.balanz.com/PFS/107316_tarifariobalanzuruguaycorredordebolsasa.pdf
  balanzuruguay: ["USD","UYU"],
  // AMD, USD, EUR, RUB. FAQ: 'You can deposit in AMD, USD, EUR, and RUB'; 'ROQ
  // Markets supports multi-currency balances'; 'FX conversion fees are not
  // charged by ROQ Markets'.
  // https://roqcapital.am/en/roqmarkets
  roq: ["USD","EUR","RUB"],
  // EUR only. The PLV has no currency account, and securities FX is done at
  // "frei gehandelter Marktkurse" (PLV B.II.2.2) with no margin printed, so
  // non-EUR Xetra lines are N/A.
  // https://www.1822direkt.de/fileadmin/pdf-statisch/pv_gesamt_1822direkt.pdf
  "1822direkt": ["EUR"],
  // EUR only. The bank converts at a rate set "durch ein Verfahren ...
  // Marktgerechtigkeit" with no margin printed, so non-EUR lines are N/A.
  // https://atruvia.scene7.com/is/content/atruvia/0070_Preisaushangpdf
  vrpartnerbank: ["EUR"],
  // EUR. The PLV lists a VR-Währungskonto, but nothing says securities settle
  // in it, and the securities FX is only "marktgerecht" with no margin, so
  // non-EUR lines are N/A.
  // https://atruvia.scene7.com/is/content/atruvia/7557-plvpdf
  eckernforder: ["EUR"],
  // EUR. The PLV mentions a "Kunden-Währungskonto (mind. 5.000 €)" for cash,
  // but nothing says securities settle in it, so non-EUR lines are N/A.
  // Possible stand-in for the owner: PLV 4.5 prints the bank's Devisen
  // https://atruvia.scene7.com/is/content/atruvia/Preis_und_Leistungsverzeichnispdf
  meinevolksbankra: ["EUR"],
  // EUR only. Securities FX is only "marktgerecht" with no margin printed, so
  // non-EUR lines are N/A.
  // https://atruvia.scene7.com/is/content/atruvia/PVZ_01_04_2026pdf
  kdbank: ["EUR"],
  // EUR only. The PLV has no currency account for securities, and
  // foreign-currency trades are converted at the bank's rate (PLV 9.1.1).
  // https://atruvia.scene7.com/is/content/atruvia/20261001_Pax-BKC_PLV-Gesamtpdf
  pax: ["EUR"],
  // EUR only. The PLV has no securities currency account, and the depot
  // settles on the euro Girokonto.
  // https://atruvia.scene7.com/is/content/atruvia/preisverzeichnis-wertpapierdienstleistungenpdf
  berlinervolksban: ["EUR"],
  // EUR only. The PLV prints no currency account, and foreign-currency
  // securities trades are converted (9.1.1.1).
  // https://atruvia.scene7.com/is/content/atruvia/wertpapiergeschaeft_preis_und_leistungsverzeichnis_20260115
  edekabank: ["EUR"],
  // EUR only. The PLV has no securities currency account; FX goes through
  // GenoFX conversion (PLV 4.6).
  // https://atruvia.scene7.com/is/content/atruvia/134200-Preis-und-Leistungsverzeichnispdf
  psdrheinneckarsa: ["EUR"],
  // EUR only. The depot needs a euro Girokonto at the bank ('Einzige
  // Voraussetzung: Sie benötigen ein Girokonto bei uns'), and no currency
  // account is offered.
  // https://www.eb.de/privatkunden/wertpapiere/depot.html
  evangelische: ["EUR"],
  // EUR only. Trades settle on the Kasseler Sparkasse Girokonto and no
  // currency account is offered.
  // https://www.kasseler-sparkasse.de/de/home/privatkunden/wertpapiere-und-boerse/wertpapier-depot.html
  kasselersparkass: ["EUR"],
  // EUR only. Securities FX is set by a 'marktgerecht' procedure and no
  // currency account is offered.
  // https://atruvia.scene7.com/is/content/atruvia/Preisaushangpdf-13
  volksbankkolnbon: ["EUR"],
  // EUR only. No currency account is offered; FX goes through DZ BANK at a
  // rate it does not print for securities.
  // https://atruvia.scene7.com/is/content/atruvia/Preisaushangpdf-7
  dkmdarlehnskasse: ["EUR"],
  // EUR only. No currency account is offered, and the PLV prints no securities
  // FX margin.
  // https://www.ksk-ostalb.de/content/dam/myif/sk-ostalb/work/dokumente/pdf/preise-leistungen/preis-leistungsverzeichnis.pdf
  kreissparkasseos: ["EUR"],
  // EUR only. No currency account is offered.
  // https://www.sparkasse-spree-neisse.de/content/dam/myif/sk-spree-neisse/work/dokumente/pdf/preise-leistungen/preisaushang.pdf
  sparkassespreene: ["EUR"],
  // EUR. The pages show a euro Girokonto and depot only, with no currency
  // account.
  // https://www.gestalterbank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  volksbankegdiege: ["EUR"],
  // EUR. The site shows no currency account.
  // https://www.volksbankinostwestfalen.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/depotmodelle.html
  volksbankinostwe: ["EUR"],
  // EUR. The site shows no currency account.
  // https://www.verbundvolksbank-owl.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
  verbundvolksbank: ["EUR"],
  // EUR. The site shows no currency account.
  // https://www.volksbanking.de/privatkunden/depot-wertpapiere/depot-brokerage/depots/depotmodelle.html
  volksbankdarmsta: ["EUR"],
  // EUR. The site shows no currency account.
  // https://www.vr-rheinahreifel.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  vrrheinahreifel: ["EUR"],
  // EUR only. The depot settles on a euro Verrechnungskonto at the bank and no
  // currency account is offered.
  // https://www.vrbank-brs.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot.html
  vrbonnrheinsieg: ["EUR"],
  // EUR only. The PLV converts foreign-currency trades at a 'marktgerecht'
  // rate and no currency account is offered.
  // https://atruvia.scene7.com/is/content/atruvia/Preisverzeichnis%20Wertpapierepdf
  vereinigtevrkuru: ["EUR"],
  // EUR only. There is a euro Verrechnungskonto at the bank and no currency
  // account.
  // https://www.vrbank-lb.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot-investier.html
  vrludwigsburg: ["EUR"],
  // EUR only. There is a euro current account at the bank and no currency
  // account.
  // https://www.diebank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  vereinigtevolksb: ["EUR"],
  // EUR only. The PLV converts foreign-currency trades at a 'marktgerecht'
  // rate and no currency account is offered.
  // https://atruvia.scene7.com/is/content/atruvia/PLVpdf-42
  vrstarnbergzugsp: ["EUR"],
  // EUR only. The Preisaushang and the depot page show only a euro current
  // account and no currency accounts.
  // https://atruvia.scene7.com/is/content/atruvia/aktueller-preisaushangpdf-1
  vrnord: ["EUR"],
  // EUR only. The depot page shows no currency account and a depot needs a
  // current account at the bank.
  // https://www.vr-teilhaberbank.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  vrteilhaberbankm: ["EUR"],
  // EUR only. No currency account appears on the depot or Mein.Depot pages.
  // https://www.vb-sauerland.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  volksbanksauerla: ["EUR"],
  // EUR only. The PLV extract and the depot page show only a euro
  // Verrechnungskonto.
  // https://www.vrbank.de/privatkunden/geldanlage-und-sparen/boerse-und-wertpapiere/depotmodelle.html
  vrrheinneckar: ["EUR"],
  // EUR only. No currency account is shown on the depot-models page.
  // https://www.vb-bo.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/depotmodelle.html
  volksbankbodense: ["EUR"],
  // EUR only. No currency account is offered on the depot pages, and
  // foreign-currency settlement is converted by DZ BANK (GenoFX).
  // https://www.volksbank-wml.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  volksbankwestmun: ["EUR"],
  // EUR only. The Preisaushang lists no currency account for securities, and
  // foreign-currency items are converted.
  // https://atruvia.scene7.com/is/content/atruvia/7207-preisaushangpdf-1
  volksbankinschau: ["EUR"],
  // EUR only. No currency account is shown, and foreign-currency settlement
  // goes through DZ BANK GenoFX.
  // https://www.volksbank-trier-eifel.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  volksbanktrierei: ["EUR"],
  // EUR only. The PLV converts foreign-currency items at DZ BANK-set rates
  // (PLV Devisen section), and no currency account is offered for the depot.
  // https://atruvia.scene7.com/is/content/atruvia/PLV-01-07-2026pdf
  vrheilbronnschwa: ["EUR"],
  // EUR only. No currency account appears in the Preisaushang or on the depot
  // page.
  // https://atruvia.scene7.com/is/content/atruvia/09.30.00.00.100%20Preisaushang%20VR%20Nopf%20Stand%2020261001pdf
  volksbankraiffei: ["EUR"],
  // EUR only. The Preisaushang (01.10.2026) lists only euro accounts and no
  // currency account; a non-euro trade is converted.
  // https://atruvia.scene7.com/is/content/atruvia/2026-10-01_Preisaushangpdf
  volksbankheidelb: ["EUR"],
  // EUR only. The Preisaushang (01.11.2025) shows euro accounts only.
  // https://atruvia.scene7.com/is/content/atruvia/1742-preisaushangpdf
  vereinigtevolksbde: ["EUR"],
  // EUR only. Both depot pages price everything in euro and show no currency
  // account.
  // https://www.vbinswf.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/meindepot-classic.html
  volksbankinsudwe: ["EUR"],
  // EUR only. The PLV (01.10.2026) and the Preisaushang list euro accounts
  // only, and a non-euro trade is converted at a 'marktgerecht' rate.
  // https://atruvia.scene7.com/is/content/atruvia/4024-plvpdf
  volksbankgronaua: ["EUR"],
  // EUR only. The Preisaushang (01.06.2026) shows euro accounts only.
  // https://atruvia.scene7.com/is/content/atruvia/Preisaushang%2001.06.2026pdf-2
  ihrevolksbanknec: ["EUR"],
  // EUR only. The account is a euro current account at the bank, and the page
  // shows no currency accounts. Source: wertpapierdepot.html, which says "Für
  // die Depoteröffnung brauchen Sie ein Konto mit OnlineBanking-Zugang bei
  vraugsburgostall: ["EUR"],
  // EUR only. Euro current account, and the depot prices apply only to online
  // entries by the customer. Source:
  // https://www.vrbk.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  vrrottalinn: ["EUR"],
  // EUR only. Euro current accounts (Mein GiroKonto); no currency account is
  // offered. Source: Preisaushang Stand 08.07.2026.
  vrimsudlichenfra: ["EUR"],
  // EUR only. Euro current accounts (VR-Online and others); no currency
  // accounts. Source: Preisaushang Stand 01.10.2026.
  volksbankkurpfal: ["EUR"],
  // EUR only. Euro current accounts (Volksbank Individual and others); no
  // currency accounts. Source:
  // https://atruvia.scene7.com/is/content/atruvia/Preisaushang%20per%2001.10.2026%202pdf
  volksbankimweste: ["EUR"],
  // EUR only. The Preisaushang and the depot pages show no currency accounts.
  // https://atruvia.scene7.com/is/content/atruvia/0370-preisaushangpdf-1
  ostfriesischevol: ["EUR"],
  // EUR only. No currency accounts are shown.
  // https://www.vrbank-in-holstein.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  vrinholstein: ["EUR"],
  // EUR only. No currency accounts are shown.
  // https://www.vrbank-wl.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  vrwestfalenlippe: ["EUR"],
  // EUR only. No currency accounts are shown.
  // https://www.volksbank-zollernalb.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  volksbankzollern: ["EUR"],
  // EUR only. The Preisaushang shows no currency accounts.
  // https://atruvia.scene7.com/is/content/atruvia/Preisaushang%2001.10.2026pdf-1
  emslandischevolk: ["EUR"],
  // EUR only. The PLV has no securities currency account, and a non-EUR line
  // is converted at DZ BANK GenoFX rates (PLV 'Umrechnungskurs bei
  // Fremdwährungsgeschäften'). Source:
  // https://atruvia.scene7.com/is/content/atruvia/Preis_und_Leistungsverzeichnis03082026pdf
  volksbanknieders: ["EUR"],
  // EUR only. No currency account is shown, and FX goes at the DZ BANK rate.
  // Source:
  // https://atruvia.scene7.com/is/content/atruvia/preisaushangpdf-29
  munchner: ["EUR"],
  // EUR only. No currency account is shown. Source:
  // https://www.vrdo.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  vrdonauoberschwa: ["EUR"],
  // EUR only. No currency account is shown. Source:
  // https://www.vb-niers.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  volksbankanderni: ["EUR"],
  // EUR only. No currency account is shown. Source:
  // https://www.volksbank-lahr.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  volksbanklahr: ["EUR"],
  // EUR only. The page shows no currency account, and the bank converts
  // non-EUR trades at its own rate.
  // https://www.vrbank-suedpfalz.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  vrsudpfalz: ["EUR"],
  // EUR only. The PLV has no securities currency account, and FX is
  // 'marktgerecht' with no margin.
  // https://atruvia.scene7.com/is/content/atruvia/1105-plvpdf-1
  volksbankegwolfe: ["EUR"],
  // EUR only. No currency account is shown. Same URL.
  vrkemptenoberall: ["EUR"],
  // EUR only. No currency account is shown. Same URL.
  volksbankraiffeide: ["EUR"],
  // EUR only. No currency account is shown. Same URL.
  vrneuulm: ["EUR"],
  // EUR. The Preisaushang and fee pages list only EUR accounts and no currency
  // accounts.
  // https://www.vr-dachau.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  volksbankraiffei2: ["EUR"],
  // EUR. Only EUR accounts are in the Preisaushang.
  // https://atruvia.scene7.com/is/content/atruvia/VRBML-Preisaushangpdf
  vrmunchenland: ["EUR"],
  // EUR. The Preisaushang lists only EUR accounts (Bankhaus Privatkonto, Next
  // Generation, Basiskonto).
  // https://atruvia.scene7.com/is/content/atruvia/PA_10_2026pdf
  bankhausrsa: ["EUR"],
  // ARS, USD. The bank's investment page says 'Invertís en pesos o en dólares'
  // and dollars go to the client's Caja de Ahorro en dólares.
  // https://www.galicia.ar/personas/inversiones/bonos-acciones
  bancogalicia: ["ARS","USD"],
  // ARS, USD. The tariff computes fees 'en $ o U$S según la moneda de la
  // operación', and Banco Macro holds peso and dollar accounts.
  // https://www.macro.com.ar/macrosecurities/documento/1517351172498
  macro: ["ARS","USD"],
  // ARS, USD. The Ualá account has a peso Caja de Ahorro and a Caja de Ahorro
  // en Dólares, and dollars are bought as Dólar MEP. Every line in the
  // catalogue is in pesos.
  // https://www.uala.com.ar/preguntas-frecuentes
  uala: ["ARS","USD"],
  // ARS, USD. The page says 'Los montos de tus transacciones, en pesos o en
  // dólares, se acreditan de forma online en tus cuentas'.
  // https://www.icbc.com.ar/personas/productos-servicios/inversiones/acciones-titulos
  icbcar: ["ARS","USD"],
  // ARS, USD. FAQ: to trade with dollars, choose the ticker ending in 'D'
  // (AAPLD), settled from the client's dollar account.
  // https://www.bancopatagonia.com.ar/personas/inversiones/preguntas-frecuentes.php
  bancopatagonia: ["ARS","USD"],
  // ARS, USD. The terms debit and credit the client's 'Caja de Ahorro en
  // Pesos' and 'Caja de Ahorro en Dólares' (or current accounts) at the bank,
  // and online trading is allowed 'tanto en moneda local como en moneda
  bancociudad: ["ARS","USD"],
  // ARS, USD. Shares trade in pesos or dollars, the MEP page buys and sells
  // dollars inside the account, and CEDEAR dividends are paid in dólar cable.
  // Source:
  // https://alfyinversiones.com.ar/opera/acciones/
  alfyinversiones: ["ARS","USD"],
  // ARS, USD. The fee sheet has dividend rows for 'Acciones en pesos' and
  // 'Acciones en dólares', and fund transfers in dólares via MEP and in
  // Dólares Cable. Source:
  // https://www.rosental.com/wp-content/uploads/2026/09/comisiones-sept-26.pdf
  rosental: ["ARS","USD"],
  // ARS, USD. The Dólar MEP service buys dollars with the account's pesos and
  // sells them back, and the fee grid has bank-transfer fees in PESOS and
  // DÓLARES. Source:
  // https://integrarinversiones.com.ar/servicios/dolar-mep/
  integrarinversio: ["ARS","USD"],
  // ARS, USD. The platform shows balances in 'pesos (ARS) y dólares (USD)' and
  // gives a CBU per currency to fund the account. Source:
  // https://clientes.bavsa.com/manualUsuario.html
  buenosairesvalor: ["ARS","USD"],
  // ARS, USD. FAQ: investments are in pesos and dollars, and 'Para operar
  // dólar MEP, es necesario que tengas configuradas tu cuenta en pesos y
  // dólares'. Tarifas: dollar commissions are charged in the same currency.
  // https://criteria.com.ar/preguntas-frecuentes/
  criteria: ["ARS","USD"],
  // ARS, USD. FAQ: 'Los depósitos en Pesos y/o en Dólares pueden ser
  // realizados mediante transferencia a nuestras cuentas bancarias'.
  // https://dracmainv.com.ar/como-comenzar/preguntas-frecuentes/
  dracma: ["ARS","USD"],
  // ARS, USD. The bank-accounts page lists Rosario Valores S.A. at Banco
  // Comafi: ARS (alias Rosvalpesos) and USD (alias RosvalUSD).
  // https://lacalifornia.com.ar/cuentas-bancarias/
  california: ["ARS","USD"],
  // ARS, USD. The MEP help article says bought dollars 'se acreditarán
  // automáticamente en tu cuenta personal de fiwind' and sales credit pesos,
  // so the account holds both.
  // https://help.fiwind.io/es/articles/16348618-compra-y-vende-dolar-mep-en-fiwind
  fiwind: ["ARS","USD"],
  // ARS, USD. The PDF says commissions 'podrán ser percibidas en la moneda de
  // pago y/o cobro de cada operación', and the services page trades 'Dólar MEP
  // / CCL'.
  // https://mills.capital/servicios/inversion-financiera/
  mills: ["ARS","USD"],
  // ARS, USD. The fee page prices foreign shares, ADR conversion in dollars
  // ('hasta U$D 0,1 por ADR') and transfers to foreign depositaries. MEP D
  // lines settle in dollars in the client's account.
  // https://winsa.com.ar/aranceles-y-comisiones/
  winsecurities: ["ARS","USD"],
  // ARS, USD. The 'Cuentas habilitadas' PDF lists 'Cuentas corrientes
  // operativas en PESOS' and 'Cuentas corrientes operativas en Dólares'
  // (Valores, Macro, Comafi, Santander).
  // https://acrobat.adobe.com/id/urn:aaid:sc:VA6C2:2c692a2e-89c1-46ae-8564-164dc07e3ac0
  cucchiara: ["ARS","USD"],
  // ARS, USD (cable dollars included). The same table prices 'Transferencia
  // Bancarias en pesos', 'Transferencia Bancarias en U$S', 'Transferencias
  // MEP' and 'Transferencias Bancarias en el Exterior U$S 60'.
  // https://www.petrini.com.ar/comisiones-y-aranceles/
  petrinivalores: ["ARS","USD"],
  // ARS, USD. The weakest evidence of the five: no page names a dollar account
  // in words. The basis is the catalogue's MEP D lines, which settle in
  // dollars in the account, as at every Argentine ALyC.
  // https://www.cgvm.com.ar/
  cgvm: ["ARS","USD"],
  // ARS, USD. The Dólar MEP page says the dollars from the sale go to the
  // client's bank account in dollars, and an account in pesos and another in
  // dollars are required.
  // https://www.dinosauriobursatil.com.ar/productos/dolar-mep
  dinosauriobursat: ["ARS","USD"],
  // ARS, USD
  proficio: ["ARS","USD"],
  // ARS, USD
  torontoinversion: ["ARS","USD"],
  // ARS, USD
  one618: ["ARS","USD"],
  // ARS, USD
  aldazabal: ["ARS","USD"],
  // ARS, USD
  valiantbursatil: ["ARS","USD"],
  // ARS, USD. Evidence: the site trades all products 'local y del exterior',
  // and the catalogue has MEP (D) lines. No explicit dollar account is
  // printed.
  // https://aratasa.com.ar/
  arata: ["ARS","USD"],
  // ARS, USD. Evidence: 'Negociación en moneda local y extranjera' on the
  // products page. The tariff prints USD minimums and dollar accounts abroad
  // (cable).
  // https://www.beneditsa.com.ar/productos
  beneditbursatil: ["ARS","USD"],
  // ARS, USD. Evidence: the catalogue's MEP lines, and the tariff bills
  // mandates abroad in u$s. Dollars abroad sit in a separate Pershing/IBKR
  // account.
  // https://fivesa.com.ar/
  fivecorp: ["ARS","USD"],
  // ARS, USD. Evidence: the FAQ 'Cómo deposito dinero' lists a Banco Comafi
  // PESOS account and a Banco Comafi DOLARES account, plus Dólar MEP and CCL.
  // https://www.sjb.com.ar/preguntas-frecuentes/
  sjbbursatil: ["ARS","USD"],
  // ARS, USD. Evidence: the services page offers 'Dólar MEP y CCL (Contado con
  // Liquidación)', and the tariff has dollar cauciones.
  // https://stcinversiones.com.ar/servicios/
  stcinversiones: ["ARS","USD"],
  // ARS, USD. Client notices describe its MEP and Cable trades ('modalidad
  // MEP', 'modalidad Cable', 'dólares MEP y CCL').
  // https://www.bellinvestments.com.ar/news-detail/17-importante
  bellinvestments: ["ARS","USD"],
  // ARS, USD. The tariff bills 'Gastos Bancarios por transferencia $' and
  // 'Gastos Bancarios por transferencia USD'.
  // https://www.aeromarvalores.com.ar/comisiones.php
  aeromarvalores: ["ARS","USD"],
  // ARS, USD. The home page sells 'Dólar mep' ('Operá con AG Valores: Dólar
  // mep, acciones, bonos, cedears...').
  // https://agvalores.com.ar/
  valoresar: ["ARS","USD"],
  // ARS, USD. The home page sells the MEP dollar ('Comprá y vendé dolar MEP'),
  // and the tariff bills 'Transferencia Nacional Dolares USD 10,00' next to
  // 'Transferencia Nacional Pesos'.
  // https://fescina.com/
  fescina: ["ARS","USD"],
  // ARS, USD. Its product pages say 'Invertí desde Argentina en pesos o
  // dólares', and the Dólar MEP y CCL page says cable dollars are paid to the
  // client's bank account abroad.
  // https://finco.com.ar/productos/dolar-mep-y-ccl/
  finco: ["ARS","USD"],
  // ARS, USD. No page lists the currencies. Listro sells the MEP (D) lines,
  // which settle in dollars at Rosario Valores (the clearing agent), so the
  // account holds pesos and dollars.
  // https://listrovalores.com/
  listrovalores: ["ARS","USD"],
  // ARS, USD. The products page lists 'Dolar Mep' and 'Dolar CCL', and the
  // catalogue has D and C lines.
  // https://www.omegabursatil.com/productos
  omegabursatil: ["ARS","USD"],
  // ARS, USD. The FAQ says it has instruments in pesos and in dollars.
  // https://rigvalores.com/preguntas-frecuentes/
  rigvalores: ["ARS","USD"],
  // ARS, USD. No page names the currencies. The ALyC settles BYMA trades
  // itself, MEP (D) lines included, which credit dollars to the account.
  // https://www.bairesbursatil.com.ar/servicios.php
  bairesbursatil: ["ARS","USD"],
  // ARS, USD. The tariff bills 'TRANSFERENCIAS BANCARIAS (en pesos y/o
  // dolares)', and the catalogue has D lines.
  // https://alvarezycia.com.ar/wp-content/uploads/2024/08/GASTOS-2024.pdf
  alvarezycia: ["ARS","USD"],
  // ARS, USD. The home page names no deposit currencies. Inferred because
  // Matex is an ALyC Integral whose tariff prices dollar products ("Opciones
  // compradas USD 0,35 x TN") and it offers "renta fija y variable, local e
  // https://www.matexcapital.com.ar/
  matex: ["ARS","USD"],
  // ARS, USD. The site lists "Cuentas Corrientes Pesos: Banco de Valores ...
  // alias aurum.pesos" and "Cuentas Corrientes Dólares ... alias aurum.dolar",
  // and offers MEP and CCL dollars.
  // https://aurum.com.ar/
  aurumvalores: ["ARS","USD"],
  // ARS, USD. The site has "Inversiones en Pesos / Dólares"; the tariff
  // charges "TRANSFERENCIAS EN U$S USD 5" and its note (3) says fees are taken
  // in the settlement currency.
  // https://apps.leivahnos.com.ar/legales/esquema-de-comisiones/
  leivahnos: ["ARS","USD"],
  // ARS, USD. The FAQ gives deposit accounts "Rosario Valores SA – Banco
  // COMAFI", ARS alias Rosvalpesos and USD alias RosvalUSD, plus Banco de
  // Valores ARS/USD for funds.
  // https://www.elyca.com.ar/
  elyca: ["ARS","USD"],
  // ARS, USD. The site says "Dólar Mep: Operá Dolar Mep con nosotros" and
  // "Cedears: Dolarizá tu cartera"; no deposit-account page is published.
  // https://portfolioinvestment.com.ar/inversion/
  portfolio: ["ARS","USD"],
  // ARS, USD. Its bank panel lists peso accounts plus a 'CTA. CTE. SOLO
  // Transferencias USD' at Banco de Valores, and the tariff prints 'Transfer.
  // Receptora USD MEP SIN COSTO'. (in the bundle /assets/index-DLzNyvR7.js)
  // https://www.futurobursatil.com.ar/
  futurobursatil: ["ARS","USD"],
  // ARS, USD. The tariff prices 'Transferencia Emisora u$s Local' (u$s 10 +
  // IVA) and 'Transferencia Receptora u$s Local' (0.00) beside the peso
  // transfers.
  // https://szbursatil.com/tabla-de-aranceles/
  szwarccia: ["ARS","USD"],
  // ARS, USD. The sheet prices 'Transferencias Bancaria emisora en pesos' ($
  // 500) and 'Transferencias Bancaria emisora en dólares' (U$S 25). Same PDF.
  fernandezlaya: ["ARS","USD"],
  // BRL. The investment account is funded in reais from the Nubank account by
  // Pix or TED; every B3 listing is in BRL, so no FX.
  // https://nubank.com.br/nu/investimentos
  nubank: ["BRL"],
  // BRL. The íon account is fed in reais from the Itaú current account or by
  // TED/Pix; all listings are BRL.
  // https://www.ion.itau/
  itauion: ["BRL"],
  // BRL. The Ágora account is funded in reais (TED/Pix from a Bradesco or
  // other bank account in the same CPF); all listings are BRL.
  // https://www.agorainvestimentos.com.br/home
  agorabr: ["BRL"],
  // BRL. Safra Corretora is funded in reais from the Safra account or by
  // TED/Pix; all listings are BRL.
  // https://www.safra.com.br/investimentos/
  bancosafra: ["BRL"],
  // BRL. The investment account draws on the PagBank digital account in reais
  // (Pix/TED); all listings are BRL.
  // https://pagbank.com.br/conta-digital/investimentos/renda-variavel
  pagbank: ["BRL"],
  // ["BRL"]. The account is funded in reais by TED/Pix; the page notes "Conta,
  // manutenção, TED e Pix são R$ 0,00" and every B3 line is in BRL.
  // https://www.novafutura.com.br/custos
  novafutura: ["BRL"],
  // ["BRL"]. A Brazilian broker funded in reais (TED/Pix), and every B3
  // listing is in BRL.
  // https://www.ativainvestimentos.com.br/
  ativainvestiment: ["BRL"],
  // ["BRL"]. "Para operar ... você deve ter conta corrente no BANRISUL": the
  // account is settled from a Banrisul current account in reais.
  // https://www.banrisulcorretora.com.br/lxa/link/como-realizar-operacoes.html
  banrisulcorretor: ["BRL"],
  // ["BRL"]. Invested from the PicPay account balance in reais; the app is
  // cash market only ("só permite operações no 'mercado à vista'").
  // https://meajuda.picpay.com/hc/pt-br/articles/52896181711251
  picpay: ["BRL"],
  // ["BRL"]. A cooperative bank; trades settle from the member's Sicredi
  // current account in reais.
  // https://www.sicredi.com.br/site/investimentos/renda-variavel/
  sicredi: ["BRL"],
  // BRL. A CAIXA current account in reais; the whole site is Brazilian retail
  // banking with Pix, and the B3 tariff is consolidated per CPF.
  caixaacoesonline: ["BRL"],
  // BRL. The account is funded in reais (free TED withdrawals); Brazilian
  // CCTVM.
  miraebrasil: ["BRL"],
  // BRL. Reais account with free TED; BTG Pactual platforms.
  eqiinvestimentos: ["BRL"],
  // BRL. Brazilian reais account.
  terrainvestiment: ["BRL"],
  // BRL. Banco Sofisa digital account in reais (Pix/TED); terms governed by
  // Brazilian law.
  sofisadireto: ["BRL"],
  // BRL. Brazilian broker; the fee page says transfers come only by DOC/TED
  // from a same-owner Brazilian account ("sempre de uma conta de mesma
  // titularidade").
  // https://www.planner.com.br/tarifas-custos-operacionais/
  plannercorretora: ["BRL"],
  // BRL. Brazilian broker for Brazilian accounts; every listing and the fee
  // page are in reais.
  // https://www.rbinvestimentos.com/custos-operacionais/
  rbinvestimentos: ["BRL"],
  // BRL. Brazilian broker; accounts are funded in reais ("Depósito e
  // Transferências" page, Brazilian bank rails).
  // https://novinvest.com.br/custos-operacionais/
  novinvest: ["BRL"],
  // BRL. Unicred is a Brazilian credit-cooperative network; its broker ZIIN
  // (Unicred DTVM) is funded from the member's Brazilian account in reais.
  // https://www.unicred.com.br/solucoes/ziin/custos
  unicred: ["BRL"],
  // BRL. Brazilian DTVM; the client page prices everything in reais for
  // Brazilian accounts.
  // https://www.stonex.com/pt-br/empresas/dtvm/informacoes-ao-cliente/
  stonexdtvm: ["BRL"],
  // BRL. The account is a Brazilian CPF account funded in reais by TED/PIX,
  // the same as toro in deposits.mjs.
  // https://galapagoscapital.com/investimentos
  galapagos: ["BRL"],
  // BRL. Brazilian CPF account in reais.
  // https://sita.com.br/sita/servicos/
  sitacorretora: ["BRL"],
  // BRL. Funds come in by TED through the Brazilian banking system ('o envio
  // dos recursos deverá ser efetuado através de TED').
  // https://www.codepe.com.br/regras-e-parametros
  codepecorretora: ["BRL"],
  // BRL. Brazilian CPF account; XP Investimentos is the clearing partner
  // (PNP).
  // https://www.montebravo.com.br/wp-content/uploads/2026/09/Custos_Monte_Bravo.pdf
  montebravo: ["BRL"],
  // BRL. The account is with the Brazilian partner broker Genial, CPF based,
  // in reais.
  // https://guru.com.vc/faq/
  gurubr: ["BRL"],
  // BRL only. The page states the cash-market fees and the minimum deposit in
  // reais only ("Não há valor mínimo para o aporte inicial"), the account is a
  // Brazilian DTVM account trading B3 in BRL, and no foreign-currency account
  // https://traders.com.br/investimentos/renda-variavel
  traderscorretora: ["BRL"],
  // ["NPR"]. TMS collateral is loaded in rupees and the sign-up asks for
  // Nepali bank details ('citizenship, PAN, and bank details').
  // https://onlinesecurities.com.np/services/OnlineTms
  onlinesecurities: ["NPR"],
  // ["NPR"]. 'Cash Account' is handled in rupees and TMS collateral is NPR.
  // https://ssl.com.np/service/trading
  secured: ["NPR"],
  // ["NPR"]. KYC requires 'Bank Account Details' (a Nepali bank account) and
  // settlement is in rupees.
  // https://imnpltd.com.np/
  imnepal: ["NPR"],
  // ["NPR"]. A subsidiary of Nepal Investment Mega Bank; TMS collateral and
  // settlement are in NPR.
  // https://nimbstock.com.np/our-services/brokerage/
  nimb: ["NPR"],
  // ["NPR"]. 'Load the collateral balance for trading by making payment via
  // NCHL platform via TMS Account' (Nepali NCHL rail, NPR).
  // https://www.rbbsecurities.com.np/services.html
  rbb: ["NPR"],
  // ["NPR"]. The services page gives the NPR bank account for funding (Global
  // IME Bank, Kamaladi).
  // https://www.sanimasecurities.com.np/our-services
  sanima: ["NPR"],
  // ["NPR"]. The fee page is in rupees only; Nepal-only offices (Dillibazar,
  // Biratnagar).
  // https://www.agrawalsecurities.com.np/trading-fee-structure/
  agrawal: ["NPR"],
  // ["NPR"]. The calculator and tariff are in rupees and the site has an NPR
  // 'Payment Details' page; clients are Nepali investors.
  // https://trishakti.com.np/
  trishakti: ["NPR"],
  // ["NPR"]. 'Our Bank Accounts' lists NPR accounts at Siddhartha, Global IME
  // and Prabhu Bank, and the site offers Connect IPS and eSewa funding.
  // https://www.visionsecurities.com.np/payment/our-bank-accounts
  vision: ["NPR"],
  // ["NPR"]. The tariff is in rupees and Kathmandu is the only office; the DP
  // charge is paid in rupees.
  // https://kalikasecurities.com/commission-and-fee/
  kalika: ["NPR"],
  // ["NPR"]. The page quotes only rupee amounts, and the account settles in
  // NPR on NEPSE TMS with a Nepali bank and CDSC demat.
  // https://opalsecurities.com.np/service/2/details
  opal: ["NPR"],
  // ["NPR"]. Rupee tariff. TMS registration asks for a 'Bank Cheque' (a Nepali
  // bank account). (bundle /assets/index-*.js)
  // https://www.primosecurities.com.np/services/brokerage
  primo: ["NPR"],
  // ["NPR"]. Rupee tariff. Account opening needs a bank account and a
  // 'Digitally Scan Cheque' (Nepali bank).
  // https://abc.com.np/
  abcnp: ["NPR"],
  // ["NPR"]. Rupee tariff only. Fees are charged 'in line with CDSC
  // guidelines' (Nepali demat).
  // https://midasstock.com.np/pricing
  midas: ["NPR"],
  // ["NPR"]. Rupee tariff and DP charges only. eSewa and Khalti (Nepali
  // wallets) appear among its links.
  // https://trishulsecurities.com.np/our-services/
  trishul: ["NPR"],
  // ["NPR"]. Rupee-only NEPSE account: TMS 35 collateral and a Nepali bank
  // account, and every fee is in Rs.
  // https://www.kohinoorinvestment.com/services/
  kohinoor: ["NPR"],
  // ["NPR"]. NPR-only NEPSE account through TMS 41, with all fees in Rs.
  // https://linch.com.np/commission-and-fees/trading-and-commission-fees
  linchmarket: ["NPR"],
  // ["NPR"]. NPR-only NEPSE account through TMS 45; the API's fees are all in
  // Rs.
  // https://imperialsecurities.com.np/quick-links/fees-and-commission
  imperial: ["NPR"],
  // ["NPR"]. NPR-only NEPSE account through TMS 50, with all fees in Rs.
  // https://crystalsecurities.com/trading-commission-and-fees/
  crystalkanchanju: ["NPR"],
  // ["NPR"]. NPR-only NEPSE account through TMS 54 (home page 'TMS Login' /
  // 'TMS Registration'), with all fees in NRs.
  // https://sewasecurities.com.np/
  sewa: ["NPR"],
  // ["NPR"]: NPR-only TMS collateral ('load collateral ... online' through
  // TMS); Nepal broker no. 79, rupee lines.
  // https://pahiinvestment.com/services/
  pahi: ["NPR"],
  // ["NPR"]: the services page gives a Global IME Bank (Kamaladi) NPR account
  // for client payments.
  // https://capitalhub.com.np/services/
  capitalhub: ["NPR"],
  // ["NPR"]: Nepal-only broker; the TMS account is funded in rupees (same as
  // kumari, garima and himalayan).
  // https://stoxkarts.com.np/services/
  stoxkarts: ["NPR"],
  // ["NPR"]: the broker-charges page gives a Global IME Bank (Kamaladi) NPR
  // account under PAYMENT PARTNERS.
  // https://spsasecurities.com.np/broker-charges
  spsasecurities: ["NPR"],
  // ["NPR"]: the site has a 'Bank Account Details' page with Nepali bank
  // accounts; rupee TMS collateral.
  // https://sajilobroker.com.np/
  sajilo: ["NPR"],
  // ["NPR"]. The home page prints NPR collection accounts (Global IME Bank,
  // Kamaladi, account 'Roadshow Securities Limited') and lists Prabhu and
  // Global IME as banking partners.
  // https://roadshowsecurities.com.np/
  roadshow: ["NPR"],
  // ["NPR"]. The services page gives the collection account at Global IME
  // Bank, Kamaladi ('Himalayan Securities Limited'). NPR only.
  // https://himalayansecurities.com/our-services
  himalayannp: ["NPR"],
  // CHF, EUR, USD, GBP, JPY. The Kontokorrent serves trading: 'Gerne führen
  // wir Ihr Kontokorrent in Euro, Dollar, Pfund, Yen, sowie weiteren Währungen
  // auf Anfrage'. The price list has Kontokorrent / Kontokorrent EUR / Übrige
  // https://www.migrosbank.ch/de/privatpersonen/konten-karten/konten/kontokorrent.html
  migros: ["CHF","EUR","USD","GBP","JPY"],
  // CHF, EUR, GBP, USD. The Compte de Gestion is 'destiné exclusivement aux
  // opérations d'achat et de vente de titres' and shows rates for CHF, EUR,
  // GBP, USD and 'autres'.
  // https://www.bcn.ch/prives/comptes-et-cartes/comptes-prives/compte-de-gestion
  banquecantonalen: ["CHF","EUR","GBP","USD"],
  // CHF, EUR. Private clients get CHF accounts and the 'Privatkonto EUR'
  // ('Wertschriftengeschäfte in Euro'). No other currency account is listed.
  // https://www.appkb.ch/private/zahlen/konten-zum-zahlen
  appenzellerkanto: ["CHF","EUR"],
  // CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD. The Fremdwährungskonto lets you
  // 'Börsenaufträge ... ohne Währungsverluste ab[wickeln]. Unser Angebot
  // umfasst Währungen aus allen Kontinenten.'
  // https://www.ukb.ch/private/konten-und-karten/konten/fremdwaehrungskonto
  urnerkantonalban: ["CHF","EUR","USD","GBP","JPY","AUD","CAD","SGD"],
  // CHF, EUR. Private accounts are the 'Compte revenu' (CHF) and the 'Compte
  // courant EUR'. No other currency account is offered.
  // https://www.bcj.ch/fr/Particuliers/Comptes-et-Cartes/Comptes-revenus.html
  banquecantonaled: ["CHF","EUR"],
  // CHF, EUR. The Privatkonto is 'In den Währungen CHF / EUR erhältlich' (
  // 'Kontokorrent FW' is the business account. FX is 'zu aktuellen Kursen'
  // with no markup, so fx is null and any other currency gives N/A.
  // https://www.grb.ch/unsere-produkte/zahlen/zahlungskonten
  glarnerregionalb: ["CHF","EUR"],
  // CHF, EUR, USD, GBP. The site lists Privatkonto (CHF) and Eurokonto ( The
  // general price list prices 'Auszahlung Fremdwährungskonto: Eurokonto 0.50%
  // / Übrige Währungen 1.00%' and card fees in CHF/EUR/USD ( So USD and GBP
  // https://thayngen.clientis.ch/de/privatkunden/konten
  clientissparundl: ["CHF","EUR","USD","GBP"],
  // CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD. The price list (section 1) shows
  // 'Privatkonto Währung CHF/EUR' and 'Kontokorrent Privat Währung alle' ( So
  // every SIX trading currency is held and nothing is converted.
  // https://www.acrevis.ch/document/uebersicht-dienstleistungspreise
  acrevis: ["CHF","EUR","USD","GBP","JPY","AUD","CAD","SGD"],
  // CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD. The Privatkonto is 'Auch in EUR
  // oder anderen Fremdwährungen verfügbar', with currencies as in the
  // correspondent list (AUD, CAD, EUR, GBP, JPY, SGD, USD and others).
  // https://www.hbl.ch/media/meoakt2o/dienstleistungspreise-kontofuehrung_zahlungsverkehr.pdf
  hypothekarbankle: ["CHF","EUR","USD","GBP","JPY","AUD","CAD","SGD"],
  // CHF, EUR, USD, GBP. The general price list shows 'Privatkonto in CHF oder
  // EUR' and 'Fremdwährungs-... konto auf Anfrage', and its credit cards come
  // in CHF/EUR/USD ( USD and GBP are taken as held from 'auf Anfrage'. No FX
  // https://www.aekbank.ch/dam/jcr:bad6134c-03d9-44d4-b871-7edeed996c59/Dienstleistungs-%20und%20Preisuebersicht.2026-02-26-11-05-29.pdf
  aek1826: ["CHF","EUR","USD","GBP"],
  // CHF, EUR, USD. Evidence: 'Il conto può essere aperto in CHF, EUR e valuta
  // estera' ( and the investment tariff lists 'Depositi vincolati
  // (CHF/EUR/USD)'. I removed the earlier GBP guess.
  // https://www.bps-suisse.ch/conto_corrente_privati.shtml
  bancapopolaredis: ["CHF","EUR","USD"],
  // CHF, EUR, USD, GBP, DKK, NOK, SEK, JPY, AUD, CAD, NZD, HKD, ZAR, SGD, THB,
  // TRY. Evidence: Eurokonto, plus a Fremdwährungskonto for 'Zahlungs- und
  // Wertschriftenverkehr in verschiedenen Fremdwährungen ohne laufende
  // https://www.ersparniskasse.ch/de/fremdwaehrungskonto
  ersparniskassesc: ["CHF","EUR","USD","GBP","DKK","NOK","SEK","JPY","AUD","CAD","NZD","HKD","ZAR","SGD","THB","TRY"],
  // CHF, EUR. Evidence: Privatkonto/Kontokorrent in CHF and an Eurokonto, with
  // 'Kontoführung in weiteren Fremdwährungen auf Anfrage' ( Currencies only
  // 'auf Anfrage' are left out, as in migros_cost.mjs. I changed this from
  // https://www.bankzimmerberg.ch/app/uploads/2025/07/Zahlen-und-Sparen_Juli26.pdf
  zimmerberg: ["CHF","EUR"],
  // CHF, EUR. Evidence: private accounts are 'Jugendkonto, Privatkonto,
  // Kontokorrent Private, Privatkonto EUR'. The 'Kontokorrent Fremdwährung' is
  // listed only under Firmenkunden (same PDF).
  sparkasseschwyz: ["CHF","EUR"],
  // CHF, EUR, USD, CAD, AUD, NZD, HKD, JPY, SEK, DKK, GBP, ZAR, NOK. Evidence:
  // Euro-Konto, plus a Fremdwährungskonto ('Als Depotkunde ist es Ihnen
  // möglich Ihre Wertschriftentransaktionen direkt in der entsprechenden
  // https://www.bankeki.ch/privatkunden/zahlen/konten/fremdwaehrungskonto
  eki: ["CHF","EUR","USD","CAD","AUD","NZD","HKD","JPY","SEK","DKK","GBP","ZAR","NOK"],
  // CHF, EUR, USD, GBP, AUD, NOK. Evidence: the Fremdwährungskonto is for
  // "Zahlungen und Wertschriftentransaktionen in fremder Währung ... USD GBP
  // NOK AUD andere Währungen auf Anfrage", plus a Eurokonto.
  // https://www.slfrutigen.ch/konten-und-karten/privatkonto/fremdw%C3%A4hrungskonto
  sparundleihkasse: ["CHF","EUR","USD","GBP","AUD","NOK"],
  // CHF, EUR, USD, GBP. Evidence: the Fremdwährungskonto offers "Abwicklung
  // Zahlungsverkehr in EUR, USD und GBP".
  // https://bankoberaargau.clientis.ch/de/privatkunden/konten/zahlkonten/fremdwaehrungskonto
  clientisoberaarg: ["CHF","EUR","USD","GBP"],
  // CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD (all catalogue currencies).
  // Evidence: the Fremdwährungskonto is for "Wertschriftenverkehrs in einer
  // fremden, frei handelbaren Währung. Für die Fremdwährungen EUR und USD gibt
  // https://bankthur.clientis.ch/de/privatkunden/konten/zahlkonten/fremdwaehrungskonto
  clientisthur: ["CHF","EUR","USD","GBP","JPY","AUD","CAD","SGD"],
  // CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD. Evidence: the Fremdwährungskonto
  // is "in einer fremden, frei handelbaren Währung" with separate EUR and USD
  // accounts.
  // https://eb.clientis.ch/de/privatkunden/konten/zahlkonten/fremdwaehrungskonto
  clientisentlebuc: ["CHF","EUR","USD","GBP","JPY","AUD","CAD","SGD"],
  // CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD. Evidence: the Fremdwährungskonto
  // is "in einer fremden, frei handelbaren Währung" with separate EUR and USD
  // accounts.
  // https://bankimthal.clientis.ch/de/privatkunden/konten/zahlkonten/fremdwaehrungskonto
  clientisimthal: ["CHF","EUR","USD","GBP","JPY","AUD","CAD","SGD"],
  // CHF, EUR, USD. The site lists a 'Eurokonto' and a 'Fremdwährungskonto'
  // ('in der gewünschten Fremdwährung'). The foreign-currency account page
  // names only USD ('Kreditkarte (nur in USD)'). Sources: and
  // https://www.bankgantrisch.ch/Privat/Zahlen/Konten
  gantrisch: ["CHF","EUR","USD"],
  // CHF, EUR, USD. The Universalkonto page says 'Das Konto ist auch in Euro
  // verfügbar'. The tariff prices 'Ein-/Auszahlungen via Fremdwährungskonto
  // bis 10'000 EUR/USD'. Sources: and
  // https://bankslm.ch/zahlen-sparen/einzelprodukte/konten-zahlen/universalkonto/
  slm: ["CHF","EUR","USD"],
  // CHF only. The factsheet lists Privatkonto, Kontokorrent and a
  // 'Fremdwährungskonto' but names no currency for it. Source:
  // https://www.slb.ch/app/uploads/2026/07/Factsheet_SLB_Gebuehren-Tarife_aktuell.pdf
  sparundleihkassech: ["CHF"],
  // CHF, EUR. The site lists a 'Eurokonto' ('Zahlungsverkehr in Euro und als
  // Ergänzung zum Wertschriftendepot') and a 'Fremdwährungskonto' ('in einer
  // Fremdwährung', no currency named). Sources: and
  // https://www.eek.ch/de/services/konten/eurokonto
  eek: ["CHF","EUR"],
  // TRY. Cash is moved through Halkbank (havale/EFT to the Halk Yatırım
  // account), and every BIST line is in lira, so there is no FX.
  // https://www.halkyatirim.com.tr/content/tr/sikca-sorulan-sorular
  halkyatrm: ["TRY"],
  // TRY. The account is opened from and linked to VakıfBank, and BIST lines
  // are in lira. No FX account for the stock market is published.
  // https://www.vakifyatirim.com.tr/hesap-acmak
  vakfyatrm: ["TRY"],
  // TRY. The only funding account published is one Takasbank TL IBAN for
  // shares and VİOP ('HİSSE/VİOP İBAN NUMARALARIMIZ ... TAKASBANK').
  // https://integralyatirim.com.tr/borsa/hesap-iban-bilgileri
  integralyatrm: ["TRY"],
  // TRY. BIST lines are lira and no FX funding account is published for the
  // stock market (an assumption, since no IBAN page was found on the site).
  // https://www.icbcyatirim.com.tr/tr/
  icbcturkeyyatrm: ["TRY"],
  // TRY, USD, EUR. The bank-account page lists TL, USD and EUR IBANs at
  // VakıfBank, Akbank, QNB and others ('TL ve döviz transferi yapabilirsin').
  // BIST lines are TRY, so there is no FX.
  // https://www.destekyatirim.com/banka-hesap-bilgileri
  destekyatrm: ["TRY","USD","EUR"],
  // TRY, USD, EUR. The para yatırma page lists TRL, USD and EUR IBANs at
  // Albaraka, Denizbank, Halkbank and ING.
  // https://trive.com.tr/para-yatirma-cekme-islemleri
  triveyatrm: ["TRY","USD","EUR"],
  // TRY only. The contact page gives a single Takasbank IBAN with no currency
  // named, and no FX account is printed anywhere.
  // https://strateji.com.tr/iletisim/
  stratejimenkulge: ["TRY"],
  // TRY, USD, EUR. 'Tüm bankalar nezdinde bulunan hesaplara TL, USD ve EUR
  // olarak ... EFT yapabilir', with IKON Menkul Değerler A.Ş. TL, USD and EUR
  // IBANs at VakıfBank and others. That page sits under the forex section, but
  // https://www.ikonmenkul.com.tr/forex/para-yatirma-para-cekme
  ikonmenkul: ["TRY","USD","EUR"],
  // TRY, USD, EUR. The Banka Hesap Bilgileri page lists 'Vadesiz TL / EURO /
  // USD Hesabı' IBANs at several banks.
  // https://allbatrossyatirim.com/hakkimizda/banka-hesap-bilgileri/
  allbatrossyatrm: ["TRY","USD","EUR"],
  // TRY, USD, EUR, GBP. The contact page lists Alternatif Bank İstanbul
  // Kurumsal Şube TL, USD, EURO and GBP IBANs for Alternatif Menkul.
  // https://www.alternatifmenkul.com.tr/bize-ulasin/iletisim-bilgilerimiz
  alternatifmenkul: ["TRY","USD","EUR","GBP"],
  // TRY. Webborsam funds come only through the Anadolubank / Anadolu Yatırım
  // lira account; neither the fee page nor the service tariff PDF mentions a
  // USD or EUR account.
  // https://webborsam.com/webborsam/nasil-hesap-acilir
  anadoluyatrm: ["TRY"],
  // TRY, USD, EUR. The bank-account page lists TL IBANs and also 'Döviz
  // Hesaplarımız' with USD and EUR accounts at Yapı Kredi, Emlak Katılım and
  // Takasbank.
  // https://bullsyatirim.com/banka-hesap-bilgileri
  bullsyatrm: ["TRY","USD","EUR"],
  // TRY, USD, EUR. The 'Hesap-IBAN Bilgileri' section has a 'BANKA TL USD
  // EURO' table with IBANs at Takasbank, Vakıfbank, Garanti and İş Bankası.
  // https://galatamenkul.com/nasil-hesap-acarim/
  galatamenkul: ["TRY","USD","EUR"],
  // TRY. The 'Para Transferleri' page lists only lira IBANs, at Takasbank, İş
  // Bankası and QNB; no foreign-currency account is listed.
  // https://www.baskentmenkul.com.tr/tr/yardim-merkezi/para-transferleri
  baskentmenkul: ["TRY"],
  // TRY, USD. 'Yatırım hesabınıza sadece Enpara'da bulunan TL ve USD vadesiz
  // hesaplarınız aracılığıyla para transferi yapabilirsiniz.'
  // https://www.enpara.com/yatirim-hesabi/hisse-senedi
  enpara: ["TRY","USD"],
  // TRY. The FAQ says the investment account is funded by an instant transfer
  // from the bank's lira current account ('cari hesabınızdan yatırım
  // hesabınıza anında para transferi'), and every BIST line is TRY.
  // https://www.vakifkatilim.com.tr/tr/kendim-icin/yatirim/sermaye-piyasasi-urunleri/hisse-senedi
  vakfkatlm: ["TRY"],
  // TRY. Share trading runs in the Hayat Finans Mobil app from the lira
  // account; the fee table prices the share lines in TL, and every BIST row is
  // TRY.
  // https://hayatfinans.com.tr/urun-ve-hizmet-ucretleri
  hayatfinanskatlm: ["TRY"],
  // TRY. The FAQ says money is moved with 'yatırım hesabıma transfer' from the
  // bank account into the investment account, and every BIST row is TRY.
  // https://dunyakatilim.com.tr/kendim-icin/yatirim-urunleri/sermaye-piyasasi-urunleri/hisse-senedi
  dunyakatlmbankas: ["TRY"],
  // TRY. The IBAN page lists one client-money account, at Takasbank, IBAN TR75
  // 0013 2000 0000 0000 0000 5053, for EFT and havale; no foreign-currency
  // account is listed.
  // https://www.metromenkul.com.tr/iban
  metromenkulgerle: ["TRY"],
  // IDR. Account money sits in an IDR RDN at BCA or Bank Jago (Indonesian
  // securities fund account).
  // https://help.stockbit.com/
  stockbit: ["IDR"],
  // IDR. RDN at an Indonesian bank, the standard IDX retail setup. The account
  // is in rupiah.
  // https://sekuritas.miraeasset.co.id/m-stock
  miraeindonesia: ["IDR"],
  // IDR. RDN at Bank Sinarmas, BCA or CIMB Niaga. The account is in rupiah.
  // https://help.siminvest.id/
  siminvest: ["IDR"],
  // IDR. RDI in the client's name. Online opening for clients with a BCA, BRI
  // or Mandiri account.
  // https://star.id/faq
  samuel: ["IDR"],
  // IDR. RDN at BCA, BRI or Permata. Minimum deposit IDR 100,000 for online
  // trading.
  // https://www.sucorsekuritas.com/member/faq
  sucor: ["IDR"],
  // IDR only. The FAQ lists online RDN accounts at CIMB Niaga, Permata, BCA
  // and Mandiri (BRI and BNI offline), all rupiah accounts at Indonesian
  // banks.
  // https://bahanasekuritas.id/frequently-asked-questions/
  bahana: ["IDR"],
  // IDR only (RDN rupiah account; the FAQ says a transfer from another bank
  // costs that bank's fee).
  // https://phintracosekuritas.com/pertanyaan-umum/
  phintraco: ["IDR"],
  // IDR only. Online accounts get an RDN at BCA or Permata (offline also
  // Mandiri, CIMB, BNI), all rupiah.
  // https://www.kbvalbury.com/id/ajax/faq?category=1
  kbvalbury: ["IDR"],
  // IDR only. The online account needs a personal BCA account, and deposits
  // are a transfer to the BCA RDN.
  // https://www.minnapadi.com/faq
  minnapadi: ["IDR"],
  // IDR only (rupiah RDN, funded by a normal bank transfer).
  // https://victoria-sekuritas.co.id/faq/
  victoriaindonesi: ["IDR"],
  // IDR only. RDN at an Indonesian bank; online opening needs a BCA or BRI
  // account (
  // https://www.kiwoom.co.id/cs/getFAQ
  kiwoomindonesia: ["IDR"],
  // IDR only. RDN at Mandiri, BCA or CIMB; the RIPLAY lists RTGS fees per RDN
  // bank (
  // https://www.yuanta.co.id/inc/uploads/content/RIPLAY.pdf
  yuantaindonesia: ["IDR"],
  // IDR only. YOUTRADE account with a rupiah RDN at an Indonesian bank;
  // minimum deposit printed as 1 million rupiah (
  // https://youtrade.yuliesekuritas.com/
  yulie: ["IDR"],
  // IDR only. Rupiah RDN at an Indonesian bank (
  // https://www.tuntun.co.id/id
  tuntun: ["IDR"],
  // IDR only. Rupiah RDN; online opening for BCA and CIMB Niaga customers
  // ('Selain Nasabah Bank BCA & CIMB Niaga, Hubungi Customer Service Kami') (
  // https://www.kisi.co.id/produk/saham
  koreaindonesia: ["IDR"],
  // IDR. The RDN account is in rupiah, and the PINA Trade page talks only
  // about opening an RDN and depositing rupiah, with no minimum deposit.
  // https://www.pinatrade.id/
  trustsekuritas: ["IDR"],
  // IDR. RDN at BCA: online opening needs an active BCA savings account.
  // https://www.hei5.id/faq
  pancaglobal: ["IDR"],
  // IDR. Indonesian RDN account; the IDX trading is in rupiah only.
  // https://www.webull.co.id/help/faq/10
  webullindonesia: ["IDR"],
  // IDR. The FAQ lists "RDN secara online: BCA" and, offline, BCA, Mandiri,
  // CIMB Niaga and Permata.
  // https://www.erdikha.com/FAQ
  erdikhaelit: ["IDR"],
  // IDR. RDN at BCA or BRI; the initial deposit is "Rp1.000.000".
  // https://www.yb.co.id/faq
  ybsekuritasyakin: ["IDR"],
  // 2026-10-29, the IDX catalogues of 2026-10-28: each account is a
  // rupiah RDN and every fee page prices in rupiah.
  // https://www.mandirisekuritas.co.id/id/siaran-pers-artikel/artikel/Fee-Mandiri-Sekuritas-Apakah-Termurah-di-Indonesia
  growin: ["IDR"],
  // https://bcasekuritas.co.id/api/pdf/RIPLAY%20Umum_versi%2020082025.pdf
  bcasekuritas: ["IDR"],
  // https://pinepick.ciptadana.com/
  ciptadana: ["IDR"],
  // https://harita-sekuritas.co.id/simulasi-biaya
  haritakencana: ["IDR"],
  // https://uno.inasekuritas.com/
  inasekuritas: ["IDR"],
  // https://www.kafsekuritas.co.id/id/faqs
  kafsekuritas: ["IDR"],
  // https://lotussekuritas.com/services/securities/trading
  lotusandalan: ["IDR"],
  // https://www.mncsekuritas.id/pages/equity/
  mncsekuritas: ["IDR"],
  // https://www.poems.co.id/Support/Knowledgebase
  phillipid: ["IDR"],
  // https://profindo.com/page/tutorial-opening-account
  profindo: ["IDR"],
  // https://www.yugen.co.id/documents/files/docs/YBS%20RIPLAY.pdf
  yugen: ["IDR"],
  // ["PKR"]. FAQ: "we only accept from or send money to clients via banking
  // channels", minimum deposit PKR 5,000; no other currency is named.
  // https://nextcapital.com.pk/faq
  nextcapital: ["PKR"],
  // ["PKR"]. All amounts are in rupees (opening amounts PKR 25,000 and PKR
  // 300,000). Non-residents come in through Roshan Equity Investment, which is
  // rupee-settled.
  // https://www.fsedge.com/fee.php
  foundation: ["PKR"],
  // ["PKR"]. Clients fund their accounts through "Fund Transfer" to the
  // broker; non-residents use a Roshan Digital Account, which reaches the
  // trading account in rupees. No other currency is named.
  // https://adamsecurities.com.pk/page-roshan-digital-account
  adam: ["PKR"],
  // ["PKR"]. The commission sheet and levies are in rupees; non-resident
  // Pakistanis go through a Roshan Digital Account (menu: "Non-resident
  // Pakistani", "Roshan Digital Account"). No other currency is named.
  // https://bel.com.pk/contact-us/
  babaequities: ["PKR"],
  // ["PKR"]. Online PSX accounts are in rupees; non-residents use Roshan
  // Digital Accounts / Roshan Equity Investment "with full repatriation of
  // funds", reaching the account in rupees. No other currency is named.
  // https://mra.com.pk/
  mra: ["PKR"],
  // PKR. The commission page lists only PK IBANs (Allied, HBL, Askari, MCB,
  // Alfalah, JS) under 'OPTIMUS CAPITAL MANAGEMENT (PVT) LIMITED'; a
  // non-resident goes through a Roshan Digital Account
  // https://optimus.pk/commission-structure/
  optimus: ["PKR"],
  // PKR. Rupee PSX trading account; a non-resident goes through a Roshan
  // Digital Account (darson.com.pk/roshan-digital-account); no other currency
  // is named; the minimum balance is printed as Rs 5,000.
  // https://www.darson.com.pk/
  darson: ["PKR"],
  // PKR. The site has 'Bank Accounts Details' and a 'Fund Deposit System For
  // Equities' (rupee bank accounts), and RDA for non-residents; no other
  // currency.
  // https://munirkhanani.com/bank-accounts-details/
  munirkhanani: ["PKR"],
  // PKR. Rupee account with online fund transfer; non-residents use 'Roshan
  // Equity Investment - RDA'; the Rs 5,000 minimum is printed in rupees.
  // https://ismailiqbal.com/Commission_Charges.php
  ismailiqbal: ["PKR"],
  // PKR. GROW offers 'Instant deposits & withdrawals' and online payment
  // requests into the rupee account; non-residents use the Roshan Equity
  // Investment Account via a Roshan Digital Account.
  // https://www.ahcml.com/grow
  alhabib: ["PKR"],
  // PKR only. Evidence: a Karachi PSX broker billing in rupees; non-residents
  // come in through the Roshan Digital Account (PKR).
  // https://fortunesecurities.com/
  fortune: ["PKR"],
  // PKR only. Evidence: 'You may deposit funds via Inter Bank Funds Transfer
  // IBFT/Cheque' into PKR client accounts at JS Bank and Habib Metropolitan
  // (Karachi IBANs).
  // https://www.msltrade.com/invester-information/funds-deposit&withdrawal
  multiline: ["PKR"],
  // PKR only. Evidence: FAQ 10, 'send your cheque / Pay order/DD in favor of
  // "WE Financial Services Limited"'; a Roshan Digital Account page exists.
  // https://weonline.biz/WENEW/faq.php
  wefinancialservi: ["PKR"],
  // PKR only. Evidence: a Karachi PSX TREC holder; its 'Schedule of Charges'
  // is in rupees and its FAQ says the account 'is 100% cash based'.
  // https://tvspl.com/faq-2/
  tariqvohra: ["PKR"],
  // PKR only. Evidence: the site lists 'Bank Accounts Details' and 'Raast'
  // (Pakistan's PKR instant-payment rail) for client deposits.
  // https://fdm.com.pk/
  fdm: ["PKR"],
  // PKR. All PSX catalogue rows are PKR, funding is through Pakistani banks,
  // and Roshan Digital Accounts are PKR-settled (same as abbasi/ktrade).
  // https://rafisecurities.com/
  rafi: ["PKR"],
  // PKR. PSX broker, Pakistani bank funding only.
  // https://www.spectrumonline.com.pk/
  spectrum: ["PKR"],
  // PKR. Online funds transfer from Bank Alfalah, Bank Al-Habib and MCB
  // (Commission-Slab.pdf); Roshan Digital Account is PKR-settled.
  // https://bopcapital.com.pk/
  bop: ["PKR"],
  // PKR. Pakistani PSX broker; funds stay in the client's own Pakistani bank
  // account.
  // https://www.iel.net.pk/OpenAccount.html
  integratedequiti: ["PKR"],
  // PKR. Pakistani PSX broker, PKR rows only.
  // https://akikcapital.com/page-online-trading
  akik: ["PKR"],
  // RUB, USD, EUR, CNY, BYN, KZT, TRY. The FAQ lists 'Перечень иностранных
  // валют, в которых может быть открыт Брокерский счет — USD, EUR, CNY, BYN,
  // KZT, TRY'.
  // https://www.psbank.ru/personal/wealth/markets/faq
  psb: ["RUB","USD","EUR","CNY","BYN","KZT","TRY"],
  // RUB, CNY. The account can 'покупать, хранить и продавать ... валюту', and
  // only CNY has a tariff (1.8.1, 'Спред +/- 0,3% от биржевого курса').
  // Deposits come from the client's own bank account.
  // https://support.mts.ru/invetitsii/brokerskii-schyot/obschaya-informatsiya-po-brokerskomu-schyotu-v-mts-investitsiyah
  mts: ["RUB","CNY"],
  // RUB, CNY. 'Валюта Юани Московская Биржа, валютный рынок' (currency market
  // 1.5 at 0.2%).
  // https://brokerkf.ru/invest/start/
  kitfinance: ["RUB","CNY"],
  // RUB, USD, EUR, CNY. /tariffs/ prices withdrawals: 'Евро 5% ... Доллар 1%
  // ... Китайский юань 5 500 руб.'; the currency market is 1.8.1 at 0.01%.
  // https://d8.capital/tariffs/
  d8: ["RUB","USD","EUR","CNY"],
  // RUB, USD, EUR, CNY. 'Тариф за хранение денежных средств в иностранной
  // валюте на Клиентском счете ... доллары США, Евро, китайский юань ... 3%';
  // external foreign-currency credits and CNY withdrawals are priced too.
  // https://www.russ-invest.com/investment/documents/tarifs/
  russ: ["RUB","USD","EUR","CNY"],
  // RUB, CNY. Regulation 1.4.7: «По умолчанию Клиенту открываются Брокерские
  // счета в рублях РФ и Китайских юанях».
  // https://www.nskbl.ru/upload/iblock/d2e/sg18mlkqmdtxhsn203640d547ghyvmoz/Reglament-predostavleniya-uslug-na-finansovykh-rynkakh-_206_2_1_140_2026-ot-14.07.2026-.pdf
  levoberezhny: ["RUB","CNY"],
  // RUB, CNY. FAQ: «Валютная секция ... Банк предлагает доступ к RUB, CNY».
  // https://www.primbank.ru/investitsii/populyarnye-voprosy-brokerskoe-obsluzhivanie/
  primorye: ["RUB","CNY"],
  // RUB only. «Вы можете пополнить свой торговый счет в АО Актив, осуществив
  // перевод в рублях на НКО НКЦ (АО)».
  // https://aktiv.ru/services/valyutniy-rinok-moskovskoy-birzhi
  aktiv: ["RUB"],
  // RUB. The brokerage account (Брокерский лицевой счет) is in rubles, and the
  // FX tariff allows withdrawals only in rubles («Вывод ... производится
  // только в российских рублях»). is unreadable (empty text); the rules are
  // https://chelinvest.ru/upload/iblock/990/rouj5ooqzglmo2zq9tgbwzqzcgi3hynj.pdf
  chelinvest: ["RUB"],
  // RUB. Regulation 7.4, clause 4.5 bars securities «расчеты или выплаты
  // доходов по которым производятся в валюте, отличной от валюты Российской
  // Федерации».
  // https://abr.ru/upload/iblock/6ad/Регламент_брокерских_услуг_версия_7.4.pdf
  rossiya: ["RUB"],
  // RUB, CNY. The tariff charges for crediting foreign currency to the
  // brokerage account ("Комиссия за зачисление иностранной валюты на
  // Брокерский счет ... CNY - не менее 299 CNY") and prices currency deals.
  // https://bbrbroker.ru/upload/iblock/911/4yrntyuw46ysu8b828rpy2w268tac7w0.pdf
  bbr: ["RUB","CNY"],
  // RUB, CNY. The account application (Приложение № 2б) lets stock-market
  // deals settle in a foreign currency, "доллар США евро иная валюта".
  // https://severgazbank.ru/upload/medialibrary/raskrytie/Prilozheniya-k-Pravilam-brokerskogo-obsluzhivaniya-AO-BANK-SGB-s-21.10.2026.zip
  severgazbank: ["RUB","CNY"],
  // RUB, CNY. The account application in the Регламент opens the account "в
  // Рублях РФ, а так же: Китайский Юань Доллар США Евро", and the tariff has
  // CNY-settled exchange lines (2.3). брокерского обслуживания клиентов
  // https://domrfbank.ru/upload/docs/medialibrary/Регламент
  dominvest: ["RUB","CNY"],
  // RUB, CNY. The Условия keep the brokerage account "в валюте Российской
  // Федерации или иностранной валюте", and the tariff prices deals in
  // securities denominated in foreign currency.
  // https://s3.ru-msk.k2.cloud/bucket-cms-prod/Usloviya_brokerskogo_obsluzhivaniya_v_PAO_Bank_Sankt_Peterburg_data_publikaczii_22_10_2025_f27df01a1a.pdf
  saintpetersburg: ["RUB","CNY"],
  // RUB only. Регламент 1.13: the broker does not do "совершение сделок за
  // счет Клиента с иностранной валютой"; the catalogue is rouble stocks only.
  // https://www.rsb.ru/upload/iblock/44d/44dbe5a5359ce48ee11549fdef54dc1c.pdf
  russianstandard: ["RUB"],
  // RUB only. Every catalogue line is in RUB, fees are taken in the deal's
  // payment currency, and the currency section only prices buying foreign
  // currency (3%).
  // https://www.metallinvestbank.ru/fonds/broker/tariff/tariff/
  metallinvestbank: ["RUB"],
  // RUB, CNY, USD (also JPY and GBP). The withdrawal table in section 22
  // prices RUB (100 RUB), USD, JPY, GBP and CNY payouts (0.4% with min/max),
  // and the currency market covers CNYRUB/USDRUB.
  // https://investpalata.ru/wp-content/uploads/2026/08/Регламент-обслуживания-клиентов-ред.-01.09.2026v6.pdf
  investitsionnaya: ["RUB","CNY","USD","JPY","GBP"],
  // RUB, USD, EUR. Tariff 5.2 has withdrawal fees only for rubles (35 RUB), US
  // dollars and euros (2,100 RUB), with no CNY rail.
  // https://ivolgacap.ru/upload/iblock/d27/9h0kt7jzagr45em5szay09yi1jzkkxbk/Tarify_izm-SR-Rayf_chistyy.pdf
  ivolga: ["RUB","USD","EUR"],
  // CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD. GKB offers
  // Privatkonto/Kontokorrent/Sparkonto Euro and a "Fremdwährungskonto ... in
  // zahlreichen Währungen verfügbar" (CHF 6 a quarter).
  // https://www.gkb.ch/de/private/unsere-angebote/konten-und-karten/fremdwaehrungskonto
  graubundnerkanto: ["CHF","EUR","USD","GBP","JPY","AUD","CAD","SGD"],
  // CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD. Privatkonto Euro plus "Privatkonto
  // Fremdwährung": "USD, GBP oder weiteren gängigen Währungen", interest on
  // USD/CAD/GBP, "Weitere Währungen auf Anfrage". JPY, AUD and SGD are taken
  // https://www.okb.ch/private/konten-und-karten/privatkonten/privatkonto-fremdwaehrung
  obwaldnerkantona: ["CHF","EUR","USD","GBP","JPY","AUD","CAD","SGD"],
  // CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD. "Mit einem Fremdwährungskonto
  // können Sie regelmässige Transaktionen in einer von Ihnen gewählten Währung
  // durchführen".
  // https://www.regiobank.ch/privatkunden-zahlen-und-sparen
  regiobanksolothu: ["CHF","EUR","USD","GBP","JPY","AUD","CAD","SGD"],
  // CHF, EUR, USD, GBP. The private "Fremdwährungskonto" is "geeignet für
  // sämtliche Bankdienstleistungen in Fremdwährungen" but names no currency,
  // so only the main ones are kept.
  // https://www.dcbank.ch/wp-content/uploads/2026/02/DCB_Kontosortiment_Privatkunden_LY01-DCB-Fonts_2026-Web.pdf
  dcbank: ["CHF","EUR","USD","GBP"],
  // CHF, EUR, USD, GBP, JPY, AUD, CAD. "Privatkonto Fremdwährung" in "EUR,
  // USD, GBP, SEK, NOK, DKK, HKD, JPY, CAD, AUD, NZD, ZAR" (no SGD).
  // https://www.nkb.ch/privatkonto-fremdwaehrung?parent=2324
  nidwaldnerkanton: ["CHF","EUR","USD","GBP","JPY","AUD","CAD"],
  // CHF, EUR, USD, GBP. The price list names '€-Konti' and 'übrigen
  // Fremdwährungskonti'. The Kontosortiment lists a 'Fremdwährungskonto' in
  // unnamed 'Fremdwährungen', so USD and GBP are an assumption. No markup for
  // https://www.saanenbank.ch/download/pictures/f4/r26sun5vruer6imo8aajl9dx07wsg3/kontosortiment_a5_de_01.01.26.pdf
  saanen: ["CHF","EUR","USD","GBP"],
  // CHF, EUR, USD, GBP, JPY, AUD, CAD, SGD. The price list names a 'Eurokonto'
  // and a 'Fremdwährungskonto', and the account page says the
  // Fremdwährungskonto is offered in 'frei handelbaren Währungen'. No
  // https://www.bankbsu.ch/privatkunden/zahlen-sparen/zahlen/fremdwaehrungskonto
  bsu: ["CHF","EUR","USD","GBP","JPY","AUD","CAD","SGD"],
  // CHF, EUR, USD, GBP. The site names a 'Euro-Konto / Fremdwährungskonto'
  // ('Abwicklung der Bankgeschäfte in Euro oder in Fremdwährungen'). CHF and
  // EUR are named; USD and GBP are an assumption. No securities FX markup is
  // https://bbobank.ch/de/Info/Zahlen/Euro-Konto__Fremdwahrungskonto
  bbobrienzoberhas: ["CHF","EUR","USD","GBP"],
  // ["NGN"]. Naira wallet. The FAQ says diaspora investors 'can fund in USD,
  // GBP or EUR at the live rate', so those are converted, not kept.
  // https://www.morgancapitalgroup.com/faq
  morgancapital: ["NGN"],
  // ["NGN"]. NGX trading account in naira. The 'Multicurrency global account'
  // named on the page is a wallet and prints no conversion.
  // https://asset.apel.com.ng/apelalpha
  apel: ["NGN"],
  // ["NGN"]. 'You will fund your trading account for purchase of shares', with
  // naira trading on the NSE.
  // https://integratedtrustng.com/forms/Application-Form-Guide-to-Online-Trading.pdf
  integratedtrust: ["NGN"],
  // ["NGN"]. Naira NGX account; the FAQ names no other currency.
  // https://quantumzenithsecurities.com.ng/faqs/
  quantumzenith: ["NGN"],
  // ["NGN"]. The calculator and the NGX trading are in naira only.
  // https://www.falconsecuritiesltd.com/brokage.html
  falcon: ["NGN"],
  // ["NGN"]. The calculator and the price list are in naira only, and the
  // account form asks for a BVN and a Nigerian bank account number. Source:
  // https://www.newdevcoinvestment.com/account-opening
  newdevco: ["NGN"],
  // ["NGN"]. All fees are printed in naira ('of Consideration', N50,000
  // minimum). The account is a Nigerian stockbroking account with CSCS.
  // Source:
  // https://www.missionsecuritiesltd.com/faq.html
  mission: ["NGN"],
  // EUR. Evidence: one euro Verrechnungskonto ('Zwei Depots sowie ein
  // Verrechnungskonto sind kostenfrei inkludiert'); the PLV's 0.40% FX margin
  // applies only to foreign dividends. URL
  // https://tradegate.direct/aktien
  tradegatedirect: ["EUR"],
  // EUR. Evidence: the settlement account is the client's Sparkasse Girokonto
  // in euro (S-Neo requires 'ein Girokonto bei einer Sparkasse' as the
  // Verrechnungskonto). URL
  // https://www.sparkasse.de/pk/produkte/sparen-und-anlegen/geld-anlegen/depot/s-neo.html
  berlinersparkass: ["EUR"],
  // EUR. Evidence: the settlement account is the client's Sparkasse Girokonto
  // in euro. URL
  // https://www.sparkasse.de/pk/produkte/sparen-und-anlegen/geld-anlegen/depot/s-neo.html
  nassauischespark: ["EUR"],
  // EUR. Evidence: the settlement account is the client's Sparkasse Girokonto
  // in euro. URL
  // https://www.sparkasse.de/pk/produkte/sparen-und-anlegen/geld-anlegen/depot/s-neo.html
  mittelbrandenbur: ["EUR"],
  // EUR. Evidence: the settlement account is the client's Sparkasse Girokonto
  // in euro. URL
  // https://www.sparkasse.de/pk/produkte/sparen-und-anlegen/geld-anlegen/depot/s-neo.html
  stadtsparkassedu: ["EUR"],
  // EUR, CZK, GBP, KZT, PLN, SEK, MXN. Evidence: Mintos help 'Which currencies
  // can I exchange' lists exactly these, and the account keeps a balance per
  // currency. Investing needs EUR ('Our platform does not support
  // https://help.mintos.com/hc/en-us/articles/9318879624849-Which-currencies-can-I-exchange
  mintos: ["EUR","CZK","GBP","KZT","PLN","SEK","MXN"],
  // PHP, USD. A peso account plus a USD FirstMetroSec account for
  // dollar-denominated PSE securities ('To invest in DDS, open a USD
  // FirstMetroSec account').
  // https://help.firstmetrosec.com.ph/hc/en-us/articles/55429167151129-Dollar-Denominated-Securities-DDS
  firstmetro: ["PHP","USD"],
  // PHP only. Initial and additional funding through Philippine bank bills
  // payment or transfer, minimum initial fund PHP 5,000.
  // https://www.philstocks.ph/faq
  philstocks: ["PHP"],
  // PHP only. Funding through Philippine banks or e-wallets (BDO, Unionbank,
  // Metrobank, BPI; Instapay/Pesonet into a Metrobank account), minimum
  // opening balance P10,000.
  // https://aaa-equities.com.ph/faq/
  aaaequities: ["PHP"],
  // PHP only. Cash-in by Instapay (max P50,000) or bank Pay Bills (BDO, BPI,
  // Metrobank, Unionbank). Withdrawals by bank transfer only, to the
  // designated settlement account.
  // https://www.investorsonline.ph/
  investors: ["PHP"],
  // PHP only. LunaFundNow or bank bills payment with 'Deposit Amount: Php
  // (Amount)'. Settlement bank must be AUB, BPI, BDO or RCBC.
  // https://www.lunasecurities.com/support/
  lunasec: ["PHP"],
  // PHP only. The trading account is funded by transfer from the Maya wallet
  // to Philstocks Buying Power: "Enter the amount you want to transfer from
  // your Maya Wallet to your Philstocks Buying Power". Withdrawals also go
  // https://www.maya.ph/stocks
  mayastocks: ["PHP"],
  // ["BDT"]. The deposit rails are Amar Biniyog app, EFT/BEFTN/RTGS 'from any
  // bank in Bangladesh', cheque, cash at a bank and bKash. Foreigners and NRBs
  // trade through a NITA (Non-resident Investor's Taka Account). and
  // https://www.mikasecurities.net/pricing/
  mika: ["BDT"],
  // ["BDT"]. The site shows taka accounts only and no foreign-currency cash
  // account. Foreign investors go through the custodian/NITA route, and the
  // NITA is a taka account.
  // https://www.basl-bd.com/home/commissionrate
  bankasiasec: ["BDT"],
  // ["BDT"]. Only taka rails are shown. For foreign investors the custodian
  // bank keeps 'Cash or NITA account, Securities account and F/C account', and
  // the NITA is in taka.
  // https://www.sheltechbrokerage.com/page/details/account-opening
  sheltech: ["BDT"],
  // ["BDT"]. The home page says "Deposit from any Bank Account, bkash, Nagad
  // directly into your Bo Account", which are all taka rails.
  // https://www.abcdsebroker.com/
  abcoltd: ["BDT"],
  // ["BDT"]. The site describes no deposit method and no foreign-currency
  // account. The minimum balance is printed as '500 BDT'.
  // https://www.mondolsecurities.com/
  mondol: ["BDT"],
  // ["BDT"]. The FAQ "How do I transfer funds" lists BEFTN, intra-bank
  // transfer for One Bank and Mercantile Bank account holders, RTGS and
  // account-payee cheque, all taka rails.
  // https://utrade.com.bd/#faq
  uniroyal: ["BDT"],
  // ["XOF"]. The tariff is "F CFA / HT", the BRVM trades in XOF, and the
  // CONNECT online broker runs through a Société Générale Côte d'Ivoire
  // account. The bank also has a euro current account, but securities are
  // https://particuliers.societegenerale.ci/fileadmin/user_upload/SG_Cote_ivoire/migrated/CB_particuliers.pdf
  societegeneralew: ["XOF"],
  // ["XOF"]. The tariff is in FCFA and the FAQ says the account is for BRVM
  // trades, which settle in XOF; funds are paid out by cheque or transfer to a
  // bank account.
  // https://www.bridge-securities.com/centre-dinformation/faq
  bridge: ["XOF"],
  // ["XOF"]. The simulator and approved tariff are in FCFA, and the online
  // order book boaksdirect.com is a BRVM account in XOF.
  // https://boacapitalsecurities.com/fr/simulateur
  boa: ["XOF"],
  // ["XOF"]. The grid is in FCFA and the online service trades BRVM lines
  // only.
  // https://nsiacapital.com/nsia-capital-online/
  nsia: ["XOF"],
  // ["XOF"]. The grid is in FCFA, and the Bourse Connect platform is for "le
  // marché boursier régional de l'espace UEMOA" (BRVM, XOF).
  // https://sib.ci/aswa/bourse-en-ligne/
  attijariwestafri: ["XOF"],
  // ["HKD"]: the fee page says 'All amount in Hong Kong dollars' and the fund
  // withdrawal form asks for 'Withdrawal Amount (HKD)'. USD and CNH counters
  // are therefore a forced conversion at an unpublished rate, so their total
  // http://www.primesec.com.hk/rev1/fee-structure.php?Lang=EN
  primehk: ["HKD"],
  // ["HKD","CNH"]: the deposit section lists HKD bank accounts plus 'A/C No.
  // 364469-057 (RMB)' at OCBC Wing Hang. No USD account is listed, so a USD
  // counter is a forced conversion (N/A).
  // http://upbest.com/en/support/select.html
  upbest: ["HKD","CNH"],
  // ["HKD"]: every fee is in 港幣 and the deposit page (cheque, online banking,
  // remittance to the firm's HK bank) names no other currency. USD and CNH
  // counters are a forced conversion at an unpublished rate, so N/A.
  // https://asasec.com/tc/fund.php
  asa: ["HKD"],
  // ["HKD","USD","CNH"]: the evidence is indirect. A bank account with RMB and
  // FX services, plus tariff note 2 (HKD fees 'levied in HKD or its equivalent
  // in trading currency'), implies USD and RMB counters settle in their own
  // https://www.publicbank.com.hk/static/prod/retailBanking-investment-securitiesTrading/00078_13EN.pdf
  publichk: ["HKD","USD","CNH"],
  // ["HKD"]: every securities fee is in HK$ and no page names another
  // settlement currency for the securities account (the bank also holds MOP,
  // but HK trades settle in HKD). USD and CNH counters are a forced conversion
  // https://www.wlbank.com.mo/webfile/upload/2026/07-10/17-17-290757397616718.pdf
  bancowelllink: ["HKD"],
  // ["LKR"]. Every CSE line settles in rupees. A foreign client funds through
  // a Sri Lankan bank SIA/IIA, and dividends go 'to your local bank/SIA
  // account' (FAQ).
  // https://www.asiasecurities.lk/faqs
  asialk: ["LKR"],
  // ["LKR"]. The FAQ says to deposit to its LKR account at Commercial Bank of
  // Ceylon (Foreign Branch); dividends go 'to your local bank/SIA account'.
  // https://www.bartleetreligare.com/faqs/
  bartleetreligare: ["LKR"],
  // ["LKR"]. CSE settles in rupees; 'All foreign institutional and individual
  // Investors are required to open a Securities Investment Account (SIA) via a
  // local custodian bank'.
  // https://www.jksb.com/jksb_venture_with_us/
  johnkeells: ["LKR"],
  // ["LKR"]. All CSE lines are in rupees; foreign clients fund through a Sri
  // Lankan bank SIA.
  // https://www.ndbs.lk/pages/faq.jsp
  ndb: ["LKR"],
  // ["LKR"]. The online-trading minimum deposit is in rupees and every CSE
  // line is in rupees; the site offers 'Open IIA Account' for foreign funds.
  // https://capitaltrust.lk/knowledge-hub/
  trustlk: ["LKR"],
  // ["MXN"]. The account is in pesos with free SPEI transfers (guide §6.4),
  // and every catalogue line is MXN.
  // https://actinvertrade.actinver.com/preguntas-frecuentes.html
  actinvertrade: ["MXN"],
  // ["MXN"]. Funding is by SPEI in pesos (footer FAQ: 'fondear tu cuenta con
  // una transferencia (SPEI)').
  // https://kuspit.com/
  kuspit: ["MXN"],
  // ["MXN"]. Every catalogue line is in pesos and the Casa de Bolsa account
  // settles in pesos. The B×+ Dólares accounts are separate bank products.
  // https://www.vepormas.com/fwpf/portal/documents/servicios-casa-de-bolsa-linea
  bx: ["MXN"],
  // ["MXN"]. Every catalogue line is in pesos and the page's fees are in pesos
  // with SPEI transfers. USD items exist only for share transfers abroad and
  // USD cheques.
  // https://invex.com/costos-y-comisiones
  invexcasabolsa: ["MXN"],
  // ARS, USD. The sheet says 'Es condición obligatoria para operar con valores
  // negociables, contar con Cuentas a la Vista en Pesos y/o Dólares'. The
  // product page says 'Vincular cuenta en pesos y/o dólares a la cuenta
  // https://www.bancor.com.ar/personas/inversiones/compra-venta-de-valores-negociables
  bancor: ["ARS","USD"],
  // ARS, USD. The tariff bills 'TRANSFERENCIA $ EMISORA $ 6.500' and
  // 'TRANSFERENCIA u$s EMISORA u$s 8,00-12,00' from the account, so it holds
  // pesos and dollars.
  // https://www.guor.com.ar/Recursos/Pdf/aranceles.pdf
  guor: ["ARS","USD"],
  // ARS, USD. Home page: 'CEDEARs y Acciones ... Podés hacerlo en pesos o
  // dólares'; dólar MEP is offered.
  // https://www.gorostiagabursatil.com/
  gorostiagabursat: ["ARS","USD"],
  // ARS, USD. FAQ: you transfer pesos or dollars 'desde cualquier CBU o CVU
  // ... siempre y cuando seas titular de la cuenta', and 'La moneda de
  // suscripción y rescate siempre debe ser la misma'. The tariff takes fees in
  // https://wise.com.ar/preguntas-frecuentes/
  wise: ["ARS","USD"],
  // GBP only. Money comes in by bank transfer or Direct Debit from a UK bank
  // account in the client's name; there is no currency wallet and the 0.70%
  // 'Foreign currency exchange' fee applies to foreign trades. and
  // https://www.moneyfarm.com/uk/contact-us/
  moneyfarm: ["GBP"],
  // GBP only. The charges sheet (G909, 24/09/26) has no euro or dollar cash
  // account and no FX rate for Sharedealing; fees are charged to the sterling
  // 'Taxed Account'.
  // https://www.firstdirect.com/content/dam/wpb/fsdt/en/documents/pdf/rates-and-charges.pdf
  firstdirect: ["GBP"],
  // GBP only. Commissions and minimums are in pounds; postal sale proceeds
  // 'can only be issued by cheque in pound sterling', and online proceeds go
  // to a validated UK bank account (Faster Payment £4.99 / cheque £10 on the
  // https://shareview.co.uk/documentrepository/svd/ratesandchargescertificated.pdf
  shareviewdealing: ["GBP"],
  // GBP. Evidence: GBP account with WealthKernel as custodian, UK stocks only
  // (FAQ: "Currently, Stratiphy offers UK stocks and ETFs"); every price on
  // the pricing page is in £.
  // https://www.stratiphy.io/faq
  stratiphy: ["GBP"],
  // GBP. Evidence: terms say "Payments must be at least £1 in value and in
  // pounds sterling."
  // https://monzo.com/legal/investments/terms-and-conditions
  monzo: ["GBP"],
  // GBP. Evidence: Stocks & Shares ISA only; clause 8.4 treats assets "in a
  // currency other than GBP (Sterling)" as converted by WealthKernel.
  // https://www.investwizz.co.uk/terms-of-service
  investwizz: ["GBP"],
  // EUR. Evidence: Spanish retail bank, securities tariff priced in euros and
  // euro current account; all Madrid lines are EUR. URL:
  // https://portal.kutxabank.es/cs/Satellite/kb/es/particulares/productos/bolsa
  kutxabank: ["EUR"],
  // EUR. Evidence: the folleto prices Spanish-market orders in EUR and treats
  // any other currency as a separate FX conversion ('cambios de divisa
  // distinta del euro'); all Madrid lines are EUR. URL:
  // https://www.deutsche-bank.es/dam/spain/es/pbc/pdf/Tarifas_valores.pdf
  deutscheespana: ["EUR"],
  // EUR. Evidence: folleto states 'Los importes del presente folleto están en
  // moneda euro', and other currencies are handled as a separate FX
  // conversion; all Madrid lines are EUR. URL:
  // https://www.caixaruralgalega.gal/sites/default/files/2024-07/FOLLETO%20TARIFAS%20CNMV%203070.pdf
  caixaruralgalega: ["EUR"],
  // KES only. Evidence: terms s.6(4) and s.10(4): money moves in and out
  // between M-PESA and the Ziidi Trader account, with no other rail or
  // currency. URL:
  // https://www.safaricom.co.ke/media-center-landing/terms-and-conditions/terms-and-conditions-for-the-ziidi-trader-product
  ziiditrader: ["KES"],
  // KES only. Evidence: Investor Guide s.II.2: pre-funding by M-Pesa paybill
  // 814355 or transfer to the OMNI MARCHE SECURITE Stanbic account (SWIFT
  // SBICKENX); no dollar account is named. URL:
  // https://www.omsafrica.co.ke/investor-guide
  omsafrica: ["KES"],
  // KES only. Evidence: FAQ 31 gives a single SBG SECURITIES account at
  // Stanbic Bank (Chiromo) for funding, and the general T&C define 'Foreign
  // Currency' as anything other than Kenya shillings; no dollar trading
  // https://www.sbgsecurities.co.ke/sbgsecurities/securities/General-Terms-&-Conditions
  sbg: ["KES"],
  // THB only. Settlement is by ATS debit from a Thai bank account or cash
  // placed in the Cash Balance account. (ATS fee note) and
  // https://www.kgieworld.co.th/corporate/media/pdf/feerate/eq-commission-th.pdf
  kgithailand: ["THB"],
  // THB only. Cash Balance is funded in full beforehand, and ATS works only
  // through the Thai banks LH lists (KBank, BBL, SCB, KTB, BAY, UOB, LH Bank,
  // CIMB Thai, TTB).
  // https://www.lhsec.co.th/infocus.php?method=detail&id=53
  landhouses: ["THB"],
  // THB only. Settlement is by ATS from a Thai bank (the Cash Account's ATS
  // fee is 14 THB + VAT) or a prepaid Cash Balance account.
  // https://www.ivglobal.co.th/content/articles/brokerages-fees.html
  ivglobal: ["THB"],
  // ["VES"]: the account is topped up from a Venezuelan bank in bolivares,
  // payment matched to the client's cedula ('Recarga tu saldo', 'Debes colocar
  // tu numero de cedula'); all catalogue lines are VES.
  // https://mercosur.com.ve/home/centrode-sopore/
  mercosurcasabols: ["VES"],
  // ["VES"]: a Venezuelan bolivar account (SUNAVAL-regulated BVC member no.
  // 52, +58 contact); every catalogue line is VES.
  // https://www.stateracasadebolsa.com/
  stateracasabolsa: ["VES"],
  // ["VES"]: home page says 'Fondea tu cuenta con Pago Movil, transferencia
  // bancaria o afiliando tu cuenta' (Venezuelan bolivar rails); all catalogue
  // lines are VES.
  // https://www.per-capital.com/
  percasabolsa: ["VES"],
  // EUR only. Euro current account (Verrechnungskonto) at a German cooperative
  // bank. The bank prints no foreign-currency account and charges an
  // Auslandsaufschlag on foreign exchanges.
  // https://www.bank1saar.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/depot-aktiv.html
  bank1saar: ["EUR"],
  // EUR only. Euro Verrechnungskonto: the page says foreign-currency trades
  // settled 'über Ihr Euro-Verrechnungskonto' are converted at the day's FX
  // bid/ask rate.
  // https://www.bib-fairbanking.de/privatkunden/geldanlage-und-sparen/produkte/depot-brokerage/wertpapierdepot.html
  bibimbistumessen: ["EUR"],
  // EUR. Euro current account; the tariff charges a currency-exchange
  // commission on operations in foreign currencies (min 15 EUR), so no non-EUR
  // cash is held.
  // https://www.monabanq.com/fr/pdf/tarifications/monabanq_tarification.pdf
  monabanq: ["EUR"],
  // EUR. A French regional bank (Crédit Agricole group); its tariff lists only
  // euro accounts, and foreign operations carry conversion fees. Same tariff
  // URL.
  banquechalus: ["EUR"],
  // EUR. Evidence: the folleto says 'Los importes del presente folleto están
  // en moneda euro', and euro is the account currency for the securities
  // account. The bank can also open foreign-currency current accounts
  // https://www.caixaenginyers.com/documents/20143/1080191/Operaciones+por+canales_cast.pdf
  cajaingenieros: ["EUR"],
  // EUR. Evidence: the tariff charges 0.15% for 'compra y venta de divisas',
  // so the account is in euros and other currencies are converted.
  // https://web.archive.org/web/20240812211833/https://content.caixaguissona.com/particular/borsavalues/tarifesgaescoesp.pdf
  caixaguissona: ["EUR"],
  // DKK (no currency account and no securities FX in the price book)
  frslevmollerupsp: ["DKK"],
  // DKK
  lgernes: ["DKK"],
  // RON, USD, EUR. Client accounts 'Cont LEI/USD/EUR SSIF BRM Clients' at
  // https://ssif.brm.ro/informatii-ssif/
  brmssif: ["RON","USD","EUR"],
  // RON. The single client account at BCR Craiova (
  // https://www.shareinvest.ro/despre-noi.php
  shareinvest: ["RON"],
  // EUR
  abcfinance: ["EUR"],
  // EUR
  ipfavorit: ["EUR"],
  // MKD. The MSE settles only in denars, and every catalogue line is MKD. The
  // tariff prices everything in ден., and eTrader shows the client's MKD cash
  // position.
  // https://www.ttk.com.mk/Web/ФИЗИЧКИ_ЛИЦА/Хартии_од_вредност/Електронско_тргување_со_хартии_од_вредност.aspx
  ttkbanka: ["MKD"],
  // MKD. The MSE settles in denars only. The broker page says purchase funds
  // are paid to the buyer's account or directly to the bank's account
  // 100000070020077 at the National Bank (a denar settlement account).
  // https://www.stb.com.mk/finansiski-pazari/brokerski-uslugi/
  stopanskabanka: ["MKD"],
  // EUR only. Evidence: the fees page lists deposits and minimums in € only
  // ('Minimum deposit €1'), and the PDF FX line is 'FX fee (EUR/USD)'.
  // deposits.mjs plum eu = ['EUR'].
  // https://withplum.com/en-cy/legal/fees
  plummoneycy: ["EUR"],
  // COP only. Evidence: 'Recargas en pesos, la conversión a dólares se hace
  // dentro de la plataforma y retiras a tu cuenta bancaria'. The USD balance
  // (Power Cash) comes from converted pesos, not from a USD deposit, and no FX
  // https://tyba.com.co/blog/invertir-en-acciones-de-estados-unidos-desde-colombia/
  tyba: ["COP"],
  // KWD. KFIC deals only on Boursa Kuwait, and every fee on its sheet is in
  // fils/KWD. Same reading as the sharq and efghermeskw entries.
  // https://www.kficbrokerage.com/en/our-business/
  kfic: ["KWD"],
  // KWD. Al-Tijari is a Kuwait-only Boursa broker and its whole fee list is in
  // KWD. Cash withdrawals are paid by a Kuwait Clearing Company cheque.
  // https://www.tijarifb.com/en/faqs
  altijari: ["KWD"],
  // MAD only. Moroccan broker (societe de bourse). The account-opening
  // documents ask residents for a cheque specimen, every fee is in DH, and no
  // foreign-currency account is offered.
  // https://www.valorisgroup.ma/upload/vs/PP/Grille_tarifaire.pdf
  valoris: ["MAD"],
  // MAD. Trades settle in dirhams and every securities fee is in DH HT. The
  // bank also offers convertible-dirham and foreign-currency accounts, but
  // none is tied to the broker.
  // https://www.sahambank.com/wp-content/uploads/2026/02/Affiche-tarifaire-JAN-2026-Saham-Bank.pdf
  sogecapitalbours: ["MAD"],
  // JOD. All deposit routes go to the company's account at Arab Jordan
  // Investment Bank (cash, transfer, cheque); ASE trades in dinars, no other
  // currency mentioned.
  // https://www.uajib.com/en/faq
  unitedarabjordan: ["JOD"],
  // JOD. Bank of Jordan brokerage on the dinar-only ASE; no other cash
  // currency is printed.
  // https://excelinvest.jo/en/brokerage
  excelfor: ["JOD"],
  // UZS. The tariff prices shares in sums; top-ups go through a bank, Uzum
  // Bank or Payme ('Есть возможно как в банке, так и через платежные системы
  // (Uzum Bank и Payme)'), The tariff also prices bonds in USD, so a USD
  // https://ffin.uz/brokerskoe-obsludgivanie
  freedomuzbekista: ["UZS"],
  // UZS. Top-ups are from a card linked to the app ('Выберите карту,
  // подключенную к приложению'), minimum 10,000 сумов. FAQ at
  // https://jett.uz/ru/
  jett: ["UZS"],
  // MNT only. Client cash is held in MNT on the broker's nominal account, and
  // the terms of service (9.2) say a withdrawal to a bank account in another
  // currency is converted at the commercial bank's rate.
  // https://icapital.mn/1310?lang=en
  invescore: ["MNT"],
  // MNT only. The fee page says deposits are free by any bank transfer ('Бүх
  // банкны шилжүүлэг'), and the fees and the sign-up form (Mongolian bank
  // account number) are all in MNT.
  // https://bulganbroker.mn/fees
  bulgan: ["MNT"],
  // EUR (euro Girokonto/Tagesgeld; price list in EUR, no foreign-currency
  // account) -
  // https://www.umweltbank.de/download/f003
  umweltbank: ["EUR"],
  // EUR only. The Gebühren page lists only 'Einzahlung in Euro' / 'Auszahlung
  // in Euro' to the euro Verrechnungskonto, and every catalogue line is EUR.
  // https://bisonapp.com/gebuehren/
  bison: ["EUR"],
  // EUR. Offer sheet: BPnow clients 'possono visualizzare e sottoscrivere, il
  // deposito titoli in euro' -
  // https://www.bancadelpiemonte.it/wp-content/uploads/2024/04/offerta-titoli.pdf
  bancapiemonte: ["EUR"],
  // EUR only. Evidence: an Italian bank whose ViViConto current account is in
  // euros, and both fee sheets price everything in Euro.
  // https://www.vivibanca.it/viviconto/conto-corrente-viviconto
  vivibanca: ["EUR"],
  // EUR (euro bank account; not yet in deposits.mjs;
  // https://misc.aktia.fi/data-service/documents/investment/Hinnastot/Arvopaperipalvelut/Hinnasto_Arvopaperipalvelut.pdf
  aktia: ["EUR"],
  // ISK. The app shows the balance of the client's bank account ("innstæðu á
  // bankabók") and buys only shares on Kauphöll Íslands. The fees are in
  // krónur, and no other currency is named. and the tariff PDF
  // https://acro.is/app/
  acro: ["ISK"],
  // PLN (PLN accounts at Erste Bank Polska only;
  // https://www.trigon.pl/dom-maklerski/klient-indywidualny/wplata-na-rachunek-brokerski
  trigondommaklers: ["PLN"],
  // HUF, EUR, USD. Evidence: the mBanking securities-account page says the
  // account is linked to the client's HUF, EUR and USD current accounts, one
  // per currency, and that orders settle from them. Source:
  // https://www.unicreditbank.hu/hu/maganszemelyek/napi_penzugyek/elektronikus_bankolas/mbanking_ertekpapirszamlanyitas.html
  unicredithungary: ["HUF","EUR","USD"],
  // EUR. The tariff and account are in euro, and deposits go to a HR IBAN at
  // Agram banka (general terms art. 4). Source:
  // https://www.agram-brokeri.hr/UserDocsImages/Arhiva/UserDocsImages/Dokumenti%20za%20euro/Op%C4%87i%20uvjeti%20za%20obavljanje%20brokerskih%20poslova01.03.2025_.pdf
  agrambrokeri: ["EUR"],
  // BAM only. The purchase page asks for an advance payment to Raiffeisen
  // CAPITAL's account 161 045 003 508 0184 at Raiffeisen BANK dd BiH, under
  // 'Advance payment instructions in BiH'. That is a domestic KM account, and
  // https://www.raiffeisenbank.ba/en/raiffeisen-grupa/raiffeisen-capital/proizvodi-i-usluge/brokerske-usluge-/kupovina-hartija-od-vrijednosti.html
  raiffeisenba: ["BAM"],
  // BAM only. Evidence: the full purchase advance is paid in KM to Unibroker's
  // depository account at Moja banka Sarajevo (domestic account
  // 137-470-6001-8825-08), and SASE settles only in KM.
  // https://www.unibroker.ba/uputstvo.html
  unibroker: ["BAM"],
  // ZAR. The costs page says to fund by EFT ('We do not accept cash deposits
  // or cheques. Please arrange for payment to be made via EFT'). The sign-up
  // form lists local SA banks, and JSE trading is in rand.
  // https://www.sharenet.co.za/securities/costs.php
  sharenet: ["ZAR"],
  // ZAR, USD
  eqt: ["ZAR","USD"],
  // AUD only. Buys settle from a linked Macquarie Cash Management Account or a
  // nominated Australian cash account, and only Australian shares are sold.
  // Sources: and
  // https://www.sequoiadirect.com.au/support/frequently-asked-questions/
  sequoiadirect: ["AUD"],
  // JPY. Evidence: the only funding route is らくらく振替 from a 八十二長野銀行 account
  // into the securities account, and the online service sells only TSE yen
  // lines; no foreign-currency cash is offered online.
  // https://www.82sec.co.jp/trade/commodity.php
  hachijuni: ["JPY"],
  // MMK. The services page describes a 'Cash trading' account where you can
  // buy shares up to the amount of 'Myanmar Kyats that you deposit with us'.
  // Deposits arrive by KBZ Quick Pay, KBZ iBanking or transfer to the KBZSC
  // http://www.kbzsc.com/securities-trading/services-offered
  kbzstirlingcolem: ["MMK"],
  // BRL only. The account is a Brazilian brokerage account funded in reais
  // (Pix/TED). Evidence: 'Tudo com corretagem zero' for B3 products, and the
  // help centre says the account is blocked after 'saída fiscal do Brasil'.
  // https://mkt.cmcapital.com.br/abertura-de-conta-versao-2
  cmcapital: ["BRL"],
  // COP. The FAQ lists deposits through PSE debit, Baloto, Efecty and other
  // Colombian cash networks, and the Trader Pro tariff is in pesos. No dollar
  // account is offered.
  // https://www.progresion.com.co/servicio-al-cliente/faqs/
  progresion: ["COP"],
  // JMD, USD. Evidence: 'Open a JMMB EMMA with as little as J$25,000 or
  // US$200' ( deposits.mjs has no jmmb entry yet.
  // https://jm.jmmb.com/investment-jamaica-products
  jmmb: ["JMD","USD"],
  // TTD, USD. TTD: the fees, the TTD$35,000 opening minimum and the TTD$35
  // certificate fee are all in TTD. USD: the TTSE USD Equity board (MPCCEL,
  // ASBH6.00) trades in USD, and RWML sells the whole board. RWML's own pages
  // https://republicwealthmanagement.com/brokerage-services-local-equity/
  republicwealth: ["TTD","USD"],
  // TTD, USD. Evidence: the TOP FAQ, question 21: trading "in the currency
  // of the market in which the security is listed, i.e. Trinidad and Tobago
  // Dollar (TTD) or United States Dollar (USD)"; FCBAS sells the whole TTSE
  // board, USD Equity board included.
  // https://www.firstcitizensgroup.com/tt/wp-content/uploads/sites/2/2025/10/TOP-Frequently-Asked-Questions.pdf
  firstcitizenstt: ["TTD","USD"],
  // TTD, USD. Evidence: the local stockbroking page's opening amount is
  // "$10,000TT"; the TTSE USD Equity board trades in USD and Bourse sells
  // the whole board; its international stockbroking account is in USD
  // ("US$5,000").
  // https://bourseinvestment.com/individual-solutions/stockbroking/local-stockbroking/
  boursebrokers: ["TTD","USD"],
  // TTD, USD. Evidence: products "Available in two (2) currencies TT$ and
  // US$"; equities minimum "TT $2,500" or "US $10,000"; the NYSE and the
  // TTSE USD Equity board trade in USD.
  // https://tt.jmmb.com/investment-products
  jmmbsecuritiestt: ["TTD","USD"],
  // USD, UYU. The site says 'Ofrecemos planes de ahorro en pesos y dólares',
  // all tariff amounts are in USD, and every BVM share line is in USD, so
  // there is no FX. and
  // https://www.maiorano.com.uy/
  maioranocia: ["USD","UYU"],
  // KZT, USD
  udcapitaludcinve: ["KZT","USD"],
  // AZN, USD, EUR. Evidence: the share commission minimum is printed as 'min.5
  // AZN/USD/EUR', and XalqOnline offers conversion between the bank's AZN and
  // foreign-currency accounts. URL:
  // https://api.xalqbank.az/storage/temp/processing/investisiya-xidmetleri-uzre-tarifler.pdf
  xalq: ["AZN","USD","EUR"],
  // AOA
  bfacm: ["AOA"],
  // AED, AUD, CAD, CHF, CNH, CZK, DKK, EUR, GBP, HKD, HUF, ILS, JPY, MXN, NOK,
  // NZD, PLN, SEK, SGD, TRY, USD, ZAR (the IBKR LLC wire currencies, same as
  // ibkrus/ibkrint), plus INR for the NSE lines only. Evidence: the accounts
  // https://placetrade.com/investment-types-1
  placetrade: ["AED","AUD","CAD","CHF","CNH","CZK","DKK","EUR","GBP","HKD","HUF","ILS","JPY","MXN","NOK","NZD","PLN","SEK","SGD","TRY","USD","ZAR","INR"],
  // Caucasus Capital (IBKR introducing broker): the interest page rates cash
  // balances in each of these. RUB is also printed but is not a currency IBKR
  // takes in, so it is left out.
  // https://capital.ge/interest-and-financing/
  caucasus: ["USD","AUD","CAD","CHF","CNH","CZK","DKK","EUR","GBP","HKD","HUF","ILS","INR","JPY","KRW","MXN","NOK","NZD","PLN","SEK","SGD","ZAR"],
  // Peso and dollar transfers are both free ("en pesos o en moneda
  // extranjera" to local accounts); MEP dollars are bought into the client's
  // own dollar account.
  // https://quicktrade.com.ar/preguntas-frecuentes-quicktrade/
  // https://quicktrade.com.ar/dolar-mep/
  quicktrade: ["ARS","USD"],
  // Funding from abroad is converted into the naira account; dividends and
  // sale proceeds are paid in naira.
  // https://networkcapitalltd.com/frequently-asked-questions/
  netcap: ["NGN"],
  // "using EUR, USD or PLN currency as a base for your account".
  // https://axontrader.eu/
  axon: ["EUR","USD","PLN"],
  // Chong Hing Bank securities accounts in HKD, RMB and USD; FPS deposits in
  // HKD and RMB.
  // https://www.christfund.com/capital.php
  christfund: ["HKD","USD","CNH"],
  // The ADIB bank account is in dirhams; a foreign-market trading account is
  // opened "in the Trading Currency" (SAR for Tadawul/Nomu, USD for the US).
  // https://www.adibsecurities.ae/en/Pages/active_trading.aspx
  adibsec: ["AED","SAR","USD"],
  // Rupees for NSE/BSE; the global account takes dollars directly, "from
  // Indian or international banks" or from ESOP/RSU proceeds.
  // https://www.hdfcsec.com/globalinvesting
  hdfcsec: ["INR","USD"],
  // Rupees for NSE/BSE, and the dollars of the US wallet in GIFT City. That
  // wallet is funded by an INR remittance converted to dollars, but it holds a
  // dollar balance, which counts as cash (owner, 2026-10-28, as for SMC, Rico
  // and XP).
  // https://www.sharekhan.com/global-markets/invest-in-us-stocks
  sharekhan: ["INR","USD"],
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

// A multi-currency broker keeps a title in the currencies of its cash
// (owner, 2026-10-26): where one place quotes the same title in several
// currencies (HKEX's HKD, USD and RMB counters, the LSE's GBP, USD and EUR
// lines, SIX's CHF and USD lines), the lines in a currency the account
// holds stay and the others go. A title with no line in the cash keeps all
// its lines (it is bought by converting). Pence are pounds, and a Hong Kong
// RMB counter is the same money whether filed CNY or CNH. A broker with one
// cash currency is treated the same way (a peso-only account keeps the peso
// line of a CEDEAR, not its dollar line; owner, 2026-10-27); one with none on
// file is left as its catalogue says. Crypto rows are pairs, not lines of one
// place, and are not touched.
const SAME_CASH = { GBX: "GBP", GBP: "GBP", CNY: "CNH", CNH: "CNH" };
const cashOf = (ccy) => {
  const code = String(ccy || "").trim().toUpperCase();
  return SAME_CASH[code] || code;
};
export function cashLines(folder, rows) {
  const cash = new Set(listOf(folder, "").map(cashOf));
  if (!cash.size) return rows;
  const groups = new Map();
  for (const row of rows) {
    const id = String(row.isin || row.ticker || "").trim().toUpperCase();
    const place = String(row.mic || row.exchange || "").trim();
    if (!id || !row.currency || String(row.type || "").toUpperCase() === "CRYPTO") continue;
    const key = `${id}|${place}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const drop = new Set();
  for (const list of groups.values()) {
    if (new Set(list.map((row) => cashOf(row.currency))).size < 2) continue;
    const held = list.filter((row) => cash.has(cashOf(row.currency)));
    if (!held.length) continue;
    for (const row of list) if (!held.includes(row)) drop.add(row);
  }
  return drop.size ? rows.filter((row) => !drop.has(row)) : rows;
}
