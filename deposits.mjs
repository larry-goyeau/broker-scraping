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
