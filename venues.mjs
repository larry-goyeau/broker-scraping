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
    exact: ["xlon", "lse", "lseetf", "lseetfs", "londonstockexchange", "uklse", "londonmainmarket"],
    loose: ["london", "uk", "gb"],
  },
  {
    mic: "XSWX",
    name: "SIX Swiss Exchange",
    source: "six",
    hours: { open: "09:00", close: "17:20", tz: "Europe/Zurich" },
    exact: ["xswx", "six", "swx", "swxetf", "ebs", "xvtx", "swissebsstocks", "sixswissexchange"],
    loose: ["zurich", "switzerland"],
  },
  {
    mic: "XPAR",
    name: "Euronext Paris",
    source: "euronext",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Paris" },
    exact: ["xpar", "euronextparis", "sbf", "par", "epa"],
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
    exact: ["xbru", "euronextbrussels", "bru", "ebr"],
    loose: ["brussels", "belgium"],
  },
  {
    mic: "XLIS",
    name: "Euronext Lisbon",
    source: "euronext",
    hours: { open: "08:00", close: "16:30", tz: "Europe/Lisbon" },
    exact: ["xlis", "euronextlisbon", "lis"],
    loose: ["lisbon", "portugal"],
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
      XNAS: ["xnas", "nasdaq", "nmq", "ndq", "nasdaqgs", "nasdaqgm", "nasdaqcm"],
      // Brokers write "AMEX" for Arca more often than for NYSE American, tastytrade
      // among them: EEM, GLD, IAU and VOO all come through labelled AMEX and all four
      // list on Arca. The alias sits here rather than on XASE because that is what the
      // catalogues mean by it, and because the figure is the same either way.
      ARCX: ["arcx", "arca", "nysearca", "amex", "pcq", "nysemkt"],
      XNYS: ["xnys", "nyse", "newyorkstockexchange", "nys", "nsy", "usnyse"],
      XASE: ["xase", "nyseamerican", "americanstockexchange"],
      BATS: ["bats", "batsz", "cboebzx", "bzx", "cboe"],
    }[mic],
    loose: { XNAS: ["nasdaqus"], ARCX: [], XNYS: ["newyork"], XASE: [], BATS: ["cboe"] }[mic],
  })),

  {
    mic: "XMIL",
    name: "Euronext Milan",
    source: "euronext",
    path: "ETFP",
    hours: { open: "09:00", close: "17:30", tz: "Europe/Rome" },
    exact: ["xmil", "borsaitaliana", "mil", "miletf", "bvmeetf", "etfp", "mta", "mtaa"],
    loose: ["milan", "milano", "italy", "italianse", "italiansecontinuous"],
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
    exact: ["xmun", "gettex", "gettex2", "munc", "mund", "munich", "bayerischeboerse", "boersemuenchen"],
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
  {
    mic: "XQTX",
    name: "Börse Düsseldorf",
    source: "quotrix",
    hours: { open: "08:00", close: "22:00", tz: "Europe/Berlin" },
    exact: ["xqtx", "quotrix", "dusc", "dusd", "dus", "xdus", "dusseldorf", "duesseldorf"],
    loose: [],
  },
];

// Places that exist in broker catalogues but publish no free pre-trade book, or have
// no adapter yet. Naming them keeps a gap distinguishable from a lookup that failed,
// and keeps a neighbour's number from being borrowed to fill it.
export const KNOWN_UNSOURCED = [
  // Trade Republic's parser writes TIB when the API left exchangeId empty. That is not a
  // MIC, and assigning those lines to Tradegate or LS Exchange would file another book's
  // number under a place the catalogue never named.
  { match: ["tib"], name: "Trade Republic (TIB)", why: "le broker ne nomme pas la place" },
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
  { match: ["otc", "pink", "otcmkts"], name: "OTC Markets", why: "gré à gré américain, pas un carnet unique" },
  { match: ["bm", "bme", "madrid", "xmad", "spain"], name: "Bolsa de Madrid", why: "adaptateur non écrit" },
  { match: ["mexi", "bmv", "mexico"], name: "Bolsa Mexicana", why: "adaptateur non écrit" },
  { match: ["tase", "telaviv"], name: "Tel Aviv", why: "adaptateur non écrit" },
  { match: ["tse", "tyo", "tokyo"], name: "Tokyo", why: "adaptateur non écrit" },
  { match: ["hkex", "sehk", "hongkong"], name: "Hong Kong", why: "adaptateur non écrit" },
  // Swissquote (and WH SelfInvest) write the German floor books as FWB / SWB / MUN /
  // HAM / HAN. Those are not Xetra or gettex: Swissquote already has XETR and GETTEX
  // as separate codes, and Munich's floor is not the gettex book.
  { match: ["fwb", "xfra", "boersefrankfurt"], name: "Börse Frankfurt", why: "adaptateur non écrit" },
  { match: ["swb", "xstu", "stuttgart", "boersestuttgart"], name: "Börse Stuttgart", why: "adaptateur non écrit" },
  { match: ["mun", "xmuc"], name: "Börse München", why: "adaptateur non écrit" },
  { match: ["ham", "xham", "hamburg", "boersehamburg"], name: "Börse Hamburg", why: "adaptateur non écrit" },
  { match: ["han", "xhan", "hannover", "boersehannover"], name: "Börse Hannover", why: "adaptateur non écrit" },
  { match: ["tsx", "xtse", "toronto"], name: "Toronto Stock Exchange", why: "adaptateur non écrit" },
  { match: ["tsxv", "xtsx", "tsxventure"], name: "TSX Venture", why: "adaptateur non écrit" },
  { match: ["asx", "xasx"], name: "ASX", why: "adaptateur non écrit" },
  { match: ["set", "xbkk", "thailand"], name: "Stock Exchange of Thailand", why: "adaptateur non écrit" },
  {
    match: ["omx", "nasdaqomx", "nasdaqnordic"],
    name: "Nasdaq Nordic",
    why: "le broker ne dit pas laquelle des places nordiques",
  },
  { match: ["xcse", "copenhagen"], name: "Nasdaq Copenhagen", why: "adaptateur non écrit" },
  { match: ["xsto", "stockholm"], name: "Nasdaq Stockholm", why: "adaptateur non écrit" },
  { match: ["xhel", "helsinki"], name: "Nasdaq Helsinki", why: "adaptateur non écrit" },
  { match: ["vie", "xwbo", "vienna", "wienerboerse"], name: "Wiener Börse", why: "adaptateur non écrit" },
  { match: ["sgx", "xses", "singapore"], name: "Singapore Exchange", why: "adaptateur non écrit" },
  { match: ["jse", "xjse", "johannesburg"], name: "Johannesburg Stock Exchange", why: "adaptateur non écrit" },
  { match: ["osl", "xosl", "oslo"], name: "Oslo Børs", why: "adaptateur non écrit" },
  { match: ["gpw", "xwar", "warsaw", "wse"], name: "Warsaw Stock Exchange", why: "adaptateur non écrit" },
  { match: ["lsin"], name: "Lang & Schwarz International", why: "adaptateur non écrit" },
  { match: ["luxse", "xlux", "luxembourg"], name: "Luxembourg Stock Exchange", why: "adaptateur non écrit" },
  { match: ["nzx", "xnze"], name: "NZX", why: "adaptateur non écrit" },
  { match: ["biva"], name: "BIVA", why: "adaptateur non écrit" },
  { match: ["dfm", "dubai"], name: "Dubai Financial Market", why: "adaptateur non écrit" },
  { match: ["crypto"], name: "Crypto", why: "gré à gré, pas un carnet unique" },
  { match: ["bet", "xbse", "bucharest"], name: "Bucharest Stock Exchange", why: "adaptateur non écrit" },
  { match: ["csecy", "xcys", "cyprus"], name: "Cyprus Stock Exchange", why: "adaptateur non écrit" },
  { match: ["psecz", "xpra", "prague"], name: "Prague Stock Exchange", why: "adaptateur non écrit" },
  { match: ["bx", "bxswiss"], name: "BX Swiss", why: "adaptateur non écrit" },
  { match: ["bvc", "colombia"], name: "Bolsa de Valores de Colombia", why: "adaptateur non écrit" },
  { match: ["bsesof", "xbul", "sofia"], name: "Bulgarian Stock Exchange", why: "adaptateur non écrit" },
  { match: ["myx", "xkls", "malaysia"], name: "Bursa Malaysia", why: "adaptateur non écrit" },
  { match: ["neo", "neoe"], name: "Cboe Canada", why: "adaptateur non écrit" },
  { match: ["eurotlx"], name: "EuroTLX", why: "adaptateur non écrit" },
  { match: ["pse", "xphs"], name: "Philippine Stock Exchange", why: "adaptateur non écrit" },
  { match: ["nseke", "xnai", "nairobi"], name: "Nairobi Securities Exchange", why: "adaptateur non écrit" },
  { match: ["aquis", "aqse"], name: "Aquis", why: "adaptateur non écrit" },
  { match: ["bsse", "xbra", "bratislava"], name: "Bratislava Stock Exchange", why: "adaptateur non écrit" },
  { match: ["nag", "xnag", "nagoya"], name: "Nagoya", why: "adaptateur non écrit" },
  { match: ["nseng", "xngn", "nigeria"], name: "Nigerian Exchange", why: "adaptateur non écrit" },
  { match: ["kse"], name: "Pakistan Stock Exchange", why: "adaptateur non écrit" },
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

export function spreadLeaf(spreads, { isin, mic, currency, unsourced }) {
  const id = String(isin || "").toUpperCase();
  const ccy = String(currency || "").toUpperCase();
  if (id && mic && spreads[id]?.[mic]?.[ccy]) return { leaf: spreads[id][mic][ccy], mic };
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
  // The American figure is not a book but a monthly average across several firms'
  // published reports, so no single page shows it. The link goes to the directory those
  // reports are found through, which is the nearest thing to a source a reader can open
  // and the only one that stays valid when the set of reporters changes.
  us605: () => "https://www.finra.org/filing-reporting/regulation-nms/sec-rule-605-reports",
  tradegate: (l) => `https://www.tradegate.de/orderbuch.php?isin=${l.isin}`,
  gettex: () => "https://www.gettex.de/handel/delayed-data/pretrade-data",
  lsex: () => "https://www.ls-x.de/de/download",
  quotrix: () => "https://cld42.boersenag.de/m13data/indexpt.html",
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
  if (weekday === "Sat" || weekday === "Sun") return { open: false, why: "week-end" };
  // Public holidays are not modelled: an empty book on a holiday reads as a closed
  // book anyway, which is the conclusion that matters.
  if (minutes < at(venue.hours.open)) return { open: false, why: "avant l'ouverture" };
  if (minutes > at(venue.hours.close)) return { open: false, why: "après la clôture" };
  return { open: true, why: null };
}
