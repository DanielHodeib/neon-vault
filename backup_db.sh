#!/bin/bash
# Pfad zur aktuellen DB und zum Backup-Ordner
DB_PATH="$HOME/neon-vault/prisma/dev.db"
BACKUP_DIR="$HOME/neon-vault/backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

# Kopie erstellen
cp $DB_PATH $BACKUP_DIR/dev_backup_$TIMESTAMP.db

# Alte Backups löschen, die älter als 7 Tage sind (spart Platz!)
find $BACKUP_DIR -name "dev_backup_*.db" -mtime +7 -exec rm {} \;

echo "Backup erstellt: dev_backup_$TIMESTAMP.db"
