#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
plugins_dir="$config_dir/plugins"
commands_dir="$config_dir/commands"

plugin_files=("$plugins_dir/plain.js")
command_files=(
  "$commands_dir/plain.md"
  "$commands_dir/plain-commit.md"
  "$commands_dir/plain-review.md"
)

link() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    local backup="$dst.bak.$(date +%s)"
    mv "$dst" "$backup"
    echo "kept the file already at $dst as $backup"
  fi
  ln -sfn "$src" "$dst"
  echo "linked $dst -> $src"
}

if [ "${1:-install}" = "--uninstall" ] || [ "${1:-}" = "uninstall" ]; then
  for f in "${plugin_files[@]}" "${command_files[@]}"; do
    if [ -L "$f" ]; then
      rm "$f"
      echo "removed $f"
    fi
  done
  rm -f "$config_dir/.plain-active"
  echo "plain uninstalled; restart opencode"
  exit 0
fi

link "$repo_dir/src/plain.js" "$plugins_dir/plain.js"
for name in plain plain-commit plain-review; do
  link "$repo_dir/commands/$name.md" "$commands_dir/$name.md"
done
echo "plain installed; restart opencode"
