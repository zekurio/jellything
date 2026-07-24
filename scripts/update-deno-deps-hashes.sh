#!/usr/bin/env bash
# Recompute the per-target dependency hashes used by flake.nix.
#
# This mirrors the fixed-output dependency derivation. Deno can resolve npm
# packages for another OS/architecture without executing target binaries, so
# every supported hash can be refreshed from one machine.
set -euo pipefail

repo=$(cd -- "$(dirname -- "$0")/.." && pwd)

declare -A targets=(
  [aarch64-darwin]="darwin arm64"
  [x86_64-darwin]="darwin x64"
  [aarch64-linux]="linux arm64"
  [x86_64-linux]="linux x64"
)

for system in aarch64-darwin x86_64-darwin aarch64-linux x86_64-linux; do
  read -r os arch <<<"${targets[$system]}"
  dir=$(mktemp -d)
  trap 'rm -rf "$dir"' EXIT

  mkdir "$dir/work" "$dir/out"
  cp "$repo/deno.json" "$repo/deno.lock" "$repo/package.json" "$dir/work/"
  (
    cd "$dir/work"
    DENO_DIR="$dir/cache" deno install \
      --os "$os" \
      --arch "$arch" \
      --frozen \
      --quiet
    rm -f node_modules/.deno/.setup-cache.bin node_modules/.deno/.deno.lock
    cp -a node_modules "$dir/out/node_modules"
  )
  printf '%s = "%s";\n' "$system" "$(nix hash path "$dir/out")"

  rm -rf "$dir"
  trap - EXIT
done
