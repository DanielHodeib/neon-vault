-- AlterTable
ALTER TABLE "User" ADD COLUMN "frame" TEXT;
ALTER TABLE "User" ADD COLUMN "nameEffect" TEXT;
ALTER TABLE "User" ADD COLUMN "title" TEXT;

-- CreateTable
CREATE TABLE "ShopPurchase" (
    "userId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "item"),
    CONSTRAINT "ShopPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

