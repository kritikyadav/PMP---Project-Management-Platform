#!/bin/sh
set -e

if [ "$1" = "--new" ]; then
  echo "Running migrations..."
  node dist/migrate.js

  echo "Seeding admin..."
  node dist/scripts/seedAdmin.js

  echo "Filling dummy data..."
  node dist/scripts/fillDummyData.js
fi

echo "Starting server..."
exec node dist/index.js