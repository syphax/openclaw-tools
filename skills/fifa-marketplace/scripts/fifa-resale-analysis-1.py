# %% [markdown]
#
# # This script analyzes the FIFA World Cup ticket dataset

# Key questions:
# * Which venues have the cheapest tickets?

# %%
# Import libraries

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

# %%
# Load the data

df_tix_raw = pd.read_csv("data/fifa_worldcup_tickets.csv")

