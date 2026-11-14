#!/usr/bin/env bash
# Creates the S3 bucket that holds Terraform's state (once per AWS account), then initialises infra/.
# Terraform can't create the bucket it keeps its own state in, so this one bucket is made by hand.
# Run from the repo root, logged in to AWS as an admin:  bash scripts/bootstrap-state.sh
set -euo pipefail
REGION=ap-southeast-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="coinvoy-tfstate-$ACCOUNT"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "State bucket $BUCKET already exists."
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION"
  aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled # undo a bad state write
  echo "Created state bucket $BUCKET."
fi

terraform -chdir=infra init -backend-config="bucket=$BUCKET"
