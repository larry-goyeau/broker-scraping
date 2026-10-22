// Mid rates into one US dollar. A fact about the market, not about any broker,
// so it lives at the root next to `venues.mjs` and `taxes.mjs`.
//
// The figures are the ECB reference of 2026-09-07, published as foreign units
// per euro and inverted here through USD. Swissquote converts its CHF grid at
// that same mid, with no markup; the other two files only need the table so
// `b` and `c` can be added across listings.
//
//   toUsd(3, "CHF")     → dollars
//   usdPer("EUR")       → dollars per euro
//
// `GBX` is a penny: one-hundredth of a pound. `AED` is the UAE peg, which the
// ECB does not print. `EGP` is the Central Bank of Egypt mid of the same day
// (buy 50.8606 / sell 50.9606 on 2026-09-07). `KZT` is the National Bank of
// Kazakhstan official rate of that same day, 456.56 tenge per dollar.

export const QUOTE = "USD";
export const AS_OF = "2026-09-07";
export const SOURCE = "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/";

// Foreign units per one US dollar, ECB 2026-09-07 via Frankfurter. Invert to
// multiply: dollars = amount / FOREIGN_PER_USD[ccy].
const FOREIGN_PER_USD = {
  USD: 1,
  EUR: 0.86044,
  CHF: 0.80924,
  GBP: 0.73906,
  JPY: 154.75,
  CAD: 1.382,
  AUD: 1.3861,
  HKD: 7.8402,
  SGD: 1.2662,
  SEK: 9.6042,
  NOK: 9.2703,
  DKK: 6.4314,
  NZD: 1.7019,
  PLN: 3.7087,
  CZK: 20.82,
  HUF: 312.51,
  MXN: 16.9121,
  ZAR: 15.9917,
  THB: 32.895,
  CNY: 6.711,
  INR: 94.49,
  KRW: 1347.93,
  TRY: 48.433,
  BRL: 5.1261,
  ILS: 3.0108,
  IDR: 17647,
  MYR: 4.046,
  PHP: 62.641,
  RON: 4.5189,
  ISK: 121.15,
  // GCC pegs. Not ECB prints. Qatar's published peg is 3.64.
  // The Saudi riyal is SAMA's peg, 3.75 per dollar. Kuwait floats on a
  // basket and is not in this table.
  AED: 3.6725,
  SAR: 3.75,
  BHD: 0.376,
  OMR: 0.3845,
  QAR: 3.64,
  // Central Bank of Jordan peg, 0.709 dinar per dollar since 1995. Not an ECB print.
  JOD: 0.709,
  // CBE mid, not an ECB print. Same day as AS_OF.
  EGP: 50.9106,
  // NBK official rate, not an ECB print. Same day as AS_OF.
  // https://nationalbank.kz/rss/get_rates.cfm?fdate=07.09.2026
  KZT: 456.56,
  // Banco Central de Chile, dólar observado, same day. Not an ECB print.
  // https://si3.bcentral.cl/Siete/ES/Siete/Cuadro/CAP_TIPO_CAMBIO/MN_TIPO_CAMBIO4/DOLAR_OBS_ADO
  CLP: 934.35,
  // CBN NFEM central rate, same day. Not an ECB print.
  // https://www.cbn.gov.ng/api/GetAllExchangeRates
  NGN: 1320.0574,
  // RBZ interbank mid, ZiG per dollar, same day. Not an ECB print.
  // https://www.rbz.co.zw/documents/Exchange_Rates/2026/September/RATES_7_SEPTEMBER_2026.pdf
  ZWG: 26.8547,
  // SBV central rate, dong per dollar, same day. Not an ECB print.
  // https://vov.vn/thi-truong/ty-gia-usd-hom-nay-79-ty-gia-trung-tam-tang-len-moc-25611-dongusd-post1330446.vov
  VND: 25611,
  // CBI official selling rate, dinar per dollar. Not an ECB print.
  // The 5 September 2026 denial says this selling rate was unchanged,
  // so it is the rate on AS_OF. The bulletin is buy 1,300 / sell 1,310 /
  // a 1,320 ceiling at the banks.
  // https://channel8.com/english/news/65154
  IQD: 1310,
  // TRM in force on this day, pesos per dollar. Not an ECB print.
  // The 7 September 2026 rate is the one published for 5–8 September.
  // https://www.datos.gov.co/resource/32sa-8pi3.json?$where=vigenciadesde%20between%20%272026-09-05%27%20and%20%272026-09-08%27
  COP: 3126.08,
  // BCRP interbank mid, soles per dollar, same day. Not an ECB print.
  // Compra 3.358, venta 3.360.
  // https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04637PD/json/2026-09-07/2026-09-07
  // https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04638PD/json/2026-09-07/2026-09-07
  PEN: 3.359,
  // BCRA wholesale close, pesos per dollar, same day. Not an ECB print.
  // https://www.rava.com/cotizaciones/historico/dolar-mayorista/2026/09/07/
  ARS: 1511.5,
  // CBR official rate in force on 7 September 2026. The ECB no longer
  // prints the ruble. The daily file requested for that Monday is the
  // 5 September fixing, 86.5857 rubles per dollar; the next fixing is
  // 8 September.
  // https://www.cbr.ru/scripts/XML_daily.asp?date_req=07/09/2026
  RUB: 86.5857,
  // Bank Al-Maghrib customer board for 7 September 2026, via MAP.
  // Not an ECB print. Buy 8.8022 / sell 10.2296 dirhams per dollar.
  // The figure is the mid of that board.
  // https://maroc-diplomatique.net/cours-des-devises-du-lundi-7-septembre-2026/
  MAD: 9.5159,
  // SBP daily average of banks' floating rates, rupees per dollar, same day.
  // Not an ECB print. The 7 September column is 277.701786.
  // https://www.sbp.org.pk/assets/document/BFER_Daily.pdf
  PKR: 277.701786,
  // Bangladesh Bank's published average, taka per dollar, same day.
  // Not an ECB print. Prothom Alo quotes the 7 September figure as 122.79.
  // https://www.prothomalo.com/business/bank/qrytfuwcfr
  BDT: 122.79,
  // CBSL indicative USD/LKR spot, rupees per dollar, same day.
  // Not an ECB print. The 7 September 2026 daily indicators print 323.7691.
  // https://www.cbsl.gov.lk/sites/default/files/daily_economic_indicators_20260907_e_0.pdf
  LKR: 323.7691,
  // Not an ECB print. Same day. New Taiwan dollars per dollar.
  // https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-09-07/v1/currencies/usd.min.json
  TWD: 31.618,
  // BCT interbank "cours moyen" for 7 September 2026, dinars per dollar.
  // Not an ECB print. The archive answers a POST of input=2026-09-07.
  // https://www.bct.gov.tn/bct/siteprod/cours_archiv.jsp
  TND: 2.9123,
  // Bank of Zambia mid, kwacha per dollar, the 15:30 print of the same day
  // (buy 19.1757 / sell 19.2257). Not an ECB print.
  // https://www.boz.zm/api/v1/views/boz_zmw_usd_daily_exchange_rates?time%5Bmin%5D=2026-09-07%2000%3A00%3A00&time%5Bmax%5D=2026-09-07%2023%3A59%3A59
  ZMW: 19.2007,
  // Central Bank of Myanmar reference rate, kyat per dollar, same day.
  // Not an ECB print.
  // https://forex.cbm.gov.mm/api/history/07-09-2026
  MMK: 2100,
  // Not ECB prints. Same day. Mauritian rupees, Cambodian riels and
  // Tanzanian shillings per dollar (the National Bank of Cambodia page
  // refused the request, so the three come from the same daily file as TWD).
  // https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-09-07/v1/currencies/usd.min.json
  MUR: 46.861,
  KHR: 4047.18,
  TZS: 2649.59,
  // CFA franc (BCEAO), fixed at 655.957 per euro, so the ECB euro of the
  // same day gives the dollar: 655.957 × 0.86044.
  XOF: 564.4116,
  // CBK daily KES rate, shillings per dollar, same day. Not an ECB print.
  // CBK prints one weighted average of the interbank trades; its buy and
  // sell columns stop in January 2024.
  // https://www.centralbank.go.ke/forex/ (wpDataTables table 193, 07/09/2026)
  KES: 129.43,
  // Bank of the Lao PDR board, kip per dollar, same day. Not an ECB print.
  // Buy 22,308 / sell 22,520; the figure is the mid. The BOL reference
  // rate of that day (notice 1220) is 22,311.
  // https://www.bol.gov.la/en/ExchangRate (POST date=07-09-2026)
  LAK: 22414,
  // Bank of Jamaica weighted averages in force on 7 September 2026 (trade
  // date 4 September, the counter-rate row dated 7 September), Jamaican
  // dollars per dollar. Not an ECB print. Buy 157.2941 / sell 159.0304; the
  // figure is the mid.
  // https://boj.org.jm/market/foreign-exchange/counter-rates/
  JMD: 158.16225,
  // Nepal Rastra Bank, rupees per dollar, same day. Not an ECB print.
  // Buy 150.88 / sell 151.48; the figure is the mid.
  // https://www.nrb.org.np/api/forex/v1/rates?page=1&per_page=5&from=2026-09-07&to=2026-09-07
  NPR: 151.18,
  // National Bank of Ethiopia indicative rate, birr per dollar, same day.
  // Not an ECB print. Buy 160.9448 / sell 162.5542; the figure is the mid
  // (NBE's "weighted average" field repeats the buying rate).
  // https://api.nbe.gov.et/api/filter-exchange-rates?date=2026-09-07
  ETB: 161.7495,
  // Free-market dollar, rials per dollar, same day. Not an ECB print.
  // Bonbast prints tomans: sell 224,200 / buy 224,100, so 2,242,000 /
  // 2,241,000 rials; the figure is the mid. The official ICE transfer rate
  // of that day (buy 1,600,136 / sell 1,614,668) is what rials do not buy.
  // https://www.bonbast.com/archive (POST date=2026-09-07)
  IRR: 2241500,
};

function keyOf(currency) {
  const s = String(currency || "").trim();
  if (/^GBX$/i.test(s) || s === "GBp" || /^GBPENCE$/i.test(s)) return "GBX";
  // Offshore yuan (CNH) is the same unit as the onshore one for sizing an order.
  if (/^CNH$/i.test(s)) return "CNY";
  return s.toUpperCase();
}

export function usdPer(currency) {
  const key = keyOf(currency);
  if (key === "GBX") {
    const gbp = FOREIGN_PER_USD.GBP;
    return gbp ? 1 / gbp / 100 : null;
  }
  const per = FOREIGN_PER_USD[key];
  return per ? 1 / per : null;
}

export function toUsd(amount, currency) {
  const px = usdPer(currency);
  if (px == null || amount == null || !Number.isFinite(Number(amount))) return null;
  return Number(amount) * px;
}

export function listingCash(currency) {
  const key = keyOf(currency);
  if (key === "GBX") return "GBP";
  return key || "";
}

/** One-way FX in a remark: the rate, and only when cash is not the instrument. */
export function fxRemark(pctLabel, currency, extra = "") {
  const ccy = listingCash(currency);
  // A computed rate is shown to two decimals; one that would round to zero,
  // or a range, is shown as given.
  const raw = String(pctLabel ?? "").replace(/\s*%$/, "");
  const two = /^\d+(\.\d+)?$/.test(raw) ? Number(Number(raw).toFixed(2)) : null;
  const label = two ? String(two) : raw;
  const tail = extra ? ` ${extra}` : "";
  const vs = ccy || "listing";
  if (!label) return `FX when cash ≠ ${vs}.`;
  return `FX ${label}%${tail} when cash ≠ ${vs}.`;
}
