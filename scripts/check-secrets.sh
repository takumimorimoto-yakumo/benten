#!/usr/bin/env bash
# Backward-compatible entry point for the comprehensive, non-disclosing gate.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${1:-$(cd "$SCRIPT_DIR/.." && pwd)}"

exec bash "$SCRIPT_DIR/check-publishable.sh" "$REPO_ROOT"
