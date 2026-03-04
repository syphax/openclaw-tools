# World Cup Ticket Price Tracker

The objective of this skill is to track prices for specific 2026 World Cup matches for specific categories.

The files supporting this skill are stored in `/world-cup-tickets`.

The source of these prices are from StubHub. The URLs, which should be stored in a cfg file, are of the form:

https://www.stubhub.com/world-cup-philadelphia-tickets-6-14-2026/event/153022356/?quantity=4&sections=1989122%2C195429%2C195408%2C195412%2C1527053%2C195419%2C195423%2C195420%2C195421%2C195403%2C195439%2C195422%2C195402&ticketClasses=1245&rows=&seats=&seatTypes=&listingQty=

Each day, I want to capture the price for each match, for each quantity of tickets, from 1-4, as determined by the quantity parameter, and for each ticket category. The web page lists prices for each category on one page; we need to iterate through the quantities, as that's a parameter in the URL.

I want to store the results in a Google Sheet, with one row for each observation (date, match #, category, number of tickets, price)

More information about the World Cup game URLs are stored in `/world-cup-tickets/cfg/private-info.json`, as is the link to the Google Sheet where we want to store the results.

## Setup

The URLs are provided in `/world-cup-tickets/cfg/private-info.json`, as is the link to the results spreadseet.

The results spreadsheet has the following columns:

- Date
- Match
- Quantity
- Price

## Web scraping approach

* Use Playwright to access the URLs.
* You will need to inspect the page to determine how to retrieve the Category 1, 2, 3 and 4 prices. 

## Config file

The config file is a YAML file in `/world-cup-tickets/cfg/wct-comnfig.yaml` that contains:
* A dict of base URLs for each match
* Google Sheet URL for results
* A list of ticket categories to track (i.e. [1, 2, 3, 4])
* A list of quantities to track (i.e. [1, 2, 3, 4])

## Output

* Please produce a script that, when run, obtains prices for all specified games, for all categories and quantities, and stores them in the specified google sheet, as well as in a results file (CSV) in the /world-cup-tickets directory called `/world-cup-tickets/ticket-price-history.csv`

## Details

* The script should include variable pauses between calls, out of courtesy to the server
* The script should include error handling for when the server is unavailable
* The script should include error handling for when the page is not found
* Log info is stored in `/world-cup-tickets/logs/world-cup-tickets.log`
* We may move the locations of the results and logs files, but will start with them in the `/world-cup-tickets` directory.

# Enhancement: FIFA Collect

For this version, we want to generalize across data sources.

I have located an additional data source that I want to track.

It is at: https://www.fifacollect.info/tickets/world-cup-2026/listings

This tracks prices on the FIFA Collect marketplace. These prices will be a bit different than on other sites. That's fine.

There are also additional fields in this dataset:

Match - Match number, date, teams
Location - Where the match will be played
Round - Group and Round
Category - Ticket Category
Face Value - Face value of ticket
Volume - Number of sales, and sales amount. It is unclear if this is cumulative
Last Sale - Price for last sale
Starting at - Current listing price

I want to capture all of these fields. In particular, Volume will map to 3 fields: 
- Sales volume
- Sales amount
- Avg. Price

The results will be stored in the same Google Sheet, but in a separate tab, called Prices-FC. This sheet exists and has the columns:

- Date: Date of data pull
- Match: Match number only (e.g. M09)	
- Category: 1-4	
- Face Value	
- Sales Volume
- Sales Amount
- Avg. Price
- Starting at: This is the number in the "Starting at" column on https://www.fifacollect.info/tickets
- URL: This will be https://www.fifacollect.info/tickets/world-cup-2026/listings?sort=sale-volume-desc

The dict of what matches to track is in the config file `skills/world-cup-tickets/cfg/wct-collect.yaml`. It will share this log file with the other script. As such, this script should ID itself when initially writing to the log, and the existing script should be modified so that it also ID's itself in a consistent manner. The current script is `skills/world-cup-tickets/scripts/scrape_tickets.py`

I recommend that we build this scraper as a separate script, and run it separately, as I don't think there's much synergy in combining with the existing script.

## Details

The script should include variable pauses between calls, out of courtesy to the server
The script should include error handling for when the server is unavailable
The script should include error handling for when the page is not found
Log info is stored in `/world-cup-tickets/logs/world-cup-tickets.log`

## Claude Questions

1. **Last Sale field**: The site lists a "Last Sale" column, but it does not appear in the Prices-FC Google Sheet column spec. Is this intentional — i.e., we skip Last Sale — or should it be added as a column?

A: That was an omission on my part; I have added it to the sheet.

2. **CSV backup**: The existing scraper writes results to both Google Sheets and a local CSV (`ticket-price-history.csv`). The spec only mentions Google Sheets for this new script. Should the FC scraper also write to a local CSV (e.g., `ticket-price-history-fc.csv`), or is Google Sheets the only output?

A: Yes, also write to a local CSV, `ticket-price-history-fc.csv`

3. **Volume column format**: The Volume field maps to Sales Volume, Sales Amount, and Avg. Price. How does this appear on the fifacollect.info page — is it a single cell with combined text (e.g., "45 / $12,345"), or are these already in separate columns? This will drive the parsing logic.

A: I will ask you to retrieve the page and inspect that. In short, there are 2 lines of info, like "$116,215 |130 sales". We want the $116,215 and the 130, and 116,215 / 130 = $894.96

4. **Config file for Google Sheet**: `wct-collect.yaml` currently only has a `matches` dict. Should the Google Sheet connection info (spreadsheet_id, sheet_name "Prices-FC") be added to `wct-collect.yaml`, or should the new script read from `wct-config.yaml` (where the spreadsheet_id already lives)?

A: Yes, I have added that info.

5. **Script name**: What should the new script be called? (e.g., `scrape_collect.py`?)

A: `scrape_tickets_collect.py`

6. **Scheduling**: Should I also update `run_daily_4am.sh` to run the new script, or will you handle scheduling separately?

A: Not sure. If we add here, can we do so in a way that will still run if the first script throws an error? Would it be more robust to trigger them separately?

CC: On scheduling (Q6): I'd recommend two separate cron entries rather than combining them in run_daily_4am.sh. The current shell script uses set -euo pipefail — restructuring it to isolate failures between two scripts adds complexity with little benefit. Two independent cron jobs are simpler, easier to monitor separately, and completely isolated from each other's failures.

A: OK; please add a separate cron entry for the new script.