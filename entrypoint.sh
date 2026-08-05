#!/bin/sh
echo "[entrypoint] initial scrape run at $(date)"
python -u execution/run_all.py >> /var/log/scraper.log 2>&1 || echo "[entrypoint] initial run failed, see /var/log/scraper.log"
echo "[entrypoint] starting cron"
exec cron -f
