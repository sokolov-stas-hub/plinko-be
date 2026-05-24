/*
  Warnings:

  - Made the column `periodKey` on table `ProgressionRewardLedger` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ProgressionRewardLedger" ALTER COLUMN "periodKey" SET NOT NULL;
