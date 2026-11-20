from types import SimpleNamespace
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError
from django.core.management import call_command
from django.test import SimpleTestCase


class EnsureStorageBucketCommandTests(SimpleTestCase):
    @patch("apps.books.management.commands.ensure_storage_bucket.default_storage")
    def test_creates_bucket_when_missing(self, storage):
        client = Mock()
        storage.bucket_name = "library-media"
        storage.connection = SimpleNamespace(meta=SimpleNamespace(client=client))
        client.head_bucket.side_effect = ClientError(
            {
                "Error": {"Code": "NoSuchBucket", "Message": "Not found"},
                "ResponseMetadata": {"HTTPStatusCode": 404},
            },
            "HeadBucket",
        )

        call_command("ensure_storage_bucket")

        client.create_bucket.assert_called_once_with(Bucket="library-media")

    @patch("apps.books.management.commands.ensure_storage_bucket.default_storage")
    def test_does_not_recreate_existing_bucket(self, storage):
        client = Mock()
        storage.bucket_name = "library-media"
        storage.connection = SimpleNamespace(meta=SimpleNamespace(client=client))

        call_command("ensure_storage_bucket")

        client.create_bucket.assert_not_called()

    @patch("apps.books.management.commands.ensure_storage_bucket.default_storage")
    def test_propagates_unexpected_storage_errors(self, storage):
        client = Mock()
        storage.bucket_name = "library-media"
        storage.connection = SimpleNamespace(meta=SimpleNamespace(client=client))
        client.head_bucket.side_effect = ClientError(
            {
                "Error": {"Code": "AccessDenied", "Message": "Denied"},
                "ResponseMetadata": {"HTTPStatusCode": 403},
            },
            "HeadBucket",
        )

        with self.assertRaises(ClientError):
            call_command("ensure_storage_bucket")
