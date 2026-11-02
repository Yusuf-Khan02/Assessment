import { ResumeParsingTool, ResumeParsingInput } from './tools/resume-parsing.tool';
import { FeatureExtractionTool } from './tools/feature-extraction.tool';
import { SkillNormalizationTool } from './tools/skill-normalization.tool';
import { DeterministicMatchingTool, MatchingInput } from './tools/deterministic-matching.tool';
import { ScoringEngineTool, ScoringEngineInput } from './tools/scoring-engine.tool';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
  };
}

export class ToolRegistry {
  static getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: ResumeParsingTool.name,
        description: ResumeParsingTool.description,
        parameters: {
          type: 'object',
          properties: {
            s3Key: { type: 'string', description: 'The S3 key of the resume file to parse' },
          },
          required: ['s3Key'],
        },
      },
      {
        name: FeatureExtractionTool.name,
        description: FeatureExtractionTool.description,
        parameters: {
          type: 'object',
          properties: {
            rawText: { type: 'string', description: 'Sanitized resume plain text' },
          },
          required: ['rawText'],
        },
      },
      {
        name: SkillNormalizationTool.name,
        description: SkillNormalizationTool.description,
        parameters: {
          type: 'object',
          properties: {
            skills: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of skill names to normalize',
            },
          },
          required: ['skills'],
        },
      },
      {
        name: DeterministicMatchingTool.name,
        description: DeterministicMatchingTool.description,
        parameters: {
          type: 'object',
          properties: {
            candidateExp: { type: 'number', description: 'Years of candidate experience' },
            experienceMin: { type: 'number', description: 'Job minimum required experience' },
            experienceMax: { type: 'number', description: 'Job maximum experience' },
            candidateSkills: { type: 'array', items: { type: 'string' } },
            requiredSkills: { type: 'array', items: { type: 'string' } },
            candidateLocation: { type: 'string' },
            jobLocation: { type: 'string' },
          },
          required: ['candidateExp', 'experienceMin', 'candidateSkills', 'requiredSkills', 'candidateLocation'],
        },
      },
      {
        name: ScoringEngineTool.name,
        description: ScoringEngineTool.description,
        parameters: {
          type: 'object',
          properties: {
            skillMatchScore: { type: 'number', description: 'Score between 0 and 1' },
            experienceMatchScore: { type: 'number', description: 'Score between 0 and 1' },
            locationMatchScore: { type: 'number', description: 'Score between 0 and 1' },
          },
          required: ['skillMatchScore', 'experienceMatchScore', 'locationMatchScore'],
        },
      },
    ];
  }

  static async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    contextBuffer?: Buffer
  ): Promise<unknown> {
    switch (toolName) {
      case ResumeParsingTool.name:
        return ResumeParsingTool.execute({
          s3Key: String(args.s3Key),
          buffer: contextBuffer,
        } as ResumeParsingInput);

      case FeatureExtractionTool.name:
        return FeatureExtractionTool.extract(String(args.rawText || ''));

      case SkillNormalizationTool.name:
        return SkillNormalizationTool.execute((args.skills as string[]) || []);

      case DeterministicMatchingTool.name:
        return DeterministicMatchingTool.execute(args as unknown as MatchingInput);

      case ScoringEngineTool.name:
        return ScoringEngineTool.compute(args as unknown as ScoringEngineInput);

      default:
        throw new Error(`Unknown tool requested: ${toolName}`);
    }
  }
}
