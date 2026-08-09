import json

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


def get_client(cfg):
    return boto3.client(
        "s3",
        endpoint_url=cfg["endpoint"],
        aws_access_key_id=cfg["access_key_id"],
        aws_secret_access_key=cfg["secret_access_key"],
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )


def upload_file(client, cfg, local_path, key, content_type="application/json"):
    client.upload_file(
        str(local_path), cfg["bucket"], key, ExtraArgs={"ContentType": content_type}
    )


def _article_key(article):
    return (
        article.get("source"),
        str(article.get("article_id") or article.get("id") or article.get("url") or ""),
    )


def _merged_articles(preferred, existing):
    merged = []
    seen = set()
    for article in [*preferred, *existing]:
        key = _article_key(article)
        if key in seen:
            continue
        seen.add(key)
        merged.append(article)
    return merged


def _download_json_list(client, cfg, key):
    try:
        response = client.get_object(Bucket=cfg["bucket"], Key=key)
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        if code in ("404", "NoSuchKey", "NotFound"):
            return []
        raise
    parsed = json.loads(response["Body"].read().decode("utf-8"))
    if not isinstance(parsed, list):
        raise RuntimeError(f"R2 object {key} is not a JSON article array")
    return parsed


def merge_and_upload_json(client, cfg, local_path, key):
    local_articles = json.loads(local_path.read_text(encoding="utf-8"))
    if not isinstance(local_articles, list):
        raise RuntimeError(f"Local file {local_path} is not a JSON article array")
    remote_articles = _download_json_list(client, cfg, key)
    merged = _merged_articles(local_articles, remote_articles)
    body = json.dumps(merged, ensure_ascii=False, indent=2).encode("utf-8")
    client.put_object(
        Bucket=cfg["bucket"],
        Key=key,
        Body=body,
        ContentType="application/json",
    )
    local_path.write_bytes(body)
    return len(merged)
