#!/usr/bin/env bash
# Copies the database backups to a second place, so losing this server doesn't lose the data.
# Usage (the app runs it after every daily backup when OFFSITE_BACKUP_CMD is set in .env):
#   OFFSITE_BACKUP_CMD="bash /home/ubuntu/neon-vault/deploy/offsite-backup.sh rclone:mycrypt:neon-vault"
#   OFFSITE_BACKUP_CMD="bash /home/ubuntu/neon-vault/deploy/offsite-backup.sh rsync:user@other-host:neon-backups/"
# rclone: set up a remote once with `rclone config` (Backblaze B2, Google Drive, …). Wrap it in a "crypt" remote
# so the copies are encrypted. rsync: needs a password-less SSH key to a machine you control.
set -euo pipefail
TARGET="${1:?Ziel angeben: rclone:<remote:pfad> oder rsync:<user@host:pfad>}"
DIR="${BACKUP_DIR:?BACKUP_DIR fehlt}"
case "$TARGET" in
  rclone:*) rclone copy --max-age 3d "$DIR" "${TARGET#rclone:}" ;;
  rsync:*) rsync -a -e 'ssh -o BatchMode=yes' --include='*.db' --exclude='*' "$DIR/" "${TARGET#rsync:}" ;;
  *) echo "Unbekanntes Ziel: $TARGET" >&2; exit 1 ;;
esac
