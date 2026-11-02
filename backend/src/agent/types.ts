import { z } from 'zod';

export const featureVectorSchema = z.object({
  experienceYears: z.number().min(0),
  skills: z.array(z.string()),
  normalizedSkills: z.array(z.string()),
  location: z.string(),
  education: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
});

export type FeatureVector = z.infer<typeof featureVectorSchema>;

export const scoringBreakdownSchema = z.object({
  skillMatchScore: z.number().min(0).max(1),
  experienceMatchScore: z.number().min(0).max(1),
  locationMatchScore: z.number().min(0).max(1),
  finalScore: z.number().min(0).max(1),
});

export type ScoringBreakdown = z.infer<typeof scoringBreakdownSchema>;

export const agentOutputSchema = z.object({
  recommended: z.boolean(),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(5),
});

export type AgentOutput = z.infer<typeof agentOutputSchema>;

export interface StructuredObservabilityLog {
  timestamp: string;
  profileId: number;
  openingId: string;
  startTime: string;
  parsingTimeMs: number;
  matchingTimeMs: number;
  totalLatencyMs: number;
  finalScore: number;
  recommended: boolean;
  confidence: number;
  decisionBand: 'RECOMMENDED' | 'BORDERLINE' | 'NOT_RECOMMENDED';
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  errors?: string[];
}
