// Frøslev-Mollerup Sparekasse (Denmark) prints no list of its own. Its
// clients trade Danish listed shares and investment fund certificates on
// Nasdaq Copenhagen, through the netbank or an adviser, so the catalogue is
// the whole Copenhagen main market book (copenhagenBook.mjs in this folder).
//
// What it sells, from its own pages (no login):
// - Basic agreement: execution only in "børsnoterede aktier, stats- og
//   realkreditobligationer og investeringsbeviser" (listed shares, bonds
//   and investment certificates), in Netbank/Mobilbank or via an adviser.
//   https://www.fmspks.dk/media/mebfmrwq/basisaftale_om_handel_med_vaerdipapirer.pdf
// - Order execution policy, annex: "Danske aktier", "Udenlandske aktier og
//   ETF'er" and "Investeringsforeningsandele" are all executed through
//   Danske Andelskassers Bank, "medlem af reguleret marked".
//   https://www.fmspks.dk/media/3u1d5kjg/7111-ordreudfoerelsespolitik.pdf
// - Price book, "Handel med værdipapirer": "Danske aktier og
//   investeringsforeningsbeviser" 0.75% (min. 200, max. 500 kr.) below
//   100,000 kr., 0.50% above; netbank "Danske aktier og investeringsbeviser"
//   0.15%, min. 38 kr.; limit orders 125 kr. per 14 days.
//   https://www.fmspks.dk/media/phvlew21/prisbog_fmspks_01032026.pdf
//
// Kept: every Nasdaq Copenhagen main market share (Large, Mid and Small
// Cap, Danish or foreign), the Copenhagen ETF, and the listed Danish
// investment funds and AIFs as FUND (the price book prices
// "investeringsforeningsbeviser" with the Danish shares). Currency is the
// line's trading currency on Nasdaq (DKK, a few EUR fund classes).
// Left out:
// - First North Denmark: no page of the savings bank names it, and it is
//   another place in broker-list.json.
// - Suspended, halted, delisted or never-traded lines (copenhagenBook.mjs).
// - Bonds, warrants and structured products, as in the other scrapers.
// No other restriction is named on the bank's pages (the investment terms
// page https://www.fmspks.dk/investeringsvilkaar and the trading terms
// https://www.fmspks.dk/media/seudybok/vilka-r-for-vaerdipapirhandel-rev-2021.pdf).
//
// Fees: https://www.fmspks.dk/media/phvlew21/prisbog_fmspks_01032026.pdf
//
//   node brokers/frslevmollerupsp/frslevmollerupsp_scraping.mjs

import { writeCopenhagenCatalogue } from "./copenhagenBook.mjs";

await writeCopenhagenCatalogue(import.meta.url, "frslevmollerupsp-parsed.json", {
  types: ["STOCK", "ETF", "FUND"],
  funds: true,
  firstNorth: false,
});
