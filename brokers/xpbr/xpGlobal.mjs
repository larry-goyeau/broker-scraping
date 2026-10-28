// The Conta Investimento Global tariff that XP and Rico print word for word
// (XP Investments US, LLC, "XP International", holds both brands' US
// accounts). Read on 2026-10-26 from the newest Wayback copies of
//   https://www.xpi.com.br/custos-operacionais/
//   https://www.rico.com.vc/custos/
//
//   "Corretagens & comissões de Ações, ETFs, REITS e ADRs", per order:
//     Operações até U$ 100                       U$ 1,00
//     Operações acima de U$ 100 até U$ 1.000     U$ 1,50
//     Operações acima de U$ 1.000 até U$ 2.000   U$ 4,30
//     Operações acima de U$ 2.000                U$ 8,60
//   "Ações fracionadas: ... o mesmo custo de corretagem".
//   "UCITs Operações de compra & venda 0,25% com mínimo de U$ 5,00".
//   Desk or adviser orders ("mesa de operações, assessor ... push"): 0.5 %,
//   minimum $10 ($5 on UCITS). Not an online order.
//   No SEC, TAF or CAT line is printed: they stay at 0.
//
//   Câmbio: "Spread regressivo que varia de 2,25% a 1,30% a depender do
//   segmento & valor transferido"; Digital & Exclusive, up to R$15,000:
//   2.25 %. IOF "De Real (BRL) para Dólar (USD) na Conta Investimentos:
//   1,10%". The global account holds dollars (deposits.mjs: BRL, USD), so
//   this is the remark, not the total.

export const XP_GLOBAL_READ_ON = "2026-10-26";

export const US_BANDS = [
  { upTo: 100, fee: 1 },
  { upTo: 1000, fee: 1.5 },
  { upTo: 2000, fee: 4.3 },
  { upTo: Infinity, fee: 8.6 },
];
export const UCITS_RATE = 0.0025;
export const UCITS_MIN = 5;
export const FX_SPREAD = 0.0225;
export const IOF_BRL_USD = 0.011;
export const FX_REMARK = "FX 2.25% + IOF 1.1% when cash ≠ USD.";

/** One US order (a share, ETF, REIT or ADR), in dollars. */
export const usOrder = (notional) => US_BANDS.find((b) => notional <= b.upTo + 1e-9).fee;

/** One UCITS ETF order, in dollars. */
export const ucitsOrder = (notional) => Math.max(UCITS_MIN, notional * UCITS_RATE);

const fr = (x) => String(x).replace(".", ",");

// price(ctx) for ../xpbr/lineCost.mjs: the US lines and the LSE UCITS lines.
export function xpGlobalPrice({ brand, usRemark = "" }) {
  return ({ us, notional, listing }) => {
    if (us) {
      const each = usOrder(notional);
      return {
        buy: each,
        sell: each,
        feeCurrency: "USD",
        basis:
          `${brand}, Conta Investimento Global (XP Investments US), barème relu le ${XP_GLOBAL_READ_ON} : ` +
          `actions, ETF, REIT et ADR U$ 1,00 jusqu'à 100 $, 1,50 jusqu'à 1 000 $, 4,30 jusqu'à 2 000 $, 8,60 au-delà, par ordre ; SEC, TAF et CAT non imprimés, comptés 0`,
        confidence: `${fr(each.toFixed(2))} $ par ordre sur ${fr(notional.toFixed(2))} $`,
        fxRemark: FX_REMARK,
        remark: usRemark,
        detail: { bands: US_BANDS },
      };
    }
    if (listing.mic === "XLON") {
      const each = ucitsOrder(notional);
      return {
        buy: each,
        sell: each,
        feeCurrency: "USD",
        basis:
          `${brand}, Conta Investimento Global (XP Investments US), barème relu le ${XP_GLOBAL_READ_ON} : ` +
          `« UCITs Operações de compra & venda 0,25% com mínimo de U$ 5,00 », par ordre ; ligne LSE en dollars`,
        confidence: each === UCITS_MIN ? "minimum de 5 $ par ordre" : `0,25 % de ${fr(notional.toFixed(2))} $`,
        fxRemark: FX_REMARK,
        detail: { rate: UCITS_RATE, min: UCITS_MIN },
      };
    }
    return { buy: null, sell: null, why: `${brand} ne publie aucun tarif pour ${listing.exchange}` };
  };
}
