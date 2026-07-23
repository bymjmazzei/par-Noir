# AWS S3 setup for par Noir storage

## 1. Create a bucket

Use a dedicated bucket (or prefix) per environment. Enable **Block Public Access** unless you intentionally serve public blobs elsewhere.

## 2. IAM policy (least privilege)

Replace `YOUR_BUCKET` with your bucket name:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET",
      "Condition": {
        "StringLike": { "s3:prefix": ["par-noir-*"] }
      }
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET/par-noir-*"
    }
  ]
}
```

## 3. Connect in dashboard

**Additional Cloud Providers → AWS S3**

- Bucket name
- Region (e.g. `us-east-1`)
- Access key ID
- Secret access key
- **Key prefix** (required; defaults to `par-noir-{pn}`)

With device cloud custody, secrets are sealed on the device; the API stores layout/prefix metadata only.

## 4. Layout created on init

```
par-noir-{pn}/_metadata/
par-noir-{pn}/integrators/
par-noir-{pn}/par-noir-messages/
par-noir-{pn}/par-noir-messages/_outbox/
```

Tables are stored as `_metadata/{table}.db` (SQLite files).
