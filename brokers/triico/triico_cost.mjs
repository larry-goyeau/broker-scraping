// What one round trip costs at trii Colombia: buy n shares at price p in the
// trii app, sell them back at once, in dollars. BVC lines (local market and
// the Mercado Global Colombiano) through Acciones & Valores S.A., in pesos;
// US shares and ETFs through Vector Capital, held and executed at Alpaca
// Securities LLC, in dollars.
//
// Read on 2026-10-26.
//   https://trii.co/   ("Tarifas")
//     Bolsa de Colombia   "Compra de acciones $ 12.500 + IVA", "Venta de
//                         acciones $ 12.500 + IVA"; "Operaciones con montos
//                         mayores a $5.000.000": "0.25% + IVA" each way.
//                         0.25 % of COP 5,000,000 is COP 12,500, so the fee
//                         is max(COP 12,500, 0.25 %) + IVA.
//     Bolsa de EE.UU.     "Usuario estándar: Compra o venta de acciones y
//                         ETFs 0.2%"; "Usuario triipro: ... Gratis".
//     Retiros, depósitos  free.
//   https://trii.co/acciones-estados-unidos   (the same US card)
//   https://trii.co/triipro
//     "$34.900 /mes" (or $349.000 a year): "Sin comisión en acciones
//     EE.UU" and "50% de descuento en comisiones de acciones locales".
// IVA: 19 %, the general rate (Estatuto Tributario, art. 468).
// No exchange, Deceval or SEC/TAF/CAT line is printed: 0.
//
// Plans are the client's subscription, one row each (`query.plan`):
//   standard   COP 12,500 / 0.25 % + IVA on the BVC, 0.2 % in the US
//   triipro    half that on the BVC, 0 in the US; remark "COP 34,900/month."
//
// Money. The BVC account takes pesos (deposits.mjs: COP). For the US,
// "Deposita en pesos desde PSE ... y pásalos a dólares": Acciones & Valores
// converts "a la tasa de cambio definida al momento de la operación" and
// prints no fixed spread ("no hay una tasa fija"). The dollars then stay in
// the client's Alpaca wallet. While deposits.mjs lists COP only, a US line
// is a forced conversion with no published rate: N/A. With USD listed as a
// cash currency (the Alpaca dollar wallet), the US total carries no FX and
// no FX remark (no rate is printed).
//
// Book: the BVC lines read the BVC's own leaf. A US line uses Alpaca
// Securities LLC's 606 once spreads/rule606.mjs maps "triico" to "alpaca";
// until then the quoted NBBO.
//
//   node brokers/triico/triico_cost.mjs ECOPETROL BVC COP --shares=1000 --price=2000
//   node brokers/triico/triico_cost.mjs ECOPETROL BVC COP --shares=5000 --price=2000 --plan=triipro
//   node brokers/triico/triico_cost.mjs AAPL XNAS USD --shares=10 --price=230
//   node brokers/triico/triico_cost.mjs AAPL XNAS USD --shares=10 --price=230 --plan=triipro
//
// `roundTrip(...)` reads files, not the network.

import { makeLineCost, printLineCli } from "../xpbr/lineCost.mjs";

const PAGE = "https://trii.co/";
const US_PAGE = "https://trii.co/acciones-estados-unidos";
const READ_ON = "2026-10-26";
const IVA = 0.19;
const BVC_FLAT = 12500;
const BVC_RATE = 0.0025;
const US_RATE = 0.002;

const PLANS = {
  standard: { name: "Usuario estándar", local: 1, us: US_RATE, remark: "" },
  triipro: { name: "triipro", local: 0.5, us: 0, remark: "COP 34,900/month." },
};

const fr = (x, d = 2) => Number(x).toFixed(d).replace(".", ",");

/** One BVC order, pesos, IVA included. */
export function bvcOrder(notional, plan = PLANS.standard) {
  return Math.max(BVC_FLAT, notional * BVC_RATE) * plan.local * (1 + IVA);
}

export const roundTrip = makeLineCost({
  folder: "triico",
  name: "trii",
  catalogue: new URL("triico-parsed.json", import.meta.url),
  url: PAGE,
  plans: PLANS,
  defaultPlan: "standard",
  base: "COP",
  price: ({ us, listing, notional, plan }) => {
    const chosen = PLANS[plan];
    if (us) {
      const each = notional * chosen.us;
      return {
        buy: each,
        sell: each,
        feeCurrency: "USD",
        url: US_PAGE,
        remark: chosen.remark,
        basis:
          `trii ${chosen.name}, tarifs relus le ${READ_ON} : actions et ETF américains ${chosen.us ? "0,2 % par ordre" : "sans commission"} ` +
          `(Vector Capital, compte Alpaca) ; SEC, TAF et CAT non imprimés, comptés 0`,
        forcedFx: {
          rate: null,
          why: "change forcé COP → USD par Acciones & Valores « a la tasa de cambio definida al momento de la operación » : aucun taux publié",
        },
      };
    }
    if (listing.mic === "XBOG" && listing.currency === "COP") {
      const each = bvcOrder(notional, chosen);
      const flat = notional * BVC_RATE <= BVC_FLAT;
      return {
        buy: each,
        sell: each,
        feeCurrency: "COP",
        remark: chosen.remark,
        basis:
          `trii ${chosen.name}, tarifs relus le ${READ_ON} : Bolsa de Colombia 12 500 COP + IVA par ordre, 0,25 % + IVA au-delà de 5 000 000 COP` +
          (chosen.local < 1 ? ", moins 50 % (triipro)" : "") +
          ", à l'achat et à la vente ; IVA 19 % ; aucun droit de bourse refacturé",
        confidence: `${fr(each, 0)} COP par ordre (${flat ? "forfait" : `0,25 % de ${fr(notional, 0)} COP`}, IVA comprise)`,
        detail: { flat: BVC_FLAT, rate: BVC_RATE, iva: IVA, discount: 1 - chosen.local },
      };
    }
    return { buy: null, sell: null, why: `trii ne publie aucun tarif pour ${listing.exchange} en ${listing.currency}` };
  },
});

printLineCli(roundTrip, import.meta.url);
