#!/bin/bash
set -e

echo "Building MineCloud server..."
cd "$(dirname "$0")"

go build -o bin/server ./cmd/server

echo "Build complete! Binary: bin/server"
