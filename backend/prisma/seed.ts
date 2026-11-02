import { PrismaClient, OpeningStatus, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export async function seed() {
  console.log('--- Starting Database Seeding ---');

  // Clean existing data for idempotency
  await prisma.hiringProfile.deleteMany({});
  await prisma.opening.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenants.deleteMany({});

  // 1. Create Tenant: "Bruce Wayne Corp"
  const tenant = await prisma.tenants.create({
    data: {
      name: 'Bruce Wayne Corp',
    },
  });
  console.log(`Created Tenant: "${tenant.name}" (${tenant.tenantId})`);

  // 2. Create Users
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const hiringManager = await prisma.user.create({
    data: {
      tenantId: tenant.tenantId,
      name: 'Lucius Fox',
      email: 'lucius.fox@waynecorp.com',
      passwordHash,
      role: UserRole.HIRING_MANAGER,
    },
  });

  const hiringManager2 = await prisma.user.create({
    data: {
      tenantId: tenant.tenantId,
      name: 'Rachel Dawes',
      email: 'rachel.dawes@waynecorp.com',
      passwordHash,
      role: UserRole.HIRING_MANAGER,
    },
  });

  const vendor1 = await prisma.user.create({
    data: {
      tenantId: tenant.tenantId,
      name: 'Wayne Tech Vendor 1',
      email: 'vendor1@techpartners.com',
      passwordHash,
      role: UserRole.IT_VENDOR,
    },
  });

  const vendor2 = await prisma.user.create({
    data: {
      tenantId: tenant.tenantId,
      name: 'Wayne Tech Vendor 2',
      email: 'vendor2@cloudsolutions.com',
      passwordHash,
      role: UserRole.IT_VENDOR,
    },
  });

  console.log(`Created Users: 2 Hiring Managers, 2 IT Vendors`);

  // 3. Create at least 12 Opening records with varied attributes
  const openingsData = [
    {
      title: 'Senior Full Stack Engineer (React/Node)',
      description: 'Looking for a senior engineer experienced with React, Node.js, TypeScript, and AWS.',
      location: 'Remote',
      contractType: 'C2C',
      experienceMin: 5,
      experienceMax: 8,
      status: OpeningStatus.OPEN,
      hiringManagerId: hiringManager.id,
    },
    {
      title: 'AI / Machine Learning Engineer',
      description: 'Design and deploy LLM agent workflows, fine-tuning, and retrieval augmented generation pipelines.',
      location: 'Gotham City - Onsite',
      contractType: 'W2 Contract',
      experienceMin: 4,
      experienceMax: 7,
      status: OpeningStatus.OPEN,
      hiringManagerId: hiringManager.id,
    },
    {
      title: 'DevOps & Cloud Infrastructure Specialist',
      description: 'Maintain Kubernetes clusters, Terraform modules, and AWS infrastructure.',
      location: 'Remote',
      contractType: 'C2C',
      experienceMin: 6,
      experienceMax: 10,
      status: OpeningStatus.OPEN,
      hiringManagerId: hiringManager.id,
    },
    {
      title: 'Senior Frontend Developer (React/Next.js)',
      description: 'Build responsive, high-performance dashboards with React, Tailwind, and WebSockets.',
      location: 'Gotham City - Hybrid',
      contractType: 'Contract-to-Hire',
      experienceMin: 4,
      experienceMax: 6,
      status: OpeningStatus.OPEN,
      hiringManagerId: hiringManager.id,
    },
    {
      title: 'Backend Systems Architect',
      description: 'Lead architecture for distributed transaction engines with PostgreSQL and Redis.',
      location: 'Remote',
      contractType: 'C2C',
      experienceMin: 8,
      experienceMax: 12,
      status: OpeningStatus.OPEN,
      hiringManagerId: hiringManager.id,
    },
    {
      title: 'Cybersecurity Threat Analyst',
      description: 'Enterprise threat detection, penetration testing, and security auditing for Wayne Enterprises.',
      location: 'Gotham City - Onsite',
      contractType: 'W2 Contract',
      experienceMin: 5,
      experienceMax: 9,
      status: OpeningStatus.OPEN,
      hiringManagerId: hiringManager.id,
    },
    {
      title: 'Lead QA Automation Engineer',
      description: 'Build end-to-end test automation suites with Playwright, Vitest, and CI/CD pipelines.',
      location: 'Remote',
      contractType: 'C2C',
      experienceMin: 5,
      experienceMax: 8,
      status: OpeningStatus.ON_HOLD,
      hiringManagerId: hiringManager2.id,
    },
    {
      title: 'Embedded Systems Firmware Engineer',
      description: 'Develop low-level C/C++ firmware for advanced IoT hardware and autonomous devices.',
      location: 'Gotham City - Onsite',
      contractType: 'W2 Contract',
      experienceMin: 4,
      experienceMax: 7,
      status: OpeningStatus.OPEN,
      hiringManagerId: hiringManager2.id,
    },
    {
      title: 'Staff Data Engineer (Snowflake / dbt)',
      description: 'Build modern data stack pipelines, data warehousing, and ETL transformation.',
      location: 'Remote',
      contractType: 'C2C',
      experienceMin: 7,
      experienceMax: 11,
      status: OpeningStatus.OPEN,
      hiringManagerId: hiringManager2.id,
    },
    {
      title: 'Junior Backend Developer (Node/TypeScript)',
      description: 'Assist in building microservices and RESTful APIs using Express and Prisma.',
      location: 'Remote',
      contractType: 'Contract',
      experienceMin: 1,
      experienceMax: 3,
      status: OpeningStatus.OPEN,
      hiringManagerId: hiringManager2.id,
    },
    {
      title: 'Product Design Lead (UI/UX)',
      description: 'Design intuitive enterprise workflows, design systems in Figma, and conduct usability testing.',
      location: 'Gotham City - Hybrid',
      contractType: 'Contract',
      experienceMin: 6,
      experienceMax: 10,
      status: OpeningStatus.CLOSED,
      hiringManagerId: hiringManager2.id,
    },
    {
      title: 'Site Reliability Engineer (SRE)',
      description: 'Ensure 99.99% availability, monitor telemetry with Prometheus/Grafana, and automate incident response.',
      location: 'Remote',
      contractType: 'C2C',
      experienceMin: 5,
      experienceMax: 8,
      status: OpeningStatus.OPEN,
      hiringManagerId: hiringManager2.id,
    },
    {
      title: 'Mobile App Developer (React Native)',
      description: 'Cross-platform mobile engineering for enterprise iOS and Android applications.',
      location: 'Remote',
      contractType: 'C2C',
      experienceMin: 3,
      experienceMax: 6,
      status: OpeningStatus.OPEN,
      hiringManagerId: hiringManager.id,
    },
  ];

  for (const opening of openingsData) {
    await prisma.opening.create({
      data: {
        ...opening,
        tenantId: tenant.tenantId,
      },
    });
  }

  const count = await prisma.opening.count({ where: { tenantId: tenant.tenantId } });
  console.log(`Successfully seeded ${count} openings for tenant "${tenant.name}"`);
  console.log('--- Seeding Completed Successfully ---');
}

if (require.main === module) {
  seed()
    .catch((e) => {
      console.error('Seeding failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

