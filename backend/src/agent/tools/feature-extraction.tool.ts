import { FeatureVector, featureVectorSchema } from '../types';
import { SkillNormalizationTool } from './skill-normalization.tool';

export class FeatureExtractionTool {
  static readonly name = 'feature_extraction_tool';
  static readonly description =
    'Extracts structured candidate features (experience years, skills, location, education) from sanitized resume text.';

  /**
   * Deterministic / hybrid extractor that parses structured facts from sanitized text
   */
  static extract(rawText: string): FeatureVector {
    // 1. Extract years of experience
    let experienceYears = 0;
    const expRegexes = [
      /(\d+)\+?\s*(?:years?|yrs?)(?:\s+of)?\s+experience/i,
      /experience\s*:\s*(\d+)\+?\s*(?:years?|yrs?)/i,
      /(\d+)\+?\s*(?:years?|yrs?)\s+in\s+software/i,
    ];

    for (const reg of expRegexes) {
      const match = rawText.match(reg);
      if (match && match[1]) {
        experienceYears = parseInt(match[1], 10);
        break;
      }
    }

    // Default heuristic if not matched: check for year ranges
    if (experienceYears === 0) {
      const yearMatches = rawText.match(/\b(20\d\d)\b/g);
      if (yearMatches && yearMatches.length >= 2) {
        const years = yearMatches.map((y) => parseInt(y, 10)).sort((a, b) => a - b);
        const span = years[years.length - 1] - years[0];
        if (span > 0 && span <= 30) {
          experienceYears = span;
        }
      }
    }

    // 2. Extract skills
    const knownSkillKeywords = [
      'React',
      'ReactJS',
      'Node.js',
      'NodeJS',
      'TypeScript',
      'JavaScript',
      'Python',
      'PostgreSQL',
      'Postgres',
      'AWS',
      'Docker',
      'Kubernetes',
      'GraphQL',
      'Express',
      'Next.js',
      'Go',
      'Java',
      'Tailwind',
      'Prisma',
      'SQL',
    ];

    const detectedSkills: string[] = [];
    for (const kw of knownSkillKeywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(`\\b${escaped}\\b`, 'i');
      if (reg.test(rawText)) {
        detectedSkills.push(kw);
      }
    }

    const normalizedSkills = SkillNormalizationTool.execute(detectedSkills);

    // 3. Location detection
    let location = 'Remote';
    if (/gotham/i.test(rawText)) {
      location = 'Gotham City';
    } else if (/new york/i.test(rawText)) {
      location = 'New York';
    } else if (/san francisco/i.test(rawText)) {
      location = 'San Francisco';
    }

    // 4. Education
    const education: string[] = [];
    if (/bachelor|b\.s|b\.e|b\.tech/i.test(rawText)) {
      education.push("Bachelor's Degree in Computer Science");
    }
    if (/master|m\.s|m\.tech/i.test(rawText)) {
      education.push("Master's Degree");
    }

    const featureVector: FeatureVector = {
      experienceYears,
      skills: detectedSkills,
      normalizedSkills,
      location,
      education,
      keywords: normalizedSkills.slice(0, 5),
    };

    return featureVectorSchema.parse(featureVector);
  }
}

