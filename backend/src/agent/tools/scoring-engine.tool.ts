import { ScoringBreakdown, scoringBreakdownSchema } from '../types';

export interface ScoringEngineInput {
  skillMatchScore: number;
  experienceMatchScore: number;
  locationMatchScore: number;
}

export class ScoringEngineTool {
  static readonly name = 'scoring_engine_tool';
  static readonly description =
    'Computes the mandatory final score outside the LLM using the deterministic weighted formula: 0.5*skills + 0.3*experience + 0.2*location.';

  /**
   * FinalScore = (0.5 * skillMatchScore) + (0.3 * experienceMatchScore) + (0.2 * locationMatchScore)
   */
  static compute(input: ScoringEngineInput): ScoringBreakdown {
    const rawScore =
      0.5 * input.skillMatchScore +
      0.3 * input.experienceMatchScore +
      0.2 * input.locationMatchScore;

    // Round to 4 decimal places for floating-point sanity
    const finalScore = Math.round(rawScore * 10000) / 10000;

    const result: ScoringBreakdown = {
      skillMatchScore: Math.round(input.skillMatchScore * 10000) / 10000,
      experienceMatchScore: Math.round(input.experienceMatchScore * 10000) / 10000,
      locationMatchScore: Math.round(input.locationMatchScore * 10000) / 10000,
      finalScore: Math.min(1.0, Math.max(0.0, finalScore)),
    };

    return scoringBreakdownSchema.parse(result);
  }
}

