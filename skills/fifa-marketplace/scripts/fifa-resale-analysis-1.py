# %% [markdown]
#
# # This script analyzes the FIFA World Cup ticket dataset

# Key questions:
# * Which venues have the cheapest tickets?
# * How does inventory vary day to day?

# %%
# Import libraries

from pathlib import Path
import datetime

import pandas as pd
import numpy as np

import matplotlib.pyplot as plt
import seaborn as sns

from scipy.stats import gaussian_kde

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

dt = pd.to_datetime(datetime.datetime.now().date()).strftime("%Y-%m-%d")

print(f"Date: {dt}")

# %%
# Load the data

df_tix_raw = pd.read_csv(DATA_DIR / "fifa-resale-tickets.csv")

#print(df_tix_raw.dtypes)

# %%
# Enhance

df_tix_raw['seat_key'] = (df_tix_raw['Match'] + '-' +
                          df_tix_raw['Section'].astype(str).str.zfill(4) + '-' +
                          df_tix_raw['Row'].astype(str).str.zfill(4) + '-' +
                          df_tix_raw['Seat'].astype(str).str.zfill(4))

df_tix_raw['Match ID'] = df_tix_raw['Match'].str.extract(r'M(\d+)').astype(int)

# %%
# Keep latest seat data by date

latest_pull = (df_tix_raw.groupby(["seat_key", "Pull Date"])["Pull Time"]
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

n = 10

print(f"Matches with {n}+ snapshots:")

display(df_cnts_by_match[df_cnts_by_match["num_dt"] >= n].sort_values(['max_dt', 'Match'], ascending=False))

# %%
# How many with the most recent date?

max_dt = df_tix_raw["Pull Date"].max()

print(f'Latest snapshot date: {max_dt}')

df_current_matches = df_tix_raw[df_tix_raw["Pull Date"] == max_dt].groupby('Match ID').agg(
    cnt_seats=("seat_key", "nunique")
).sort_values("cnt_seats", ascending=False)

#.sort_values("Match ID", ascending=False)

display(df_current_matches)

# %%
# What are the counts of latest snapshots by date?

df_matches_by_latest_dt = (df_tix_daily.groupby("Match ID").agg(
    latest_dt=("Pull Date", "max"))).sort_values("latest_dt")
    
df_cnts_by_latest_dt = df_matches_by_latest_dt.value_counts().sort_index()

display(df_cnts_by_latest_dt)

#print(df_matches_by_latest_dt.head())

# %%
# Review a single match

match = "M18"

print(f"Reviewing match: {match}")

df_single_match = df_tix_raw[df_tix_raw["Match"] == match].copy()

df_sm_by_pull = df_single_match.groupby(["Pull Date", 'Pull Time']).agg(
    cnt_seats=("seat_key", "nunique"),    
)

display(df_sm_by_pull)

print(f"Reviewing daily data for match: {match}")

df_single_match_daily = df_tix_daily[df_tix_daily["Match"] == match].copy()

df_sm_by_pull = df_single_match.groupby(["Pull Date"]).agg(
    cnt_seats=("seat_key", "nunique"),    
)

display(df_sm_by_pull)

# %%
# Cross tab of matches and dates:

df_all_by_pull = df_tix_daily.groupby(['Match ID', "Pull Date"], as_index=False).agg(
    cnt_seats=("seat_key", "nunique"),    
)

#display(df_all_by_pull)

display(df_all_by_pull[df_all_by_pull['Match ID'] == 18])

df_all_xtab = df_all_by_pull.reset_index().pivot(index="Match ID", columns="Pull Date", values="cnt_seats")    

display(df_all_xtab)
# %%
# Save cross-tab

df_all_xtab.to_csv(DATA_DIR / f"fifa-resale-tickets-daily-xtab-{dt}.csv")

# %%
# For all cases where we have snapshots for 2 dates:
# For each match, determine:
# * How many seats existed in the 1st snapshot, but not the 2nd? (sold or removed)
# * How many are listed in the 2nd snapshot, but not the 1st? (new or relisted)

DATE_A = "2026-04-15"
DATE_B = "2026-04-16"

seats_a = df_tix_daily[df_tix_daily["Pull Date"] == DATE_A].groupby("Match")["seat_key"].apply(set)
seats_b = df_tix_daily[df_tix_daily["Pull Date"] == DATE_B].groupby("Match")["seat_key"].apply(set)

both = seats_a.index.intersection(seats_b.index)

df_seat_churn = pd.DataFrame({
    "sold_or_removed": [len(seats_a[m] - seats_b[m]) for m in both],
    "new_or_relisted":  [len(seats_b[m] - seats_a[m]) for m in both],
    "in_both":          [len(seats_a[m] & seats_b[m]) for m in both],
    f"cnt_{DATE_A}":         [len(seats_a[m]) for m in both],
    f"cnt_{DATE_B}":         [len(seats_b[m]) for m in both],
}, index=both).sort_index()

display(df_seat_churn)

# %%
# Data coverage: which dates does each match have data for?

match_dates = (df_tix_daily.groupby("Match ID")["Pull Date"]
               .apply(set).to_dict())

coverage_records = []
for match_id in sorted(match_dates.keys()):
    dates_set = match_dates[match_id]
    all_dates_sorted = sorted(dates_set)
    pairs = sum(1 for i in range(len(all_dates_sorted) - 1)
                if (pd.to_datetime(all_dates_sorted[i + 1])
                    - pd.to_datetime(all_dates_sorted[i])).days == 1)
    coverage_records.append({
        "Match": f"M{match_id}",
        "Snapshot Dates": len(dates_set),
        "Consecutive Pairs": pairs,
        "Last Snapshot": max(dates_set),
    })

df_coverage = pd.DataFrame(coverage_records).sort_values("Match")
display(df_coverage)

# %%
# Save seat churn


df_seat_churn.to_csv(DATA_DIR / f"fifa-resale-tickets-seat-churn-{dt}.csv")   

# %%
# Check single match - debug

#print(df_tix_daily.dtypes)

# %%
# Histos of sold/removed vs stayed vs added

# For specific matches & categories, what's the distribution of prices across:
# * Sold/removed
# * Stayed
# * Added

# Show each match/category as a seperate chart, 
# with 3 histograms stacked verticall for the 3 categories above.

# Configuration:

list_matches = [18, 47, 62, 74]

list_matches = [18]

# For histograms
list_categories = ["Category 1", "Category 2", "Category 3"]
list_pctiles = [0, 0.1, 0.5, 0.9, 1.0]

# For line charts
list_line_categories = ["Category 1", "Category 2"] #, "Category 3"]
list_plot_pctiles = [0, 0.1, 0.5]

FLAG_HISTOS = True
FLAG_HISTOS = False

FLAG_LINES = True

FLAG_RIDGELINES = True
RIDGELINE_GROUP = "sold"  # "sold", "stayed", or "added"

FLAG_BOXPLOTS = True
BOXPLOT_GROUP = "sold"  # "sold", "stayed", or "added"

# %%
# Setup

start_date = pd.to_datetime("2026-04-03")
end_date = pd.to_datetime(datetime.datetime.now().date())

# 1. Create a range of dates from start to (end - 1 day)
# 'D' frequency ensures we hit every single day
date_list = pd.date_range(start=start_date, end=end_date - pd.Timedelta(days=1), freq='D')

# DATE_B strings for consistent chart axes (one per date pair)
all_date_strs = [(d + pd.Timedelta(days=1)).strftime('%Y-%m-%d') for d in date_list]

# %%

for DATE_A in date_list:
    # 2. Assign DATE_B as exactly one day after DATE_A
    DATE_B = DATE_A + pd.Timedelta(days=1)
    
    print(f"\nAnalyzing changes from {DATE_A.date()} to {DATE_B.date()}...")

    bin_width = 100  # set to None to use 20 equal-width bins up to 95th percentile

# Convert Timestamps to strings
    str_a = DATE_A.strftime('%Y-%m-%d')
    str_b = DATE_B.strftime('%Y-%m-%d')
    
    # Filter using the strings
    snap_a = df_tix_daily[df_tix_daily["Pull Date"] == str_a].set_index("seat_key")
    snap_b = df_tix_daily[df_tix_daily["Pull Date"] == str_b].set_index("seat_key")

    for match_id in list_matches:
        match_str = f"M{match_id}"
        # Skip if match doesn't have data for both dates
        m_dates = match_dates.get(match_id, set())
        if str_a not in m_dates or str_b not in m_dates:
            continue
        for cat in list_categories:
            mask_a = (snap_a["Match"] == match_str) & (snap_a["Category"] == cat)
            mask_b = (snap_b["Match"] == match_str) & (snap_b["Category"] == cat)

            keys_a = set(snap_a[mask_a].index)
            keys_b = set(snap_b[mask_b].index)

            if len(keys_a) > 0 and len(keys_b) > 0:

                prices_sold    = snap_a.loc[snap_a.index.isin(keys_a - keys_b) & mask_a, "Price"]
                prices_stayed  = snap_b.loc[snap_b.index.isin(keys_a & keys_b)  & mask_b, "Price"]
                prices_added   = snap_b.loc[snap_b.index.isin(keys_b - keys_a)  & mask_b, "Price"]

                groups = [
                    (f"Sold/Removed ({len(prices_sold)})", prices_sold,   "tomato"),
                    (f"Stayed ({len(prices_stayed)})",      prices_stayed, "steelblue"),
                    (f"Added ({len(prices_added)})",         prices_added,  "mediumseagreen"),
                ]

                pct_headers = " ".join(f"{'p'+str(int(p*100)):>8}" for p in list_pctiles)
                print(f"\n{match_str} — {cat}")
                print(f"{'Group':<20} {pct_headers} {'mean':>8}")
                print("-" * (20 + 9 * len(list_pctiles) + 9))
                for label, prices, _ in groups:
                    if len(prices):
                        pct_vals = " ".join(f"{prices.quantile(p):>8.0f}" for p in list_pctiles)
                        print(f"{label:<20} {pct_vals} {prices.mean():>8.0f}")
                    else:
                        blanks = " ".join(f"{'—':>8}" for _ in list_pctiles)
                        print(f"{label:<20} {blanks} {'—':>8}")

                if FLAG_HISTOS:
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
            
            else:
                print(f'{len(keys_a)} seats on {DATE_A}, {len(keys_b)} seats on {DATE_B} — skipping {match_str} / {cat} due to insufficient data.')

# %%
# Line charts: daily sold/removed price percentile trends per match

if FLAG_LINES:

    cat_colors = {
        "Category 1": "orange",
        "Category 2": "crimson",
        "Category 3": "royalblue",
        "Category 4": "green",
    }
    pctile_linestyles = ["solid", "dashed", "dotted"]

    for match_id in list_matches:
        match_str = f"M{match_id}"

        # Collect sold/removed percentiles per (date, category, percentile)
        records = []
        for DATE_A in date_list:
            DATE_B = DATE_A + pd.Timedelta(days=1)
            str_a = DATE_A.strftime('%Y-%m-%d')
            str_b = DATE_B.strftime('%Y-%m-%d')

            snap_a = df_tix_daily[df_tix_daily["Pull Date"] == str_a].set_index("seat_key")
            snap_b = df_tix_daily[df_tix_daily["Pull Date"] == str_b].set_index("seat_key")

            # Skip if match doesn't have data for both dates
            m_dates = match_dates.get(match_id, set())
            if str_a not in m_dates or str_b not in m_dates:
                continue

            for cat in list_line_categories:
                mask_a = (snap_a["Match"] == match_str) & (snap_a["Category"] == cat)
                mask_b = (snap_b["Match"] == match_str) & (snap_b["Category"] == cat)
                keys_a = set(snap_a[mask_a].index)
                keys_b = set(snap_b[mask_b].index)
                sold_keys = keys_a - keys_b
                if len(sold_keys) == 0:
                    continue
                prices_sold = snap_a.loc[snap_a.index.isin(sold_keys) & mask_a, "Price"]
                for p in list_plot_pctiles:
                    records.append({
                        "date": DATE_B.date(),
                        "category": cat,
                        "percentile": p,
                        "value": prices_sold.quantile(p),
                    })

        if not records:
            print(f"No sold/removed data for {match_str} — skipping line chart.")
            continue

        df_trend = pd.DataFrame(records)

        fig, ax = plt.subplots(figsize=(12, 6))
        for cat in list_line_categories:
            color = cat_colors.get(cat, "gray")
            for i, p in enumerate(list_plot_pctiles):
                ls = pctile_linestyles[i % len(pctile_linestyles)]
                subset = df_trend[(df_trend["category"] == cat) & (df_trend["percentile"] == p)]
                if subset.empty:
                    continue
                subset = subset.sort_values("date")
                ax.plot(subset["date"], subset["value"],
                        color=color, linestyle=ls, marker="o", markersize=4,
                        label=f"{cat} p{int(p*100)}")

        ax.set_title(f"{match_str} — Sold/Removed Price Trends", fontsize=13)
        ax.set_xlabel("Date")
        ax.set_ylabel("Price")
        ax.legend(fontsize=9)
        ax.grid(True, alpha=0.3)
        # Consistent date axis showing all dates in range
        all_date_vals = [pd.to_datetime(d).date() for d in all_date_strs]
        ax.set_xticks(all_date_vals)
        ax.set_xticklabels([d[5:] for d in all_date_strs], rotation=45, ha="right", fontsize=8)
        plt.tight_layout()
        plt.show()

# %%
# Ridgeline charts: price distributions over time

if FLAG_RIDGELINES:

    ridgeline_group_labels = {
        "sold":   "Sold/Removed",
        "stayed": "Stayed",
        "added":  "Added",
    }
    ridgeline_label = ridgeline_group_labels[RIDGELINE_GROUP]

    for match_id in list_matches:
        match_str = f"M{match_id}"

        # Collect price series per (date, category)
        price_data = {}  # (cat, date_str) -> Series of prices
        for DATE_A in date_list:
            DATE_B = DATE_A + pd.Timedelta(days=1)
            str_a = DATE_A.strftime('%Y-%m-%d')
            str_b = DATE_B.strftime('%Y-%m-%d')

            snap_a = df_tix_daily[df_tix_daily["Pull Date"] == str_a].set_index("seat_key")
            snap_b = df_tix_daily[df_tix_daily["Pull Date"] == str_b].set_index("seat_key")

            # Skip if match doesn't have data for both dates
            m_dates = match_dates.get(match_id, set())
            if str_a not in m_dates or str_b not in m_dates:
                continue

            for cat in list_line_categories:
                mask_a = (snap_a["Match"] == match_str) & (snap_a["Category"] == cat)
                mask_b = (snap_b["Match"] == match_str) & (snap_b["Category"] == cat)
                keys_a = set(snap_a[mask_a].index)
                keys_b = set(snap_b[mask_b].index)

                if RIDGELINE_GROUP == "sold":
                    target_keys = keys_a - keys_b
                    prices = snap_a.loc[snap_a.index.isin(target_keys) & mask_a, "Price"]
                elif RIDGELINE_GROUP == "stayed":
                    target_keys = keys_a & keys_b
                    prices = snap_b.loc[snap_b.index.isin(target_keys) & mask_b, "Price"]
                else:  # "added"
                    target_keys = keys_b - keys_a
                    prices = snap_b.loc[snap_b.index.isin(target_keys) & mask_b, "Price"]

                if len(prices) >= 2:
                    price_data[(cat, str_b)] = prices

        if not price_data:
            print(f"No {ridgeline_label} data for {match_str} — skipping ridgeline.")
            continue

        # Determine shared x-axis range across all categories
        all_prices = pd.concat(price_data.values())
        x_min = all_prices.quantile(0.0)
        x_max = all_prices.quantile(0.95)
        x_grid = np.linspace(x_min, x_max, 300)

        # Use full date range for consistent axis (gaps where data is missing)
        all_dates = all_date_strs

        n_cats = len(list_line_categories)
        fig, axes = plt.subplots(n_cats, 1, figsize=(12, 4 * n_cats), squeeze=False)
        fig.suptitle(f"{match_str} — {ridgeline_label} Price Distributions", fontsize=14, y=1.01)

        for ax_idx, cat in enumerate(list_line_categories):
            ax = axes[ax_idx, 0]
            color = cat_colors.get(cat, "gray")

            dates_with_data = [d for d in all_dates if (cat, d) in price_data]
            if not dates_with_data:
                ax.set_title(f"{cat} — no data", fontsize=11)
                continue

            # Compute KDEs and find max density for scaling
            kdes = {}
            for d in dates_with_data:
                prices = price_data[(cat, d)].clip(upper=x_max)
                try:
                    kde = gaussian_kde(prices)
                    kdes[d] = kde(x_grid)
                except np.linalg.LinAlgError:
                    continue

            if not kdes:
                ax.set_title(f"{cat} — KDE failed", fontsize=11)
                continue

            max_density = max(k.max() for k in kdes.values())
            overlap = 0.7
            scale = overlap / max_density if max_density > 0 else 1

            for i, d in enumerate(all_dates):
                if d not in kdes:
                    continue
                y_offset = i
                density = kdes[d] * scale
                ax.fill_between(x_grid, y_offset, y_offset + density,
                                alpha=0.5, color=color, edgecolor=color, linewidth=0.8)
                ax.plot(x_grid, y_offset + density, color=color, linewidth=0.8)

            ax.set_yticks(range(len(all_dates)))
            ax.set_yticklabels([d[5:] for d in all_dates], fontsize=8)
            ax.set_xlim(x_min, x_max)
            ax.set_ylim(-0.2, len(all_dates) - 1 + 1.2)
            ax.set_title(f"{cat}", fontsize=11)
            ax.set_xlabel("Price")

        plt.tight_layout()
        plt.show()

# %%
# Boxplots: price distributions over time

if FLAG_BOXPLOTS:

    boxplot_group_labels = {
        "sold":   "Sold/Removed",
        "stayed": "Stayed",
        "added":  "Added",
    }
    boxplot_label = boxplot_group_labels[BOXPLOT_GROUP]

    for match_id in list_matches:
        match_str = f"M{match_id}"

        # Collect price series per (date, category)
        price_data = {}  # (cat, date_str) -> Series of prices
        for DATE_A in date_list:
            DATE_B = DATE_A + pd.Timedelta(days=1)
            str_a = DATE_A.strftime('%Y-%m-%d')
            str_b = DATE_B.strftime('%Y-%m-%d')

            snap_a = df_tix_daily[df_tix_daily["Pull Date"] == str_a].set_index("seat_key")
            snap_b = df_tix_daily[df_tix_daily["Pull Date"] == str_b].set_index("seat_key")

            # Skip if match doesn't have data for both dates
            m_dates = match_dates.get(match_id, set())
            if str_a not in m_dates or str_b not in m_dates:
                continue

            for cat in list_line_categories:
                mask_a = (snap_a["Match"] == match_str) & (snap_a["Category"] == cat)
                mask_b = (snap_b["Match"] == match_str) & (snap_b["Category"] == cat)
                keys_a = set(snap_a[mask_a].index)
                keys_b = set(snap_b[mask_b].index)

                if BOXPLOT_GROUP == "sold":
                    target_keys = keys_a - keys_b
                    prices = snap_a.loc[snap_a.index.isin(target_keys) & mask_a, "Price"]
                elif BOXPLOT_GROUP == "stayed":
                    target_keys = keys_a & keys_b
                    prices = snap_b.loc[snap_b.index.isin(target_keys) & mask_b, "Price"]
                else:  # "added"
                    target_keys = keys_b - keys_a
                    prices = snap_b.loc[snap_b.index.isin(target_keys) & mask_b, "Price"]

                if len(prices) >= 1:
                    price_data[(cat, str_b)] = prices

        if not price_data:
            print(f"No {boxplot_label} data for {match_str} — skipping boxplot.")
            continue

        n_cats = len(list_line_categories)
        fig, axes = plt.subplots(n_cats, 1, figsize=(14, 5 * n_cats), squeeze=False)
        fig.suptitle(f"{match_str} — {boxplot_label} Price Distributions", fontsize=14)

        for ax_idx, cat in enumerate(list_line_categories):
            ax = axes[ax_idx, 0]
            color = cat_colors.get(cat, "gray")

            dates_with_data = sorted(d for c, d in price_data if c == cat)
            if not dates_with_data:
                ax.set_title(f"{cat} — no data", fontsize=11)
                continue

            # Plot boxes at positions matching the full date range
            box_positions = [all_date_strs.index(d) for d in dates_with_data]
            box_data = [price_data[(cat, d)].values for d in dates_with_data]
            bp = ax.boxplot(box_data, positions=box_positions,
                            patch_artist=True, widths=0.6,
                            showfliers=True, flierprops=dict(marker='.', markersize=3, alpha=0.5))
            for patch in bp['boxes']:
                patch.set_facecolor(color)
                patch.set_alpha(0.5)
            for median in bp['medians']:
                median.set_color('black')

            all_cat_prices = np.concatenate(box_data)
            y_max = np.median(all_cat_prices) * 3
            ax.set_ylim(0, y_max)
            # Consistent date axis with all dates; show counts where data exists
            ax.set_xticks(range(len(all_date_strs)))
            labels = []
            for d in all_date_strs:
                if (cat, d) in price_data:
                    n = len(price_data[(cat, d)])
                    labels.append(f"n={n}\n{d[5:]}")
                else:
                    labels.append(f"\n{d[5:]}")
            ax.set_xticklabels(labels, rotation=45, ha="right", fontsize=8)
            ax.set_title(f"{cat}", fontsize=11)
            ax.set_ylabel("Price")
            ax.grid(True, axis='y', alpha=0.3)

        plt.tight_layout()
        plt.show()

# %%
