# broker-scraping

Who sells a stock, an ETF, or a coin, and what it costs to buy it and sell it straight back.

The page is one search over every broker catalogue. A row is a broker, a venue, and a currency. The round-trip column is in dollars. The fees column is the broker’s own charges, without the book. N/A means the book was not measured.

## Run the page

```
node front.mjs --port=3470
```

Open http://127.0.0.1:3470. Country, deposit currency, and size change who is shown and what the trip costs. http://127.0.0.1:3470/method is how that number is built: the Rule 605 effective spread, the Rule 606 mix that scales it, the NBBO when a broker has no 606, and each venue’s own bid and ask outside the US.

`front.html` and `method.html` are read from disk on every request. A change to a catalogue, `parsed_json/spread.json`, or a `*_cost.mjs` needs the process restarted.

## What the round trip is

Buy the quantity on the page and sell it back at once. The total is the book you cross, plus the broker’s charges, plus a tax when that schedule names one.

On a US listing the book starts from the monthly Rule 605 effective spread (orders of 100 to 499 shares, dollars per share, price improvement included). Rule 606 says where that broker-dealer sends market orders, and that mix scales the 605 figure. A broker outside the US that names a US dealer uses that dealer’s mix. With no 606, the book is the average NBBO. Outside the US, the book is that venue’s own bid and ask, brought back to the average hour of the session. One venue’s tape is not copied onto another.

## Layout

A broker’s scraper, cost script, and catalogue live in `<broker>/`. `<broker>_scraping.mjs` uses a real account at the broker it scrapes. The catalogue is what that signed-in session is shown.

| Path | What it is |
| --- | --- |
| `<broker>/<broker>_scraping.mjs` | Builds `<broker>/<broker>-parsed.json` |
| `<broker>/<broker>_cost.mjs` | One round trip at that broker. `roundTrip({ etf, place, currency, shares, price })` |
| `etfs.csv`, `stocks.csv`, `cryptos.csv` | The names a scraper walks |
| `broker-list.txt` | Broker, country, kind, URL |
| `venues.mjs` | Exchange names, hours, and which tape each one uses |
| `spread.mjs` | Reads those tapes into `parsed_json/spread.json` |
| `rule605-monthly.mjs` | US effective spreads, `parsed_json/rule605-monthly.json` |
| `rule606.mjs` | Where US broker-dealers send orders. Q is computed, not stored |
| `prices.mjs` | Last close per ISIN, `parsed_json/prices.json`, so a percent fee can become money |
| `taxes.mjs`, `taxMap.mjs` | Stamp and transaction taxes by ISIN |
| `fx.mjs` | Mid rates into dollars |
| `accepted.mjs` | Countries a broker will open an account for |
| `deposits.mjs` | Currencies an account can hold without converting |

Shared files are imported from a broker script with `import.meta.url` (`../etfs.csv`), not a path that only works when the shell is at the repo root.

Catalogues (`*-parsed.json`) are not committed. `parsed_json/` holds the shared books, prices, taxes, and the 605 and 606 tables.
