-- CreateTable
CREATE TABLE "Clan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "open" BOOLEAN NOT NULL DEFAULT true,
    "leaderId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ClanRequest" (
    "clanId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("clanId", "userId"),
    CONSTRAINT "ClanRequest_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "balance" BIGINT NOT NULL DEFAULT 10000,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bannedUntil" DATETIME,
    "banReason" TEXT,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "bio" TEXT NOT NULL DEFAULT '',
    "clanTag" TEXT,
    "clanId" TEXT,
    "chatColor" TEXT,
    "rankTag" TEXT NOT NULL DEFAULT 'BRONZE',
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "theme" TEXT NOT NULL DEFAULT 'neon',
    "publicProfile" BOOLEAN NOT NULL DEFAULT true,
    "showBalance" BOOLEAN NOT NULL DEFAULT false,
    "showHistory" BOOLEAN NOT NULL DEFAULT false,
    "dailyLimit" BIGINT,
    "dailyLimitNext" BIGINT,
    "dailyLimitNextAt" DATETIME,
    "frame" TEXT,
    "title" TEXT,
    "nameEffect" TEXT,
    "bubble" TEXT,
    "aura" TEXT,
    "showcase" TEXT,
    "accent" TEXT,
    CONSTRAINT "User_clanId_fkey" FOREIGN KEY ("clanId") REFERENCES "Clan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("accent", "aura", "avatarUrl", "balance", "banReason", "bannedUntil", "bannerUrl", "bio", "bubble", "chatColor", "clanTag", "createdAt", "dailyLimit", "dailyLimitNext", "dailyLimitNextAt", "frame", "id", "nameEffect", "passwordHash", "publicProfile", "rankTag", "role", "showBalance", "showHistory", "showcase", "soundEnabled", "theme", "title", "username", "xp") SELECT "accent", "aura", "avatarUrl", "balance", "banReason", "bannedUntil", "bannerUrl", "bio", "bubble", "chatColor", "clanTag", "createdAt", "dailyLimit", "dailyLimitNext", "dailyLimitNextAt", "frame", "id", "nameEffect", "passwordHash", "publicProfile", "rankTag", "role", "showBalance", "showHistory", "showcase", "soundEnabled", "theme", "title", "username", "xp" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Clan_name_key" ON "Clan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Clan_tag_key" ON "Clan"("tag");


-- Existing free-text clan tags become real clans (the earliest player with a tag leads it).
INSERT INTO "Clan" ("id", "name", "tag", "leaderId")
SELECT 'clan' || lower(hex(randomblob(8))), t.tag, t.tag,
       (SELECT u2."id" FROM "User" u2 WHERE u2."clanTag" = t.tag ORDER BY u2."createdAt" LIMIT 1)
FROM (SELECT DISTINCT "clanTag" AS tag FROM "User" WHERE "clanTag" IS NOT NULL AND "clanTag" != '') t;
UPDATE "User" SET "clanId" = (SELECT "id" FROM "Clan" WHERE "tag" = "User"."clanTag") WHERE "clanTag" IS NOT NULL AND "clanTag" != '';
UPDATE "User" SET "clanTag" = NULL WHERE "clanId" IS NULL;
