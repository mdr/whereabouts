#!/usr/bin/env bash
# One-time Fly setup, safe to re-run. Creates the app named in fly.toml if it
# does not exist and mints a deploy token for GitHub Actions.
#
# Run from the dev shell (flyctl and jq come from the flake) after
# `fly auth login`:
#
#   scripts/fly-bootstrap.sh
#
# Put the printed token in 1Password, then in the GitHub repo as the
# FLY_API_TOKEN Actions secret. IPs and the fly.dev certificate are allocated
# automatically on the first deploy.
set -euo pipefail

cd "$(dirname "$0")/.."

app=$(sed -n 's/^app = "\(.*\)"$/\1/p' fly.toml)
org=${FLY_ORG:-personal}

if fly apps list --json | jq -e --arg app "$app" 'any(.[]; .Name == $app)' >/dev/null; then
  echo "app $app already exists"
else
  echo "creating app $app in org $org"
  fly apps create "$app" --org "$org"
fi

echo
echo "Deploy token for GitHub Actions (scoped to $app, valid one year):"
fly tokens create deploy --app "$app" --name github-actions --expiry 8760h
