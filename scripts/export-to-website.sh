#!/bin/sh
# Build the game and copy it into Rob's local website (Documents/Website/heliopause-runner/),
# ready to upload with Cyberduck. Old build files are removed from the local copy, so the
# folder always matches this build exactly. See the Heliopause Runner section in the
# website's DEPLOY.md for the upload itself.
set -e
cd "$(dirname "$0")/.."
SITE="$HOME/Documents/Website/heliopause-runner"
npm run build
mkdir -p "$SITE"
rsync -a --delete --exclude .DS_Store dist/ "$SITE/"
echo "Copied to $SITE"
du -sh "$SITE"
