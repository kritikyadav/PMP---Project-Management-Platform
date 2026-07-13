#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   BACKUP_DIR=/mnt/pmp-backups DB_HOST=localhost DB_PORT=5432 DB_NAME=pmp_prod DB_USER=pmp_user ./scripts/backup-postgres.sh
#
# PGPASSWORD should be supplied by the calling environment or a secure pgpass file.

BACKUP_DIR="${BACKUP_DIR:-/var/backups/pmp-postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_FILE="${BACKUP_DIR}/${DB_NAME:-pmp}_backup_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

pg_dump \
  --host="${DB_HOST:?DB_HOST is required}" \
  --port="${DB_PORT:-5432}" \
  --username="${DB_USER:?DB_USER is required}" \
  --format=custom \
  --blobs \
  --file="${OUTPUT_FILE}" \
  "${DB_NAME:?DB_NAME is required}"

find "${BACKUP_DIR}" -type f -name "*_backup_*.dump" -mtime +"${RETENTION_DAYS}" -delete

echo "Backup written to ${OUTPUT_FILE}"
