FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends cron \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY execution/ execution/
COPY directives/ directives/

RUN mkdir -p data .tmp /var/log

COPY crontab /etc/cron.d/scraper-cron
RUN chmod 0644 /etc/cron.d/scraper-cron

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
