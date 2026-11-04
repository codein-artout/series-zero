-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "AnonClaim" (
    "token" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "claimedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonClaim_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "commit" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "revealed" BOOLEAN NOT NULL DEFAULT false,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tick" (
    "seasonId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "supply" BIGINT NOT NULL,
    "minted" BIGINT NOT NULL,
    "burned" BIGINT NOT NULL,
    "stabilizer" DOUBLE PRECISION NOT NULL,
    "hype" DOUBLE PRECISION NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tick_pkey" PRIMARY KEY ("seasonId","number")
);

-- CreateTable
CREATE TABLE "Sector" (
    "seasonId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "pool" DOUBLE PRECISION NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("seasonId","id")
);

-- CreateTable
CREATE TABLE "Founder" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reputation" DOUBLE PRECISION NOT NULL,
    "companyId" TEXT,
    "state" JSONB NOT NULL,

    CONSTRAINT "Founder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "name" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reputation" DOUBLE PRECISION NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acquirer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "Acquirer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "mark" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "sectorRank" INTEGER NOT NULL,
    "createdTick" INTEGER NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "companyId" TEXT,
    "sector" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pitch" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pitch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "pitchId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "expiresTick" INTEGER NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExitOffer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "acquirerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "ExitOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "expiresTick" INTEGER NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldEvent" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "sector" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "WorldEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "authorType" TEXT NOT NULL,
    "authorId" TEXT,
    "companyId" TEXT,
    "fundId" TEXT,
    "text" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "cosigns" INTEGER NOT NULL DEFAULT 0,
    "roasts" INTEGER NOT NULL DEFAULT 0,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feud" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "a" TEXT NOT NULL,
    "b" TEXT NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "Feud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "ownerId" TEXT,
    "status" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialLog" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "ownerId" TEXT,
    "data" JSONB NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoDay" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "tick" INTEGER NOT NULL,
    "state" JSONB NOT NULL,

    CONSTRAINT "DemoDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mark" (
    "companyId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "seasonId" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "mark" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Mark_pkey" PRIMARY KEY ("companyId","seasonId","tick")
);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "balance" BIGINT NOT NULL,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "seq" BIGINT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "memo" TEXT,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "LedgerTotals" (
    "id" TEXT NOT NULL,
    "minted" BIGINT NOT NULL,
    "burned" BIGINT NOT NULL,
    "seq" BIGINT NOT NULL,

    CONSTRAINT "LedgerTotals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "AnonClaim_ipHash_createdAt_idx" ON "AnonClaim"("ipHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Season_number_key" ON "Season"("number");

-- CreateIndex
CREATE INDEX "Founder_ownerId_idx" ON "Founder"("ownerId");

-- CreateIndex
CREATE INDEX "Fund_ownerId_idx" ON "Fund"("ownerId");

-- CreateIndex
CREATE INDEX "Company_seasonId_sector_idx" ON "Company"("seasonId", "sector");

-- CreateIndex
CREATE INDEX "Company_founderId_idx" ON "Company"("founderId");

-- CreateIndex
CREATE INDEX "Idea_founderId_idx" ON "Idea"("founderId");

-- CreateIndex
CREATE INDEX "Pitch_companyId_idx" ON "Pitch"("companyId");

-- CreateIndex
CREATE INDEX "Pitch_seasonId_tick_idx" ON "Pitch"("seasonId", "tick");

-- CreateIndex
CREATE INDEX "Offer_companyId_idx" ON "Offer"("companyId");

-- CreateIndex
CREATE INDEX "Offer_fundId_idx" ON "Offer"("fundId");

-- CreateIndex
CREATE INDEX "Deal_fundId_idx" ON "Deal"("fundId");

-- CreateIndex
CREATE INDEX "Deal_companyId_idx" ON "Deal"("companyId");

-- CreateIndex
CREATE INDEX "ExitOffer_companyId_idx" ON "ExitOffer"("companyId");

-- CreateIndex
CREATE INDEX "Decision_userId_status_idx" ON "Decision"("userId", "status");

-- CreateIndex
CREATE INDEX "WorldEvent_seasonId_tick_idx" ON "WorldEvent"("seasonId", "tick");

-- CreateIndex
CREATE INDEX "Post_seasonId_tick_idx" ON "Post"("seasonId", "tick");

-- CreateIndex
CREATE INDEX "Post_companyId_idx" ON "Post"("companyId");

-- CreateIndex
CREATE INDEX "PostReaction_userId_createdAt_idx" ON "PostReaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostReaction_postId_userId_kind_key" ON "PostReaction"("postId", "userId", "kind");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Draft_ownerId_status_idx" ON "Draft"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key" ON "Report"("reporterId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "Card_refId_idx" ON "Card"("refId");

-- CreateIndex
CREATE INDEX "DemoDay_seasonId_number_idx" ON "DemoDay"("seasonId", "number");

-- CreateIndex
CREATE INDEX "Mark_seasonId_sector_tick_idx" ON "Mark"("seasonId", "sector", "tick");

-- CreateIndex
CREATE INDEX "LedgerEntry_seasonId_tick_idx" ON "LedgerEntry"("seasonId", "tick");

-- CreateIndex
CREATE INDEX "LedgerEntry_from_idx" ON "LedgerEntry"("from");

-- CreateIndex
CREATE INDEX "LedgerEntry_to_idx" ON "LedgerEntry"("to");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

