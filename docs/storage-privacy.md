# Object Storage (MinIO/S3) Privacy

The `library-media` bucket stores book PDFs and cover images. It must stay **private**:
every read goes through the Django backend, which enforces visibility and premium
access checks before streaming bytes.

## Configuration (enforced in code)

- `config/settings.py` sets `AWS_DEFAULT_ACL = "private"` — new uploads are never
  written with a public-read ACL.
- `AWS_QUERYSTRING_AUTH = True` — object access requires signed URLs / server-side
  credentials; anonymous reads are not issued.
- `ensure_storage_bucket` (run by the `minio-init` service on first deploy) creates the
  bucket with **no bucket policy**. MinIO and S3 buckets are private by default when no
  policy exists. Do not add a policy that grants `s3:GetObject`/`ListBucket` to `*`.
- nginx serves only `/static/` from disk; it does not proxy the bucket.

## Verifying bucket privacy (read-only)

With the stack credentials available to Django (the same `MINIO_*` variables the backend
uses), run:

```bash
python manage.py verify_storage_privacy
```

This command changes **nothing**. It:

1. Confirms the bucket exists (`head_bucket`).
2. Reads the bucket policy, if any, and fails (exit 1) if any statement grants a public
   principal (`*`) a read-like action. A bucket with no policy prints OK.

Manual verification with the MinIO client (`mc`):

```bash
mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc ls anonymous local/library-media          # expected: "Access for anonymous user is not found" / no anonymous read
mc policy get local/library-media            # expected: empty / no public statements
```

Or via the MinIO console (default port 9001): select `library-media`, browse
**Access Policy** — it must not be set to `download` (public read) or `public`.

## If a public policy is found

Do not patch it automatically. Remove the public statements (or set the bucket policy
to empty) using `mc policy set none local/library-media` or the console, then re-run
`python manage.py verify_storage_privacy`. Existing objects need no rewrite: privacy is
a bucket/policy property, not a per-object edit.

## Notes and limits

- This verification is configuration/policy-level. It cannot prove every historical
  object ACL; if objects were uploaded long ago with explicit public ACLs elsewhere
  (e.g., via another client), check `mc stat local/library-media/<key>` for those keys.
- Credentials are required for the check. Never print or commit them.
