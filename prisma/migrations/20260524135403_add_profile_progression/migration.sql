-- CreateEnum
CREATE TYPE "MissionType" AS ENUM ('DAILY', 'STARTER');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CLAIMED');

-- CreateEnum
CREATE TYPE "RewardSource" AS ENUM ('DAILY_BONUS', 'MISSION');

-- CreateTable
CREATE TABLE "UserProfile" (
    "userId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatarKey" TEXT,
    "avatarUrl" TEXT,
    "avatarUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserProgress" (
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "dailyStreak" INTEGER NOT NULL DEFAULT 0,
    "lastDailyClaimAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProgress_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserMissionProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "missionKey" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "type" "MissionType" NOT NULL,
    "target" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "status" "MissionStatus" NOT NULL DEFAULT 'ACTIVE',
    "creditReward" BIGINT NOT NULL,
    "xpReward" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMissionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressionRewardLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "RewardSource" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "periodKey" TEXT,
    "creditAmount" BIGINT NOT NULL,
    "xpAmount" INTEGER NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "levelBefore" INTEGER NOT NULL,
    "levelAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressionRewardLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_nickname_key" ON "UserProfile"("nickname");

-- CreateIndex
CREATE INDEX "UserMissionProgress_userId_periodKey_idx" ON "UserMissionProgress"("userId", "periodKey");

-- CreateIndex
CREATE INDEX "UserMissionProgress_userId_status_idx" ON "UserMissionProgress"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "UserMissionProgress_userId_missionKey_periodKey_key" ON "UserMissionProgress"("userId", "missionKey", "periodKey");

-- CreateIndex
CREATE INDEX "ProgressionRewardLedger_userId_createdAt_idx" ON "ProgressionRewardLedger"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ProgressionRewardLedger_userId_source_sourceKey_periodKey_key" ON "ProgressionRewardLedger"("userId", "source", "sourceKey", "periodKey");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgress" ADD CONSTRAINT "UserProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMissionProgress" ADD CONSTRAINT "UserMissionProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressionRewardLedger" ADD CONSTRAINT "ProgressionRewardLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
