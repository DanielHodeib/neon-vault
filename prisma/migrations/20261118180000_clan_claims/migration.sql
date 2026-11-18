-- CreateTable
CREATE TABLE "ClanClaim" (
    "userId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "week", "tier")
);

