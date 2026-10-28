// What one round trip costs at Bulls Yatırım through Bulls Trader or its
// e-Şube: buy n shares at price p on Borsa İstanbul, sell them back at once,
// in dollars. Shares and the BIST exchange-traded funds (BYF) of the
// catalogue. VİOP, bonds, warrants and portfolio management are not this
// trip.
//
// "Ücretler ve Masraflar", read on 2026-10-26:
//
//   Commission     "PAY SENEDİ ALIM-SATIM KOMİSYON en yüksek 0.003
//                  (binde3,00)": a ceiling, no lower rate or volume scale
//                  printed. Owner's rule for a discretionary range: the
//                  maximum, 0.3 % each way. No minimum is printed, and no
//                  separate online rate.
//   Levies         "PAY PİYASASI BORSA PAYI ÜCRETİ: Borsa Payı ve Takasbank
//                  ücretleri ayrıca alınır": BIST 0.25 bp and Takasbank 4 per
//                  million on shares, 1 on BYF, each side, with BSMV.
//   BSMV           not printed; 5 % is the statutory rate.
//   Not this trip  order cancellation ("Borsa'nın aldığı ücret aynen
//                  yansıtılır"), money transfers (25 TL up to 250,000 TL),
//                  virman, postage, corporate actions at MKK's tariff,
//                  margin interest.
//
// Formula: book + 2 × amount × 0.3 % × 1.05 + 2 × amount × (0.25 bp + 4 per
// million, 1 for BYF) × 1.05, lira converted with fx.mjs. Every line is lira,
// a deposit currency: no conversion.
//
//   https://bullsyatirim.com/ucretler-ve-masraflar
//   https://www.borsaistanbul.com/files/borsa-payi-ve-diger-ucretler-tarifesi.pdf
//   https://www.takasbank.com.tr/documents/mevzuat/pay-piyasasi-ucret-tarifesi-03_02_2026.pdf
//
//   node brokers/bullsyatrm/bullsyatrm_cost.mjs GARAN BIST TRY --shares=345 --price=140
//   node brokers/bullsyatrm/bullsyatrm_cost.mjs --schedule
//
// `roundTrip(...)` reads files, not the network.

import { bistCost, printCli } from "../halkyatrm/bistCost.mjs";

const SCHEDULE = {
  folder: "bullsyatrm",
  broker: "Bulls Yatırım",
  entity: "Bulls Yatırım Menkul Değerler A.Ş.",
  url: "https://bullsyatirim.com/ucretler-ve-masraflar",
  readOn: "2026-10-26",
  sources: { tariff: "https://bullsyatirim.com/ucretler-ve-masraflar" },
  rate: 0.003,
  levies: "added",
  bsmvPrinted: false,
  remark: "",
  cash: ["TRY", "USD", "EUR"],
  basis:
    "barème Bulls relu le 2026-10-26 : « en yüksek binde 3 », plafond retenu (règle du maximum) soit 0,3 % par sens, " +
    "BSMV 5 % en sus, borsa payı et frais Takasbank « ayrıca alınır »",
};

export const roundTrip = (q) => bistCost(SCHEDULE, q);

printCli(roundTrip, SCHEDULE, import.meta.url);
