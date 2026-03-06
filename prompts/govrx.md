# Prescription Drug Tracker

https://trumprx.gov/ offers some prescription drug price data.  

I want to track this site on a daily basis.

Currently, the page https://trumprx.gov/browse lists drugs and their prices. It is currently one page as there are only 44 drugs listed.

Example text:

Cetrotide®
$22.50
$316.12  ·  93% off

# Objective

I want to run a script daily to scrape this site and record what drugs are listed, and at what price.

# Location

There is a folder called `govrx` in the root of this repo.

# Data

I want to store the data in a csv file and on a Google Sheet with the following columns:

- Date
- Drug
- Price
- List Price

# Config

I want to store the config in a json file with the following keys:

- `url`: The url to scrape
- `csv_file`: The path to the csv file
- `google_sheet_id`: The id of the Google Sheet

This config file lives in a /cfg/ directory within the `govrx` folder.

# Script

I want to run a script that will scrape the site and append the data to the csv file.
This script should run daily at 3am.

# Implementation Details

I do not know how the data is rendered on the site- e.g. whether it is dynamic or static. Please inspect the site and determine the best way to scrape the data. Please use the simplest method that is sufficiently robust (resistant to failures). Many skills use PlayWright to render dynamic content.

# Notes

- The script will only append data to the csv file and Google Sheet. It will not overwrite the file.
- The script will only append data if the drug is not already in the csv file for that date.

# Updates

After the script runs, I want an update via Telegram that indicates:
- Whether the script ran successfully
- The number of drugs captured in that run
- The number of new drugs added (drugs that did not appear previously)
