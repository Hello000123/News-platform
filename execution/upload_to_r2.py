import boto3
from botocore.config import Config


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
