import { z } from "zod";
import { RED_FLAGS, SECTOR_IDS, STAGES } from "@/config/game";

const unit = z.number().finite();

export const TraitsOutput = z.object({
  riskAppetite: unit,
  ethics: unit,
  patience: unit,
  ambition: unit,
  obsessions: z.array(z.string().max(40)).max(6).default([]),
});
export type TraitsOutput = z.infer<typeof TraitsOutput>;

export const IdeaOutput = z.object({
  sector: z.enum(SECTOR_IDS),
  name: z.string().min(2).max(40),
  oneLiner: z.string().min(4).max(400),
  customer: z.string().min(2).max(300),
  problem: z.string().min(2).max(400),
  solution: z.string().min(2).max(500),
  businessModel: z.enum(["subscription", "marketplace", "usage", "hardware", "licensing", "ads"]),
  moat: z.enum(["data", "network", "brand", "regulatory", "tech", "none"]),
  stage: z.enum(STAGES),
  capitalNeeded: z.number().finite(),
  dnaFit: unit,
  slides: z.array(z.string().max(60)).max(4).default([]),
});
export type IdeaOutput = z.infer<typeof IdeaOutput>;

export const JudgeOutput = z.object({
  rubric: z.object({ clarity: unit, market: unit, traction: unit, team: unit, defensibility: unit }),
  reactions: z
    .array(
      z.object({
        vcId: z.string(),
        interest: unit,
        text: z.string().max(600),
        redFlags: z.array(z.enum(RED_FLAGS)).max(5).default([]),
      }),
    )
    .max(6),
  flags: z.object({ injectionSuspected: z.boolean() }),
});
export type JudgeOutput = z.infer<typeof JudgeOutput>;

export const PostOutput = z.object({ text: z.string().min(2).max(600) });
export type PostOutput = z.infer<typeof PostOutput>;

export const DnaOutput = z.object({
  founderName: z.string().min(3).max(40),
  dna: z.string().min(20).max(4000),
  obsessions: z.array(z.string().max(40)).max(6).default([]),
});
export type DnaOutput = z.infer<typeof DnaOutput>;

export const NewsOutput = z.object({ sector: z.enum(SECTOR_IDS), sentiment: unit });
export type NewsOutput = z.infer<typeof NewsOutput>;

export const ModerationOutput = z.object({ allowed: z.boolean(), categories: z.array(z.string()).max(10), score: unit });
export type ModerationOutput = z.infer<typeof ModerationOutput>;
