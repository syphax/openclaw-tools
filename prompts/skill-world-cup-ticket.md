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