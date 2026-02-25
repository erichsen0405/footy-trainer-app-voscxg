#!/usr/bin/env bash
# scripts/qa-bundle-mac.sh
# QA bundle for macOS (zip only)
#
# Default (runs lint + typecheck):
#   ./scripts/qa-bundle-mac.sh
#
# Disable QA commands:
#   ./scripts/qa-bundle-mac.sh --no-qa
#
# Override QA commands (repeat --qa):
#   ./scripts/qa-bundle-mac.sh --qa "npm run lint" --qa "npm run typecheck" --qa "npm test"
#
# Do not open Finder automatically:
#   ./scripts/qa-bundle-mac.sh --no-open

set -euo pipefail

print_usage() {
  cat <<'EOF'
Usage: scripts/qa-bundle-mac.sh [options]

Options:
  --no-qa         Skip QA commands.
  --qa "<cmd>"    Add QA command (can be provided multiple times).
  --no-open       Do not open Finder after creating bundle.
  -h, --help      Show this help.
EOF
}

NO_QA=false
OPEN_FINDER=true
QA_COMMANDS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-qa)
      NO_QA=true
      shift
      ;;
    --qa)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --qa" >&2
        exit 1
      fi
      QA_COMMANDS+=("$2")
      shift 2
      ;;
    --no-open)
      OPEN_FINDER=false
      shift
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_usage >&2
      exit 1
      ;;
  esac
done

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" ]]; then
  echo "Not in a git repo. Run the script from this repo or a subdirectory." >&2
  exit 1
fi
cd "$repo_root"

if [[ "$NO_QA" == true ]]; then
  QA_COMMANDS=()
elif [[ ${#QA_COMMANDS[@]} -eq 0 ]]; then
  QA_COMMANDS=("npm run lint" "npm run typecheck")
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
base_dir="$repo_root/.qa-export"
out_dir="$base_dir/$timestamp"
zip_path="$base_dir/$timestamp.zip"

mkdir -p "$out_dir"

patch_file="$out_dir/changes.patch"
names_file="$out_dir/files.txt"
stat_file="$out_dir/stats.txt"
status_file="$out_dir/status.txt"
meta_file="$out_dir/meta.txt"
check_file="$out_dir/diff-check.txt"
cmd_file="$out_dir/qa-commands.txt"
full_dir="$out_dir/full_worktree"
manifest_file="$full_dir/manifest.txt"

mkdir -p "$full_dir"

tmp_unstaged="$(mktemp)"
tmp_unstaged_deletions="$(mktemp)"
tmp_untracked="$(mktemp)"
tmp_staged="$(mktemp)"
tmp_all_candidates="$(mktemp)"
tmp_copied="$(mktemp)"
tmp_skipped="$(mktemp)"
tmp_staged_unique="$(mktemp)"

cleanup() {
  rm -f \
    "$tmp_unstaged" \
    "$tmp_unstaged_deletions" \
    "$tmp_untracked" \
    "$tmp_staged" \
    "$tmp_all_candidates" \
    "$tmp_copied" \
    "$tmp_skipped" \
    "$tmp_staged_unique"
}
trap cleanup EXIT

branch="$(git rev-parse --abbrev-ref HEAD)"
head="$(git rev-parse --short HEAD)"
last_commit="$(git log -1 --oneline)"
node_v="$(node -v 2>/dev/null || true)"
npm_v="$(npm -v 2>/dev/null || true)"

{
  echo "timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "repoRoot:   $repo_root"
  echo "branch:     $branch"
  echo "head:       $head"
  echo "lastCommit: $last_commit"
  echo "node:       $node_v"
  echo "npm:        $npm_v"
} > "$meta_file"

git status -sb > "$status_file"
git --no-pager diff --name-status HEAD > "$names_file"
git --no-pager diff --stat HEAD > "$stat_file"
git --no-pager diff --check HEAD > "$check_file" || true
git --no-pager diff --binary HEAD > "$patch_file"

git diff --name-only --diff-filter=d > "$tmp_unstaged"
git diff --name-only --diff-filter=D > "$tmp_unstaged_deletions"
git ls-files --others --exclude-standard > "$tmp_untracked"
git diff --name-only --cached > "$tmp_staged"

cat "$tmp_unstaged" "$tmp_untracked" | sed '/^[[:space:]]*$/d' | sort -u > "$tmp_all_candidates"
cat "$tmp_staged" | sed '/^[[:space:]]*$/d' | sort -u > "$tmp_staged_unique"

while IFS= read -r rel; do
  [[ -z "$rel" ]] && continue
  src="$repo_root/$rel"
  dst="$full_dir/$rel"
  if [[ -e "$src" ]]; then
    mkdir -p "$(dirname "$dst")"
    cp -p "$src" "$dst"
    printf "%s\n" "$rel" >> "$tmp_copied"
  else
    printf "%s\n" "$rel" >> "$tmp_skipped"
  fi
done < "$tmp_all_candidates"

copied_count="$(wc -l < "$tmp_copied" | tr -d ' ')"
staged_only_count="$(wc -l < "$tmp_staged_unique" | tr -d ' ')"

{
  echo "copied: $copied_count"
  echo "copied files:"
  cat "$tmp_copied"
  echo
  echo "deletions:"
  cat "$tmp_unstaged_deletions"
  echo
  echo "staged (ignored):"
  cat "$tmp_staged_unique"
  echo
  echo "skipped (missing):"
  cat "$tmp_skipped"
} > "$manifest_file"

echo "=== QA commands output ===" > "$cmd_file"
qa_overall_exit=0

if [[ ${#QA_COMMANDS[@]} -gt 0 ]]; then
  for cmd in "${QA_COMMANDS[@]}"; do
    {
      echo
      echo ">>> $cmd"
    } >> "$cmd_file"

    set +e
    cmd_output="$(bash -lc "$cmd" 2>&1)"
    cmd_exit=$?
    set -e

    if [[ -n "$cmd_output" ]]; then
      printf "%s\n" "$cmd_output" >> "$cmd_file"
    fi
    echo "exitCode: $cmd_exit" >> "$cmd_file"
    if [[ $cmd_exit -ne 0 && $qa_overall_exit -eq 0 ]]; then
      qa_overall_exit=$cmd_exit
    fi
  done
else
  echo "NOTE: QA commands were not run (disabled or empty)." >> "$cmd_file"
fi

(cd "$out_dir" && zip -qr "$zip_path" .)
rm -rf "$out_dir"

echo
echo "[OK] QA bundle (zip only) created:"
echo "  Zip: $zip_path"
echo
echo "Full files included (unstaged+untracked): $copied_count"
echo "Staged files ignored: $staged_only_count"
echo
git --no-pager diff --stat HEAD || true
echo

if [[ "$OPEN_FINDER" == true ]]; then
  open "$base_dir" >/dev/null 2>&1 || true
fi

exit "$qa_overall_exit"
