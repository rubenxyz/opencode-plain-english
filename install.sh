#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
plugins_dir="$config_dir/plugins"
commands_dir="$config_dir/commands"

# OpenCode 2 loads plugins from this file and calls its `setup`. The same
# package also exposes a V1 `server` hook, so `--v1` installs the legacy
# function entry plus the markdown command bridge instead.
v2_plugin="$plugins_dir/opencode-plain-english.js"
v1_plugin="$plugins_dir/plain.js"
command_files=(
  "$commands_dir/plain.md"
  "$commands_dir/plain-commit.md"
  "$commands_dir/plain-review.md"
)

usage() {
  cat <<'EOF'
usage: ./install.sh [install|--v1|uninstall]

  install      Install for OpenCode 2 (default): links src/server.js into
               ~/.config/opencode/plugins and lets the plugin register
               /plain, /plain-commit and /plain-review itself.
  --v1         Install the legacy OpenCode 1.x entry and command bridge.
  uninstall    Remove the plugin links, the command bridge, and the flag file.
EOF
}

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

remove() {
  local target="$1"
  if [ -L "$target" ]; then
    rm "$target"
    echo "removed $target"
  fi
}

mode="${1:-install}"
case "$mode" in
  -h|--help|help)
    usage
    exit 0
    ;;
  uninstall|--uninstall)
    remove "$v2_plugin"
    remove "$v1_plugin"
    for f in "${command_files[@]}"; do remove "$f"; done
    rm -f "$config_dir/.plain-active"
    echo "plain uninstalled; restart opencode"
    exit 0
    ;;
  --v1)
    link "$repo_dir/src/plain.js" "$v1_plugin"
    for name in plain plain-commit plain-review; do
      link "$repo_dir/commands/$name.md" "$commands_dir/$name.md"
    done
    echo "plain (OpenCode 1.x) installed; restart opencode"
    exit 0
    ;;
  install|--v2)
    # Drop a legacy V1 link if one is present; OpenCode 2 refuses it.
    remove "$v1_plugin"
    link "$repo_dir/src/server.js" "$v2_plugin"
    echo "plain (OpenCode 2) installed; restart opencode"
    exit 0
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
