-- AlterTable
ALTER TABLE "User" ADD COLUMN "showcase" TEXT;

-- CreateTable
CREATE TABLE "ProfileLike" (
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("fromId", "toId"),
    CONSTRAINT "ProfileLike_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProfileLike_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProfileLike_toId_idx" ON "ProfileLike"("toId");

