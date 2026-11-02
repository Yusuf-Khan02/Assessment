export interface MatchingInput {
  candidateExp: number;
  experienceMin: number;
  experienceMax?: number | null;
  candidateSkills: string[];
  requiredSkills: string[];
  candidateLocation: string;
  jobLocation?: string | null;
}

export interface MatchingResult {
  experienceMatchScore: number;
  skillMatchScore: number;
  locationMatchScore: number;
}

export class DeterministicMatchingTool {
  static readonly name = 'deterministic_matching_tool';
  static readonly description =
    'Calculates deterministic experience, skill overlap, and location match scores based on strict mathematical rules.';

  /**
   * Experience Logic:
   * if candidateExp < min -> 0
   * if within range (candidateExp >= min && (max == null || candidateExp <= max)) -> 1
   * if above max (max != null && candidateExp > max) -> 0.8
   */
  static calculateExperienceMatch(
    candidateExp: number,
    min: number,
    max?: number | null
  ): number {
    if (candidateExp < min) {
      return 0;
    }
    if (max !== undefined && max !== null && candidateExp > max) {
      return 0.8;
    }
    return 1.0;
  }

  /**
   * Skill Match:
   * overlap / requiredSkills
   */
  static calculateSkillMatch(candidateSkills: string[], requiredSkills: string[]): number {
    if (!requiredSkills || requiredSkills.length === 0) {
      return 1.0;
    }

    const candidateSkillsLower = new Set(
      candidateSkills.map((s) => s.trim().toLowerCase())
    );

    let overlapCount = 0;
    for (const req of requiredSkills) {
      if (candidateSkillsLower.has(req.trim().toLowerCase())) {
        overlapCount++;
      }
    }

    const score = overlapCount / requiredSkills.length;
    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Location Match:
   * Remote -> 1
   * Onsite mismatch -> 0.5
   * Exact match -> 1
   */
  static calculateLocationMatch(
    candidateLocation: string,
    jobLocation?: string | null
  ): number {
    const jobLoc = (jobLocation || 'Remote').trim().toLowerCase();
    const candLoc = (candidateLocation || 'Remote').trim().toLowerCase();

    // If job is Remote or candidate is Remote -> 1
    if (jobLoc.includes('remote') || candLoc.includes('remote')) {
      return 1.0;
    }

    // Exact match -> 1
    if (jobLoc === candLoc) {
      return 1.0;
    }

    // Onsite mismatch -> 0.5
    return 0.5;
  }

  static execute(input: MatchingInput): MatchingResult {
    const experienceMatchScore = this.calculateExperienceMatch(
      input.candidateExp,
      input.experienceMin,
      input.experienceMax
    );

    const skillMatchScore = this.calculateSkillMatch(
      input.candidateSkills,
      input.requiredSkills
    );

    const locationMatchScore = this.calculateLocationMatch(
      input.candidateLocation,
      input.jobLocation
    );

    return {
      experienceMatchScore,
      skillMatchScore,
      locationMatchScore,
    };
  }
}

