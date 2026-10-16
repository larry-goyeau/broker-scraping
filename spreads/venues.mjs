// Where a listing actually trades, resolved from whatever name a broker happened to
// print. Every broker parser needs the same answer, and needs it to agree with the
// spread cache, so the registry lives here rather than inside any one script.
//
// A spread belongs to a listing, not to a fund: the same ETF on the same exchange in
// two currencies is two order books. IE00B6R52259 trades on the LSE as SSAC in pence
// at 1.1 bp and as ISAC in dollars at 0.8 bp. So the unit of identity is the triple
// (place, ISIN, devise), and `listingKey` builds it.

// Brokers name the same place a dozen ways, so match on a normalised alias and settle
// on the MIC. Aliases under `loose` name a city rather than a book and are recorded as
// assumptions: "Frankfurt" is probably Xetra but the floor, XFRA, is a separate venue.
//
// `hours` bounds continuous trading in the exchange's own time. Most sources publish a
// snapshot of the touch, and a snapshot taken after the close is not a spread: Milan
// showed 126.52 / 129.99, or 274 bp, half an hour after the bell. The window is what
// lets a reading be marked unusable instead of published.
//
// `path` is the code a source's own URLs use where it differs from the MIC. Euronext
// serves Milan under its ETF segment, ETFP, and answers 404 for XMIL.

import fs from "node:fs";
import { apply606, qOf, usBookPerShare } from "./rule606.mjs";
export const VENUES = [
  {
    mic: "XETR",
    name: "Börse Xetra",
    source: "xetra",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Berlin" },
    exact: ["xetr", "xetra", "xet", "xetretf", "deutscheborsexetra", "ibis", "ibis2", "etr", "fse"],
    loose: ["frankfurt", "fra", "germany"],
  },
  {
    mic: "XLON",
    name: "London Stock Exchange",
    source: "lse",
    hours: { open: "08:00", close: "16:30", tz: "Europe/London" },
    exact: [
      "xlon",
      "lse",
      "lseetf",
      "lseetfs",
      "lsesets",
      "lseiob",
      "lseiob1",
      "lseintl",
      "lseaim",
      "lseseaq",
      "seaqinternational",
      "londonstockexchange",
      "uklse",
      "londonmainmarket",
      "lon",
    ],
    loose: ["london", "uk", "gb"],
  },
  {
    // CXE is the Chi-X lit book. BXE and DXE are other Cboe Europe books and are
    // not this one. Continuous trading is 08:00–16:30 London; the close after
    // that is an auction, not a spread.
    mic: "CHIX",
    name: "Cboe Europe (Chi-X)",
    source: "cxe",
    hours: { open: "08:00", close: "16:30", tz: "Europe/London" },
    exact: ["chix", "chixen", "cxe", "bcxe", "cboeeurope"],
    loose: [],
  },
  // DXE is the Dutch lit book, not Chi-X (CXE) and not BXE. Continuous
  // trading is the same window, 08:00–16:30 London. The touch is the
  // public book viewer.
  {
    mic: "CEUX",
    name: "Cboe Europe DXE",
    source: "dxe",
    hours: { open: "08:00", close: "16:30", tz: "Europe/London" },
    exact: ["ceux", "dxe", "cboeeuropedxe"],
    loose: [],
  },
  {
    mic: "XSWX",
    name: "SIX Swiss Exchange",
    source: "six",
    hours: { open: "09:00", close: "17:20", tz: "Europe/Zurich" },
    exact: [
      "xswx",
      "six",
      "swx",
      "swxetf",
      "ebs",
      "xvtx",
      "swissebsstocks",
      "sixswissexchange",
      "swissexchange",
      "swxswissexchange",
      "swxbndetf",
      "virtx",
      "vx",
    ],
    loose: ["zurich", "switzerland"],
  },
  {
    // Continuous trading ends at 16:50. The closing auction runs on to 17:05.
    // A touch taken then is the close, so the window stops when continuous
    // trading ends.
    mic: "XWAR",
    name: "Warsaw Stock Exchange",
    source: "gpw",
    hours: { open: "09:00", close: "16:50", tz: "Europe/Warsaw" },
    exact: ["xwar", "gpw", "wse", "warsaw", "warsawstockexchange"],
    loose: [],
  },
  // Continuous trading is 09:00–16:50. The closing auction runs on to 17:05.
  // The touch is the delayed NewConnect book in spreads/nc-touch.json.
  // There is no live adapter, so a later pass of spread.mjs leaves the
  // stored figure alone. It is not the main Warsaw board.
  {
    mic: "XNCO",
    name: "NewConnect",
    source: "newconnect",
    hours: { open: "09:00", close: "16:50", tz: "Europe/Warsaw" },
    exact: ["xnco", "newconnect"],
    loose: [],
  },
  {
    mic: "XPAR",
    name: "Euronext Paris",
    source: "euronext",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Paris" },
    exact: ["xpar", "euronextparis", "euronextparismonep", "sbf", "societydesboursesfrancaises", "par", "epa", "paraccess", "parmcetf"],
    loose: ["paris", "france"],
  },
  {
    mic: "XAMS",
    name: "Euronext Amsterdam",
    source: "euronext",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Amsterdam" },
    exact: ["xams", "euronextamsterdam", "aeb", "aex", "eam", "ams", "amsmcetf"],
    loose: ["amsterdam", "netherlands"],
  },
  {
    mic: "XBRU",
    name: "Euronext Brussels",
    source: "euronext",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Brussels" },
    exact: ["xbru", "euronextbrussels", "euronextbruxelles", "bru", "ebr", "enextbe", "bruaccess"],
    loose: ["brussels", "bruxelles", "belgium"],
  },
  {
    mic: "XLIS",
    name: "Euronext Lisbon",
    source: "euronext",
    hours: { open: "08:00", close: "16:30", tz: "Europe/Lisbon" },
    exact: ["xlis", "euronextlisbon", "euronextlisbonne", "lis", "eli", "lisaccess", "lisb"],
    loose: ["lisbon", "lisbonne", "portugal"],
  },
  // The American venues share one figure, and that is a fact about Reg NMS rather than a
  // shortcut. A retail order in an NMS stock is almost never executed on the listing
  // exchange: it goes to a wholesaler, which prices it against the national best bid and
  // offer. So what a round trip costs depends on the security and the size, not on
  // whether the fund happens to be listed on Arca or Nasdaq — and the source, the Rule
  // 605 monthly reports, is keyed by symbol for exactly that reason.
  //
  // They stay separate rows in the file, one per named place. The number a broker
  // is shown is still the one NBBO: the 605 of the ticker, times that broker's Q
  // when a 606 names one. A touch filed under NYSE or Nasdaq is not that number.
  //
  // Hours are the regular session, which is what the rule measures: covered orders are
  // those received during regular trading hours. Pre- and post-market cost more and are
  // not in the data.
  ...["XNAS", "ARCX", "XNYS", "XASE", "BATS"].map((mic) => ({
    mic,
    name: {
      XNAS: "Nasdaq",
      ARCX: "NYSE Arca",
      XNYS: "New York Stock Exchange",
      XASE: "NYSE American",
      BATS: "Cboe BZX",
    }[mic],
    source: "us605",
    hours: { open: "09:30", close: "16:00", tz: "America/New_York" },
    exact: {
      // "nsdq" is Al Ramz's spelling, and on its own it kept 1 113 American lines of
      // that catalogue out of reach of a book they plainly have.
      // "nsm" is the Nasdaq code on a Hargreaves Lansdown factsheet.
      // "nas" is MeDirect Belgium's Nasdaq. "nms" is MeDirect Malta's, the
      // same tape: Apple is NAS on one book and NMS on the other.
      XNAS: ["xnas", "nasdaq", "nsdq", "nmq", "ndq", "nasdaqgs", "nasdaqgm", "nasdaqcm", "nsc", "nsm", "nas", "nms"],
      // Brokers write "AMEX" for Arca more often than for NYSE American, tastytrade
      // among them: EEM, GLD, IAU and VOO all come through labelled AMEX and all four
      // list on Arca. The alias sits here rather than on XASE because that is what the
      // catalogues mean by it, and because the figure is the same either way.
      ARCX: ["arcx", "arca", "nysearca", "amex", "americanamex", "usamex", "pcq", "nysemkt"],
      XNYS: ["xnys", "nyse", "newyorkstockexchange", "nys", "nsy", "usnyse"],
      XASE: ["xase", "nyseamerican", "americanstockexchange", "ase"],
      BATS: ["bats", "batsz", "batsbzx", "cboebzx", "bzx", "cboe"],
    }[mic],
    loose: { XNAS: ["nasdaqus"], ARCX: [], XNYS: ["newyork"], XASE: [], BATS: ["cboe"] }[mic],
  })),

  {
    mic: "XMIL",
    name: "Euronext Milan",
    source: "euronext",
    path: "ETFP",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Rome" },
    exact: ["xmil", "borsaitaliana", "mil", "miletf", "bvme", "bvmeetf", "etfp", "mta", "mtaa", "bgem", "milaim"],
    loose: ["milan", "milano", "italy", "italianse", "italiansecontinuous"],
  },
  // EuroTLX is Borsa Italiana's own MTF, not the Milan book (MTAA, BGEM,
  // ETFP). Bond-X and Equity trade continuously 09:00–17:30 Rome, after a
  // call that runs 07:30–09:00. The touch is the ETLX page on the same
  // Euronext site, and a Milan figure is not written here.
  {
    mic: "ETLX",
    name: "EuroTLX",
    source: "eurotlx",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Rome" },
    exact: ["eurotlx", "etlx"],
    loose: [],
  },
  // Oslo moved onto Euronext's platform. The delayed book is the same live.euronext.com
  // page as Paris. Brokers still write "OSL" or, Admirals, "Norway (NASDAQ)" — that last
  // string must not fall through to the American Nasdaq.
  {
    mic: "XOSL",
    name: "Oslo Børs",
    source: "euronext",
    hours: { open: "09:00", close: "16:20", tz: "Europe/Oslo" },
    exact: ["xosl", "osl", "ose", "oslo", "oslostockexchange", "oslobors", "oslobrs", "euronextoslo", "norwaynasdaq", "omxno"],
    loose: ["norway"],
  },
  // Euronext Dublin. Brokers still write ISE / ISED; the live book is the XMSM segment
  // on the same live.euronext.com page as Paris.
  {
    mic: "XMSM",
    name: "Euronext Dublin",
    source: "euronext",
    hours: { open: "08:00", close: "16:30", tz: "Europe/Dublin" },
    exact: ["xmsm", "xdub", "ise", "ised", "euronextdublin", "irishstockexchange", "irishmainmarket", "irl"],
    loose: ["dublin", "ireland"],
  },
  // The public Nordic screener prints the best bid and the best ask for
  // every share and ETF on Nasdaq Iceland. One touch, not a session
  // average. Continuous trading is 09:30–15:25 Reykjavik. First North
  // is another book.
  {
    mic: "XICE",
    name: "Nasdaq Iceland",
    source: "xice",
    hours: { open: "09:30", close: "15:25", tz: "Atlantic/Reykjavik" },
    exact: ["xice", "nasdaqiceland", "omxice"],
    loose: [],
  },
  // The same public screener, category FIRST_NORTH rather than the main
  // market. Five names, their own book. Continuous trading is the same
  // window as Nasdaq Iceland, 09:30–15:25 Reykjavik.
  {
    mic: "FNIS",
    name: "Nasdaq First North Iceland",
    source: "fnis",
    hours: { open: "09:30", close: "15:25", tz: "Atlantic/Reykjavik" },
    exact: ["fnis", "firstnorthisland", "nasdaqfirstnorthisland"],
    loose: [],
  },
  // The same public Nordic screener, for the Copenhagen main market and
  // its ETFs. Continuous trading is 09:00–16:55 Copenhagen. First North
  // is another book.
  {
    mic: "XCSE",
    name: "Nasdaq Copenhagen",
    source: "xcse",
    hours: { open: "09:00", close: "16:55", tz: "Europe/Copenhagen" },
    // "nasdaqcopenhagen" is the whole comdirect label. Left to the substring pass it
    // matches "nasdaq" first and the line is priced on the American book.
    exact: ["xcse", "copenhagen", "omk", "omxcop", "cph", "denmarkcse", "nasdaqcopenhagen"],
    loose: [],
  },
  // The same public screener, category FIRST_NORTH rather than the main
  // market. Continuous trading is the same window as Nasdaq Copenhagen,
  // 09:00–16:55. The book is in kroner. It is not the main Copenhagen book.
  {
    mic: "DSME",
    name: "First North Denmark",
    source: "fndk",
    hours: { open: "09:00", close: "16:55", tz: "Europe/Copenhagen" },
    exact: ["dsme", "fndk", "csefndk", "firstnorthdenmark"],
    loose: [],
  },
  // The same public Nordic screener, for the Stockholm main market and its
  // ETFs. Admirals writes "Sweden (NASDAQ)"; that must not fall through
  // to the American Nasdaq. Continuous trading is 09:00–17:25 Stockholm. The book is in
  // kronor, except Verisure, which the screener quotes in euro. First
  // North is another book.
  {
    mic: "XSTO",
    name: "Nasdaq Stockholm",
    source: "xsto",
    hours: { open: "09:00", close: "17:25", tz: "Europe/Stockholm" },
    exact: ["xsto", "stockholm", "sto", "sfb", "omxsto", "nasdaqstockholm", "swedennasdaq"],
    loose: [],
  },
  // The same public screener, category FIRST_NORTH rather than the main
  // market. Continuous trading is the same window as Nasdaq Stockholm,
  // 09:00–17:25. The book is in kronor. It is not the main Stockholm book.
  {
    mic: "SSME",
    name: "First North Stockholm",
    source: "fnse",
    hours: { open: "09:00", close: "17:25", tz: "Europe/Stockholm" },
    exact: ["ssme", "fnse", "ssefnse", "firstnorthstockholm", "firstnorthsweden"],
    loose: [],
  },
  // Avanza writes XXXX for this book. The public prices page prints Köp
  // and Sälj for the seven names. The session followed here is
  // 09:00–17:30 Stockholm. There is no live adapter, so a later pass of
  // spread.mjs leaves the stored figure alone.
  {
    mic: "XXXX",
    name: "beQuoted",
    source: "bequoted",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Stockholm" },
    exact: ["xxxx", "bequoted"],
    loose: [],
  },
  // Pre-trade file, at least fifteen minutes late. Continuous trading is
  // 08:00–16:30 London. Pence and pounds are one book. AQSE is the growth
  // market, not the pan-European Aquis order book.
  {
    mic: "AQSE",
    name: "Aquis Stock Exchange",
    source: "aqse",
    hours: { open: "08:00", close: "16:30", tz: "Europe/London" },
    exact: ["aqse", "aquis", "plusmarketsgroupformerlyofex", "plusmarkets", "ofex"],
    loose: [],
  },
  // Admirals writes "Finland (NASDAQ)"; that must not fall through to
  // the American Nasdaq. MeDirect writes HEL. Helsinki's clock is an hour ahead of Stockholm and the session is the
  // same window: 10:00–18:25 Helsinki. The screener quotes that book in
  // euro. First North is another book.
  {
    mic: "XHEL",
    name: "Nasdaq Helsinki",
    source: "xhel",
    hours: { open: "10:00", close: "18:25", tz: "Europe/Helsinki" },
    exact: ["xhel", "helsinki", "hse", "omxhex", "omxh", "hex", "hel", "nasdaqhelsinki", "finlandnasdaq"],
    loose: [],
  },
  // The same public screener, category FIRST_NORTH rather than the main
  // market. Continuous trading is the same window as Nasdaq Helsinki,
  // 10:00–18:25. The book is in euro. It is not the main Helsinki book.
  // Saxo writes HSE_FN. Avanza writes FNFI. The official MIC is FSME.
  {
    mic: "FSME",
    name: "First North Helsinki",
    source: "fnfi",
    hours: { open: "10:00", close: "18:25", tz: "Europe/Helsinki" },
    exact: ["fsme", "fnfi", "hsefn", "firstnorthhelsinki", "firstnorthfinland"],
    loose: [],
  },
  // Best bid and best ask on the exchange's own MiFIR page, 15 minutes
  // late, refreshed about once a minute. Continuous trading is
  // 09:00–16:20 Prague. A name that is only on the MTF (XPRM) still
  // uses that touch: brokers write one Prague label for both boards.
  {
    mic: "XPRA",
    name: "Prague Stock Exchange",
    source: "xpra",
    hours: { open: "09:00", close: "16:20", tz: "Europe/Prague" },
    exact: ["xpra", "prague", "pra", "psecz", "praguestockexchange"],
    loose: [],
  },
  // Delayed bid/ask on the exchange's own instrument page, 15 minutes late. No monthly
  // XLM-style file is published for free.
  {
    mic: "XWBO",
    name: "Wiener Börse",
    source: "vienna",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Vienna" },
    exact: [
      "xwbo",
      "vie",
      "vienna",
      "wienerborse",
      "wienerboerse",
      "boersewien",
      "wien",
      "viennastockexchange",
      "austriavie",
      "wen",
      "vse",
    ],
    loose: ["austria"],
  },
  // Delayed best bid and best ask on the exchange's own instrument page.
  // Continuous matching is 09:15–15:15. Auction-only names are a different
  // method and are not this book. The quote names the currency; a second
  // counter is its own book.
  {
    mic: "XLJU",
    name: "Ljubljana Stock Exchange",
    source: "ljse",
    hours: { open: "09:15", close: "15:15", tz: "Europe/Ljubljana" },
    exact: ["xlju", "ljse", "ljubljana", "ljubljanskaborza", "ljubljanastockexchange"],
    loose: [],
  },
  // The public instrument list prints the best bid and the best ask in francs.
  // One touch, not a session average. Neon sends every line here.
  {
    mic: "XBRN",
    name: "BX Swiss",
    source: "bxswiss",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Zurich" },
    exact: ["xbrn", "bxswiss", "bx", "bern", "berne", "boersebern"],
    loose: [],
  },
  // Retail German books. They publish a delayed pre-trade file under MiFID rather than
  // a public live book, which is why they sat in KNOWN_UNSOURCED: the file was never
  // wired, not because the data is paid. Hours run into the evening, which is the
  // point of the venues; a snapshot taken then is still a live book.
  {
    mic: "XGAT",
    name: "Tradegate",
    source: "tradegate",
    hours: { open: "07:30", close: "22:00", tz: "Europe/Berlin" },
    exact: ["xgat", "xgrm", "tgat", "tdg", "tradegate", "tradegateexchange", "tradegatebsx"],
    loose: [],
  },
  {
    mic: "XMUN",
    name: "gettex",
    source: "gettex",
    hours: { open: "08:00", close: "22:00", tz: "Europe/Berlin" },
    exact: ["xmun", "gettex", "gettex2", "munc", "mund", "mun", "munich", "bayerischeboerse", "boersemuenchen"],
    loose: [],
  },
  // The Munich floor, not gettex. MUNA is the regulated book and MUNB the
  // Freiverkehr; both are 15-minute MiFID files. "Munich" stays on gettex:
  // that is the name ING and comdirect already use for XMUN.
  {
    mic: "XMUC",
    name: "Börse München",
    source: "munich",
    hours: { open: "08:00", close: "22:00", tz: "Europe/Berlin" },
    exact: ["xmuc", "munchen", "boersemunchen", "muna", "munb"],
    loose: [],
  },
  {
    mic: "LSEX",
    name: "LS Exchange",
    source: "lsex",
    hours: { open: "07:30", close: "23:00", tz: "Europe/Berlin" },
    exact: ["lsex", "lsx", "ls", "langschwarz", "langundschwarz", "lsexchange", "langschwarzexchange"],
    loose: [],
  },
  // Systematic internaliser of the same house. Brokers write LSIN; the MIC on the
  // delayed CSV is LSSI. Same RPC host as LS Exchange, different file (lstcpretrades).
  {
    mic: "LSSI",
    name: "Lang & Schwarz International",
    source: "lsin",
    hours: { open: "07:30", close: "23:00", tz: "Europe/Berlin" },
    exact: ["lssi", "lsin", "langschwarzinternational", "lstc", "lstradecenter"],
    loose: [],
  },
  {
    mic: "XQTX",
    name: "Börse Düsseldorf",
    source: "quotrix",
    hours: { open: "08:00", close: "22:00", tz: "Europe/Berlin" },
    exact: ["xqtx", "quotrix", "dusc", "dusd", "dus", "xdus", "dusseldorf", "duesseldorf"],
    loose: [],
  },
  // Frankfurt floor (XFRA), not Xetra. Same delayed NDJSON tape as Tradegate, product
  // DFRA-pretrade. Swissquote writes FWB / FWB2; IBKR the same.
  {
    mic: "XFRA",
    name: "Börse Frankfurt",
    source: "frankfurt",
    hours: { open: "08:00", close: "22:00", tz: "Europe/Berlin" },
    exact: ["xfra", "fwb", "fwb2", "boersefrankfurt", "fra", "fft"],
    loose: [],
  },
  // Hamburg and Hannover share BÖAG's delayed CSVs with Quotrix. HAMQ is the busy
  // Hamburg tape; HAMB/HAMA and HANB/HANA are the regulated / Freiverkehr slices.
  {
    mic: "XHAM",
    name: "Börse Hamburg",
    source: "hamburg",
    hours: { open: "08:00", close: "22:00", tz: "Europe/Berlin" },
    exact: ["xham", "ham", "hamburg", "boersehamburg", "hama", "hamb", "hamq"],
    loose: [],
  },
  {
    mic: "XHAN",
    name: "Börse Hannover",
    source: "hannover",
    hours: { open: "08:00", close: "22:00", tz: "Europe/Berlin" },
    exact: ["xhan", "han", "hannover", "boersehannover", "hana", "hanb"],
    loose: [],
  },
  // Scalable's home book. BÖAG runs it at Hannover under HANC (regulated) and HAND
  // (Freiverkehr); Scalable writes SEIX. Not XHAN: that tape is HANA/HANB on the
  // BÖAG index. EIX publishes its own 15-minute file, 24 hours of slices.
  {
    mic: "HANC",
    name: "European Investor Exchange (EIX)",
    source: "eix",
    hours: { open: "08:00", close: "22:00", tz: "Europe/Berlin" },
    exact: ["seix", "eix", "hanc", "hand", "europeaninvestorexchange"],
    loose: [],
  },
  // Trade Republic Bestpreis. Not a MIC and not a neighbour's tape: the live
  // touch is what TR prints on TIB, stored by `traderepublic-touches.mjs`.
  {
    mic: "TIB",
    name: "Trade Republic (TIB)",
    source: "tib",
    hours: { open: "08:00", close: "22:00", tz: "Europe/Berlin" },
    exact: ["tib"],
    loose: [],
  },
  // ING's own Direkthandel quote, code TGT. Not Tradegate and not gettex:
  // the order may be sent on to one of them, but the fiche prints this
  // book. Open 08:00–22:00. `ing_touch.mjs` reads it.
  {
    mic: "TGT",
    name: "Direkthandel",
    source: "direkthandel",
    hours: { open: "08:00", close: "22:00", tz: "Europe/Berlin" },
    exact: ["direkthandel", "tgt"],
    loose: [],
  },
  // The listing page is behind Cloudflare; the 15-minute MiFIR tape is not, once a
  // browser has opened the index. XSTU is the cash book Swissquote writes SWB / SWB2.
  {
    mic: "XSTU",
    name: "Börse Stuttgart",
    source: "stuttgart",
    hours: { open: "08:00", close: "22:00", tz: "Europe/Berlin" },
    exact: ["xstu", "swb", "swb2", "stuttgart", "boersestuttgart"],
    loose: [],
  },
  // The daily bulletin prints propuestas de compra y venta. That is the
  // touch. A last trade is not used. S/ is soles, US$ is dollars.
  {
    mic: "XLIM",
    name: "Bolsa de Valores de Lima",
    source: "lima",
    hours: { open: "08:30", close: "14:52", tz: "America/Lima" },
    exact: ["xlim", "bolsadevaloresdelima", "lima"],
    loose: [],
  },
  // The official INTRA tape is paid. The public site still prints a 20-minute delayed
  // touch (posturaCompra / posturaVenta) for the local board and the SIC, which is the
  // book CapTrader and IBKR write MEXI. XMEX is the ISO MIC; XBMV is a vendor spelling.
  {
    mic: "XMEX",
    name: "Bolsa Mexicana",
    source: "bmv",
    hours: { open: "08:30", close: "15:00", tz: "America/Mexico_City" },
    exact: ["xmex", "xbmv", "mexi", "bmv", "mexico", "mexicanstockexchange", "bolsamexicana"],
    loose: [],
  },
  // BIVA's licensed feed sells the best bid and offer. The public site prints
  // a delayed last price. The touch read here is the two-sided quote TradingView
  // streams for the BIVA board, in pesos. Continuous trading is 08:30–14:50.
  {
    mic: "BIVA",
    name: "BIVA",
    source: "biva",
    hours: { open: "08:30", close: "14:50", tz: "America/Mexico_City" },
    exact: ["biva"],
    loose: [],
  },
  // Continuous matching is 10:00–16:55 in São Paulo. The closing call and
  // the after-hours session are another book. The touch is the delayed
  // bid and ask on the Interactive Brokers portal. There is no live
  // adapter, so a later pass of spread.mjs leaves the stored figure
  // alone. Another currency, if the portal prints one, is its own book.
  // https://www.b3.com.br/pt_br/solucoes/plataformas/puma-trading-system/para-participantes-e-traders/horario-de-negociacao/acoes/
  {
    mic: "BVMF",
    name: "B3 São Paulo",
    source: "b3",
    hours: { open: "10:00", close: "16:55", tz: "America/Sao_Paulo" },
    exact: ["bvmf", "b3", "bovespa", "bmfbovespa", "xbsp", "bvsp"],
    loose: [],
  },
  // BYMA publishes the best bid and offer on a licensed feed. The touch read
  // here is the two-sided quote TradingView streams for the Buenos Aires
  // board. Pesos and dollars are two lines. Continuous trading is 10:30–17:00.
  {
    mic: "XBUE",
    name: "BYMA",
    source: "byma",
    hours: { open: "10:30", close: "17:00", tz: "America/Argentina/Buenos_Aires" },
    exact: ["xbue", "byma", "bcba", "xmev", "merval"],
    loose: [],
  },
  // Canada publishes no free pre-trade book of its own: TMX serves bid and ask only to a
  // signed-in watchlist, Cboe Canada behind a member key, and there is no Rule 605 here.
  // The touch does reach the screen of anyone holding a Questrade account, and a figure a
  // broker displays is still a fact about the exchange, so the adapter reads it there. It
  // names the venue it came from, which is what lets these four stay four.
  //
  // TSX and Cboe Canada share the `.TO` suffix in that symbol space, so the venue is
  // settled by the feed the quote arrives under, never by the ticker.
  {
    mic: "XTSE",
    name: "Toronto Stock Exchange",
    source: "questrade",
    hours: { open: "09:30", close: "16:00", tz: "America/Toronto" },
    exact: ["xtse", "tsx", "toronto", "tor", "torontostockexchange"],
    loose: [],
  },
  {
    mic: "XTSX",
    name: "TSX Venture",
    source: "questrade",
    hours: { open: "09:30", close: "16:00", tz: "America/Toronto" },
    exact: ["xtsx", "tsxv", "tsxventure", "tsv", "venture"],
    loose: [],
  },
  // Free only on a 15-minute delay: the account is entitled to TSX and TSX Venture live,
  // and reads these two late. Same book either way, an older look at it.
  {
    mic: "XCNQ",
    name: "Canadian Securities Exchange",
    source: "questrade",
    hours: { open: "09:30", close: "16:00", tz: "America/Toronto" },
    // "cse" is deliberately absent: Saxo writes it for Copenhagen. `resolveVenue` splits
    // on the krone before letting it reach here.
    exact: ["xcnq", "cnsx", "canadiansecuritiesexchange", "canadiannationalstockexchange"],
    loose: [],
  },
  // Brokers write PURE for this book. Questrade returns it on the CSE feed
  // with a .CN suffix, which is not the Toronto book and not a CSE-listed
  // line stored under XCNQ.
  {
    mic: "PURE",
    name: "Pure Trading",
    source: "pure",
    hours: { open: "09:30", close: "16:00", tz: "America/Toronto" },
    exact: ["pure", "puretrading"],
    loose: [],
  },
  {
    mic: "NEOE",
    name: "Cboe Canada",
    source: "questrade",
    hours: { open: "09:30", close: "16:00", tz: "America/Toronto" },
    exact: ["neoe", "neo", "cboecanada"],
    loose: [],
  },

  // The Gulf. Four of these markets publish their own touch for nothing — the
  // whole board in one call, bid, ask and both volumes. Tadawul sells that book.
  // The touch kept here is the delayed bid and ask on the Interactive Brokers
  // portal, both sides present, never a frozen mark and never the last trade.
  //
  // Abu Dhabi and Dubai moved to a Monday–Friday week in January 2022, so the default
  // applies. Manama and Muscat did not, and trade Sunday to Thursday; `days` says so,
  // or `sessionState` would call a live Sunday closed and a dead Friday open.
  {
    mic: "XADS",
    name: "Abu Dhabi Securities Exchange",
    source: "adx",
    hours: { open: "10:00", close: "15:00", tz: "Asia/Dubai" },
    exact: ["xads", "adx", "adsm", "abudhabi", "abudhabisecuritiesexchange", "abudhabisecurities"],
    loose: [],
  },
  {
    mic: "XDFM",
    name: "Dubai Financial Market",
    source: "dfm",
    hours: { open: "10:00", close: "15:00", tz: "Asia/Dubai" },
    // "kse" is not an alias of this board. Swissquote's six dirham lines are
    // cross-listings and stay here; Boubyan's dinar lines are Boursa Kuwait.
    // resolveVenue splits the two.
    exact: ["xdfm", "dfm", "dubai", "dubaifinancialmarket"],
    loose: [],
  },
  {
    // Continuous matching is 09:00–13:00 Kuwait time, Sunday to Thursday.
    // The closing auction starts at 13:00. The public quote is in fils;
    // the ratio is the dinar book. A counter the quote names in another
    // currency is its own book.
    mic: "XKUW",
    name: "Boursa Kuwait",
    source: "kuwait",
    hours: { open: "09:00", close: "13:00", tz: "Asia/Kuwait", days: ["Sun", "Mon", "Tue", "Wed", "Thu"] },
    exact: ["xkuw", "boursakuwait", "kuwaitstockexchange", "kuwait"],
    loose: [],
  },
  {
    mic: "XBAH",
    name: "Bahrain Bourse",
    source: "bhb",
    hours: { open: "09:30", close: "13:00", tz: "Asia/Bahrain", days: ["Sun", "Mon", "Tue", "Wed", "Thu"] },
    exact: ["xbah", "bhb", "bahrain", "bahrainbourse"],
    loose: [],
  },
  {
    mic: "XMUS",
    name: "Muscat Stock Exchange",
    source: "msx",
    hours: { open: "10:00", close: "13:00", tz: "Asia/Muscat", days: ["Sun", "Mon", "Tue", "Wed", "Thu"] },
    exact: ["xmus", "msx", "msm", "muscat", "muscatstockexchange", "muscatsecuritiesmarket"],
    loose: [],
  },
  {
    mic: "XSAU",
    name: "Tadawul",
    source: "tadawul",
    hours: { open: "10:00", close: "15:00", tz: "Asia/Riyadh", days: ["Sun", "Mon", "Tue", "Wed", "Thu"] },
    exact: ["xsau", "tadawul", "tdwl", "saudiexchange", "saudi"],
    loose: [],
  },
  {
    mic: "XCAI",
    name: "The Egyptian Exchange",
    source: "egx",
    hours: { open: "10:00", close: "14:30", tz: "Africa/Cairo", days: ["Sun", "Mon", "Tue", "Wed", "Thu"] },
    exact: ["xcai", "egx", "case", "cairo", "egyptianexchange", "theegyptianexchange"],
    loose: [],
  },
  // Cash session only. The touch is the official book, MarketDepth on the BSE and
  // quote-equity on the NSE. A last trade is not a substitute when one side is missing.
  {
    mic: "XNSE",
    name: "National Stock Exchange of India",
    source: "nse",
    hours: { open: "09:15", close: "15:30", tz: "Asia/Kolkata" },
    exact: ["xnse", "nse", "nseindia", "nationalstockexchangeofindia"],
    loose: [],
  },
  {
    mic: "XBOM",
    name: "BSE",
    source: "bse",
    hours: { open: "09:15", close: "15:30", tz: "Asia/Kolkata" },
    // "bse" is not listed here. Lightyear writes it for Brussels, and `resolveVenue`
    // only sends an INR line (or an IN ISIN) to Bombay.
    exact: ["xbom", "bombay", "bombaystockexchange", "bseindia", "bseltd"],
    loose: [],
  },
  // Cash session 09:00–15:30 Seoul. The touch is Naver's KRX askingPrice.
  // Nextrade is a second book at /api/stock/NXT/ and is not this venue.
  // XKRX is the stock market (KOSPI), where the ETFs and ETNs also trade.
  {
    mic: "XKRX",
    name: "KOSPI",
    source: "kospi",
    hours: { open: "09:00", close: "15:30", tz: "Asia/Seoul" },
    exact: ["xkrx", "kospi"],
    loose: [],
  },
  {
    mic: "XKOS",
    name: "KOSDAQ",
    source: "kosdaq",
    hours: { open: "09:00", close: "15:30", tz: "Asia/Seoul" },
    exact: ["xkos", "kosdaq"],
    loose: [],
  },
  // Continuous matching is 09:00–13:25 Taipei time. The closing call runs
  // 13:25–13:30 and is not this book. The touch is the exchange's own
  // five-deep quote. Taipei Exchange (TPEx) is a different book.
  {
    mic: "XTAI",
    name: "Taiwan Stock Exchange",
    source: "twse",
    hours: { open: "09:00", close: "13:25", tz: "Asia/Taipei" },
    exact: ["xtai", "twse", "taiwanstockexchange"],
    loose: [],
  },
  // Same session as the Taiwan Stock Exchange: continuous matching
  // 09:00–13:25 Taipei time, closing call 13:25–13:30. The touch is the
  // same five-deep quote, on the otc channel. That channel is this
  // exchange, not the American OTC book.
  {
    mic: "ROCO",
    name: "Taipei Exchange",
    source: "tpex",
    hours: { open: "09:00", close: "13:25", tz: "Asia/Taipei" },
    exact: ["roco", "tpex", "taipeiexchange", "gretai"],
    loose: [],
  },
  // Continuous trading is 10:00–16:45 Auckland time. The public quote is
  // about twenty minutes behind the tape. A stamp inside that window is
  // the touch. The closing auction starts at 16:45.
  {
    mic: "XNZE",
    name: "NZX",
    source: "nzx",
    hours: { open: "10:00", close: "16:45", tz: "Pacific/Auckland" },
    exact: ["xnze", "nzx", "nzsenationalmarket"],
    loose: [],
  },
  // Cash session 09:30–16:00 New York. The touch is the signed-in IBKR quote,
  // and only when field 6509 says the book is live. A delayed or frozen mark
  // is not this venue.
  {
    mic: "OTCM",
    name: "OTC Markets",
    source: "otc",
    hours: { open: "09:30", close: "16:00", tz: "America/New_York" },
    exact: ["otcm", "otc", "otcmarkets", "pink", "otcmkts", "otcqx", "otcqb", "pinx", "grey", "ootc", "otherotc", "ootcotherotc", "usotc"],
    loose: [],
  },
  // Cash session 09:30–11:30 and 13:00–15:00 Shanghai time. The hours here are
  // the outer window; the lunch break is not a second session this file can name.
  // The touch is Sina's bid and ask, not the last trade.
  {
    mic: "XSHG",
    name: "Shanghai Stock Exchange",
    source: "sina",
    hours: { open: "09:30", close: "15:00", tz: "Asia/Shanghai" },
    // "sse" is also Stockholm's old initials. Saxo and eToro write it on Nordic
    // lines. resolveVenue sends a krona line, and Verisure's euro line, to Stockholm.
    exact: ["xshg", "shanghai", "shanghaisc", "sehkntl", "sehkstar"],
    loose: [],
  },
  {
    mic: "XSHE",
    name: "Shenzhen Stock Exchange",
    source: "sina",
    hours: { open: "09:30", close: "15:00", tz: "Asia/Shanghai" },
    exact: ["xshe", "szse", "shenzhen", "shenzhensc", "chinext", "sehkszse"],
    loose: [],
  },

  // The two spot books a crypto line can be priced against without a key. Neither has a
  // MIC: these four letters are this file's own, chosen to sit in the same column as the
  // real ones. Nineteen catalogues in this repository carry crypto, 711 distinct coins
  // between them, and no broker among them publishes the book it executes against — so
  // the reference market is the only thing there is to measure, and it is a fact about
  // the market rather than about any one broker.
  //
  // No hours: the book never closes, and `sessionState` answers `null` rather than
  // `false` for a venue without them, which is what lets a snapshot be taken at any hour.
  //
  // Neither covers the shelf alone — 49 % of the coins here are on Coinbase and 53 % on
  // Binance, 72 % on one or the other — so a crypto line is read on both and stored
  // twice, like a fund listed on two exchanges.
  {
    mic: "BINA",
    name: "Binance",
    source: "binance",
    hours: null,
    exact: ["binance", "bina"],
    loose: [],
  },
  // Alpaca runs its own crypto venue rather than routing to one of the two above,
  // and publishes its touch without a key. It is a book in its own right and a
  // much wider one — 3.4 bp on bitcoin against Binance's 0.0013 — so it is stored
  // beside them and read only by the broker it belongs to.
  {
    mic: "ALPA",
    name: "Alpaca",
    source: "alpaca",
    hours: null,
    exact: ["alpaca", "alpa"],
    loose: [],
  },
  // Lightyear names Kraken on every coin. The public ticker is the touch, no key,
  // and it is stored beside the two reference books rather than mixed into the
  // fallback: handing Kraken to Quantfury would price a venue that broker does
  // not cross.
  {
    mic: "KRKN",
    name: "Kraken",
    source: "kraken",
    hours: null,
    exact: ["kraken", "krkn"],
    loose: [],
  },
  // Kraken's xStock fiche prints the underlying share's bid and ask. That
  // book is Kraken's, so it stays off the US tape: the same ISIN on Nasdaq
  // keeps the 605 figure.
  {
    mic: "XSTK",
    name: "xStock",
    source: "krakenx",
    hours: { open: "09:30", close: "16:00", tz: "America/New_York" },
    exact: ["xstock", "xstk"],
    loose: [],
  },
  {
    mic: "CBSE",
    name: "Coinbase",
    source: "coinbase",
    hours: null,
    exact: ["coinbase", "cbse", "gdax", "coinbasepro"],
    loose: [],
  },
  // Cash session 10:00–16:00 Sydney. The touch is the Interactive Brokers
  // reading in spreads/au-touch.json. There is no live adapter, so a
  // later pass of spread.mjs leaves the stored figure alone.
  {
    mic: "XASX",
    name: "ASX",
    source: "asx",
    hours: { open: "10:00", close: "16:00", tz: "Australia/Sydney" },
    exact: ["xasx", "asx", "asxnationalmarket", "australia", "australiansecuritiesexchange"],
    loose: [],
  },
  {
    mic: "CHIA",
    name: "Cboe Australia",
    source: "chia",
    hours: { open: "10:00", close: "16:00", tz: "Australia/Sydney" },
    exact: ["chia", "chixau", "cboeaustralia", "cxa"],
    loose: [],
  },
  // Cash session 09:00–17:30 Madrid. The touch is the Interactive Brokers
  // reading in spreads/es-touch.json. There is no live adapter, so a
  // later pass of spread.mjs leaves the stored figure alone.
  {
    mic: "XMAD",
    name: "Bolsa de Madrid",
    source: "bme",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Madrid" },
    exact: ["xmad", "xmce", "mce", "bm", "bme", "madrid", "spain", "sibe", "sibespanishstockexchangeinterconnectionsyst", "sistemadeinterconexionbursatilespanol", "mad"],
    loose: [],
  },
  // Cash session 09:00–15:00 Tokyo. The touch is the delayed Interactive
  // Brokers reading in spreads/jp-touch.json. There is no live adapter,
  // so a later pass of spread.mjs leaves the stored figure alone.
  {
    mic: "XTKS",
    name: "Tokyo",
    source: "tsej",
    hours: { open: "09:00", close: "15:00", tz: "Asia/Tokyo" },
    exact: ["xtks", "xjpx", "tyo", "tokyo", "tsej"],
    loose: [],
  },
  // Continuous matching is 09:00–11:30 and 12:30–15:25 in Nagoya. The
  // hours here are the outer window; lunch and the closing auction are
  // not a second session this file can name. The touch is the delayed
  // Nagoya book in spreads/nagoya-touch.json. There is no live adapter,
  // so a later pass of spread.mjs leaves the stored figure alone.
  {
    mic: "XNGO",
    name: "Nagoya",
    source: "nagoya",
    hours: { open: "09:00", close: "15:30", tz: "Asia/Tokyo" },
    exact: ["xngo", "xnag", "nag", "nagoya"],
    loose: [],
  },
  // Continuous matching is 09:00–12:00 and 13:00–17:00 Singapore time.
  // The touch is the exchange's own file, read into spreads/sgx-touch.json.
  // There is no live adapter, so a later pass of spread.mjs leaves the
  // stored figure alone. Lunch is not a second window here: the touch
  // file already drops a stamp that falls inside it.
  {
    mic: "XSES",
    name: "Singapore Exchange",
    source: "sgx",
    hours: { open: "09:00", close: "17:00", tz: "Asia/Singapore" },
    exact: ["sgx", "xses", "singapore", "sgxst"],
    loose: [],
  },
  // Continuous matching is 09:30–12:00 and 13:00–16:00 Hong Kong time.
  // The touch is the Sina reading in spreads/hk-touch.json. There is no
  // live adapter, so a later pass of spread.mjs leaves the stored figure
  // alone. A renminbi counter is a second book on the same ISIN: 00388 is
  // the Hong Kong dollar line, 80388 the offshore renminbi line.
  {
    mic: "XHKG",
    name: "Hong Kong",
    source: "hk",
    hours: { open: "09:30", close: "16:00", tz: "Asia/Hong_Kong" },
    exact: ["hkex", "sehk", "hongkong", "hks", "xhkg"],
    loose: [],
  },
  // Continuous matching is 09:00–12:30 and 14:30–16:45 in Kuala Lumpur.
  // The touch is the KLSE Screener reading in spreads/bursa-touch.json.
  // There is no live adapter, so a later pass of spread.mjs leaves the
  // stored figure alone. Lunch is not a second window here: the touch
  // file is only written during continuous matching.
  {
    mic: "XKLS",
    name: "Bursa Malaysia",
    source: "bursa",
    hours: { open: "09:00", close: "16:45", tz: "Asia/Kuala_Lumpur" },
    exact: ["myx", "xkls", "malaysia", "bursa", "bursamy", "malay", "klse"],
    loose: [],
  },
  // Continuous matching is 09:30–12:00 and 13:00–14:45 in Manila.
  // The touch is the exchange page in spreads/pse-touch.json. There is
  // no live adapter, so a later pass of spread.mjs leaves the stored
  // figure alone. "PSE" stays out of the aliases: Prague uses the same
  // three letters, and resolveVenue sends a peso line here.
  {
    mic: "XPHS",
    name: "Philippine Stock Exchange",
    source: "pse",
    hours: { open: "09:30", close: "14:45", tz: "Asia/Manila" },
    exact: ["xphs", "philippines", "manila"],
    loose: [],
  },
  {
    // ISO 10383. Continuous matching is 09:15–11:30 and 13:00–14:30. The
    // hours here are the outer window; the lunch break and the opening and
    // closing auctions are not a second session this file can name. The
    // touch reader skips those.
    mic: "XSTC",
    name: "HOSE",
    source: "hose",
    hours: { open: "09:15", close: "14:30", tz: "Asia/Ho_Chi_Minh" },
    exact: ["hose", "hsx", "xstc", "hochiminh"],
    loose: [],
  },
  {
    // UPCOM is the Hanoi unlisted board and has no MIC of its own. UPCM is
    // this project's code for it, so a later HNX book (HSTC) stays separate.
    // Continuous matching is 09:00–11:30 and 13:00–15:00. The hours here are
    // the outer window; the lunch break is not a second session this file
    // can name.
    mic: "UPCM",
    name: "UPCOM",
    source: "upcom",
    hours: { open: "09:00", close: "15:00", tz: "Asia/Ho_Chi_Minh" },
    exact: ["upcom"],
    loose: [],
  },
  {
    // ISO 10383. Continuous matching is 09:00–11:30 and 13:00–14:30.
    // The hours here are the outer window; the lunch break is not a
    // second session this file can name. The touch reader skips it.
    mic: "HSTC",
    name: "Hanoi Stock Exchange",
    source: "hnx",
    hours: { open: "09:00", close: "14:30", tz: "Asia/Ho_Chi_Minh" },
    exact: ["hstc", "hnx", "hanoi"],
    loose: [],
  },
  {
    // Continuous matching is 09:00–12:00 and 13:30–16:00 Jakarta time.
    // The hours here are the outer window; the lunch break is not a
    // second session this file can name. The touch reader skips it.
    // The book is the rupiah quote. A counter in another currency is
    // its own book.
    mic: "XIDX",
    name: "Indonesia Stock Exchange",
    source: "idx",
    hours: { open: "09:00", close: "16:00", tz: "Asia/Jakarta" },
    exact: ["xidx", "idx", "jakarta", "indonesia"],
    loose: [],
  },
  {
    // ISO 10383: Warsaw's GlobalConnect MTF, not the main board (XWAR) and
    // not NewConnect (XNCO). Continuous trading is 09:05–17:05. The opening
    // auction is the same minute the session starts; the reader uses the
    // two-sided book, not the auction print.
    mic: "XGLO",
    name: "GlobalConnect",
    source: "globalconnect",
    hours: { open: "09:05", close: "17:05", tz: "Europe/Warsaw" },
    exact: ["xglo", "globalconnect"],
    loose: [],
  },
  // Budapest cash market, including the BETa foreign names on the same
  // page. Continuous trading runs from 09:00 to 17:00. The touch is the
  // MiFID pre-trade table, fifteen minutes delayed, in the row's own
  // currency. Bucharest writes BVB, not BET: BET in the catalogues is this
  // exchange. BUX here is the Budapest MIC brokers print, not the Dutch broker.
  {
    mic: "XBUD",
    name: "Budapest Stock Exchange",
    source: "budapest",
    hours: { open: "09:00", close: "17:00", tz: "Europe/Budapest" },
    exact: ["xbud", "budapest", "budapeststockexchange", "bux", "bet"],
    loose: [],
  },
  // Luxembourg Stock Exchange. Continuous trading is 09:00–17:30. The touch
  // is the free delayed pre-trade file: one resting bid and one resting ask.
  // Euro MTF (EMTF) is the same exchange's other segment. A name that has a
  // regulated-market book is read there; a name that only quotes on the MTF
  // keeps that book. The two are never averaged.
  {
    mic: "XLUX",
    name: "Luxembourg Stock Exchange",
    source: "luxse",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Luxembourg" },
    exact: ["xlux", "luxse", "luxembourg", "lux", "emtf"],
    loose: [],
  },
  // Bucharest regular market. Continuous trading is 10:00–17:45. The
  // touch is the BVB book, read late because the exchange site does not
  // answer from here and its delayed service refuses the call. BET is
  // Budapest, not this book.
  {
    mic: "XBSE",
    name: "Bucharest Stock Exchange",
    source: "bvb",
    hours: { open: "10:00", close: "17:45", tz: "Europe/Bucharest" },
    exact: ["xbse", "bvb", "bucharest", "buchareststockexchange"],
    loose: [],
  },
  // Johannesburg equity market. Continuous trading is 09:00–16:50, then
  // a closing auction to 17:00. The touch is the JSE book. Prices are
  // quoted in cents; the stored spread is the same ratio in rand.
  {
    mic: "XJSE",
    name: "Johannesburg Stock Exchange",
    source: "jse",
    hours: { open: "09:00", close: "17:00", tz: "Africa/Johannesburg" },
    exact: ["jse", "xjse", "johannesburg", "johannesburgstockexchange"],
    loose: [],
  },
  // Nairobi Securities Exchange. Continuous trading is 09:30–15:00.
  // The touch is the NSEKE book, in shillings. The official feed is licensed.
  {
    mic: "XNAI",
    name: "Nairobi Securities Exchange",
    source: "nairobi",
    hours: { open: "09:30", close: "15:00", tz: "Africa/Nairobi" },
    exact: ["xnai", "nseke", "nairobi", "nairobisecuritiesexchange"],
    loose: [],
  },
  // Nigerian Exchange. Continuous trading is 09:30–15:50 Lagos, then the
  // pre-close. The touch is the NSENG book. The official quote API is licensed.
  {
    mic: "XNGN",
    name: "Nigerian Exchange",
    source: "ngx",
    hours: { open: "09:30", close: "15:50", tz: "Africa/Lagos" },
    exact: ["nseng", "xngn", "nigeria", "ngx", "nigerianexchange"],
    loose: [],
  },
  // Borsa Istanbul equity session, 10:00–18:00. The touch is the BIST
  // book in lira. The exchange sells the top of book.
  {
    mic: "XIST",
    name: "Borsa Istanbul",
    source: "bist",
    hours: { open: "10:00", close: "18:00", tz: "Europe/Istanbul" },
    exact: ["bist", "xist", "istanbul", "istanbulstockexchange", "borsaistanbul"],
    loose: [],
  },
  // Bulgarian Stock Exchange, Sofia. Continuous trading is 10:10–16:55.
  // The touch is the BSESOF book, in euro. Bombay's BSE is not this book.
  {
    mic: "XBUL",
    name: "Bulgarian Stock Exchange",
    source: "sofia",
    hours: { open: "10:10", close: "16:55", tz: "Europe/Sofia" },
    exact: ["bsesof", "xbul", "sofia", "bulgarianstockexchange"],
    loose: [],
  },
  // Bolsa de Valores de Colombia. Pre-open from 09:15, continuous trading
  // 09:30–16:00 Bogota. The touch is the BVC book in Colombian pesos. A
  // catalogue line in another currency gets that ratio when the ISIN has
  // no second line on this board.
  {
    mic: "XBOG",
    name: "Bolsa de Valores de Colombia",
    source: "bvc",
    hours: { open: "09:30", close: "16:00", tz: "America/Bogota" },
    exact: ["bvc", "colombia", "xbog", "bolsadevaloresdecolombia"],
    loose: [],
  },
  // Euronext Athens. Continuous trading is 10:30–17:00. The touch is the
  // delayed pre-trade file: the best bid and the best ask, rank 1. The
  // derivatives book (XADE) is not written here. EN.A is used only when
  // the name has no main-market quote.
  {
    mic: "XATH",
    name: "Athens Stock Exchange",
    source: "athex",
    hours: { open: "10:30", close: "17:00", tz: "Europe/Athens" },
    exact: ["ath", "xath", "athens", "athex", "enax", "euronextathens"],
    loose: [],
  },
  // Nasdaq Baltic. One continuous session, 10:00–15:55 local, on each of the
  // three exchanges. The touch is the exchange's own bid and ask on the
  // share list. A Tallinn book is not written onto Riga or Vilnius.
  {
    mic: "XTAL",
    name: "Nasdaq Tallinn",
    source: "xtal",
    hours: { open: "10:00", close: "15:55", tz: "Europe/Tallinn" },
    exact: ["xtal", "tallinn", "ntallinn", "omxtse", "tallinnstockexchange"],
    loose: [],
  },
  {
    mic: "XRIS",
    name: "Nasdaq Riga",
    source: "xris",
    hours: { open: "10:00", close: "15:55", tz: "Europe/Riga" },
    exact: ["xris", "riga", "nriga", "omxrse", "rigastockexchange"],
    loose: [],
  },
  {
    mic: "XLIT",
    name: "Nasdaq Vilnius",
    source: "xlit",
    hours: { open: "10:00", close: "15:55", tz: "Europe/Vilnius" },
    exact: ["xlit", "vilnius", "nvilnius", "omxvse", "vilniusstockexchange"],
    loose: [],
  },
  // Cyprus Stock Exchange. Continuous trading is 10:30–17:00. The touch is
  // the exchange's own bid and ask. Copenhagen's CSE and the Canadian CSE
  // are other books and are not written here.
  {
    mic: "XCYS",
    name: "Cyprus Stock Exchange",
    source: "csecy",
    hours: { open: "10:30", close: "17:00", tz: "Europe/Nicosia" },
    exact: ["csecy", "xcys", "cyprus", "cyprusstockexchange"],
    loose: [],
  },
  // Bratislava. Continuous trading is 11:00–15:30. The touch is level 1 of
  // the exchange's own delayed pre-trade file, in the currency that file
  // names. A zloty listing is not given the euro book.
  {
    mic: "XBRA",
    name: "Bratislava Stock Exchange",
    source: "bsse",
    hours: { open: "11:00", close: "15:30", tz: "Europe/Bratislava" },
    exact: ["bsse", "xbra", "bratislava", "bratislavastockexchange"],
    loose: [],
  },
  // Stock Exchange of Thailand. Two continuous sessions, 10:00–12:30 and
  // 14:00–16:30. The touch is the SET book. An NVDR (.R) is its own book.
  // The board is baht. A catalogue line in another currency gets that
  // ratio when the name has no second currency on this board.
  {
    mic: "XBKK",
    name: "Stock Exchange of Thailand",
    source: "set",
    hours: { open: "10:00", close: "16:30", tz: "Asia/Bangkok" },
    exact: ["set", "xbkk", "thailand", "stockexchangeofthailand"],
    loose: [],
  },
  // Pakistan Stock Exchange. Continuous trading is 09:32–15:30 Karachi,
  // Monday to Thursday. The touch is the PSX book, in rupees. A catalogue
  // line in another currency gets that ratio when the name has no second
  // currency on this board. The rupee line is kept even when no broker files it.
  {
    mic: "XKAR",
    name: "Pakistan Stock Exchange",
    source: "psx",
    hours: { open: "09:32", close: "15:30", tz: "Asia/Karachi" },
    exact: ["psx", "xkar", "karachi", "pakistan", "pakistanstockexchange"],
    loose: [],
  },
  // Moscow Exchange. Continuous trading is 10:00–18:45. The touch is the
  // TQBR book. MOEX names the ruble SUR; it is stored as RUB. A dollar,
  // yuan or euro book of the same ISIN is kept even when no broker files
  // that currency. The odd-lot board is not written here.
  {
    mic: "MISX",
    name: "Moscow Exchange",
    source: "moex",
    hours: { open: "10:00", close: "18:45", tz: "Europe/Moscow" },
    exact: ["moex", "misx", "moscow", "moscowexchange"],
    loose: [],
  },
  // Tel Aviv. Continuous trading is 10:00–17:14, Sunday to Thursday.
  // The touch is the TASE book. Prices arrive in agorot; the ratio is
  // stored in ILA and in ILS. Another catalogue currency gets that
  // ratio when the name has no second book. Agorot stay even when no
  // broker files them.
  {
    mic: "XTAE",
    name: "Tel Aviv Stock Exchange",
    source: "tase",
    hours: { open: "10:00", close: "17:14", tz: "Asia/Jerusalem" },
    exact: ["tase", "xtae", "telaviv", "telavivstockexchange"],
    loose: [],
  },
  // Casablanca. The opening fixing is 09:30, then continuous trading
  // until 15:20. The touch is the exchange's own bid and ask, in
  // dirhams. A catalogue line in another currency gets that ratio
  // when the name has no second book.
  {
    mic: "XCAS",
    name: "Casablanca Stock Exchange",
    source: "xcas",
    hours: { open: "09:30", close: "15:20", tz: "Africa/Casablanca" },
    exact: ["casablanca", "xcas", "csema", "boursedecasablanca"],
    loose: [],
  },
];

// A coin has no ISIN, so `spread.json` keys it the way the front already does, by
// `CRYPTO:<base>`. Both books are stored in dollars: Coinbase quotes USD outright and
// Binance's USDT leg is read as one, which is the market's own convention and costs a
// few hundredths of a basis point.
export const CRYPTO_MICS = ["CBSE", "BINA"];
// Named venues that only the broker who crosses them should request. Alpaca's
// book is wider than spot; Lightyear's is Kraken. Neither belongs in the
// fallback that answers a broker who named no tape.
export const CRYPTO_OWN_MIC = { alpaca: "ALPA", lightyear: "KRKN" };
export const cryptoMicsFor = (broker) => {
  const own = CRYPTO_OWN_MIC[String(broker || "").toLowerCase()];
  return own ? [...CRYPTO_MICS, own] : CRYPTO_MICS;
};
// Every crypto book `spread.mjs` knows how to read. Wider than `CRYPTO_MICS` on
// purpose: a broker that names no venue could be on Binance or Coinbase and is
// answered with the wider of those two, but it is certainly not on Alpaca's
// venue unless it is Alpaca, nor on Kraken unless it is Lightyear. Folding
// either into the fallback would hand that touch to Quantfury, which mirrors
// the spot books instead.
export const CRYPTO_READ_MICS = [...CRYPTO_MICS, "ALPA", "KRKN"];
export const CRYPTO_CCY = "USD";
export const cryptoId = (base) => `CRYPTO:${String(base || "").toUpperCase()}`;
export const isCryptoId = (id) => String(id || "").startsWith("CRYPTO:");

// Places that exist in broker catalogues but publish no free pre-trade book, or have
// no adapter yet. Naming them keeps a gap distinguishable from a lookup that failed,
// and keeps a neighbour's number from being borrowed to fill it.
export const KNOWN_UNSOURCED = [
  // Freedom24 and Elana name the group without the city. Euronext runs a separate book
  // per place, so there is no single one to point at: guessing Paris would repeat the
  // mistake this file exists to prevent.
  {
    match: ["euronext", "euronexteu"],
    name: "Euronext, place non précisée",
    why: "le broker ne dit pas laquelle des places Euronext",
  },
  // A country, not a book. The improved 605 times the broker's Q still
  // belongs to that tape. IEX stays in the next entry: no retail flow is
  // routed there, and the 605 table is not keyed by it.
  {
    match: ["us", "usa", "unitedstates"],
    name: "places américaines, sans précision",
    why: "le broker ne dit pas laquelle",
  },
  {
    match: ["chicago", "nygif", "iex", "iexg", "eprl"],
    name: "places américaines, sans précision",
    why: "le broker ne dit pas laquelle",
  },
  // IBKR / CapTrader / Mexem write TSE for Toronto; Swissquote / DEGIRO / eToro
  // write TSE for Tokyo. `resolveVenue` splits on CAD/CA vs JPY/JP before
  // falling through to this leftover.
  { match: ["tse"], name: "TSE (Toronto ou Tokyo)", why: "le sigle nomme les deux places" },
  // Saxo writes CSE for Copenhagen; Questrade, DEGIRO and N26 write it for the Canadian
  // Securities Exchange. `resolveVenue` splits on the currency and the ISIN before
  // falling through to this leftover.
  { match: ["cse"], name: "CSE (Canada ou Copenhague)", why: "le sigle nomme les deux places" },
  { match: ["krx"], name: "Korea Exchange", why: "adaptateur non écrit" },
  {
    match: ["aeqlit", "xats", "alpha"],
    name: "Alpha Exchange",
    why: "bande officielle payante (TMX Datalinx), pas de carnet public",
  },
  // IBKR / Mexem / WHS write VALUE. That is IB Value Exchange, IBKR's own
  // OTC / leftover destination — no MIC, no site, no public tape. Not IBKR ATS
  // (IBKRATS is NMS midpoint) and not a neighbour's book.
  { match: ["value"], name: "IB Value Exchange", why: "gré à gré IBKR, pas de carnet public" },
  {
    match: ["omx", "nasdaqomx", "nasdaqnordic"],
    name: "Nasdaq Nordic",
    why: "le broker ne dit pas laquelle des places nordiques",
  },
  // Nasdaq Dubai shares a building with DFM and not a board: its own site shows last
  // price and no touch, and the DFM feed that covers the emirate stops at DFM's own
  // securities. Tadawul publishes a ticker rich in everything except the two numbers
  // a spread is made of.
  { match: ["difx", "nasdaqdubai", "nasdaqdxb"], name: "Nasdaq Dubai", why: "pas de carnet public" },
  { match: ["crypto", "trd", "tradias", "tradiasotc", "zerohash", "zerohashe"], name: "Crypto", why: "gré à gré, pas un carnet unique" },
  // BET in the catalogues is Budapest (BÉT), which has its own book.
  { match: ["pse"], name: "PSE (Prague ou Manille)", why: "le sigle nomme les deux places" },
  // Xontro, the Berlin floor, stopped on 1 January 2026 and Börse Berlin
  // did not replace it. The file that still updates is Equiduct, a different
  // book, and it is not written here.
  { match: ["xber", "berlin", "boerseberlin"], name: "Börse Berlin", why: "Xontro arrêté le 1 janvier 2026, pas de carnet de remplacement" },
  // Börse Berlin's retail book. Avanza's site fills France, Belgium, the
  // Netherlands and Portugal here, whatever Euronext the list still prints.
  { match: ["xeqt", "equiduct"], name: "Equiduct", why: "adaptateur non écrit" },
  { match: ["xkuw", "kuwait", "boursakuwait", "kuwaitstockexchange"], name: "Boursa Kuwait", why: "adaptateur non écrit" },
  // KASE prints a best bid and a best offer, and on 22 Sep 2026 the bid was
  // above the offer on 43 of the 49 names that had both. Those are the day's
  // extremes, not the two sides of one book, so there is nothing to store.
  {
    match: ["kase", "xkaz"],
    name: "Kazakhstan Stock Exchange",
    why: "pas de touche simultanée : le bid et l'offre publiés se croisent",
  },
];

// "Deutsche Börse Xetra" has to reduce to the same token as "deutscheborsexetra", so
// strip the diacritics before dropping everything that is not a letter or a digit.
export const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Passes run from the most specific evidence to the least, and the last one only fires
// on names too verbose to match whole: Davy writes "Euronext - formerly Amsterdam (AEX
// Effectenbeurs)", which no alias list will ever equal.
export function resolveVenue(row) {
  const mic = norm(row.mic).toUpperCase();
  if (mic) {
    const hit = VENUES.find((v) => v.mic === mic);
    if (hit) return { venue: hit, assumed: false };
  }
  const names = [row.exchange, row.venue, row.exchangeName, row.market, row.mic]
    .filter(Boolean)
    .map(norm)
    .filter(Boolean);

  // A bare "NASDAQ" priced in kroner is Copenhagen. TORM's dollar line is the
  // American one; the kroner line is not. "Nasdaq Copenhagen" is an exact alias
  // and never reaches this test.
  if (names.includes("nasdaq") && String(row.currency || "").toUpperCase() === "DKK") {
    return { venue: VENUES.find((v) => v.mic === "XCSE"), assumed: false };
  }
  // IBKR's BVL is Euronext Lisbon. The same three letters are also Lima.
  // A euro line, or a Portuguese ISIN, is Lisbon. A sol line is Lima.
  // With no currency the code stays unresolved, so a lookup by the raw
  // exchange code still finds the catalogue row.
  if (names.includes("bvl")) {
    const ccy = String(row.currency || "").toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    if (ccy === "EUR" || isin.startsWith("PT")) {
      return { venue: VENUES.find((v) => v.mic === "XLIS"), assumed: false };
    }
    if (ccy === "PEN" || ccy === "USD" || isin.startsWith("PE")) {
      return { venue: VENUES.find((v) => v.mic === "XLIM"), assumed: false };
    }
  }

  for (const n of names) {
    const hit = VENUES.find((v) => v.exact.includes(n));
    if (hit) return { venue: hit, assumed: false };
  }
  for (const n of names) {
    const hit = VENUES.find((v) => v.loose.includes(n));
    if (hit) return { venue: hit, assumed: true };
  }
  // "OTC", "OTC Markets", "OTCQX", "Pink Sheets" are one book. Matching the
  // whole string only ever catches the spellings written out in `exact`.
  if (names.some((n) => n === "otc" || n.startsWith("otc") || n === "pink" || n.startsWith("pink"))) {
    return { venue: VENUES.find((v) => v.mic === "OTCM"), assumed: false };
  }
  if (names.includes("bse")) {
    const ccy = String(row.currency || "").toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    if (ccy === "INR" || isin.startsWith("IN")) {
      return { venue: VENUES.find((v) => v.mic === "XBOM"), assumed: false };
    }
  }
  if (names.includes("tse")) {
    const ccy = String(row.currency || "").toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    if (ccy === "CAD" || isin.startsWith("CA")) {
      return { venue: VENUES.find((v) => v.mic === "XTSE"), assumed: false };
    }
    if (ccy === "JPY" || isin.startsWith("JP")) {
      return { venue: VENUES.find((v) => v.mic === "XTKS"), assumed: false };
    }
  }
  // The same split for CSE. Danish evidence wins first: a Copenhagen line sent to the
  // Canadian adapter would come back with a real figure for the wrong book, while a
  // Canadian line left with Copenhagen only comes back empty.
  if (names.includes("cse")) {
    const ccy = String(row.currency || "").toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    if (ccy === "DKK" || /^(DK|FO|GL)/.test(isin)) {
      return { venue: VENUES.find((v) => v.mic === "XCSE"), assumed: false };
    }
    if (ccy === "CAD" || isin.startsWith("CA")) {
      return { venue: VENUES.find((v) => v.mic === "XCNQ"), assumed: false };
    }
    // LankaBangla writes CSE for the Chittagong Stock Exchange, in taka.
    if (ccy === "BDT" || isin.startsWith("BD")) {
      return {
        venue: null,
        unsourced: { name: "Chittagong Stock Exchange", why: "pas de carnet public", match: ["cse"] },
      };
    }
    // CAL writes CSE for the Colombo Stock Exchange, in rupees.
    if (ccy === "LKR" || isin.startsWith("LK")) {
      return {
        venue: null,
        unsourced: { name: "Colombo Stock Exchange", why: "pas de carnet public", match: ["cse"] },
      };
    }
  }
  // TradingView and COL write PSE for the Philippine Stock Exchange. Prague
  // uses the same three letters. A peso line or a Philippine ISIN is
  // Manila. A koruna line or a Czech ISIN is Prague.
  if (names.includes("pse")) {
    const ccy = String(row.currency || "").toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    if (ccy === "PHP" || isin.startsWith("PH")) {
      return { venue: VENUES.find((v) => v.mic === "XPHS"), assumed: false };
    }
    if (ccy === "CZK" || isin.startsWith("CZ")) {
      return { venue: VENUES.find((v) => v.mic === "XPRA"), assumed: false };
    }
  }
  // Stockholm is the only Nordic book quoted in kronor. Helsinki is euro,
  // Copenhagen Danish kroner, Iceland króna. A broker that writes the group
  // and prices the line in SEK has named Stockholm. SSE is the same split:
  // Saxo and eToro write it for Stockholm, and it is also Shanghai's initials.
  if (names.some((n) => n === "omx" || n === "nasdaqomx" || n === "nasdaqnordic")) {
    const ccy = String(row.currency || "").toUpperCase();
    if (ccy === "SEK") return { venue: VENUES.find((v) => v.mic === "XSTO"), assumed: false };
  }
  if (names.includes("sse")) {
    const ccy = String(row.currency || "").toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    if (ccy === "SEK" || (ccy === "EUR" && isin && !isin.startsWith("CN"))) {
      return { venue: VENUES.find((v) => v.mic === "XSTO"), assumed: false };
    }
    return { venue: VENUES.find((v) => v.mic === "XSHG"), assumed: false };
  }
  // Boubyan writes KSE for Boursa Kuwait, in dinars. Swissquote writes KSE for
  // six dirham cross-listings that really are on the DFM board.
  if (names.includes("kse")) {
    const ccy = String(row.currency || "").toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    if (ccy === "AED") return { venue: VENUES.find((v) => v.mic === "XDFM"), assumed: false };
    if (ccy === "KWD" || isin.startsWith("KW")) {
      return { venue: VENUES.find((v) => v.mic === "XKUW"), assumed: false };
    }
  }
  for (const n of names) {
    const gap = KNOWN_UNSOURCED.find((u) => u.match.includes(n));
    if (gap) return { venue: null, unsourced: gap };
  }
  // AJ Bell's CDI is its own quote. The label starts with "CDI", and
  // "CDI NASDAQ" must not fall through to Nasdaq. The book is stored
  // under CDI plus the underlying MIC, never on that MIC itself.
  if (names.some((n) => n === "cdi" || n.startsWith("cdi"))) {
    const label = String(row.exchange || row.venue || row.exchangeName || "").trim();
    const underlying = label.replace(/^cdi\s*/i, "").trim().toUpperCase();
    const home = VENUES.find((v) => v.mic === underlying);
    return {
      venue: {
        mic: `CDI${underlying}`,
        name: label || `CDI ${underlying}`,
        source: "ajbellcdi",
        hours: home?.hours || null,
        exact: [],
        loose: [],
      },
      assumed: false,
    };
  }
  for (const n of names) {
    if (n.length < 8) continue;
    // A city inside a long name beats the group name around it, or "Euronext -
    // formerly Amsterdam" would resolve to the ambiguous group instead of Amsterdam.
    const hit = VENUES.find((v) =>
      [...v.exact, ...v.loose].some((a) => a.length >= 5 && n.includes(a))
    );
    if (hit) return { venue: hit, assumed: true };
    const gap = KNOWN_UNSOURCED.find((u) => u.match.some((a) => a.length >= 5 && n.includes(a)));
    if (gap) return { venue: null, unsourced: gap };
  }
  return { venue: null };
}

// The key any broker parser uses to find its listing in the spread cache. An
// unresolved venue still gets a key, built from the name as given, so two brokers
// naming the same unknown place the same way at least agree with each other.
export function listingKey(row) {
  const { venue, assumed, unsourced } = resolveVenue(row);
  const isin = String(row.isin || "").toUpperCase();
  const currency = String(row.currency || "").toUpperCase() || "?";
  const place = venue?.mic || norm(row.exchange || row.venue || row.exchangeName) || "?";
  return { key: `${place}|${isin}|${currency}`, venue, assumed: Boolean(assumed), unsourced };
}

// A label that names several books. Currency and ISIN are tried first. What is
// left is the book closest to the broker's own country, among those the label
// confuses — not a guess at a city the label never meant.
const US_MICS = ["XNAS", "ARCX", "XNYS", "XASE", "BATS"];
// Rule 605 is the listed US tape. OTC does not file one; its book is the touch.
const NMS_MICS = new Set([...US_MICS, "IEXG", "MEMX"]);
export function isListedUsTape(mic) {
  return NMS_MICS.has(String(mic || "").toUpperCase());
}
// KOSPI (XKRX) and KOSDAQ (XKOS). A broker that writes KRX has not said which.
// Both sit in Seoul, so the closer one is not a choice.
const KOREA_MICS = ["XKRX", "XKOS"];

// Cities the ambiguous labels mix up. [lat, lon] of the exchange.
const CONFUSED = {
  euronext: [
    ["XPAR", 48.8566, 2.3522],
    ["XAMS", 52.3676, 4.9041],
    ["XBRU", 50.8503, 4.3517],
    ["XLIS", 38.7223, -9.1393],
    ["XMSM", 53.3498, -6.2603],
    ["XMIL", 45.4642, 9.19],
    ["XOSL", 59.9139, 10.7522],
  ],
  nasdaqnordic: [
    ["XSTO", 59.3293, 18.0686],
    ["XCSE", 55.6761, 12.5683],
    ["XHEL", 60.1699, 24.9384],
    ["XICE", 64.1466, -21.9426],
  ],
  tse: [
    ["XTSE", 43.6532, -79.3832],
    ["XTKS", 35.6762, 139.6503],
  ],
  cse: [
    ["XCNQ", 43.6532, -79.3832],
    ["XCSE", 55.6761, 12.5683],
  ],
  pse: [
    ["XPRA", 50.0755, 14.4378],
    ["XPHS", 14.5995, 120.9842],
  ],
};

// Capitals, or the city the broker-list country is read from. UK is London.
const COUNTRY_AT = {
  AD: [42.5063, 1.5218], AE: [24.4539, 54.3773], AM: [40.1872, 44.5152], AR: [-34.6037, -58.3816],
  AT: [48.2082, 16.3738], AU: [-33.8688, 151.2093], BA: [43.8563, 18.4131], BE: [50.8503, 4.3517],
  BG: [42.6977, 23.3219], BH: [26.2235, 50.5876], BN: [4.9031, 114.9398], BR: [-15.7975, -47.8919],
  BS: [25.0443, -77.3504], BW: [-24.6282, 25.9231], BZ: [17.251, -88.759], CA: [43.6532, -79.3832],
  CH: [46.948, 7.4474], CL: [-33.4489, -70.6693], CN: [39.9042, 116.4074], CO: [4.711, -74.0721],
  CY: [35.1856, 33.3823], CZ: [50.0755, 14.4378], DE: [52.52, 13.405], DK: [55.6761, 12.5683],
  EE: [59.437, 24.7536], EG: [30.0444, 31.2357], ES: [40.4168, -3.7038], FI: [60.1699, 24.9384],
  FR: [48.8566, 2.3522], GE: [41.7151, 44.8271], GH: [5.6037, -0.187], GR: [37.9838, 23.7275],
  HK: [22.3193, 114.1694], HR: [45.815, 15.9819], HU: [47.4979, 19.0402], ID: [-6.2088, 106.8456],
  IE: [53.3498, -6.2603], IL: [32.0853, 34.7818], IN: [19.076, 72.8777], IS: [64.1466, -21.9426],
  IT: [41.9028, 12.4964], JP: [35.6762, 139.6503], KE: [-1.2921, 36.8219], KR: [37.5665, 126.978],
  KW: [29.3759, 47.9774], KZ: [51.1694, 71.4491], LI: [47.141, 9.5209], LT: [54.6872, 25.2797],
  LU: [49.6116, 6.1319], LV: [56.9496, 24.1052], ME: [42.4304, 19.2594], MT: [35.8989, 14.5146],
  MU: [-20.1609, 57.5012], MX: [19.4326, -99.1332], MY: [3.139, 101.6869], NA: [-22.5609, 17.0658],
  NG: [9.0765, 7.3986], NL: [52.3676, 4.9041], NO: [59.9139, 10.7522], NZ: [-41.2865, 174.7762],
  OM: [23.588, 58.3829], PE: [-12.0464, -77.0428], PH: [14.5995, 120.9842], PK: [33.6844, 73.0479],
  PL: [52.2297, 21.0122], PT: [38.7223, -9.1393], QA: [25.2854, 51.531], RO: [44.4268, 26.1025],
  RS: [44.7866, 20.4489], SA: [24.7136, 46.6753], SC: [-4.6796, 55.492], SE: [59.3293, 18.0686],
  SG: [1.3521, 103.8198], SI: [46.0569, 14.5058], SK: [48.1486, 17.1077], TH: [13.7563, 100.5018],
  TR: [41.0082, 28.9784], TW: [25.033, 121.5654], TZ: [-6.7924, 39.2083], UA: [50.4501, 30.5234],
  UK: [51.5074, -0.1278], US: [40.7128, -74.006], UY: [-34.9011, -56.1645], VN: [21.0278, 105.8342],
  ZA: [-33.9249, 18.4241], ZW: [-17.8252, 31.0335],
};

const slug = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// Same names the page uses, so the country is the one shown for that folder.
const BROKER_NAME = {
  saxo: "Saxo Bank", avanza: "Avanza", virtuamericas: "Virtu Americas LLC", lloyds: "Lloyds",
  halifax: "Halifax", bimi: "Intesa Sanpaolo IMI Securities Corp.", bhmuae: "BHM Capital",
  bunq: "Bunq", century: "Century Financial", boursobank: "BoursoBank", alramz: "Al Ramz Capital",
  boubyan: "Boubyan", tastytrade: "Tastytrade", bri: "BRI Danareksa Sekuritas", bux: "BUX",
  davy: "Davy Select", oanda: "OANDA TMS", plum: "Plum", easyequities: "EasyEquities",
  efocs: "EuroFinance", elana: "Elana Trading", siebert: "Siebert Financial", sogotrade: "SogoTrade",
  swissquote: "Swissquote", thndr: "Thndr", tiger: "Tiger Brokers", traderepublic: "Trade Republic",
  tradestation: "TradeStation", tradeup: "TradeUP", tradezero: "TradeZero", tradier: "Tradier",
  vested: "Vested Finance", vivid: "Vivid Money",
  webull: "Webull", WHSelfInvest: "WH SelfInvest", xtb: "XTB", fortuneo: "Fortuneo",
  fidelity: "Fidelity", lynx: "LYNX+", vanguarduk: "Vanguard UK", choice: "Choice",
  "m.stock": "m.Stock", megabank: "Mega Bank", zsedirect: "ZSE Direct", vps: "VPS",
  vndirect: "VNDirect", vietcap: "Vietcap", rakutenjp: "Rakuten Japan", spare: "SpareBank",
  rakutenma: "Rakuten MY", profitmart: "Profitmart", dbs: "DBS Taiwan", "e.sun": "E.SUN",
  scsb: "SCSB", standardchartered: "Standard Chartered Taiwan", unionbank: "Union Bank of Taiwan",
  sinopac: "SinoPac", taishin: "Taishin", ctbc: "CTBC", moomoo: "moomoo Japan", disnat: "Desjardins",
  ing: "ING Deutschland", prime: "Prime Transaction", mirae: "Mirae", bsc: "BSC", bdm: "BDM",
  rabee: "Rabee Securities", pinetree: "Pinetree", cfgbank: "CFG Bank", wafabourse: "Wafa Bourse",
  cih: "CIH", marketech: "Marketech Focus", fsmonesg: "FSMOne SG", fsmonehk: "FSMOne HK",
  fsmonemy: "FSMOne MY", gotradeglobal: "Gotrade Global", gotradeid: "Gotrade Indonesia",
  iol: "InvertirOnline", triipe: "Trii Perou", bks: "BKS Bank", public: "Public.com",
  erste: "Erste", iguk: "IG UK", igue: "IG UE", icici: "ICICI", hdfcsky: "HDFC Sky", futu: "Futu",
};
const BROKER_LIST = {
  mirae: "Mirae Asset Securities Vietnam", bsc: "BIDV Securities (BSC)",
  boursobank: "BoursoBank (Boursorama)", iol: "InvertirOnline (IOL)", bks: "BKS Bank Slovenia",
  erste: "Erste Biuro Maklerskie", iguk: "IG", igue: "IG Europe", triipe: "Trii Peru",
  icici: "ICICI Direct", futu: "Futu / moomoo HK",
};

let brokerCountries = null;
function brokerCountry(folder) {
  if (!brokerCountries) {
    brokerCountries = new Map();
    const file = new URL("../broker-list.txt", import.meta.url);
    const rows = fs.readFileSync(file, "utf8").split("\n").slice(1).map((line) => {
      const [name, country] = line.split("\t");
      return { name: name || "", country: country || "" };
    }).filter((row) => row.name);
    const find = (wanted) =>
      rows.find((row) => row.name === wanted) || rows.find((row) => slug(row.name) === slug(wanted));
    const folders = new Set([...Object.keys(BROKER_NAME), ...Object.keys(BROKER_LIST)]);
    for (const entry of fs.readdirSync(new URL("../brokers/", import.meta.url), { withFileTypes: true })) {
      if (entry.isDirectory()) folders.add(entry.name);
    }
    for (const key of folders) {
      const listed = BROKER_LIST[key] || BROKER_NAME[key];
      const hit = listed ? find(listed) : null;
      if (hit?.country) {
        brokerCountries.set(key, hit.country.toUpperCase());
        continue;
      }
      const s = slug(key);
      const exact = rows.find((row) => slug(row.name) === s);
      if (exact?.country) {
        brokerCountries.set(key, exact.country.toUpperCase());
        continue;
      }
      let best = null;
      for (const row of rows) {
        const n = slug(row.name);
        if (n.length < 4 && s.length < 4) continue;
        if (n.startsWith(s) || (s.startsWith(n) && n.length >= 4)) {
          if (!best || n.length < slug(best.name).length) best = row;
        }
      }
      if (best?.country) brokerCountries.set(key, best.country.toUpperCase());
    }
  }
  return brokerCountries.get(folder) || "";
}

function km(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function confusedOf(unsourced) {
  const match = unsourced?.match || [];
  if (match.includes("euronext")) return "euronext";
  if (match.includes("nasdaqnordic") || match.includes("omx")) return "nasdaqnordic";
  if (match.includes("tse")) return "tse";
  if (match.includes("cse")) return "cse";
  if (match.includes("pse")) return "pse";
  return "";
}

function closestMic(folder, kind) {
  const at = COUNTRY_AT[brokerCountry(folder)];
  const cities = CONFUSED[kind];
  if (!at || !cities) return "";
  let best = "";
  let distance = Infinity;
  for (const [mic, lat, lon] of cities) {
    const d = km(at, [lat, lon]);
    if (d < distance) {
      distance = d;
      best = mic;
    }
  }
  return best;
}

// The listed American tape is one book, not a place per exchange. The 605
// file is keyed by ticker. Q is the gap against that improved 605, so a
// broker who has one gets `perShare × Q`. A broker with no Q gets the
// quoted NBBO instead, and that is a different number.
function listedTickerBook(mic, ccy, broker, ticker) {
  if (!isListedUsTape(mic)) return null;
  if (String(ccy || "").toUpperCase() !== "USD" || !ticker) return null;
  const perShare = usBookPerShare({ broker, ticker });
  if (perShare == null) return null;
  const q = qOf(broker);
  return { leaf: { perShare, source: "us605" }, mic, via605: true, ...(q != null ? { via606: true, q } : {}) };
}

// "US" names the tape and not Nasdaq or the NYSE. A broker with a Q is
// priced on the improved 605. One without a Q gets the quoted NBBO.
function unnamedUsBook(unsourced, ccy, broker, ticker) {
  if (!unsourced?.match?.includes("us") || unsourced.match.includes("iex")) return null;
  if (String(ccy || "").toUpperCase() !== "USD" || !ticker) return null;
  const perShare = usBookPerShare({ broker, ticker });
  if (perShare == null) return null;
  const q = qOf(broker);
  return { leaf: { perShare, source: "us605" }, mic: null, via605: true, ...(q != null ? { via606: true, q } : {}) };
}

export function spreadLeaf(spreads, { isin, mic, currency, unsourced, broker, ticker }) {
  const id = String(isin || "").toUpperCase();
  const ccy = String(currency || "").toUpperCase();
  // A coin is read in dollars on both books whatever fiat the broker prices it in: what
  // a round trip costs as a fraction of the amount belongs to the pair, not to the leg
  // it settles in. A broker that names its venue gets that one; a broker that names
  // neither — which is all of them — gets the wider of the two, since it could be on
  // either and this file answers with the pessimistic case elsewhere too.
  if (isCryptoId(id)) {
    if (mic && spreads[id]?.[mic]?.[CRYPTO_CCY]) return { leaf: spreads[id][mic][CRYPTO_CCY], mic };
    const found = CRYPTO_MICS.map((m) => ({ m, leaf: spreads[id]?.[m]?.[CRYPTO_CCY] })).filter((x) => x.leaf);
    if (!found.length) return { leaf: null, mic: mic || null };
    const worst = found.reduce((a, b) => ((b.leaf.bp ?? -1) > (a.leaf.bp ?? -1) ? b : a));
    return { leaf: worst.leaf, mic: worst.m, assumed: true };
  }
  // Nasdaq, NYSE, Arca, American, BZX, IEX and MEMX print one tape. A touch
  // stored under the named place does not replace the improved 605. OTC
  // keeps its own book. A row that only says "US" is that same tape when
  // the broker has a Q.
  const unnamed = !isListedUsTape(mic) ? unnamedUsBook(unsourced, ccy, broker, ticker) : null;
  if (unnamed) return unnamed;
  if (isListedUsTape(mic) && ccy === "USD") {
    const tickerBook = listedTickerBook(mic, ccy, broker, ticker);
    if (tickerBook) return tickerBook;
    if (id) {
      const hit = [...US_MICS, "IEXG", "MEMX"].find((m) => spreads[id]?.[m]?.USD?.perShare != null);
      if (hit) return apply606({ leaf: spreads[id][hit].USD, mic, assumed: hit !== mic }, { broker, ticker });
    }
    return { leaf: null, mic: mic || null };
  }
  if (id && mic && spreads[id]?.[mic]?.[ccy]) {
    return apply606({ leaf: spreads[id][mic][ccy], mic }, { broker, ticker });
  }
  // Pence and pounds are one London book. The stored figure is a ratio, so it
  // attaches either way. A per-share figure would be a hundred times off.
  const twin = ccy === "GBX" ? "GBP" : ccy === "GBP" ? "GBX" : "";
  const twinLeaf = twin && id && mic ? spreads[id]?.[mic]?.[twin] : null;
  if (twinLeaf?.bp != null && twinLeaf.perShare == null) {
    return apply606({ leaf: twinLeaf, mic }, { broker, ticker });
  }
  // The ISIN on the row is often the home listing. BHP at Admirals keeps
  // AU000000BHP4, IREN at Zesty keeps the field empty. The American book is
  // the ticker's 605 figure either way. Already the broker's own number, so
  // apply606 must not run on it again.
  const tickerBook = listedTickerBook(mic, ccy, broker, ticker);
  if (tickerBook) return tickerBook;
  if (!id || !ccy) return { leaf: null, mic: mic || null };
  // The label mixes up several books. Currency and ISIN were already tried.
  // The one left is the book closest to the broker's country. Paris,
  // Amsterdam, Brussels, Milan and Oslo are too close for that to mean
  // anything for Swissquote, Elana, Saxo and DEGIRO: several books, and
  // the tightest one is kept.
  const EUROPE_AMONG = new Set(["swissquote", "elana", "saxo", "degiro"]);
  const confused = confusedOf(unsourced);
  const among = EUROPE_AMONG.has(String(broker || "").split(":")[0]) && (confused === "euronext" || confused === "nasdaqnordic");
  const picked = confused && !among ? closestMic(broker, confused) : "";
  if (picked) {
    const leaf = id ? spreads[id]?.[picked]?.[ccy] : null;
    if (leaf) return apply606({ leaf, mic: picked, assumed: true }, { broker, ticker });
    return { leaf: null, mic: picked, assumed: true };
  }
  if (among) {
    const mics = CONFUSED[confused].map(([m]) => m);
    const hits = mics
      .map((m) => ({ m, leaf: spreads[id]?.[m]?.[ccy] }))
      .filter((hit) => hit.leaf && (hit.leaf.bp > 0 || hit.leaf.perShare > 0));
    if (!hits.length) return { leaf: null, mic: mic || null };
    const withBp = hits.filter((hit) => hit.leaf.bp > 0);
    const pool = withBp.length ? withBp : hits;
    const key = withBp.length ? "bp" : "perShare";
    const best = pool.reduce((a, b) => (b.leaf[key] < a.leaf[key] ? b : a));
    return apply606({ leaf: best.leaf, mic: best.m, assumed: true }, { broker, ticker });
  }
  // KOSPI and KOSDAQ are the same city. One book on file is that board.
  const group = unsourced?.match?.includes("krx") ? KOREA_MICS : null;
  if (!group) return listedTickerBook(mic, ccy, broker, ticker) || { leaf: null, mic: mic || null };
  const hits = group.filter((m) => spreads[id]?.[m]?.[ccy]);
  if (hits.length !== 1) return { leaf: null, mic: mic || null };
  return { leaf: spreads[id][hits[0]][ccy], mic: hits[0], assumed: true };
}

// The page showing the book a figure came from, built from the venue and the line
// rather than remembered per fund. `spread.mjs` calls this once and stores the result
// beside each figure, so that a consumer of the file needs no venue logic to show a
// reader where the number came from.
// Three of these exchanges file shares and funds in different sections and answer for the
// wrong one with a 404 or an empty page, so an ISIN alone does not name a page: Diageo
// under `/etf/` is a 404 at Frankfurt, and DocMorris in the SIX fund explorer renders
// "the requested Valor could not be found". Which section a line belongs in is a fact the
// exchange holds, so the adapters read it there -- Frankfurt's monthly register covers
// exchange-traded products only, SIX names the product line, Euronext's search returns the
// family outright -- and pass it back as `family`. Absent, the fund page stands, which is
// what this file assumed while it held nothing else.
// KRX book on Naver. The Nextrade book is /api/stock/NXT/ and is not this URL.
const askingPriceUrl = (ticker) =>
  ticker
    ? `https://m.stock.naver.com/api/stock/${encodeURIComponent(String(ticker).toUpperCase())}/askingPrice`
    : "https://m.stock.naver.com/domestic/stock";

const PAGE = {
  // Boerse Frankfurt rather than live.deutsche-boerse.com, because this is the page the
  // figure is read from: it renders the Xetra book, and its Xetra tab is the default.
  xetra: (l) => `https://www.boerse-frankfurt.de/${l.family === "share" ? "aktie" : "etf"}/${l.isin}`,
  // Keyed by TIDM, which is per currency line -- exactly the granularity a spread has.
  lse: (l) => (l.ticker ? `https://www.londonstockexchange.com/stock/${l.ticker}/x/company-page` : null),
  cxe: () => "https://www.cboe.com/europe/equities/market_statistics/book_viewer/",
  dxe: () => "https://www.cboe.com/europe/equities/market_statistics/book_viewer/",
  six: (l) =>
    l.family === "share"
      ? `https://www.six-group.com/en/market-data/shares/share-explorer/share-details.${l.isin}${l.currency}4.html`
      : `https://www.six-group.com/en/market-data/etf/etf-explorer/etf-detail.${l.isin}${l.currency}4.html`,
  // Only a fallback: Euronext runs shares, funds and trackers under three different
  // families and half a dozen segment codes per exchange, so the adapter asks the search
  // for the real path and hands it back. This is what a line with no reading falls to.
  euronext: (l) => `https://live.euronext.com/en/product/etfs/${l.isin}-${l.path}/market-information`,
  eurotlx: (l) => `https://live.euronext.com/en/product/equities/${l.isin}-ETLX/market-information`,
  budapest: () => "https://bet.hu/site/Angol/pages/mifid2#pretrade",
  luxse: () => "https://www.luxse.com/market-overview/trading-data/pre-and-post-trade-data",
  bvb: (l) => {
    const code = String(l.ticker || "").trim().toUpperCase();
    return code
      ? `https://bvb.ro/FinancialInstruments/Details/FinancialInstrumentsDetails.aspx?s=${encodeURIComponent(code)}`
      : "https://bvb.ro/TradingAndStatistics/Trading/CurrentTradingDay";
  },
  jse: (l) => {
    const code = String(l.ticker || "").trim().toUpperCase();
    return code
      ? `https://www.tradingview.com/symbols/JSE-${encodeURIComponent(code)}/`
      : "https://www.tradingview.com/markets/stocks-south-africa/market-movers-all-stocks/";
  },
  nairobi: (l) => {
    const code = String(l.ticker || "").trim().toUpperCase();
    return code
      ? `https://www.tradingview.com/symbols/NSEKE-${encodeURIComponent(code)}/`
      : "https://www.tradingview.com/markets/stocks-kenya/market-movers-all-stocks/";
  },
  ngx: (l) => {
    const code = String(l.ticker || "").trim().toUpperCase();
    return code
      ? `https://www.tradingview.com/symbols/NSENG-${encodeURIComponent(code)}/`
      : "https://www.tradingview.com/markets/stocks-nigeria/market-movers-all-stocks/";
  },
  bist: (l) => {
    const code = String(l.ticker || "").trim().toUpperCase().replace(/\.TR$/, "");
    return code
      ? `https://www.tradingview.com/symbols/BIST-${encodeURIComponent(code)}/`
      : "https://www.tradingview.com/markets/stocks-turkey/market-movers-all-stocks/";
  },
  bvc: (l) => {
    const code = String(l.ticker || "").trim().toUpperCase();
    return code
      ? `https://www.tradingview.com/symbols/BVC-${encodeURIComponent(code)}/`
      : "https://www.tradingview.com/markets/stocks-colombia/market-movers-all-stocks/";
  },
  sofia: (l) => {
    const code = String(l.ticker || "").trim().toUpperCase();
    return code
      ? `https://www.tradingview.com/symbols/BSESOF-${encodeURIComponent(code)}/`
      : "https://www.bse-sofia.bg/en";
  },
  athex: () => "https://athens.euronext.com/en/market-data/data-services/delayed-feed",
  xtal: (l) => `https://nasdaqbaltic.com/statistics/en/instrument/${l.isin}/trading`,
  bsse: () => "https://www.bsse.sk/bcpb/en/market-data/pre-trade-and-post-trade-data/",
  set: (l) => {
    const code = String(l.ticker || "").trim().toUpperCase().replace(/-R$/, ".R");
    return code
      ? `https://www.tradingview.com/symbols/SET-${encodeURIComponent(code)}/`
      : "https://www.set.or.th/en/market/product/stock/overview";
  },
  xcas: () => "https://www.casablanca-bourse.com/live-market/actions",
  tase: (l) => {
    const code = String(l.ticker || "").trim().toUpperCase();
    return code
      ? `https://www.tradingview.com/symbols/TASE-${encodeURIComponent(code)}/`
      : "https://market.tase.co.il/en";
  },
  moex: (l) => {
    const code = String(l.ticker || "").trim().toUpperCase();
    return code
      ? `https://www.moex.com/en/issue.aspx?board=TQBR&code=${encodeURIComponent(code)}`
      : "https://www.moex.com/en/trading/stocks";
  },
  psx: (l) => {
    const code = String(l.ticker || "").trim().toUpperCase();
    return code
      ? `https://www.tradingview.com/symbols/PSX-${encodeURIComponent(code)}/`
      : "https://www.psx.com.pk/";
  },
  csecy: (l) => {
    const code = String(l.ticker || "").trim().toUpperCase();
    return code
      ? `https://www.tradingview.com/symbols/CSECY-${encodeURIComponent(code)}/`
      : "https://www.cse.com.cy/en-GB/regulated-market/market-indices/current-prices/stocks-per-market/";
  },
  xris: (l) => `https://nasdaqbaltic.com/statistics/en/instrument/${l.isin}/trading`,
  xlit: (l) => `https://nasdaqbaltic.com/statistics/en/instrument/${l.isin}/trading`,
  vienna: (l) => `https://www.wienerborse.at/en/search/?q=${l.isin}`,
  xice: (l) =>
    l.orderbookId
      ? `https://www.nasdaq.com/european-market-activity/shares/${encodeURIComponent(String(l.ticker || "").toLowerCase())}?id=${encodeURIComponent(l.orderbookId)}`
      : "https://www.nasdaq.com/european-market-activity/shares",
  fnis: (l) =>
    l.orderbookId
      ? `https://www.nasdaq.com/european-market-activity/shares/${encodeURIComponent(String(l.ticker || "").toLowerCase())}?id=${encodeURIComponent(l.orderbookId)}`
      : "https://www.nasdaq.com/european-market-activity/shares",
  xcse: (l) =>
    l.orderbookId
      ? `https://www.nasdaq.com/european-market-activity/shares/${encodeURIComponent(String(l.ticker || "").toLowerCase())}?id=${encodeURIComponent(l.orderbookId)}`
      : "https://www.nasdaq.com/european-market-activity/shares",
  xsto: (l) =>
    l.orderbookId
      ? `https://www.nasdaq.com/european-market-activity/shares/${encodeURIComponent(String(l.ticker || "").toLowerCase())}?id=${encodeURIComponent(l.orderbookId)}`
      : "https://www.nasdaq.com/european-market-activity/shares",
  bequoted: () => "https://secure.bequoted.com/market/prices/",
  aqse: () => "https://www.aquis.eu/stock-exchange/trade-transparency",
  fnse: (l) =>
    l.orderbookId
      ? `https://www.nasdaq.com/european-market-activity/shares/${encodeURIComponent(String(l.ticker || "").toLowerCase())}?id=${encodeURIComponent(l.orderbookId)}`
      : "https://www.nasdaq.com/european-market-activity/shares",
  fndk: (l) =>
    l.orderbookId
      ? `https://www.nasdaq.com/european-market-activity/shares/${encodeURIComponent(String(l.ticker || "").toLowerCase())}?id=${encodeURIComponent(l.orderbookId)}`
      : "https://www.nasdaq.com/european-market-activity/shares",
  fnfi: (l) =>
    l.orderbookId
      ? `https://www.nasdaq.com/european-market-activity/shares/${encodeURIComponent(String(l.ticker || "").toLowerCase())}?id=${encodeURIComponent(l.orderbookId)}`
      : "https://www.nasdaq.com/european-market-activity/shares",
  xhel: (l) =>
    l.orderbookId
      ? `https://www.nasdaq.com/european-market-activity/shares/${encodeURIComponent(String(l.ticker || "").toLowerCase())}?id=${encodeURIComponent(l.orderbookId)}`
      : "https://www.nasdaq.com/european-market-activity/shares",
  xpra: () => "https://www.pse.cz/en/mifir",
  bxswiss: (l) => `https://www.bxswiss.com/instruments/${l.isin}`,
  // The American figure is not a book but a monthly average across several firms'
  // published reports, so no single page shows it. The link goes to the directory those
  // reports are found through, which is the nearest thing to a source a reader can open
  // and the only one that stays valid when the set of reporters changes.
  us605: () => "https://www.finra.org/filing-reporting/regulation-nms/sec-rule-605-reports",
  // The Gulf boards publish one market-wide table each rather than a page per line, so
  // the link goes to the table the figure was read off.
  adx: () => "https://www.adx.ae/all-equities",
  egx: () => "https://www.egx.com.eg/en/MarketSummary.aspx",
  dfm: () => "https://www.dfm.ae/the-exchange/market-information/market-watch",
  bhb: () => "https://bahrainbourse.com/en/Quotes%20and%20Market/Stocks/Pages/Quotes.aspx",
  msx: () => "https://www.msx.om/market-watch-custom.aspx",
  tradegate: (l) => `https://www.tradegate.de/orderbuch.php?isin=${l.isin}`,
  gettex: () => "https://www.gettex.de/handel/delayed-data/pretrade-data",
  munich: () => "https://www.boerse-muenchen.de/handel-support/kursdaten-delayed-data/",
  lsex: () => "https://www.ls-x.de/de/download",
  lsin: () => "https://www.ls-tc.de/de/download",
  quotrix: () => "https://cld42.boersenag.de/m13data/indexpt.html",
  frankfurt: () => "https://www.mds.deutsche-boerse.com/mds-en/real-time-data/Delayed-data",
  hamburg: () => "https://cld42.boersenag.de/m13data/indexpt.html",
  hannover: () => "https://cld42.boersenag.de/m13data/indexpt.html",
  eix: () => "https://european-investor-exchange.com/en/pretrade",
  tib: (l) =>
    l.isin
      ? `https://app.traderepublic.com/instrument/${encodeURIComponent(String(l.isin).toUpperCase())}`
      : "https://app.traderepublic.com",
  stuttgart: () =>
    "https://www.boerse-stuttgart.de/en/business-solutions/reports/mifir-ii-delayed-data/xstu-pre-trade/",
  // Behind a login, unlike every other link here, because that is where the Canadian
  // touch is actually shown. Pointing at a TMX page instead would name a source the
  // figure did not come from.
  questrade: (l) =>
    l.ticker
      ? `https://my.questrade.com/trading/quote/${encodeURIComponent(String(l.ticker).toUpperCase())}`
      : "https://my.questrade.com/trading",
  pure: (l) => {
    const ticker = String(l.ticker || "").toUpperCase().trim();
    const symbol = /\.(TO|VN|CN|NE)$/.test(ticker) ? ticker : ticker ? `${ticker}.CN` : "";
    return symbol
      ? `https://my.questrade.com/trading/quote/${encodeURIComponent(symbol)}`
      : "https://my.questrade.com/trading";
  },
  // The coin's own page on each exchange. `ticker` holds the base, the pair is rebuilt
  // the way each venue spells it: Binance glues USDT to it, Coinbase hyphenates USD.
  binance: (l) =>
    l.ticker
      ? `https://www.binance.com/en/trade/${encodeURIComponent(String(l.ticker).toUpperCase())}_USDT`
      : "https://www.binance.com/en/markets",
  coinbase: (l) =>
    l.ticker
      ? `https://www.coinbase.com/advanced-trade/spot/${encodeURIComponent(String(l.ticker).toUpperCase())}-USD`
      : "https://www.coinbase.com/advanced-trade/spot",
  // Alpaca has no public page per pair, so the figure points at the quote that
  // produced it, which is the thing a reader would want to check anyway.
  alpaca: (l) =>
    l.ticker
      ? `https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=${encodeURIComponent(
          `${String(l.ticker).toUpperCase()}/USD`
        )}`
      : "https://docs.alpaca.markets/docs/crypto-trading",
  kraken: (l) =>
    l.ticker
      ? `https://www.kraken.com/prices/${encodeURIComponent(String(l.ticker).toLowerCase())}`
      : "https://www.kraken.com/prices",
  gpw: () => "https://www.gpw.pl/akcje",
  newconnect: (l) =>
    l.isin ? `https://newconnect.pl/spolka?isin=${encodeURIComponent(String(l.isin).toUpperCase())}` : "https://newconnect.pl/notowania",
  nse: (l) =>
    l.ticker
      ? `https://www.nseindia.com/get-quote/equity/${encodeURIComponent(String(l.ticker).toUpperCase())}`
      : "https://www.nseindia.com/market-data/live-equity-market",
  bse: (l) =>
    l.ticker
      ? `https://www.bseindia.com/stock-share-price/scrip/${encodeURIComponent(String(l.ticker).toUpperCase())}/`
      : "https://www.bseindia.com/markets/equity.html",
  kospi: (l) => askingPriceUrl(l.ticker),
  kosdaq: (l) => askingPriceUrl(l.ticker),
  twse: (l) =>
    l.ticker
      ? `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${encodeURIComponent(String(l.ticker).toUpperCase())}.tw&json=1&delay=0`
      : "https://mis.twse.com.tw/stock/index.jsp",
  tpex: (l) =>
    l.ticker
      ? `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=otc_${encodeURIComponent(String(l.ticker).toUpperCase())}.tw&json=1&delay=0`
      : "https://mis.twse.com.tw/stock/index.jsp",
  nzx: (l) =>
    l.ticker
      ? `https://api.nzx.com/ticker/1.0/instrument/${encodeURIComponent(String(l.ticker).toUpperCase())}/last`
      : "https://www.nzx.com/markets/NZSX",
  otc: () => "https://www.interactivebrokers.ie/portal/",
  tadawul: (l) =>
    l.ticker
      ? `https://www.saudiexchange.sa/wps/portal/saudiexchange/ourmarkets/main-market-watch?symbol=${encodeURIComponent(String(l.ticker).toUpperCase())}`
      : "https://www.saudiexchange.sa/wps/portal/saudiexchange/ourmarkets/main-market-watch",
  sina: (l) => {
    const code = String(l.ticker || "").replace(/\D/g, "").padStart(6, "0").slice(-6);
    const prefix = l.path === "XSHE" || l.venue?.mic === "XSHE" ? "sz" : "sh";
    return code
      ? `https://finance.sina.com.cn/realstock/company/${prefix}${code}/nc.shtml`
      : "https://finance.sina.com.cn/stock/";
  },
  tsej: () => "https://www.jpx.co.jp/english/equities/products/etfs/quoting-data/index.html",
  nagoya: (l) => {
    const code = String(l.ticker || "").trim().toUpperCase();
    return code
      ? `https://www.tradingview.com/symbols/NAG-${encodeURIComponent(code)}/`
      : "https://www.tradingview.com/markets/stocks-japan/market-movers-all-stocks/";
  },
  asx: () => "https://www.asx.com.au/issuers/investment-products/asx-investment-products-monthly-report",
  // One board for the whole market. A per-symbol page is not what was read.
  hose: () => "https://priceapi.bsc.com.vn/datafeed/instruments",
  upcom: () => "https://priceapi.bsc.com.vn/datafeed/instruments",
  globalconnect: () => "https://gpwglobalconnect.pl/etfy-pelna-wersja-notowan",
  lima: () => "https://documents.bvl.com.pe/pubdif/boldia/stockq.htm",
  bmv: (l) =>
    l.ticker
      ? `https://www.bmv.com.mx/es/emisoras/estadisticas/${encodeURIComponent(
          String(l.ticker).toUpperCase().replace(/\*/g, "").replace(/\s+/g, "")
        )}`
      : "https://www.bmv.com.mx/es/mercados/mercado-global",
};

export function spreadUrl(row) {
  const venue = row.venue || resolveVenue(row).venue;
  if (!venue?.source) return null;
  return PAGE[venue.source]({
    isin: String(row.isin || "").toUpperCase(),
    currency: String(row.currency || "").toUpperCase(),
    ticker: row.ticker || null,
    // Which section of the exchange's site holds the line, when the adapter has found out.
    family: row.family || null,
    // Euronext serves Milan under its ETF segment and answers 404 for the MIC.
    path: venue.path || venue.mic,
  });
}

// Reading the clock in the exchange's own zone avoids caring about our own, and about
// the fortnight each year when Europe and London disagree about summer time.
export function sessionState(venue, when = new Date()) {
  if (!venue?.hours) return { open: null, why: null };
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: venue.hours.tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(when);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const weekday = get("weekday");
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  const at = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  // Monday to Friday unless the venue says otherwise. Manama and Muscat rest on Friday
  // and Saturday and trade on Sunday, so the week is a property of the exchange rather
  // than a constant of the calendar.
  const days = venue.hours.days || ["Mon", "Tue", "Wed", "Thu", "Fri"];
  if (!days.includes(weekday)) return { open: false, why: "hors jours de cotation" };
  // Public holidays are not modelled: an empty book on a holiday reads as a closed
  // book anyway, which is the conclusion that matters.
  if (minutes < at(venue.hours.open)) return { open: false, why: "avant l'ouverture" };
  if (minutes > at(venue.hours.close)) return { open: false, why: "après la clôture" };
  return { open: true, why: null };
}
