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

## Addendum #1 - March 6, 2026

I want to add a new script to the govrx skill!

I want to be able to scrape https://www.costplusdrugs.com/medications/

This site is organized by "Health Conditions" listed on URL listed above.

When you click-through to a health condition, you get a list of drugs, e.g. https://www.costplusdrugs.com/medications/categories/acid-reflux/ lists:

* Famotidine(Generic for Pepcid)
* Lansoprazole Delayed Release (DR)(Generic for Prevacid)
* Pantoprazole Sodium(Generic for Protonix)
* Rabeprazole Sodium DR(Generic for Aciphex)

On these pages, the fields are:
* Medication
* Form
* Retail
* Home Delivery
* Savings

There can be more than one page for a given category, e.g. https://www.costplusdrugs.com/medications/categories/diabetes/ has multiple pages. But the URL doesn't change as you scroll through the pages.

## Objective

I want to be able to scrape this data and populate a CSV file and a google sheet with these columns:

* Category	
* Medication
* Form
* Retail
* Home Delivery
* Savings

The Google Sheet is the same one as we use already. The sheet name is defined in the config file by `google_sheet_name_cpd`. The name of the output CSV is `cost-plus-drugs.csv`

## Approach

I only have some idea of how the site obtains and presents data. You will need to inspect it and decide on the best way to scrape the data.

Once you have done so, please:
* Write the code necessary to run the script
* Create a shell script to run the script, following the form of `skills/world-cup-tickets/scripts/run_daily_stubhub.sh`
* Test the code to ensure that the script is successful, and the results are correct
* The log entries should report how many categories were scanned, how many drugs were found, and how many new drugs were found (drugs that did not appear previously)

## Details

The data appears to be fetched via an API call, like: https://www.costplusdrugs.com/graphql/

with a payload like:

{"operationName":"GetAllProducts","variables":{"first":10,"direction":"ASC","productOrderField":"NAME","collection":"Q29sbGVjdGlvbjozNA==","channel":"default-channel","offset":20},"query":"query GetAllProducts($before: String, $after: String, $first: Int, $last: Int, $direction: OrderDirection!, $productOrderField: ProductOrderField!, $collection: [ID!], $channel: String, $offset: Int, $medicationSearch: String) {\n  products(\n    first: $first\n    last: $last\n    channel: $channel\n    after: $after\n    before: $before\n    sortBy: {direction: $direction, field: $productOrderField}\n    filter: {collections: $collection}\n    offset: $offset\n    medicationSearch: $medicationSearch\n  ) {\n    edges {\n      node {\n        id\n        name\n        collections {\n          name\n          slug\n          __typename\n        }\n        priceCalculation\n        retailPrice\n        media {\n          id\n          alt\n          sortOrder\n          url\n          type\n          oembedData\n          isPharmacyPromotionImage\n          __typename\n        }\n        variants {\n          id\n          sku\n          metafields(\n            keys: [\"retailPricePerUnit\", \"form\", \"slug\", \"sku\", \"package_size\", \"is_active\", \"insuranceEligible\", \"cashEligible\"]\n          )\n          images {\n            url\n            __typename\n          }\n          specialtyMedication\n          __typename\n        }\n        isAvailable\n        metafields(\n          keys: [\"brandGeneric\", \"brandName\", \"external_promotion\", \"medication_full_display_name\"]\n        )\n        category {\n          name\n          __typename\n        }\n        slug\n        __typename\n      }\n      __typename\n    }\n    totalCount\n    pageInfo {\n      startCursor\n      endCursor\n      hasNextPage\n      hasPreviousPage\n      __typename\n    }\n    pageInfo {\n      startCursor\n      endCursor\n      hasNextPage\n      hasPreviousPage\n      __typename\n    }\n    __typename\n  }\n}"}

which returns data like:

{
    "data": {
        "products": {
            "edges": [
                {
                    "node": {
                        "id": "UHJvZHVjdDoyNzcy",
                        "name": "Insulin Pen Needle",
                        "collections": [
                            {
                                "name": "Diabetes",
                                "slug": "diabetes",
                                "__typename": "Collection"
                            }
                        ],
                        "priceCalculation": 9.31,
                        "retailPrice": 17.15,
                        "media": [
                            {
                                "id": "UHJvZHVjdE1lZGlhOjI2Njk=",
                                "alt": "",
                                "sortOrder": 0,
                                "url": "https://storage.googleapis.com/mccpd-prod-media/thumbnails/products/09545_UC_50CT_PN_4MM_FRONT_4f0db4a8_thumbnail_4096.jpg",
                                "type": "IMAGE",
                                "oembedData": "{}",
                                "isPharmacyPromotionImage": false,
                                "__typename": "ProductMedia"
                            },
                            {
                                "id": "UHJvZHVjdE1lZGlhOjI2NzA=",
                                "alt": "",
                                "sortOrder": 1,
                                "url": "https://storage.googleapis.com/mccpd-prod-media/thumbnails/products/09565_UC_50CT_PN_6MM_FRONT_81706478_thumbnail_4096.jpg",
                                "type": "IMAGE",
                                "oembedData": "{}",
                                "isPharmacyPromotionImage": false,
                                "__typename": "ProductMedia"
                            },
                            {
                                "id": "UHJvZHVjdE1lZGlhOjI2NzE=",
                                "alt": "",
                                "sortOrder": 2,
                                "url": "https://storage.googleapis.com/mccpd-prod-media/thumbnails/products/09585_UC_50CT_PN_8MM_FRONT_6f107b89_thumbnail_4096.jpg",
                                "type": "IMAGE",
                                "oembedData": "{}",
                                "isPharmacyPromotionImage": false,
                                "__typename": "ProductMedia"
                            },
                            {
                                "id": "UHJvZHVjdE1lZGlhOjI2NzI=",
                                "alt": "",
                                "sortOrder": 3,
                                "url": "https://storage.googleapis.com/mccpd-prod-media/thumbnails/products/71007_UC_30CT_PN_4MM_FRONT_ab6efb63_thumbnail_4096.jpg",
                                "type": "IMAGE",
                                "oembedData": "{}",
                                "isPharmacyPromotionImage": false,
                                "__typename": "ProductMedia"
                            },
                            {
                                "id": "UHJvZHVjdE1lZGlhOjI2NzM=",
                                "alt": "",
                                "sortOrder": 4,
                                "url": "https://storage.googleapis.com/mccpd-prod-media/thumbnails/products/71008_UC_30CT_PN_6MM_FRONT_7be39fa5_thumbnail_4096.jpg",
                                "type": "IMAGE",
                                "oembedData": "{}",
                                "isPharmacyPromotionImage": false,
                                "__typename": "ProductMedia"
                            },
                            {
                                "id": "UHJvZHVjdE1lZGlhOjI2NzQ=",
                                "alt": "",
                                "sortOrder": 5,
                                "url": "https://storage.googleapis.com/mccpd-prod-media/thumbnails/products/71009_UC_30CT_PN_8MM_FRONT_9629e347_thumbnail_4096.jpg",
                                "type": "IMAGE",
                                "oembedData": "{}",
                                "isPharmacyPromotionImage": false,
                                "__typename": "ProductMedia"
                            }
                        ],
                        "variants": [
                            {
                                "id": "UHJvZHVjdFZhcmlhbnQ6ODkwMA==",
                                "sku": "97051050146361-30-Generic",
                                "metafields": {
                                    "sku": "97051050146361-30-Generic",
                                    "form": "Box of Pen Needles",
                                    "slug": "insulin-pen-needle-31g-x-6-mm-miscellaneous-30",
                                    "is_active": "true",
                                    "package_size": "30",
                                    "insuranceEligible": "true",
                                    "retailPricePerUnit": "17.15"
                                },
                                "images": [
                                    {
                                        "url": "https://storage.googleapis.com/mccpd-prod-media/thumbnails/products/71008_UC_30CT_PN_6MM_FRONT_7be39fa5_thumbnail_4096.jpg",
                                        "__typename": "ProductImage"
                                    }
                                ],
                                "specialtyMedication": false,
                                "__typename": "ProductVariant"
                            },
                            {
                                "id": "UHJvZHVjdFZhcmlhbnQ6ODkwMg==",
                                "sku": "97051050146361-50-Generic",
                                "metafields": {
                                    "sku": "97051050146361-50-Generic",
                                    "form": "Box of Pen Needles",
                                    "slug": "insulin-pen-needle-31g-x-6-mm-miscellaneous-50",
                                    "is_active": "true",
                                    "package_size": "50",
                                    "insuranceEligible": "true",
                                    "retailPricePerUnit": "23.85"
                                },
                                "images": [
                                    {
                                        "url": "https://storage.googleapis.com/mccpd-prod-media/thumbnails/products/09565_UC_50CT_PN_6MM_FRONT_81706478_thumbnail_4096.jpg",
                                        "__typename": "ProductImage"
                                    }
                                ],
                                "specialtyMedication": false,
                                "__typename": "ProductVariant"
                            },
                            {
                                "id": "UHJvZHVjdFZhcmlhbnQ6ODkwMw==",
                                "sku": "97051050146364-30-Generic",
                                "metafields": {
                                    "sku": "97051050146364-30-Generic",
                                    "form": "Box of Pen Needles",
                                    "slug": "insulin-pen-needle-31g-x-8-mm-miscellaneous-30",
                                    "is_active": "true",
                                    "package_size": "30",
                                    "insuranceEligible": "true",
                                    "retailPricePerUnit": "17.15"
                                },
                                "images": [
                                    {
                                        "url": "https://storage.googleapis.com/mccpd-prod-media/thumbnails/products/71009_UC_30CT_PN_8MM_FRONT_9629e347_thumbnail_4096.jpg",
                                        "__typename": "ProductImage"
                                    }
                                ],
                                "specialtyMedication": false,
                                "__typename": "ProductVariant"
                            },
                            {
                                "id": "UHJvZHVjdFZhcmlhbnQ6ODkwMQ==",
                                "sku": "97051050146364-50-Generic",
                                "metafields": {
                                    "sku": "97051050146364-50-Generic",
                                    "form": "Box of Pen Needles",
                                    "slug": "insulin-pen-needle-31g-x-8-mm-miscellaneous-50",
                                    "is_active": "true",
                                    "package_size": "50",
                                    "insuranceEligible": "true",
                                    "retailPricePerUnit": "23.85"
                                },
                                "images": [
                                    {
                                        "url": "https://storage.googleapis.com/mccpd-prod-media/thumbnails/products/09585_UC_50CT_PN_8MM_FRONT_6f107b89_thumbnail_4096.jpg",
                                        "__typename": "ProductImage"
                                    }
                                ],
                                "specialtyMedication": false,
                                "__typename": "ProductVariant"
                            },
                            {
                                "id": "UHJvZHVjdFZhcmlhbnQ6ODg5OQ==",
                                "sku": "97051050146366-30-Generic",
                                "metafields": {
                                    "sku": "97051050146366-30-Generic",
                                    "form": "Box of Pen Needles",
                                    "slug": "insulin-pen-needle-32g-x-4-mm-miscellaneous-30",
                                    "is_active": "true",
                                    "package_size": "30",
                                    "insuranceEligible": "true",
                                    "retailPricePerUnit": "17.15"
                                },
                                "images": [
                                    {
                                        "url": "https://storage.googleapis.com/mccpd-prod-media/thumbnails/products/71007_UC_30CT_PN_4MM_FRONT_ab6efb63_thumbnail_4096.jpg",
                                        "__typename": "ProductImage"
                                    }
                                ],
                                "specialtyMedication": false,
                                "__typename": "ProductVariant"
                            },
                            {
                                "id": "UHJvZHVjdFZhcmlhbnQ6ODg5OA==",
                                "sku": "97051050146366-50-Generic",
                                "metafields": {
                                    "sku": "97051050146366-50-Generic",
                                    "form": "Box of Pen Needles",
                                    "slug": "insulin-pen-needle-32g-x-4-mm-miscellaneous-50",
                                    "is_active": "true",
                                    "package_size": "50",
                                    "insuranceEligible": "true",
                                    "retailPricePerUnit": "23.85"
                                },
                                "images": [
                                    {
                                        "url": "https://storage.googleapis.com/mccpd-prod-media/thumbnails/products/09545_UC_50CT_PN_4MM_FRONT_4f0db4a8_thumbnail_4096.jpg",
                                        "__typename": "ProductImage"
                                    }
                                ],
                                "specialtyMedication": false,
                                "__typename": "ProductVariant"
                            }
                        ],
                        "isAvailable": false,
                        "metafields": {
                            "brandName": "UltiCare Micro Pen Needles",
                            "brandGeneric": "Generic"
                        },
                        "category": null,
                        "slug": "insulin-pen-needle-31g-x-6-mm-miscellaneous-30",
                        "__typename": "Product"
                    },
                    "__typename": "ProductCountableEdge"
                },

where the key fields include:

* id
* name
* priceCalculation
* retailPrice

---

## Open Questions (Claude)

### 1. Row granularity: product vs. variant

Each product in the API can have multiple variants with different forms and package sizes (e.g., "Insulin Pen Needle" has 6 variants: 30-count and 50-count in 3 needle gauges). Should the CSV/sheet have:

- **One row per variant** (more granular — each form/size combination gets its own row), or
- **One row per product** (one row per drug name, perhaps taking the first/lowest-price variant)?

A: One row per variant

### 2. Field mapping — what is "Home Delivery"?

The API response includes two price fields:
- `priceCalculation` (e.g., `9.31`)
- `retailPrice` (e.g., `17.15`)

Is `priceCalculation` the Cost Plus / home delivery price, and `retailPrice` the standard retail price? Please confirm the intended mapping:

| Column | API field |
|--------|-----------|
| Retail | `retailPrice` |
| Home Delivery | `priceCalculation` |
| Savings | calculated (`retailPrice - priceCalculation`)? |

A: Yes

### 3. Category discovery

The GraphQL API uses base64-encoded collection IDs (e.g., `Q29sbGVjdGlvbjozNA==` = `Collection:34`). Should the script:

- **Option A**: Scrape `/medications/` page first to discover category slugs, then resolve each slug's collection ID via the API, or
- **Option B**: Query a GraphQL `collections` endpoint to enumerate all categories programmatically?

Do you know which approach is feasible, or should the script figure this out?

A: I don't know; please figure this out.

### 4. Telegram notifications

Should the CPD scraper send Telegram notifications on completion (following the same pattern as the existing `scrape_drugs.py`)?

A: Yes

### 5. Cron schedule

Should the CPD scraper run on the same schedule as the existing one (3am daily), or at a different time?

A: Run at 3:23am daily (I just am choosing an arbitrary time)

### 6. Duplicate detection key

For deduplication, what constitutes a "duplicate" row? Options:
- `(Date, Medication, Form)` — same drug + form combination on the same date
- `(Date, Medication)` — same drug name on the same date (regardless of form/variant)

A: (Date, Medication, Form)

## Addendum #2

This seems to work quite well!

One issue: I think we have a duplication issue, and a field mapping issue.

Example results:

Date,Category,Medication,Form,Retail,Home Delivery,Savings
2026-03-06	Women's Health	Premarin (Conjugated Estrogens)	Tablet	$8.31	$192.85	-$184.54
2026-03-06	Women's Health	Premarin (Conjugated Estrogens)	Tablet	$8.30	$192.85	-$184.55
2026-03-06	Women's Health	Premarin (Conjugated Estrogens)	Tablet	$8.23	$192.85	-$184.62
2026-03-06	Women's Health	Premarin (Conjugated Estrogens)	Tablet	$8.31	$192.85	-$184.54
2026-03-06	Women's Health	Premarin (Conjugated Estrogens)	Tablet	$8.28	$192.85	-$184.57
2026-03-06	Women's Health	Premarin (Conjugated Estrogens)	Cream	$562.00	$192.85	$369.15

What the website shows for this item is:

Medication,Form,Retail,Home Delivery,Savings
Premarin (Conjugated Estrogens), Table, $249.30, $192.85, $56.45

So it looks like the retail price in the scrape data for this item is too low, and is variable. Do we know what attributes vary between entries for this item?

For starters, can you save the raw results for these entries in a file in a debug folder (govrx/debug; you'll need to create this)?

