import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { RecommendationService } from '../services/recommendation.service';
import { Logger, requestContextStorage } from '../utils/logger';

export const AGENT_PERFORMANCE_THRESHOLD_MS = 1500;

export interface RecommendationJob {
  id: string;
  profileId: number;
  requestId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  enqueuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  latencyMs?: number;
  error?: string;
}

export class RecommendationQueue {
  private queue: RecommendationJob[] = [];
  private activeJobs = new Map<string, RecommendationJob>();
  private completedJobs = new Map<string, RecommendationJob>();
  private failedJobs = new Map<string, RecommendationJob>();
  private concurrency: number;
  private isProcessing = false;
  private idleResolvers: (() => void)[] = [];

  constructor(concurrency = 5) {
    this.concurrency = concurrency;
  }

  /**
   * Enqueues a profile for background AI recommendation.
   * Returns immediately (O(1)) without blocking the calling thread.
   */
  enqueue(profileId: number, requestId?: string, maxAttempts = 2): RecommendationJob {
    const job: RecommendationJob = {
      id: randomUUID(),
      profileId,
      requestId: requestId || randomUUID(),
      status: 'queued',
      attempts: 0,
      maxAttempts,
      enqueuedAt: new Date(),
    };

    this.queue.push(job);
    Logger.info('Profile recommendation enqueued', {
      jobId: job.id,
      profileId: job.profileId,
      queueDepth: this.queue.length,
    });

    // Schedule worker kick-off on next tick
    setImmediate(() => this.processNext());

    return job;
  }

  private async processNext(): Promise<void> {
    if (this.activeJobs.size >= this.concurrency || this.queue.length === 0) {
      if (this.activeJobs.size === 0 && this.queue.length === 0) {
        this.notifyIdle();
      }
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeJobs.set(job.id, job);
    job.status = 'processing';
    job.attempts++;
    job.startedAt = new Date();

    const start = performance.now();

    // Run inside request context with the job's correlation requestId
    await requestContextStorage.run({ requestId: job.requestId }, async () => {
      try {
        Logger.info('Starting async profile evaluation', {
          jobId: job.id,
          profileId: job.profileId,
          attempt: job.attempts,
        });

        await RecommendationService.evaluateProfile(job.profileId);

        const latencyMs = Math.round(performance.now() - start);
        job.latencyMs = latencyMs;
        job.status = 'completed';
        job.completedAt = new Date();

        // Enforce Per-profile agent processing SLA <= 1500ms
        if (latencyMs > AGENT_PERFORMANCE_THRESHOLD_MS) {
          Logger.perfAlert(
            'AGENT_PER_PROFILE_LATENCY_EXCEEDED',
            AGENT_PERFORMANCE_THRESHOLD_MS,
            latencyMs,
            { jobId: job.id, profileId: job.profileId }
          );
        }

        this.completedJobs.set(job.id, job);
        Logger.info('Profile recommendation completed successfully', {
          jobId: job.id,
          profileId: job.profileId,
          latencyMs,
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        job.error = errorMsg;

        if (job.attempts < job.maxAttempts) {
          Logger.warn('Recommendation job failed, re-queueing for retry', {
            jobId: job.id,
            profileId: job.profileId,
            attempt: job.attempts,
            error: errorMsg,
          });
          job.status = 'queued';
          this.queue.push(job);
        } else {
          job.status = 'failed';
          job.completedAt = new Date();
          job.latencyMs = Math.round(performance.now() - start);
          this.failedJobs.set(job.id, job);
          Logger.error('Profile recommendation job permanently failed', {
            jobId: job.id,
            profileId: job.profileId,
            error: errorMsg,
          });
        }
      } finally {
        this.activeJobs.delete(job.id);
        setImmediate(() => this.processNext());
      }
    });
  }

  /**
   * Resolves when all queued and active jobs have finished.
   */
  async waitForIdle(): Promise<void> {
    if (this.queue.length === 0 && this.activeJobs.size === 0) {
      return;
    }
    return new Promise((resolve) => {
      this.idleResolvers.push(resolve);
    });
  }

  private notifyIdle(): void {
    const resolvers = [...this.idleResolvers];
    this.idleResolvers = [];
    for (const r of resolvers) {
      r();
    }
  }

  getStats() {
    return {
      queued: this.queue.length,
      active: this.activeJobs.size,
      completed: this.completedJobs.size,
      failed: this.failedJobs.size,
    };
  }

  clear(): void {
    this.queue = [];
    this.activeJobs.clear();
    this.completedJobs.clear();
    this.failedJobs.clear();
  }
}

export const recommendationQueue = new RecommendationQueue();

