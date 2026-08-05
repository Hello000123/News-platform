import json
import os
from pathlib import Path

import dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
EXECUTION_DIR = Path(__file__).resolve().parent

dotenv.load_dotenv(BASE_DIR / ".env")


def load_sources():
    with open(EXECUTION_DIR / "sources.json", encoding="utf-8") as f:
        return json.load(f)


def get_settings():
    return {
        "max_items": int(os.getenv("MAX_ITEMS_PER_SOURCE", "20")),
        "request_delay": float(os.getenv("REQUEST_DELAY", "1.5")),
    }


def get_r2_config():
    required = ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT", "R2_BUCKET")
    values = {k: os.getenv(k, "").strip() for k in required}
    if not all(values.values()):
        return None
    return {
        "access_key_id": values["R2_ACCESS_KEY_ID"],
        "secret_access_key": values["R2_SECRET_ACCESS_KEY"],
        "endpoint": values["R2_ENDPOINT"],
        "bucket": values["R2_BUCKET"],
    }
