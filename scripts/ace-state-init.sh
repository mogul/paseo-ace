#!/usr/bin/env bash
#
# One-shot setup: put the ACE plugins' runtime state (boards + teammates) into a
# git repository and push it to a remote origin so state can be versioned,
# backed up, and rolled back.
#
# Usage:
#   ./scripts/ace-state-init.sh <origin-url>
#   ./scripts/ace-state-init.sh https://github.com/user/paseo-ace-state.git
#
# State dir (the git repo):
#   "$PASEO_HOME/ace"        if PASEO_HOME is set
#   "$HOME/.paseo/ace"       otherwise
#
# Both the `ace` plugin (boards.json) and the `ace-teammates` plugin
# (teammates.json + teammates/<slug>/ dirs) live under this directory.
#
# Recurring commands (run from inside the state dir, i.e. cd "$HOME/.paseo/ace"):
#   git add -A; git commit -m "ace state snapshot"   # commit the current state
#   git push                                         # push commits to origin
#   git pull --rebase                                # pull remote changes
#   git log --oneline                                # inspect history
#   git checkout <sha> -- .                          # restore files to a snapshot
#
set -uo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: ./scripts/ace-state-init.sh <origin-url>"
  echo "Example: ./scripts/ace-state-init.sh https://github.com/user/paseo-ace-state.git"
  exit 1
fi
ORIGIN_URL="$1"

BASE="${PASEO_HOME:-$HOME/.paseo}"
STATE_DIR="$BASE/ace"

mkdir -p "$STATE_DIR"
cd "$STATE_DIR" || exit 1

if [ ! -d .git ]; then
  git init
fi

if [ -z "$(git config user.name)" ]; then
  git config --local user.name "paseo-ace"
fi
if [ -z "$(git config user.email)" ]; then
  git config --local user.email "paseo-ace@localhost"
fi
git config --local commit.gpgsign false

# Ephemeral presence state (which teammates are running) must never be committed.
if ! grep -qx "active.json" .gitignore 2>/dev/null; then
  echo "active.json" >> .gitignore
fi

git add -A
if git commit --no-gpg-sign -m "ace state snapshot"; then
  : # committed
else
  echo "No changes to commit; the state dir may be empty. Re-run once state exists."
  exit 0
fi

if [ -z "$(git remote)" ]; then
  git remote add origin "$ORIGIN_URL"
fi

git branch -M main
git push -u origin main
