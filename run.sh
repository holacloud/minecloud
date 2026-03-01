#!/bin/bash
set -e

cd "$(dirname "$0")"

if [ ! -f bin/server ]; then
    echo "Building server first..."
    ./build.sh
fi

echo "Starting MineCloud server..."
./bin/server
