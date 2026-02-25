# Skill Spec: wikipedia-search

## Goal
Create an OpenClaw skill to search and fetch content from Wikipedia using the MediaWiki API. This provides more reliable, structured access to Wikipedia than general web search.

## Requirements

### 1. Structure
- **Location:** `/Users/bcc/Code/git/openclaw-tools/skills/wikipedia-search/`
- **Symlink:** `~/.openclaw/skills/wikipedia-search` -> repo location
- **Files:**
  - `SKILL.md`: Documentation and usage instructions.
  - `scripts/wiki.py`: The main executable script.

### 2. Implementation details (scripts/wiki.py)
- **Language:** Python 3
- **Dependencies:** `wikipedia-api` (auto-install via pip if missing).
- **Functionality:**
  - `search`: Search for page titles.
  - `summary`: Get a concise summary of a specific page.
  - `full`: Get the full text/sections of a page.
- **CLI Arguments:**
  - `query`: The search term or page title.
  - `--mode`: [search|summary|full] (default: summary).
  - `--sentences`: Number of sentences for summary (default: 5).
  - `--lang`: Language code (default: en).

### 3. Output Format
- Clean JSON to stdout for machine readability.
- Errors to stderr.

## Final Steps for Agent
- Make script executable (`chmod +x`).
- Create the symlink to `~/.openclaw/skills/`.
