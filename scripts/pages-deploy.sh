#!/usr/bin/env bash
# Publish (or remove) a subtree of the gh-pages branch with plain git — no
# third-party actions. Replaces JamesIves/github-pages-deploy-action and
# rossjrw/pr-preview-action for this repo's needs:
#
#   pages-deploy.sh root            <src-dir>  "<msg>"   # production → branch root
#   pages-deploy.sh pr-preview/pr-N <src-dir>  "<msg>"   # a PR preview → subdir
#   pages-deploy.sh pr-preview/pr-N --remove   "<msg>"   # tear a preview down
#
# `root` replaces everything at the branch root EXCEPT pr-preview/ (the
# clean-exclude that keeps a production deploy from wiping live previews). A
# preview target touches only its own pr-preview/pr-N directory, so production
# and every preview own disjoint paths and never clobber each other.
#
# Auth + remote come from the actions/checkout that already ran: the gh-pages
# worktree shares this repo's .git, so `git push` reuses the persisted
# GITHUB_TOKEN credential. Nothing here needs a token in the environment.
set -euo pipefail

TARGET="${1:?usage: pages-deploy.sh <root|pr-preview/pr-N> <src-dir|--remove> <msg>}"
SRC="${2:?missing source dir or --remove}"
MSG="${3:?missing commit message}"
BRANCH="gh-pages"
WT="${RUNNER_TEMP:-/tmp}/gh-pages-worktree"

# Stage the source now: the worktree checkout wipes the index, and copying from
# an absolute path afterwards is immune to the cwd changing under us.
if [ "$SRC" != "--remove" ]; then
  [ -d "$SRC" ] || { echo "source dir '$SRC' does not exist" >&2; exit 1; }
  SRC_ABS="$(cd "$SRC" && pwd)"
fi

git config user.name  "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# Materialise the branch into a private worktree. If gh-pages doesn't exist yet
# (first ever deploy), start it as an orphan with no history.
rm -rf "$WT"
git worktree prune # clear any metadata a crashed prior run left behind
if git fetch --no-tags origin "$BRANCH:refs/remotes/origin/$BRANCH" 2>/dev/null; then
  git worktree add -B "$BRANCH" "$WT" "refs/remotes/origin/$BRANCH"
else
  echo "gh-pages absent — bootstrapping an orphan branch"
  git worktree add --detach "$WT"
  git -C "$WT" checkout --orphan "$BRANCH"
  git -C "$WT" reset --hard >/dev/null 2>&1 || true
  git -C "$WT" rm -rf . >/dev/null 2>&1 || true
fi

# Apply the change.
case "$TARGET" in
  root)
    # Clear the root but preserve pr-preview/ (the live previews).
    find "$WT" -mindepth 1 -maxdepth 1 \
      ! -name '.git' ! -name 'pr-preview' -exec rm -rf {} +
    cp -a "$SRC_ABS/." "$WT/"
    ;;
  pr-preview/*)
    rm -rf "${WT:?}/$TARGET"
    if [ "$SRC" != "--remove" ]; then
      mkdir -p "$WT/$TARGET"
      cp -a "$SRC_ABS/." "$WT/$TARGET/"
    fi
    ;;
  *)
    echo "unknown target '$TARGET' (expected 'root' or 'pr-preview/pr-N')" >&2
    exit 1
    ;;
esac

# Commit — bail cleanly if the deploy is a no-op.
git -C "$WT" add -A
if git -C "$WT" diff --cached --quiet; then
  echo "no changes to publish"
  git worktree remove --force "$WT"
  exit 0
fi
git -C "$WT" commit -q -m "$MSG"

# Push, rebasing onto any concurrent deploy. Production and previews touch
# disjoint paths, so a rebase applies without conflict; the shared gh-pages
# concurrency group already serialises writers, so this is just belt-and-braces.
for attempt in 1 2 3 4 5; do
  if git -C "$WT" push origin "HEAD:$BRANCH"; then
    git worktree remove --force "$WT"
    exit 0
  fi
  echo "push rejected (attempt $attempt) — rebasing on latest $BRANCH"
  git -C "$WT" fetch --no-tags origin "$BRANCH:refs/remotes/origin/$BRANCH"
  git -C "$WT" rebase "refs/remotes/origin/$BRANCH" || { git -C "$WT" rebase --abort; }
  sleep "$((attempt * 2))"
done

echo "failed to push $BRANCH after 5 attempts" >&2
git worktree remove --force "$WT" || true
exit 1
