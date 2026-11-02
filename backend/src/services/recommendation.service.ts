import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { AgentOrchestrator } from '../agent/orchestrator';
import {
  LLMProvider,
  GeminiProvider,
  GroqProvider,
  AutonomousAgentProvider,
} from '../agent/llm-core';
import { recommendationQueue } from '../queue/recommendation.queue';

export class RecommendationService {
  private static provider: LLMProvider | null = null;
  public static readonly VERSION = 'v1.0.0-agent';

  static getProvider(): LLMProvider {
    if (this.provider) {
      return this.provider;
    }

    const providerType = (process.env.LLM_PROVIDER || 'mock').toLowerCase();
    const apiKey = process.env.LLM_API_KEY;

    if (providerType === 'gemini' && apiKey && apiKey !== 'mock-key-for-dev') {
      this.provider = new GeminiProvider(apiKey, process.env.LLM_MODEL || 'gemini-1.5-flash');
    } else if (providerType === 'groq' && apiKey && apiKey !== 'mock-key-for-dev') {
      this.provider = new GroqProvider(apiKey, process.env.LLM_MODEL || 'llama-3.3-70b-versatile');
    } else {
      // Default autonomous tool-calling agent provider for testing & dev
      this.provider = new AutonomousAgentProvider();
    }

    return this.provider;
  }

  static setProvider(customProvider: LLMProvider): void {
    this.provider = customProvider;
  }

  /**
   * Evaluates a candidate profile using the full Agent Orchestrator and writes results
   * inside a single Prisma transaction. Idempotent — re-running overwrites cleanly.
   */
  static async evaluateProfile(profileId: number, fileBuffer?: Buffer) {
    const profile = await prisma.hiringProfile.findUnique({
      where: { id: profileId },
      include: {
        opening: true,
      },
    });

    if (!profile) {
      throw new Error(`Profile with ID ${profileId} not found`);
    }

    const opening = profile.opening;
    const provider = this.getProvider();
    const orchestrator = new AgentOrchestrator(provider);

    // Run dynamic tool-calling agent orchestrator
    const result = await orchestrator.run({
      profileId: profile.id,
      openingId: opening.id,
      s3Key: profile.s3Key,
      jobTitle: opening.title,
      requiredSkills: ['React', 'Node.js', 'TypeScript'],
      experienceMin: opening.experienceMin,
      experienceMax: opening.experienceMax,
      jobLocation: opening.location,
      fileBuffer,
    });

    // Write all recommendation fields inside a single atomic transaction
    try {
      const updated = await prisma.$transaction(async (tx) => {
        return tx.hiringProfile.update({
          where: { id: profileId },
          data: {
            recommended: result.output.recommended,
            recommendationScore: result.output.score,
            recommendationReason: result.output.reason,
            recommendationConfidence: result.output.confidence,
            recommendationLatencyMs: result.log.totalLatencyMs,
            recommendationVersion: this.VERSION,
            recommendedAt: new Date(),
            reasoningMetadata: result.metadata ? (result.metadata as unknown as Prisma.InputJsonValue) : undefined,
          },
        });
      });

      return {
        profile: updated,
        log: result.log,
        iterations: result.iterations,
      };
    } catch {
      // If profile was concurrently deleted, return graceful response
      return {
        profile: null,
        log: result.log,
        iterations: result.iterations,
      };
    }
  }

  /**
   * Background trigger helper for automatic profile evaluation on SUBMITTED
   * Uses non-blocking recommendation queue
   */
  static triggerAsyncEvaluation(profileId: number, requestId?: string): void {
    recommendationQueue.enqueue(profileId, requestId);
  }
}
