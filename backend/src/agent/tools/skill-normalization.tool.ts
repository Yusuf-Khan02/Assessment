export class SkillNormalizationTool {
  static readonly name = 'skill_normalization_tool';
  static readonly description =
    'Maps raw extracted skill strings to a canonical industry taxonomy.';

  private static readonly TAXONOMY_MAP: Record<string, string> = {
    react: 'React',
    reactjs: 'React',
    'react.js': 'React',
    'react native': 'React Native',
    reactnative: 'React Native',
    ts: 'TypeScript',
    typescript: 'TypeScript',
    js: 'JavaScript',
    javascript: 'JavaScript',
    node: 'Node.js',
    nodejs: 'Node.js',
    'node.js': 'Node.js',
    express: 'Express',
    expressjs: 'Express',
    next: 'Next.js',
    nextjs: 'Next.js',
    'next.js': 'Next.js',
    vue: 'Vue',
    vuejs: 'Vue',
    'vue.js': 'Vue',
    angular: 'Angular',
    postgres: 'PostgreSQL',
    postgresql: 'PostgreSQL',
    pgsql: 'PostgreSQL',
    mysql: 'MySQL',
    mongodb: 'MongoDB',
    mongo: 'MongoDB',
    redis: 'Redis',
    aws: 'AWS',
    'amazon web services': 'AWS',
    gcp: 'Google Cloud Platform',
    azure: 'Azure',
    docker: 'Docker',
    k8s: 'Kubernetes',
    kubernetes: 'Kubernetes',
    python: 'Python',
    python3: 'Python',
    py: 'Python',
    golang: 'Go',
    go: 'Go',
    rust: 'Rust',
    java: 'Java',
    graphql: 'GraphQL',
    rest: 'REST API',
    restful: 'REST API',
    tailwind: 'Tailwind CSS',
    tailwindcss: 'Tailwind CSS',
    prisma: 'Prisma',
  };

  static normalizeSkill(raw: string): string {
    const trimmed = raw.trim().toLowerCase();
    return this.TAXONOMY_MAP[trimmed] || raw.trim();
  }

  static execute(skills: string[]): string[] {
    const normalizedSet = new Set<string>();

    for (const skill of skills) {
      if (skill && skill.trim().length > 0) {
        normalizedSet.add(this.normalizeSkill(skill));
      }
    }

    return Array.from(normalizedSet);
  }
}

