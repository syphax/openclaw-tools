# Skill rationalization

We have built several skills for OpenClaw so far. 

A few involve scheduled jobs. I want to make sure we have consistent structures for each of these.

Specifically, I want:
* One shell script per scheduled task, like /Users/bcc/Code/git/openclaw-tools/skills/social-searcher/run-daily-digest.sh
* Consistent log location, specifically: skill-name/logs
* Consistent log file naming, specifically: skill-name/logs/task-name-run.log
* A new log file each week; old logs are stored in a weekly archive directory with the format skill-name/logs/arc/task-name-run-YYYY-MM-DD.log
* .gitignore to exclude the contents of the log directories from git

When a skill has multiple scripts, I want both:
* A master shell script that orchestrates the other scripts, like /Users/bcc/Code/git/openclaw-tools/skills/social-searcher/run-daily.sh
* A shell script for each (significant) sub-task, so that we can optionally run these sub-tasks directly

Please modify these skills so that they follow these conventions:

* social-searcher: NOTE: I want to rename this skill to daily-digest
* world-cup-tickets
* govrx: NOTE: I want to rename this skill to drug-price-checker

