# World Cup Ticket Price Tracking

I want to build code that can help me track prices on the FIFA World Cup resell exchange. This is a site that I manually need to log into, to get past the robot checkers and enter an emailed code.

But once in, I want to programatically extract, for each match (or a subset of matches), info for all available tickets:
* Seat info (category, section, row, seat #)
* Price

I think we can do this if we have a script that opens a playright browser; pauses while I log in, and then on my signal, gets to work.

Here's some info about the site:

Here are a couple game URLs:

https://fwc26-resale-usd.tickets.fifa.com/secure/selection/event/seat/performance/10229226700905/contact-advantages/10229516236677,10229516236678,10229516236679,10229997366894/lang/en

The HTTP for this page appears to contain the ID's we need for each game, in e.g. 

```

<li data-venue-id="10229225095693" aria-labelledby="event_code_M74
											dtm_M74
											venue_M74
											teams_M74
											availability_M74" data-host-team-id="10229226701500" onclick="
												document.location.href = '/secured/selection/event/seat?perfId=10229226725329&productId=10229225515651&lang=en';
											" tabindex="0" style="height: fit-content;
											cursor: pointer;
											" id="10229226725329" data-opposing-team-id="10229226701522" class="
											add_keyboard_support
											performance
											limited 
											performance_SPORTING_EVENT
											performance-1
											
												with_location
											
											
												with_perf_name
											
											
												with_at_least_one_advantage
											
											
											 with_advantage ">
											<div class="performance_line_container">

```

And when I click on this game, and then click on a section, the call with the data I want is:

https://fwc26-resale-usd.tickets.fifa.com/tnwr/v1/secure/seatmap/seats/free/ol?productId=10229225515651&performanceId=10229226700905&isSeasonTicketMode=false&advantageId=&isModifyAllSeatsMode=false&ppid=&reservationIdx=&crossSellId=&baseOperationIdsString=&bbox=15000,5000,5000,5000&isExclusive=true

Here's another example after I scroll around:

https://fwc26-resale-usd.tickets.fifa.com/tnwr/v1/secure/seatmap/seats/free/ol?productId=10229225515651&performanceId=10229226700905&isSeasonTicketMode=false&advantageId=&isModifyAllSeatsMode=false&ppid=&reservationIdx=&crossSellId=&baseOperationIdsString=&bbox=15000,5000,5000,5000&isExclusive=true

https://fwc26-resale-usd.tickets.fifa.com/tnwr/v1/secure/seatmap/seats/free/ol?productId=10229225515651&performanceId=10229226700905&isSeasonTicketMode=false&advantageId=&isModifyAllSeatsMode=false&ppid=&reservationIdx=&crossSellId=&baseOperationIdsString=&bbox=10000,0,5000,5000&isExclusive=true


https://fwc26-resale-usd.tickets.fifa.com/tnwr/v1/secure/seatmap/seats/free/ol?productId=10229225515651&performanceId=10229226700905&isSeasonTicketMode=false&advantageId=&isModifyAllSeatsMode=false&ppid=&reservationIdx=&crossSellId=&baseOperationIdsString=&bbox=25000,25000,5000,5000&isExclusive=true

Let's try another game:

https://fwc26-resale-usd.tickets.fifa.com/tnwr/v1/secure/seatmap/seats/free/ol?productId=10229225515651&performanceId=10229226725329&isSeasonTicketMode=false&advantageId=&isModifyAllSeatsMode=false&ppid=&reservationIdx=&crossSellId=&baseOperationIdsString=&bbox=20000,5000,5000,10000&isExclusive=true

Another section at that game:

https://fwc26-resale-usd.tickets.fifa.com/tnwr/v1/secure/seatmap/seats/free/ol?productId=10229225515651&performanceId=10229226725329&isSeasonTicketMode=false&advantageId=&isModifyAllSeatsMode=false&ppid=&reservationIdx=&crossSellId=&baseOperationIdsString=&bbox=10000,25000,5000,5000&isExclusive=true

Different game, top-left:

https://fwc26-resale-usd.tickets.fifa.com/tnwr/v1/secure/seatmap/seats/free/ol?productId=10229225515651&performanceId=10229226700918&isSeasonTicketMode=false&advantageId=&isModifyAllSeatsMode=false&ppid=&reservationIdx=&crossSellId=&baseOperationIdsString=&bbox=0,0,10000,10000&isExclusive=true

Same game, bottom right:

https://fwc26-resale-usd.tickets.fifa.com/tnwr/v1/secure/seatmap/seats/free/ol?productId=10229225515651&performanceId=10229226700918&isSeasonTicketMode=false&advantageId=&isModifyAllSeatsMode=false&ppid=&reservationIdx=&crossSellId=&baseOperationIdsString=&bbox=0,0,10000,10000&isExclusive=true

Result example (for the 1st call)

{
    "features": [
        {
            "id": 10229531484111,
            "geometry": {
                "coordinates": [
                    15001,
                    9233
                ],
                "rotation": 171,
                "type": "Point"
            },
            "properties": {
                "id": 10229531484111,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "33",
                "number": "3",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 4307400,
                "resaleMovementId": 10229524415459,
                "exclusive": true
            }
        },
        {
            "id": 10229531484123,
            "geometry": {
                "coordinates": [
                    15046,
                    9226
                ],
                "rotation": 171,
                "type": "Point"
            },
            "properties": {
                "id": 10229531484123,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "33",
                "number": "4",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 4307400,
                "resaleMovementId": 10229524415460,
                "exclusive": true
            }
        },
        {
            "id": 10229531484134,
            "geometry": {
                "coordinates": [
                    15092,
                    9219
                ],
                "rotation": 171,
                "type": "Point"
            },
            "properties": {
                "id": 10229531484134,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "33",
                "number": "5",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 4307400,
                "resaleMovementId": 10229524415461,
                "exclusive": true
            }
        },
        {
            "id": 10229531484145,
            "geometry": {
                "coordinates": [
                    15137,
                    9213
                ],
                "rotation": 171,
                "type": "Point"
            },
            "properties": {
                "id": 10229531484145,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "33",
                "number": "6",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 4307400,
                "resaleMovementId": 10229524415462,
                "exclusive": true
            }
        },
        {
            "id": 10229531486764,
            "geometry": {
                "coordinates": [
                    15805,
                    9370
                ],
                "rotation": 174,
                "type": "Point"
            },
            "properties": {
                "id": 10229531486764,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "30",
                "number": "20",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 850000,
                "resaleMovementId": 10229523041515,
                "exclusive": true
            }
        },
        {
            "id": 10229531485419,
            "geometry": {
                "coordinates": [
                    15329,
                    9266
                ],
                "rotation": 172,
                "type": "Point"
            },
            "properties": {
                "id": 10229531485419,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "32",
                "number": "10",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 735000,
                "resaleMovementId": 10229522728899,
                "exclusive": true
            }
        },
        {
            "id": 10229531485452,
            "geometry": {
                "coordinates": [
                    15466,
                    9249
                ],
                "rotation": 173,
                "type": "Point"
            },
            "properties": {
                "id": 10229531485452,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "32",
                "number": "13",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 2200000,
                "resaleMovementId": 10229522954496,
                "exclusive": true
            }
        },
        {
            "id": 10229531486079,
            "geometry": {
                "coordinates": [
                    15512,
                    9244
                ],
                "rotation": 173,
                "type": "Point"
            },
            "properties": {
                "id": 10229531486079,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "32",
                "number": "14",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 2200000,
                "resaleMovementId": 10229522954497,
                "exclusive": true
            }
        },
        {
            "id": 10229531486090,
            "geometry": {
                "coordinates": [
                    15558,
                    9239
                ],
                "rotation": 173,
                "type": "Point"
            },
            "properties": {
                "id": 10229531486090,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "32",
                "number": "15",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 2200000,
                "resaleMovementId": 10229522954498,
                "exclusive": true
            }
        },
        {
            "id": 10229531486101,
            "geometry": {
                "coordinates": [
                    15603,
                    9234
                ],
                "rotation": 173,
                "type": "Point"
            },
            "properties": {
                "id": 10229531486101,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "32",
                "number": "16",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 2200000,
                "resaleMovementId": 10229522954499,
                "exclusive": true
            }
        },
        {
            "id": 10229531486734,
            "geometry": {
                "coordinates": [
                    15676,
                    9069
                ],
                "rotation": 174,
                "type": "Point"
            },
            "properties": {
                "id": 10229531486734,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "34",
                "number": "18",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 575000,
                "resaleMovementId": 10229524961041,
                "exclusive": true
            }
        },
        {
            "id": 10229531484795,
            "geometry": {
                "coordinates": [
                    15284,
                    9272
                ],
                "rotation": 172,
                "type": "Point"
            },
            "properties": {
                "id": 10229531484795,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "32",
                "number": "9",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 735000,
                "resaleMovementId": 10229522740376,
                "exclusive": true
            }
        },
        {
            "id": 10229531485454,
            "geometry": {
                "coordinates": [
                    15476,
                    9326
                ],
                "rotation": 173,
                "type": "Point"
            },
            "properties": {
                "id": 10229531485454,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "31",
                "number": "13",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 2000000,
                "resaleMovementId": 10229522006181,
                "exclusive": true
            }
        },
        {
            "id": 10229531486081,
            "geometry": {
                "coordinates": [
                    15521,
                    9321
                ],
                "rotation": 173,
                "type": "Point"
            },
            "properties": {
                "id": 10229531486081,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "31",
                "number": "14",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 2000000,
                "resaleMovementId": 10229522006182,
                "exclusive": true
            }
        },
        {
            "id": 10229531486092,
            "geometry": {
                "coordinates": [
                    15567,
                    9316
                ],
                "rotation": 173,
                "type": "Point"
            },
            "properties": {
                "id": 10229531486092,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "31",
                "number": "15",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 2000000,
                "resaleMovementId": 10229522006183,
                "exclusive": true
            }
        },
        {
            "id": 10229531486103,
            "geometry": {
                "coordinates": [
                    15613,
                    9311
                ],
                "rotation": 173,
                "type": "Point"
            },
            "properties": {
                "id": 10229531486103,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "31",
                "number": "16",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 2000000,
                "resaleMovementId": 10229522006184,
                "exclusive": true
            }
        },
        {
            "id": 10229531484764,
            "geometry": {
                "coordinates": [
                    15158,
                    9762
                ],
                "rotation": 171,
                "type": "Point"
            },
            "properties": {
                "id": 10229531484764,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "26",
                "number": "5",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 1200000,
                "resaleMovementId": 10229518663042,
                "exclusive": true
            }
        },
        {
            "id": 10229531484775,
            "geometry": {
                "coordinates": [
                    15204,
                    9755
                ],
                "rotation": 171,
                "type": "Point"
            },
            "properties": {
                "id": 10229531484775,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "26",
                "number": "6",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 1200000,
                "resaleMovementId": 10229518663043,
                "exclusive": true
            }
        },
        {
            "id": 10229531484786,
            "geometry": {
                "coordinates": [
                    15249,
                    9749
                ],
                "rotation": 172,
                "type": "Point"
            },
            "properties": {
                "id": 10229531484786,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "26",
                "number": "7",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 1200000,
                "resaleMovementId": 10229518663044,
                "exclusive": true
            }
        },
        {
            "id": 10229531484797,
            "geometry": {
                "coordinates": [
                    15295,
                    9742
                ],
                "rotation": 172,
                "type": "Point"
            },
            "properties": {
                "id": 10229531484797,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "26",
                "number": "8",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 1200000,
                "resaleMovementId": 10229518663045,
                "exclusive": true
            }
        },
        {
            "id": 10229531486735,
            "geometry": {
                "coordinates": [
                    15687,
                    9538
                ],
                "rotation": 174,
                "type": "Point"
            },
            "properties": {
                "id": 10229531486735,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "28",
                "number": "17",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 550000,
                "resaleMovementId": 10229521131170,
                "exclusive": true
            }
        },
        {
            "id": 10229531486746,
            "geometry": {
                "coordinates": [
                    15733,
                    9534
                ],
                "rotation": 174,
                "type": "Point"
            },
            "properties": {
                "id": 10229531486746,
                "block": {
                    "id": 10229531392966,
                    "name": {
                        "de": "107",
                        "ar": "107",
                        "pt": "107",
                        "en": "107",
                        "fr": "107",
                        "es": "107"
                    }
                },
                "area": {
                    "id": 10229531240668,
                    "name": {
                        "de": "Opposite Stand - Lower Tier",
                        "ar": "Opposite Stand - Lower Tier",
                        "pt": "Opposite Stand - Lower Tier",
                        "en": "Opposite Stand - Lower Tier",
                        "fr": "Opposite Stand - Lower Tier",
                        "es": "Opposite Stand - Lower Tier"
                    }
                },
                "color": "#C78800",
                "row": "28",
                "number": "18",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596154,
                "audienceSubCategoryId": 0,
                "amount": 550000,
                "resaleMovementId": 10229521131171,
                "exclusive": true
            }
        },
        {
            "id": 10229531526534,
            "geometry": {
                "coordinates": [
                    15051,
                    7568
                ],
                "rotation": 173,
                "type": "Point"
            },
            "properties": {
                "id": 10229531526534,
                "block": {
                    "id": 10229531470641,
                    "name": {
                        "de": "CL7",
                        "ar": "CL7",
                        "pt": "CL7",
                        "en": "CL7",
                        "fr": "CL7",
                        "es": "CL7"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "10",
                "number": "11",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 900000,
                "resaleMovementId": 10229986169250,
                "exclusive": true
            }
        },
        {
            "id": 10229531527164,
            "geometry": {
                "coordinates": [
                    15115,
                    7560
                ],
                "rotation": 173,
                "type": "Point"
            },
            "properties": {
                "id": 10229531527164,
                "block": {
                    "id": 10229531470641,
                    "name": {
                        "de": "CL7",
                        "ar": "CL7",
                        "pt": "CL7",
                        "en": "CL7",
                        "fr": "CL7",
                        "es": "CL7"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "10",
                "number": "12",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 900000,
                "resaleMovementId": 10229986169251,
                "exclusive": true
            }
        },
        {
            "id": 10229531528393,
            "geometry": {
                "coordinates": [
                    18572,
                    6438
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531528393,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "20",
                "number": "4",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1800000,
                "resaleMovementId": 10229987161854,
                "exclusive": true
            }
        },
        {
            "id": 10229531528394,
            "geometry": {
                "coordinates": [
                    18632,
                    6440
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531528394,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "20",
                "number": "5",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1800000,
                "resaleMovementId": 10229987161855,
                "exclusive": true
            }
        },
        {
            "id": 10229531528395,
            "geometry": {
                "coordinates": [
                    18692,
                    6441
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531528395,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "20",
                "number": "6",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1800000,
                "resaleMovementId": 10229987161856,
                "exclusive": true
            }
        },
        {
            "id": 10229531528396,
            "geometry": {
                "coordinates": [
                    18752,
                    6442
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531528396,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "20",
                "number": "7",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1800000,
                "resaleMovementId": 10229987161857,
                "exclusive": true
            }
        },
        {
            "id": 10229531528397,
            "geometry": {
                "coordinates": [
                    18812,
                    6443
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531528397,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "20",
                "number": "8",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1000000,
                "resaleMovementId": 10229987154215,
                "exclusive": true
            }
        },
        {
            "id": 10229531528398,
            "geometry": {
                "coordinates": [
                    18872,
                    6444
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531528398,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "20",
                "number": "9",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1000000,
                "resaleMovementId": 10229987154216,
                "exclusive": true
            }
        },
        {
            "id": 10229531529049,
            "geometry": {
                "coordinates": [
                    18591,
                    6249
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531529049,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "22",
                "number": "4",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 800000,
                "resaleMovementId": 10229987259421,
                "exclusive": true
            }
        },
        {
            "id": 10229531527124,
            "geometry": {
                "coordinates": [
                    17059,
                    7596
                ],
                "rotation": 179,
                "type": "Point"
            },
            "properties": {
                "id": 10229531527124,
                "block": {
                    "id": 10229531470643,
                    "name": {
                        "de": "CL9",
                        "ar": "CL9",
                        "pt": "CL9",
                        "en": "CL9",
                        "fr": "CL9",
                        "es": "CL9"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "8",
                "number": "1",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 3500000,
                "resaleMovementId": 10229986147811,
                "exclusive": true
            }
        },
        {
            "id": 10229531527143,
            "geometry": {
                "coordinates": [
                    17117,
                    7595
                ],
                "rotation": 179,
                "type": "Point"
            },
            "properties": {
                "id": 10229531527143,
                "block": {
                    "id": 10229531470643,
                    "name": {
                        "de": "CL9",
                        "ar": "CL9",
                        "pt": "CL9",
                        "en": "CL9",
                        "fr": "CL9",
                        "es": "CL9"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "8",
                "number": "2",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 3500000,
                "resaleMovementId": 10229986147812,
                "exclusive": true
            }
        },
        {
            "id": 10229531527778,
            "geometry": {
                "coordinates": [
                    17175,
                    7594
                ],
                "rotation": 179,
                "type": "Point"
            },
            "properties": {
                "id": 10229531527778,
                "block": {
                    "id": 10229531470643,
                    "name": {
                        "de": "CL9",
                        "ar": "CL9",
                        "pt": "CL9",
                        "en": "CL9",
                        "fr": "CL9",
                        "es": "CL9"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "8",
                "number": "3",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 3500000,
                "resaleMovementId": 10229986156158,
                "exclusive": true
            }
        },
        {
            "id": 10229531527797,
            "geometry": {
                "coordinates": [
                    17233,
                    7593
                ],
                "rotation": 179,
                "type": "Point"
            },
            "properties": {
                "id": 10229531527797,
                "block": {
                    "id": 10229531470643,
                    "name": {
                        "de": "CL9",
                        "ar": "CL9",
                        "pt": "CL9",
                        "en": "CL9",
                        "fr": "CL9",
                        "es": "CL9"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "8",
                "number": "4",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 3500000,
                "resaleMovementId": 10229986156159,
                "exclusive": true
            }
        },
        {
            "id": 10229531521289,
            "geometry": {
                "coordinates": [
                    17995,
                    8055
                ],
                "rotation": 179,
                "type": "Point"
            },
            "properties": {
                "id": 10229531521289,
                "block": {
                    "id": 10229531470643,
                    "name": {
                        "de": "CL9",
                        "ar": "CL9",
                        "pt": "CL9",
                        "en": "CL9",
                        "fr": "CL9",
                        "es": "CL9"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "3",
                "number": "17",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 749000,
                "resaleMovementId": 10229963960560,
                "exclusive": true
            }
        },
        {
            "id": 10229531521922,
            "geometry": {
                "coordinates": [
                    18053,
                    8054
                ],
                "rotation": 179,
                "type": "Point"
            },
            "properties": {
                "id": 10229531521922,
                "block": {
                    "id": 10229531470643,
                    "name": {
                        "de": "CL9",
                        "ar": "CL9",
                        "pt": "CL9",
                        "en": "CL9",
                        "fr": "CL9",
                        "es": "CL9"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "3",
                "number": "18",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 749000,
                "resaleMovementId": 10229963960561,
                "exclusive": true
            }
        },
        {
            "id": 10229531521942,
            "geometry": {
                "coordinates": [
                    18111,
                    8053
                ],
                "rotation": 179,
                "type": "Point"
            },
            "properties": {
                "id": 10229531521942,
                "block": {
                    "id": 10229531470643,
                    "name": {
                        "de": "CL9",
                        "ar": "CL9",
                        "pt": "CL9",
                        "en": "CL9",
                        "fr": "CL9",
                        "es": "CL9"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "3",
                "number": "19",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 749000,
                "resaleMovementId": 10229963960562,
                "exclusive": true
            }
        },
        {
            "id": 10229531522575,
            "geometry": {
                "coordinates": [
                    18169,
                    8051
                ],
                "rotation": 179,
                "type": "Point"
            },
            "properties": {
                "id": 10229531522575,
                "block": {
                    "id": 10229531470643,
                    "name": {
                        "de": "CL9",
                        "ar": "CL9",
                        "pt": "CL9",
                        "en": "CL9",
                        "fr": "CL9",
                        "es": "CL9"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "3",
                "number": "20",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 749000,
                "resaleMovementId": 10229963960563,
                "exclusive": true
            }
        },
        {
            "id": 10229531521371,
            "geometry": {
                "coordinates": [
                    15843,
                    6821
                ],
                "rotation": 174,
                "type": "Point"
            },
            "properties": {
                "id": 10229531521371,
                "block": {
                    "id": 10229531470642,
                    "name": {
                        "de": "CL8",
                        "ar": "CL8",
                        "pt": "CL8",
                        "en": "CL8",
                        "fr": "CL8",
                        "es": "CL8"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "17",
                "number": "3",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 2000000,
                "resaleMovementId": 10229986260722,
                "exclusive": true
            }
        },
        {
            "id": 10229531522006,
            "geometry": {
                "coordinates": [
                    15917,
                    6814
                ],
                "rotation": 175,
                "type": "Point"
            },
            "properties": {
                "id": 10229531522006,
                "block": {
                    "id": 10229531470642,
                    "name": {
                        "de": "CL8",
                        "ar": "CL8",
                        "pt": "CL8",
                        "en": "CL8",
                        "fr": "CL8",
                        "es": "CL8"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "17",
                "number": "4",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 2000000,
                "resaleMovementId": 10229986260723,
                "exclusive": true
            }
        },
        {
            "id": 10229531523991,
            "geometry": {
                "coordinates": [
                    16477,
                    7440
                ],
                "rotation": 176,
                "type": "Point"
            },
            "properties": {
                "id": 10229531523991,
                "block": {
                    "id": 10229531470642,
                    "name": {
                        "de": "CL8",
                        "ar": "CL8",
                        "pt": "CL8",
                        "en": "CL8",
                        "fr": "CL8",
                        "es": "CL8"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "10",
                "number": "11",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1380000,
                "resaleMovementId": 10229986160034,
                "exclusive": true
            }
        },
        {
            "id": 10229531524627,
            "geometry": {
                "coordinates": [
                    16550,
                    7436
                ],
                "rotation": 176,
                "type": "Point"
            },
            "properties": {
                "id": 10229531524627,
                "block": {
                    "id": 10229531470642,
                    "name": {
                        "de": "CL8",
                        "ar": "CL8",
                        "pt": "CL8",
                        "en": "CL8",
                        "fr": "CL8",
                        "es": "CL8"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "10",
                "number": "12",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1380000,
                "resaleMovementId": 10229986160035,
                "exclusive": true
            }
        },
        {
            "id": 10229531524649,
            "geometry": {
                "coordinates": [
                    16623,
                    7432
                ],
                "rotation": 176,
                "type": "Point"
            },
            "properties": {
                "id": 10229531524649,
                "block": {
                    "id": 10229531470642,
                    "name": {
                        "de": "CL8",
                        "ar": "CL8",
                        "pt": "CL8",
                        "en": "CL8",
                        "fr": "CL8",
                        "es": "CL8"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "10",
                "number": "13",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1380000,
                "resaleMovementId": 10229986160036,
                "exclusive": true
            }
        },
        {
            "id": 10229531525287,
            "geometry": {
                "coordinates": [
                    16696,
                    7428
                ],
                "rotation": 177,
                "type": "Point"
            },
            "properties": {
                "id": 10229531525287,
                "block": {
                    "id": 10229531470642,
                    "name": {
                        "de": "CL8",
                        "ar": "CL8",
                        "pt": "CL8",
                        "en": "CL8",
                        "fr": "CL8",
                        "es": "CL8"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "10",
                "number": "14",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1380000,
                "resaleMovementId": 10229986160037,
                "exclusive": true
            }
        },
        {
            "id": 10229531475724,
            "geometry": {
                "coordinates": [
                    18971,
                    7586
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531475724,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "8",
                "number": "11",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1300000,
                "resaleMovementId": 10229986144914,
                "exclusive": true
            }
        },
        {
            "id": 10229531475733,
            "geometry": {
                "coordinates": [
                    19029,
                    7587
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531475733,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "8",
                "number": "12",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1300000,
                "resaleMovementId": 10229986144915,
                "exclusive": true
            }
        },
        {
            "id": 10229531527202,
            "geometry": {
                "coordinates": [
                    19988,
                    6661
                ],
                "rotation": 183,
                "type": "Point"
            },
            "properties": {
                "id": 10229531527202,
                "block": {
                    "id": 10229531470629,
                    "name": {
                        "de": "CL11",
                        "ar": "CL11",
                        "pt": "CL11",
                        "en": "CL11",
                        "fr": "CL11",
                        "es": "CL11"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "18",
                "number": "4",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 900000,
                "resaleMovementId": 10229986262985,
                "exclusive": true
            }
        },
        {
            "id": 10229531472257,
            "geometry": {
                "coordinates": [
                    18623,
                    7580
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531472257,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "8",
                "number": "5",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 800000,
                "resaleMovementId": 10229986149265,
                "exclusive": true
            }
        },
        {
            "id": 10229531475188,
            "geometry": {
                "coordinates": [
                    18681,
                    7581
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531475188,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "8",
                "number": "6",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 800000,
                "resaleMovementId": 10229986149266,
                "exclusive": true
            }
        },
        {
            "id": 10229531529151,
            "geometry": {
                "coordinates": [
                    15198,
                    6500
                ],
                "rotation": 173,
                "type": "Point"
            },
            "properties": {
                "id": 10229531529151,
                "block": {
                    "id": 10229531470641,
                    "name": {
                        "de": "CL7",
                        "ar": "CL7",
                        "pt": "CL7",
                        "en": "CL7",
                        "fr": "CL7",
                        "es": "CL7"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "21",
                "number": "15",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1700000,
                "resaleMovementId": 10229986914018,
                "exclusive": true
            }
        },
        {
            "id": 10229531529152,
            "geometry": {
                "coordinates": [
                    15266,
                    6493
                ],
                "rotation": 174,
                "type": "Point"
            },
            "properties": {
                "id": 10229531529152,
                "block": {
                    "id": 10229531470641,
                    "name": {
                        "de": "CL7",
                        "ar": "CL7",
                        "pt": "CL7",
                        "en": "CL7",
                        "fr": "CL7",
                        "es": "CL7"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "21",
                "number": "16",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1700000,
                "resaleMovementId": 10229986914019,
                "exclusive": true
            }
        },
        {
            "id": 10229531474711,
            "geometry": {
                "coordinates": [
                    19322,
                    7402
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531474711,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "10",
                "number": "17",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1800000,
                "resaleMovementId": 10229986170073,
                "exclusive": true
            }
        },
        {
            "id": 10229531474712,
            "geometry": {
                "coordinates": [
                    19380,
                    7403
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531474712,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "10",
                "number": "18",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1800000,
                "resaleMovementId": 10229986170074,
                "exclusive": true
            }
        },
        {
            "id": 10229531474713,
            "geometry": {
                "coordinates": [
                    19438,
                    7404
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531474713,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "10",
                "number": "19",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1800000,
                "resaleMovementId": 10229986170075,
                "exclusive": true
            }
        },
        {
            "id": 10229531474714,
            "geometry": {
                "coordinates": [
                    19496,
                    7405
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531474714,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "10",
                "number": "20",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1800000,
                "resaleMovementId": 10229986170076,
                "exclusive": true
            }
        },
        {
            "id": 10229531531161,
            "geometry": {
                "coordinates": [
                    15722,
                    7213
                ],
                "rotation": 174,
                "type": "Point"
            },
            "properties": {
                "id": 10229531531161,
                "block": {
                    "id": 10229531470642,
                    "name": {
                        "de": "CL8",
                        "ar": "CL8",
                        "pt": "CL8",
                        "en": "CL8",
                        "fr": "CL8",
                        "es": "CL8"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "13",
                "number": "1",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 850000,
                "resaleMovementId": 10229986202512,
                "exclusive": true
            }
        },
        {
            "id": 10229531521341,
            "geometry": {
                "coordinates": [
                    15796,
                    7207
                ],
                "rotation": 174,
                "type": "Point"
            },
            "properties": {
                "id": 10229531521341,
                "block": {
                    "id": 10229531470642,
                    "name": {
                        "de": "CL8",
                        "ar": "CL8",
                        "pt": "CL8",
                        "en": "CL8",
                        "fr": "CL8",
                        "es": "CL8"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "13",
                "number": "2",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 850000,
                "resaleMovementId": 10229986202513,
                "exclusive": true
            }
        },
        {
            "id": 10229531475757,
            "geometry": {
                "coordinates": [
                    19198,
                    7875
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531475757,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "5",
                "number": "15",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1800000,
                "resaleMovementId": 10229964200139,
                "exclusive": true
            }
        },
        {
            "id": 10229531474202,
            "geometry": {
                "coordinates": [
                    19256,
                    7876
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531474202,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "5",
                "number": "16",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1800000,
                "resaleMovementId": 10229964200140,
                "exclusive": true
            }
        },
        {
            "id": 10229531474211,
            "geometry": {
                "coordinates": [
                    19314,
                    7877
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531474211,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "5",
                "number": "17",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1800000,
                "resaleMovementId": 10229964200141,
                "exclusive": true
            }
        },
        {
            "id": 10229531474220,
            "geometry": {
                "coordinates": [
                    19372,
                    7878
                ],
                "rotation": 181,
                "type": "Point"
            },
            "properties": {
                "id": 10229531474220,
                "block": {
                    "id": 10229531470628,
                    "name": {
                        "de": "CL10",
                        "ar": "CL10",
                        "pt": "CL10",
                        "en": "CL10",
                        "fr": "CL10",
                        "es": "CL10"
                    }
                },
                "area": {
                    "id": 10229531240669,
                    "name": {
                        "de": "Opposite Stand - Middle Tier",
                        "ar": "Opposite Stand - Middle Tier",
                        "pt": "Opposite Stand - Middle Tier",
                        "en": "Opposite Stand - Middle Tier",
                        "fr": "Opposite Stand - Middle Tier",
                        "es": "Opposite Stand - Middle Tier"
                    }
                },
                "color": "#C78800",
                "row": "5",
                "number": "18",
                "seatCategoryId": 10229531538783,
                "seatCategory": "Category 1",
                "contingentId": 11404596151,
                "audienceSubCategoryId": 0,
                "amount": 1800000,
                "resaleMovementId": 10229964200142,
                "exclusive": true
            }
        }
    ]
}