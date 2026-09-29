#!/bin/zsh
# Double-click to run the Heliopause Runner flight prototype. Close this window to stop it.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -d node_modules ] || npm install
npm run dev -- --open
