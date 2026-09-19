#!/usr/bin/env bash
# fly with the deploy token pulled from 1Password for this one command, so
# the token never sits in a file or your shell history.
#
#   scripts/fly.sh status
#   scripts/fly.sh logs
#   scripts/fly.sh deploy --image registry.fly.io/whereabouts-game:<git sha>
#
# The item lives in the personal 1Password account rather than the CLI's
# default, hence --account. The op:// reference is in deploy/op.env.
set -euo pipefail

cd "$(dirname "$0")/.."
exec op --account my.1password.com run --env-file=deploy/op.env -- fly "$@"
