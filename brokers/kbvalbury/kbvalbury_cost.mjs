// What one round trip costs at KB Valbury Sekuritas: buy n shares at price
// p, sell them back at once, in dollars. The regular account for online
// trading, through KB ARA (MTS, HTS) or VOLT+.
//
// The regular-account page, read on 2026-10-26:
//   "Biaya transaksi untuk Trading Online adalah sebagai berikut: Tipe
//   Transaksi Fee Buy Fee 0,15 % Sell Fee 0,25 %"
//     buy online     0.15% of the fill
//     sell online    0.25% of the fill
//   Remote Trading (orders through a broker, opening deposit Rp 25 million)
//   is 0.25% / 0.35%. That is not an online price and stays out.
// The FAQ (category "Biaya Transaksi dan Keterlambatan Penyelesaian")
// prints the same 0.15% / 0.25% for the online account and "Tidak ada
// biaya administrasi ataupun biaya Market Info". No floor is printed. The
// sell figure is 0.10 points above the buy, which is the 0.1% final income
// tax on a sale, so the two figures are read as all-in (broker fee, VAT,
// levy and, on the sell, the tax), as BNI, Indo Premier, CGS and FAC print
// theirs. Nothing is added on top. No e-Meterai is printed, so none is
// added. A late settlement (36% a year) is not this trip; margin is a loan
// and stays out.
//
// A share and an ETF on the exchange are the same order and no other ETF
// rate is printed, so an ETF takes these two figures. The account is in
// rupiah (RDN) and every line is IDR: no FX. Book from spreads/
// (idx-touch); a missing book stays missing. The sums are in
// ../stockbit/idxCost.mjs.
//
//   https://www.kbvalbury.com/akun-reguler
//   https://www.kbvalbury.com/faq-id (https://www.kbvalbury.com/id/ajax/faq?category=3)
//
//   node brokers/kbvalbury/kbvalbury_cost.mjs BBCA IDX IDR --shares=2000 --price=8800
//
// `roundTrip(...)` reads files, not the network.

import { idxRoundTrip, printCli, pct } from "../stockbit/idxCost.mjs";

const SCHEDULE = {
  broker: "KB Valbury Sekuritas",
  folder: "kbvalbury",
  catalogueUrl: new URL("kbvalbury-parsed.json", import.meta.url),
  url: "https://www.kbvalbury.com/akun-reguler",
  readOn: "2026-10-26",
  buy: pct("0.15"),
  sell: pct("0.25"),
  basis: "compte régulier Online Trading, KB ARA en ligne",
};

export function roundTrip(query) {
  return idxRoundTrip(SCHEDULE, query);
}

printCli(import.meta.url, roundTrip);
