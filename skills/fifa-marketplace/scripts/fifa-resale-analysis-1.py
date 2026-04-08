# %% [markdown]
#
# # This script analyzes the FIFA World Cup ticket dataset

# Key questions:
# * Which venues have the cheapest tickets?
# * How does inventory vary day to day?

# %%
# Import libraries

from pathlib import Path
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

try:
    from IPython.display import display
except ImportError:
    display = print

# %%
# Resolve data directory relative to this file, whether run as a script or notebook
try:
    _script_dir = Path(__file__).parent
except NameError:
    _script_dir = Path.cwd()  # Jupyter: assume notebook is in the scripts/ dir

DATA_DIR = _script_dir / ".." / "data"

print(DATA_DIR)
# %%
# Load the data

df_tix_raw = pd.read_csv(DATA_DIR / "fifa-resale-tickets.csv")

print(df_tix_raw.dtypes)

# %%
# Enhance

df_tix_raw['seat_key'] = (df_tix_raw['Match'] + '-' +
                          df_tix_raw['Section'].astype(str).str.zfill(4) + '-' +
                          df_tix_raw['Row'].astype(str).str.zfill(4) + '-' +
                          df_tix_raw['Seat'].astype(str).str.zfill(4))

df_tix_raw['Match ID'] = df_tix_raw['Match'].str.extract(r'M(\d+)').astype(int)

# %%
# Keep latest pull by date

latest_pull = (df_tix_raw.groupby(["Match", "Pull Date"])["Pull Time"]
               .transform("max"))
df_tix_daily = df_tix_raw[df_tix_raw["Pull Time"] == latest_pull].copy()

# %%
# Let's figure out how many snapshots, how many matches:

df_cnts_by_match = df_tix_raw.groupby("Match").agg(
    num_dt=("Pull Date", "nunique"),
    min_dt=("Pull Date", "min"),
    max_dt=("Pull Date", "max"),
    unique_seats=("seat_key", "nunique")
).sort_values("num_dt", ascending=False)

print("All Matches:")
display(df_cnts_by_match)

print("Matches with 2+ snapshots:")

display(df_cnts_by_match[df_cnts_by_match["num_dt"] >= 2].sort_values(['max_dt', 'num_dt'], ascending=False))

# %%
# Review a single match

df_single_match = df_tix_raw[df_tix_raw["Match"] == "M18"].copy()

df_sm_by_pull = df_single_match.groupby(["Pull Date", 'Pull Time']).agg(
    cnt_seats=("seat_key", "nunique"),    
)

display(df_sm_by_pull)
# %%

df_all_by_pull = df_tix_daily.groupby(['Match ID', "Pull Date", 'Pull Time']).agg(
    cnt_seats=("seat_key", "nunique"),    
)

display(df_all_by_pull)

df_all_xtab = df_all_by_pull.reset_index().pivot(index="Match ID", columns="Pull Date", values="cnt_seats")    

display(df_all_xtab)
# %%

df_all_xtab.to_csv(DATA_DIR / "fifa-resale-tickets-daily-xtab.csv")

# %%
# For all cases where we have snapshots for 2026-04-03 and 2026-04-06:
# For each match, determine:
# * How many seats existed on the Apr 3 snapshot, but not Apr 6?
# * How many are listed in the Apr 6 snapshot, but not the 3rd?

DATE_A = "2026-04-03"
DATE_B = "2026-04-06"

seats_a = df_tix_daily[df_tix_daily["Pull Date"] == DATE_A].groupby("Match")["seat_key"].apply(set)
seats_b = df_tix_daily[df_tix_daily["Pull Date"] == DATE_B].groupby("Match")["seat_key"].apply(set)

both = seats_a.index.intersection(seats_b.index)

df_seat_churn = pd.DataFrame({
    "sold_or_removed": [len(seats_a[m] - seats_b[m]) for m in both],
    "new_or_relisted":  [len(seats_b[m] - seats_a[m]) for m in both],
    "in_both":          [len(seats_a[m] & seats_b[m]) for m in both],
    "cnt_apr3":         [len(seats_a[m]) for m in both],
    "cnt_apr6":         [len(seats_b[m]) for m in both],
}, index=both).sort_index()

display(df_seat_churn)

# %%
# Save seat churn

df_seat_churn.to_csv(DATA_DIR / "fifa-resale-tickets-seat-churn.csv")   

# %%
# Histos of sold/removed vs stayed vs added

# For specific matches & categories, what's the distribution of prices across:
# * Sold/removed
# * Stayed
# * Added

# Show each match/category as a seperate chart, 
# with 3 histograms stacked verticall for the 3 categories above.

list_matches = [18, 47]
list_categories = ["Category 1"]
bin_width = 100  # set to None to use 20 equal-width bins up to 95th percentile

snap_a = df_tix_daily[df_tix_daily["Pull Date"] == DATE_A].set_index("seat_key")
snap_b = df_tix_daily[df_tix_daily["Pull Date"] == DATE_B].set_index("seat_key")

for match_id in list_matches:
    match_str = f"M{match_id}"
    for cat in list_categories:
        mask_a = (snap_a["Match"] == match_str) & (snap_a["Category"] == cat)
        mask_b = (snap_b["Match"] == match_str) & (snap_b["Category"] == cat)

        keys_a = set(snap_a[mask_a].index)
        keys_b = set(snap_b[mask_b].index)

        prices_sold    = snap_a.loc[snap_a.index.isin(keys_a - keys_b) & mask_a, "Price"]
        prices_stayed  = snap_b.loc[snap_b.index.isin(keys_a & keys_b)  & mask_b, "Price"]
        prices_added   = snap_b.loc[snap_b.index.isin(keys_b - keys_a)  & mask_b, "Price"]

        groups = [
            (f"Sold/Removed ({len(prices_sold)})", prices_sold,   "tomato"),
            (f"Stayed ({len(prices_stayed)})",      prices_stayed, "steelblue"),
            (f"Added ({len(prices_added)})",         prices_added,  "mediumseagreen"),
        ]

        print(f"\n{match_str} — {cat}")
        print(f"{'Group':<20} {'p10':>8} {'p50':>8} {'p90':>8} {'mean':>8}")
        print("-" * 52)
        for label, prices, _ in groups:
            if len(prices):
                print(f"{label:<20} {prices.quantile(0.10):>8.0f} {prices.quantile(0.50):>8.0f} "
                      f"{prices.quantile(0.90):>8.0f} {prices.mean():>8.0f}")
            else:
                print(f"{label:<20} {'—':>8} {'—':>8} {'—':>8} {'—':>8}")

        all_prices = pd.concat([prices_sold, prices_stayed, prices_added])
        x_max = all_prices.quantile(0.95)
        x_min = all_prices.min()
        if bin_width is not None:
            bins = np.arange(x_min // bin_width * bin_width, x_max + bin_width, bin_width)
        else:
            bins = np.linspace(x_min, x_max, 21)  # 20 equal-width bins up to 95th pct

        fig, axes = plt.subplots(3, 1, figsize=(10, 9), sharex=True)
        fig.suptitle(f"{match_str} — {cat}\n{DATE_A} vs {DATE_B}", fontsize=13)

        for ax, (label, prices, color) in zip(axes, groups):
            ax.hist(prices.clip(upper=x_max), bins=bins, color=color, edgecolor="white", alpha=0.85)
            ax.set_ylabel("Count")
            ax.set_title(label, fontsize=11)

        axes[-1].set_xlabel("Price")
        axes[-1].set_xlim(x_min, x_max)
        plt.tight_layout()
        plt.show()


# %%
