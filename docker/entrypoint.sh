#!/bin/sh
set -e

CONFIG="/app/backend/config.yaml"
EXAMPLE="/app/backend/config.yaml.example"

if [ ! -f "$CONFIG" ]; then
    if [ -f "$EXAMPLE" ]; then
        cp "$EXAMPLE" "$CONFIG"
        echo "Created config.yaml from config.yaml.example."
        echo "Edit backend/config.yaml (or mount it as a volume) before production use."
    else
        echo "config.yaml not found and no example file is available." >&2
        exit 1
    fi
fi

mkdir -p /app/backend/data/uploads
chown -R app:app /app/backend/data

exec gosu app "$@"
