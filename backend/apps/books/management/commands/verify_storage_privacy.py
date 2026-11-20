import json

from botocore.exceptions import ClientError, EndpointConnectionError, NoCredentialsError
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError

PUBLIC_PRINCIPALS = {"*", "AWS:*"}
PUBLIC_ACTIONS = {"s3:GetObject", "s3:GetObjectVersion", "s3:ListBucket", "s3:*", "*"}


class Command(BaseCommand):
    """Read-only verification that the configured object-storage bucket is private.

    Checks, without changing anything:
      1. The bucket exists (head_bucket).
      2. Its bucket policy, if any, grants no public/anonymous access.

    Buckets with no policy are private by default on both MinIO and S3.
    Exits non-zero (CommandError) when a public grant is detected.
    """

    help = "Verify (read-only) that the configured object-storage bucket is private."

    def handle(self, *args, **options):
        storage = default_storage
        bucket_name = storage.bucket_name
        client = storage.connection.meta.client

        try:
            client.head_bucket(Bucket=bucket_name)
        except (NoCredentialsError, EndpointConnectionError) as error:
            raise CommandError(
                "No usable storage credentials or endpoint. The privacy check is "
                "read-only but still needs the MINIO_* / object-storage settings the "
                "backend itself uses. Run it inside the backend container or with "
                "those variables set. Detail: " + str(error)
            ) from error
        except ClientError as error:
            raise CommandError(
                f"Bucket '{bucket_name}' is not reachable: "
                f"{error.response.get('Error', {}).get('Code', 'unknown error')}"
            ) from error

        self.stdout.write(f"Bucket '{bucket_name}' exists.")

        try:
            policy = client.get_bucket_policy(Bucket=bucket_name)
        except ClientError as error:
            code = error.response.get("Error", {}).get("Code", "")
            if code in {"NoSuchBucketPolicy", "NoSuchBucket", "NoSuchPolicy"} or "policy" in str(error).lower():
                self.stdout.write(
                    f"Bucket '{bucket_name}' has no bucket policy; it is private by default. OK."
                )
                return
            raise CommandError(f"Could not read bucket policy: {code or error}") from error

        raw_policy = policy.get("Policy", "") if isinstance(policy, dict) else ""
        try:
            statements = json.loads(raw_policy or "{}").get("Statement", [])
        except json.JSONDecodeError as error:
            raise CommandError("Bucket policy is not valid JSON; manual review required.") from error

        public_grants = [
            statement
            for statement in statements
            if statement.get("Effect") == "Allow"
            and self._is_public_principal(statement.get("Principal"))
            and self._grants_public_action(statement.get("Action"))
        ]

        if public_grants:
            raise CommandError(
                f"Bucket '{bucket_name}' has a bucket policy granting PUBLIC access "
                f"({len(public_grants)} statement(s)). Remove the public statements or "
                f"restrict the principal via your storage admin tooling. "
                f"This command makes no changes."
            )

        self.stdout.write(
            f"Bucket '{bucket_name}' policy contains no public grants. OK."
        )

    @staticmethod
    def _is_public_principal(principal):
        if principal is None:
            return False
        if isinstance(principal, str):
            return principal in PUBLIC_PRINCIPALS
        if isinstance(principal, dict):
            for value in principal.values():
                items = value if isinstance(value, list) else [value]
                if any(item in PUBLIC_PRINCIPALS for item in items):
                    return True
        return False

    @staticmethod
    def _grants_public_action(action):
        if action is None:
            return False
        actions = action if isinstance(action, list) else [action]
        return any(str(a).lower() in {a.lower() for a in PUBLIC_ACTIONS} for a in actions)
