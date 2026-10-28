// The Taiwan securities transaction tax (證券交易稅) and lot rules shared by
// the cost files of the two domestic Taiwan brokers, BankTaiwan Securities
// (./banktaiwan_cost.mjs) and Union Securities (../unionsec/unionsec_cost.mjs).
// taxes.mjs / taxMap.mjs read Trading212's disclosure, which has no Taiwan
// line, so the tax is set here from the law and the broker's own table.
//
// The tax is paid by the seller, on the sale price, once per sale order:
//   3‰    a share, a preferred share ("公司發行之股票及表明股票權利之證書或憑證")
//   1‰    an ETF, a TDR, a REIT beneficiary certificate ("公司債及其他經政府
//         核准之有價證券（如ETF等）")
//   0     a passive bond ETF: "自106年1月1日起至115年12月31日止暫停徵…以債券為
//         主要投資標的之上市及上櫃指數股票型基金受益憑證之證券交易稅。但槓桿型及
//         反向型…不適用之" (證券交易稅條例 第2條之1). Active bond ETFs (主動…)
//         are not in that article and pay 1‰. A bill of 2026-10-01 extends the
//         suspension to 2036 and adds active bond ETFs from 2027: re-read after
//         2026-12-31.
//   1.5‰  a same-day buy and sell of a share (現股當沖), "施行日期延長至2027/12/31":
//         a remark ("Same day sell tax is 50% lower."), the round trip here
//         is not a day trade.
// Rounding: "小數點以下，無條件捨去" (BankTaiwan's fee and tax table).
//
//   https://www.twfhcsec.com.tw/Activity/BusinessIntro   (二、費用與收入說明)
//   https://www.twfhcsec.com.tw/Home/faq                  (Q7, Q24)
//   https://law-out.mof.gov.tw/LawContentHistory.aspx?hid=102
//
// A round lot is 1,000 shares. Odd lots (零股) are separate orders, so an
// order of 1,500 shares is one round-lot order and one odd-lot order, each
// paying its own floor.

export const LOT = 1000;
export const TAX = { share: 0.003, fund: 0.001, bondEtf: 0, dayTrade: 0.0015 };
export const BOND_ETF_SUSPENDED_UNTIL = "2026-12-31";

const code = (s) => String(s || "").trim().toUpperCase();

// A TDR is coded 91xxxx; a REIT beneficiary certificate 01xxxT.
export const isTdr = (ticker) => /^91\d{4}$/.test(code(ticker));
export const isReit = (ticker) => /^0\d{4}T$/.test(code(ticker));
// A passive bond ETF: a fund named for bonds (債), not an active fund
// (主動…), not leveraged or inverse (code ending L or R).
export const isBondEtf = (row) =>
  code(row.type) === "ETF" && /債/.test(String(row.name || "")) && !/^主動/.test(String(row.name || "")) && !/[LR]$/.test(code(row.ticker));
// An ordinary share: a four-digit code on the exchange or the Taipei
// Exchange main board (preferred shares carry a letter, TDRs six digits).
export const isCommonShare = (row) => code(row.type) === "STOCK" && /^\d{4}$/.test(code(row.ticker));

export function taxRate(row) {
  if (isBondEtf(row)) return { rate: TAX.bondEtf, label: "ETF obligataire passif, taxe suspendue jusqu'au 31/12/2026" };
  if (code(row.type) === "ETF") return { rate: TAX.fund, label: "ETF, taxe 0,1 % à la vente" };
  if (isTdr(row.ticker)) return { rate: TAX.fund, label: "TDR, taxe 0,1 % à la vente" };
  if (isReit(row.ticker)) return { rate: TAX.fund, label: "REIT, taxe 0,1 % à la vente" };
  return { rate: TAX.share, label: "action, taxe 0,3 % à la vente" };
}

// The shares of one order split into a round-lot order and an odd-lot order.
export function splitLots(n) {
  const lots = Math.floor(n / LOT + 1e-9);
  const round = lots * LOT;
  const odd = Math.max(0, n - round);
  return { round, odd: odd > 1e-9 ? odd : 0 };
}

// The tax on the sale, one figure per sale order, each truncated.
export function saleTax(row, n, price) {
  const { rate } = taxRate(row);
  const { round, odd } = splitLots(n);
  return [round, odd].filter((q) => q > 0).reduce((sum, q) => sum + Math.floor(q * price * rate + 1e-9), 0);
}

// "Same day sell tax is x% lower." on a listed ordinary share: x is the cut
// on the sale's tax (0.3 % → 0.15 %, 50 %), at the share of the order that
// is in round lots (odd lots cannot be day-traded). Whole numbers from 10,
// one decimal below (owner's rule, 2026-10-27).
export function dayTradeRemark(row, n, emerging = false) {
  if (emerging || !isCommonShare(row)) return "";
  const { round } = splitLots(n);
  if (!(round > 0)) return "";
  const x = (100 * (TAX.share - TAX.dayTrade) * round) / (TAX.share * n);
  const pct = x >= 9.95 ? Math.round(x) : Number(x.toFixed(1));
  return pct > 0 ? `Same day sell tax is ${pct}% lower.` : "";
}
