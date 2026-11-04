#!/bin/sh
# Copies the committed app and server into a Hugging Face Space and uploads it.
#   space/deploy.sh USER/SPACE      (after `hf auth login`)
set -eu
SPACE="${1:?usage: space/deploy.sh USER/SPACE}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

cd "$ROOT"
git archive HEAD tools app requirements.txt | tar -x -C "$OUT"
rm -rf "$OUT/app/people"
cp space/Dockerfile space/README.md "$OUT/"
hf upload "$SPACE" "$OUT" . --repo-type space --commit-message "deploy $(git rev-parse --short HEAD)"
