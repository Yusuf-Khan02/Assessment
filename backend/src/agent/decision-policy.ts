export type DecisionBand = 'RECOMMENDED' | 'BORDERLINE' | 'NOT_RECOMMENDED';

export interface DecisionResult {
  recommended: boolean;
  decisionBand: DecisionBand;
  badgeText: string;
}

export class DecisionPolicy {
  static readonly RECOMMENDED_THRESHOLD = 0.75;
  static readonly BORDERLINE_THRESHOLD = 0.50;

  static evaluate(finalScore: number): DecisionResult {
    if (finalScore >= this.RECOMMENDED_THRESHOLD) {
      return {
        recommended: true,
        decisionBand: 'RECOMMENDED',
        badgeText: 'Recommended',
      };
    }

    if (finalScore >= this.BORDERLINE_THRESHOLD) {
      return {
        recommended: false,
        decisionBand: 'BORDERLINE',
        badgeText: 'Borderline',
      };
    }

    return {
      recommended: false,
      decisionBand: 'NOT_RECOMMENDED',
      badgeText: 'Not Recommended',
    };
  }
}

