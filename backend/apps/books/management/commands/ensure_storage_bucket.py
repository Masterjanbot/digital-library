from botocore.exceptions import ClientError
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Ensure the configured object-storage bucket exists."

    def handle(self, *args, **options):
        storage = default_storage
        bucket_name = storage.bucket_name
        client = storage.connection.meta.client

        try:
            client.head_bucket(Bucket=bucket_name)
        except ClientError as error:
            details = error.response
            error_code = details.get("Error", {}).get("Code")
            status_code = details.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if status_code != 404 and error_code not in {"404", "NoSuchBucket", "NotFound"}:
                raise
            client.create_bucket(Bucket=bucket_name)
            self.stdout.write(f"Created object-storage bucket '{bucket_name}'.")
        else:
            self.stdout.write(f"Object-storage bucket '{bucket_name}' is available.")
