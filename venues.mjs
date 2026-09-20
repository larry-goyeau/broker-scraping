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

import { apply606 } from "./rule606.mjs";
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
    ],
    loose: ["london", "uk", "gb"],
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
      "swxswissexchange",
      "swxbndetf",
      "virtx",
      "vx",
    ],
    loose: ["zurich", "switzerland"],
  },
  {
    mic: "XPAR",
    name: "Euronext Paris",
    source: "euronext",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Paris" },
    exact: ["xpar", "euronextparis", "sbf", "par", "epa", "paraccess", "parmcetf"],
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
  // They are listed separately all the same, because the file's unit of identity is the
  // triple (place, ISIN, devise) and a broker naming Nasdaq should not be answered with a
  // leaf filed under Arca. It also leaves room for the day a venue does diverge.
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
      XNAS: ["xnas", "nasdaq", "nsdq", "nmq", "ndq", "nasdaqgs", "nasdaqgm", "nasdaqcm", "nsc"],
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
  // Oslo moved onto Euronext's platform. The delayed book is the same live.euronext.com
  // page as Paris. Brokers still write "OSL" or, Admirals, "Norway (NASDAQ)" — that last
  // string must not fall through to the American Nasdaq.
  {
    mic: "XOSL",
    name: "Oslo Børs",
    source: "euronext",
    hours: { open: "09:00", close: "16:20", tz: "Europe/Oslo" },
    exact: ["xosl", "osl", "ose", "oslo", "oslobors", "oslobrs", "euronextoslo", "norwaynasdaq", "omxno"],
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
      "viennastockexchange",
      "austriavie",
      "wen",
      "vse",
    ],
    loose: ["austria"],
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
  // The official INTRA tape is paid. The public site still prints a 20-minute delayed
  // touch (posturaCompra / posturaVenta) for the local board and the SIC, which is the
  // book CapTrader and IBKR write MEXI. XMEX is the ISO MIC; XBMV is a vendor spelling.
  {
    mic: "XMEX",
    name: "Bolsa Mexicana",
    source: "bmv",
    hours: { open: "08:30", close: "15:00", tz: "America/Mexico_City" },
    exact: ["xmex", "xbmv", "mexi", "bmv", "mexico", "bolsamexicana"],
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
  {
    mic: "NEOE",
    name: "Cboe Canada",
    source: "questrade",
    hours: { open: "09:30", close: "16:00", tz: "America/Toronto" },
    exact: ["neoe", "neo", "cboecanada"],
    loose: [],
  },

  // The Gulf. Four of these five markets publish their own touch for nothing — the
  // whole board in one call, bid, ask and both volumes — which is better than most of
  // Europe manages; they sat in KNOWN_UNSOURCED because nobody had looked, not because
  // the data is paid. Only Tadawul stays there: the Saudi Exchange publishes last
  // price and volume and sells the book.
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
    // "kse" used to be read as Karachi, on the strength of the initials alone. It is
    // Swissquote's code, it appears on six lines and no others, and all six are Kuwaiti
    // or Bahraini companies quoted in dirhams — which is what a cross-listing on Dubai
    // looks like and not what a Pakistani one looks like. All six are on the DFM board
    // under the same symbol, and five are in Al Ramz's catalogue named DFM outright.
    // What would falsify this is a catalogue writing KSE for Seoul or Karachi; those
    // would arrive in won or rupees and so would miss every AED leaf filed here.
    exact: ["xdfm", "dfm", "dubai", "dubaifinancialmarket", "kse"],
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
    mic: "XCAI",
    name: "The Egyptian Exchange",
    source: "egx",
    hours: { open: "10:00", close: "14:30", tz: "Africa/Cairo", days: ["Sun", "Mon", "Tue", "Wed", "Thu"] },
    exact: ["xcai", "egx", "case", "cairo", "egyptianexchange", "theegyptianexchange"],
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
  {
    mic: "CBSE",
    name: "Coinbase",
    source: "coinbase",
    hours: null,
    exact: ["coinbase", "cbse", "gdax", "coinbasepro"],
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
  // What is left of the American entry now that the venues above are sourced: the labels
  // that name a country rather than a book, and IEX, which is a venue no retail flow is
  // routed to and which the 605 table is not keyed by.
  {
    match: ["us", "usa", "unitedstates", "chicago", "nygif", "iex", "iexg", "eprl"],
    name: "places américaines, sans précision",
    why: "le broker ne dit pas laquelle",
  },
  {
    match: ["otc", "pink", "otcmkts", "ootc", "ootcotherotc", "otherotc"],
    name: "OTC Markets",
    why: "gré à gré américain, pas un carnet unique",
  },
  {
    match: ["bm", "bme", "madrid", "xmad", "spain", "sibe", "sibespanishstockexchangeinterconnectionsyst", "mad"],
    name: "Bolsa de Madrid",
    why: "adaptateur non écrit",
  },
  { match: ["ath", "xath", "athens", "athex", "enax"], name: "Athens Stock Exchange", why: "adaptateur non écrit" },
  { match: ["tase", "telaviv"], name: "Tel Aviv", why: "adaptateur non écrit" },
  { match: ["tyo", "tokyo", "tsej"], name: "Tokyo", why: "adaptateur non écrit" },
  // IBKR / CapTrader / Mexem write TSE for Toronto; Swissquote / DEGIRO / eToro
  // write TSE for Tokyo. `resolveVenue` splits on CAD/CA vs JPY/JP before
  // falling through to this leftover.
  { match: ["tse"], name: "TSE (Toronto ou Tokyo)", why: "le sigle nomme les deux places" },
  // Saxo writes CSE for Copenhagen; Questrade, DEGIRO and N26 write it for the Canadian
  // Securities Exchange. `resolveVenue` splits on the currency and the ISIN before
  // falling through to this leftover.
  { match: ["cse"], name: "CSE (Canada ou Copenhague)", why: "le sigle nomme les deux places" },
  { match: ["hkex", "sehk", "hongkong", "hks"], name: "Hong Kong", why: "adaptateur non écrit" },
  { match: ["sehkszse"], name: "Stock Connect Shenzhen", why: "adaptateur non écrit" },
  { match: ["sehkntl", "sehkstar"], name: "Stock Connect Shanghai", why: "adaptateur non écrit" },
  { match: ["krx"], name: "Korea Exchange", why: "adaptateur non écrit" },
  { match: ["twse"], name: "Taiwan Stock Exchange", why: "adaptateur non écrit" },
  { match: ["tpex"], name: "Taipei Exchange", why: "adaptateur non écrit" },
  { match: ["nse"], name: "National Stock Exchange of India", why: "adaptateur non écrit" },
  {
    match: ["b3", "bovespa", "bmfbovespa", "bvmf", "xbsp", "bvsp"],
    name: "B3 São Paulo",
    why: "bande officielle payante (UMDF) ; le différé public n'inclut pas la touche",
  },
  { match: ["xmuc"], name: "Börse München (plancher)", why: "adaptateur non écrit" },
  {
    match: ["aeqlit", "xats", "alpha"],
    name: "Alpha Exchange",
    why: "bande officielle payante (TMX Datalinx), pas de carnet public",
  },
  // IBKR / Mexem / WHS write VALUE. That is IB Value Exchange, IBKR's own
  // OTC / leftover destination — no MIC, no site, no public tape. Not IBKR ATS
  // (IBKRATS is NMS midpoint) and not a neighbour's book.
  { match: ["value"], name: "IB Value Exchange", why: "gré à gré IBKR, pas de carnet public" },
  { match: ["pure"], name: "Pure Trading", why: "adaptateur non écrit" },
  { match: ["asx", "xasx", "asxnationalmarket"], name: "ASX", why: "adaptateur non écrit" },
  { match: ["set", "xbkk", "thailand"], name: "Stock Exchange of Thailand", why: "adaptateur non écrit" },
  {
    match: ["omx", "nasdaqomx", "nasdaqnordic"],
    name: "Nasdaq Nordic",
    why: "le broker ne dit pas laquelle des places nordiques",
  },
  {
    match: ["xcse", "copenhagen", "omk", "omxcop", "cph", "denmarkcse"],
    name: "Nasdaq Copenhagen",
    why: "adaptateur non écrit",
  },
  {
    match: ["xsto", "stockholm", "sfb", "omxsto", "ssefnse"],
    name: "Nasdaq Stockholm",
    why: "adaptateur non écrit",
  },
  {
    match: ["xhel", "helsinki", "hse", "omxhex", "omxh", "hex", "hsefn"],
    name: "Nasdaq Helsinki",
    why: "adaptateur non écrit",
  },
  { match: ["xris", "riga", "nriga", "omxrse"], name: "Nasdaq Riga", why: "adaptateur non écrit" },
  { match: ["xtal", "tallinn", "ntallinn", "omxtse"], name: "Nasdaq Tallinn", why: "adaptateur non écrit" },
  { match: ["xlit", "vilnius", "nvilnius", "omxvse"], name: "Nasdaq Vilnius", why: "adaptateur non écrit" },
  { match: ["sgx", "xses", "singapore", "sgxst"], name: "Singapore Exchange", why: "adaptateur non écrit" },
  { match: ["jse", "xjse", "johannesburg"], name: "Johannesburg Stock Exchange", why: "adaptateur non écrit" },
  { match: ["gpw", "xwar", "warsaw", "wse", "newconnect"], name: "Warsaw Stock Exchange", why: "adaptateur non écrit" },
  { match: ["myx", "xkls", "malaysia", "bursamy", "malay"], name: "Bursa Malaysia", why: "adaptateur non écrit" },
  { match: ["luxse", "xlux", "luxembourg", "lux"], name: "Luxembourg Stock Exchange", why: "adaptateur non écrit" },
  { match: ["nzx", "xnze", "nzsenationalmarket"], name: "NZX", why: "adaptateur non écrit" },
  { match: ["biva"], name: "BIVA", why: "adaptateur non écrit" },
  // Nasdaq Dubai shares a building with DFM and not a board: its own site shows last
  // price and no touch, and the DFM feed that covers the emirate stops at DFM's own
  // securities. Tadawul publishes a ticker rich in everything except the two numbers
  // a spread is made of.
  { match: ["difx", "nasdaqdubai", "nasdaqdxb"], name: "Nasdaq Dubai", why: "pas de carnet public" },
  { match: ["crypto", "trd", "tradias", "tradiasotc", "zerohash", "zerohashe"], name: "Crypto", why: "gré à gré, pas un carnet unique" },
  { match: ["bet", "xbse", "bucharest", "bvb"], name: "Bucharest Stock Exchange", why: "adaptateur non écrit" },
  // Lightyear and Mexem write BUX for Budapesti Értéktőzsde (XBUD). That is
  // not Bucharest (BET / XBSE) and not the Dutch broker of the same letters.
  { match: ["bux", "xbud", "budapest"], name: "Budapest Stock Exchange", why: "adaptateur non écrit" },
  { match: ["csecy", "xcys", "cyprus"], name: "Cyprus Stock Exchange", why: "adaptateur non écrit" },
  { match: ["psecz", "xpra", "prague", "pse", "pra"], name: "Prague Stock Exchange", why: "adaptateur non écrit" },
  { match: ["bx", "bxswiss"], name: "BX Swiss", why: "adaptateur non écrit" },
  { match: ["bvc", "colombia"], name: "Bolsa de Valores de Colombia", why: "adaptateur non écrit" },
  { match: ["bsesof", "xbul", "sofia"], name: "Bulgarian Stock Exchange", why: "adaptateur non écrit" },
  { match: ["tadawul", "tdwl", "xsau", "saudiexchange"], name: "Tadawul", why: "carnet non publié" },
  {
    match: ["shanghaisc", "shenzhensc", "chinext", "sse", "szse"],
    name: "bourses chinoises onshore",
    why: "adaptateur non écrit",
  },
  { match: ["xber", "berlin", "boerseberlin"], name: "Börse Berlin", why: "adaptateur non écrit" },
  { match: ["chix", "chixen", "cxe", "cboeeurope"], name: "Cboe Europe (Chi-X)", why: "adaptateur non écrit" },
  { match: ["chixau", "cboeaustralia"], name: "Cboe Australia", why: "adaptateur non écrit" },
  { match: ["bist", "xist", "istanbul"], name: "Borsa Istanbul", why: "adaptateur non écrit" },
  { match: ["csefndk"], name: "Nasdaq First North Denmark", why: "adaptateur non écrit" },
  { match: ["eurotlx"], name: "EuroTLX", why: "adaptateur non écrit" },
  { match: ["xphs"], name: "Philippine Stock Exchange", why: "adaptateur non écrit" },
  { match: ["nseke", "xnai", "nairobi"], name: "Nairobi Securities Exchange", why: "adaptateur non écrit" },
  { match: ["aquis", "aqse", "plusmarketsgroupformerlyofex", "plusmarkets", "ofex"], name: "Aquis", why: "adaptateur non écrit" },
  { match: ["bsse", "xbra", "bratislava"], name: "Bratislava Stock Exchange", why: "adaptateur non écrit" },
  { match: ["nag", "xnag", "nagoya"], name: "Nagoya", why: "adaptateur non écrit" },
  { match: ["nseng", "xngn", "nigeria"], name: "Nigerian Exchange", why: "adaptateur non écrit" },
  { match: ["psx", "xkar", "karachi", "pakistan"], name: "Pakistan Stock Exchange", why: "adaptateur non écrit" },
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

  for (const n of names) {
    const hit = VENUES.find((v) => v.exact.includes(n));
    if (hit) return { venue: hit, assumed: false };
  }
  for (const n of names) {
    const hit = VENUES.find((v) => v.loose.includes(n));
    if (hit) return { venue: hit, assumed: true };
  }
  if (names.includes("tse")) {
    const ccy = String(row.currency || "").toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    if (ccy === "CAD" || isin.startsWith("CA")) {
      return { venue: VENUES.find((v) => v.mic === "XTSE"), assumed: false };
    }
    if (ccy === "JPY" || isin.startsWith("JP")) {
      return { venue: null, unsourced: KNOWN_UNSOURCED.find((u) => u.match.includes("tokyo")) };
    }
  }
  // The same split for CSE. Danish evidence wins first: a Copenhagen line sent to the
  // Canadian adapter would come back with a real figure for the wrong book, while a
  // Canadian line left with Copenhagen only comes back empty.
  if (names.includes("cse")) {
    const ccy = String(row.currency || "").toUpperCase();
    const isin = String(row.isin || "").toUpperCase();
    if (ccy === "DKK" || /^(DK|FO|GL)/.test(isin)) {
      return { venue: null, unsourced: KNOWN_UNSOURCED.find((u) => u.match.includes("xcse")) };
    }
    if (ccy === "CAD" || isin.startsWith("CA")) {
      return { venue: VENUES.find((v) => v.mic === "XCNQ"), assumed: false };
    }
  }
  for (const n of names) {
    const gap = KNOWN_UNSOURCED.find((u) => u.match.includes(n));
    if (gap) return { venue: null, unsourced: gap };
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

// Swissquote (and a few others) write "Euronext" without the city. Guessing Paris
// would be the error this file exists to prevent — unless the cache holds exactly
// one of the four books for that ISIN and currency, in which case there is nothing
// to guess.
const EURONEXT_MICS = ["XPAR", "XAMS", "XBRU", "XLIS"];
const US_MICS = ["XNAS", "ARCX", "XNYS", "XASE", "BATS"];

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
  if (id && mic && spreads[id]?.[mic]?.[ccy]) {
    return apply606({ leaf: spreads[id][mic][ccy], mic }, { broker, ticker });
  }
  // Rule 605 is a monthly average for the symbol, not a per-MIC book. A US
  // line stored under BATS (Trading212) is the same tape as Swissquote's AMEX → ARCX.
  if (id && US_MICS.includes(mic) && ccy === "USD") {
    const hit = US_MICS.find((m) => spreads[id]?.[m]?.[ccy]?.perShare != null);
    if (hit) return apply606({ leaf: spreads[id][hit][ccy], mic, assumed: true }, { broker, ticker });
  }
  const euronext = unsourced?.match?.includes("euronext");
  if (!euronext || !id || !ccy) return { leaf: null, mic: mic || null };
  const hits = EURONEXT_MICS.filter((m) => spreads[id]?.[m]?.[ccy]);
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
const PAGE = {
  // Boerse Frankfurt rather than live.deutsche-boerse.com, because this is the page the
  // figure is read from: it renders the Xetra book, and its Xetra tab is the default.
  xetra: (l) => `https://www.boerse-frankfurt.de/${l.family === "share" ? "aktie" : "etf"}/${l.isin}`,
  // Keyed by TIDM, which is per currency line -- exactly the granularity a spread has.
  lse: (l) => (l.ticker ? `https://www.londonstockexchange.com/stock/${l.ticker}/x/company-page` : null),
  six: (l) =>
    l.family === "share"
      ? `https://www.six-group.com/en/market-data/shares/share-explorer/share-details.${l.isin}${l.currency}4.html`
      : `https://www.six-group.com/en/market-data/etf/etf-explorer/etf-detail.${l.isin}${l.currency}4.html`,
  // Only a fallback: Euronext runs shares, funds and trackers under three different
  // families and half a dozen segment codes per exchange, so the adapter asks the search
  // for the real path and hands it back. This is what a line with no reading falls to.
  euronext: (l) => `https://live.euronext.com/en/product/etfs/${l.isin}-${l.path}/market-information`,
  vienna: (l) => `https://www.wienerborse.at/en/search/?q=${l.isin}`,
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
