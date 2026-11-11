-- CreateTable
CREATE TABLE "FreeSpins" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "machine" TEXT NOT NULL,
    "bet" BIGINT NOT NULL,
    "spins" INTEGER NOT NULL,
    CONSTRAINT "FreeSpins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
