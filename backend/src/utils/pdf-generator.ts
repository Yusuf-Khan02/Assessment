import PDFDocument from 'pdfkit';
import pdfParse from 'pdf-parse';

export interface ResumeData {
  candidateName: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  location?: string;
  experienceYears?: number;
  skills?: string[];
  summary?: string;
}

export function generateResumePdfBuffer(data: ResumeData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      // Header: Candidate Name
      doc.fontSize(22).font('Helvetica-Bold').fillColor('#1E293B').text(data.candidateName, { align: 'left' });
      doc.moveDown(0.25);

      // Job Title
      const title = data.jobTitle || 'Software Engineer';
      doc.fontSize(14).font('Helvetica').fillColor('#2563EB').text(title);
      doc.moveDown(0.5);

      // Contact details row
      const contactParts = [
        data.email || `${data.candidateName.toLowerCase().replace(/[^a-z0-9]/g, '.')}@example.com`,
        data.phone || '+1 (555) 234-5678',
        data.location || 'Remote',
      ];
      doc.fontSize(10).font('Helvetica').fillColor('#64748B').text(contactParts.join('  •  '));
      doc.moveDown(0.75);

      // Divider line
      doc.strokeColor('#E2E8F0').lineWidth(1).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(0.75);

      // Professional Summary Section
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#0F172A').text('PROFESSIONAL SUMMARY');
      doc.moveDown(0.3);
      const summaryText =
        data.summary ||
        `Experienced ${title} with ${data.experienceYears || 5}+ years of hands-on expertise building scalable systems, cloud native microservices, and high-performance applications. Proven track record of architecting reliable solutions and driving engineering excellence.`;
      doc.fontSize(10).font('Helvetica').fillColor('#334155').text(summaryText, { lineGap: 3 });
      doc.moveDown(1);

      // Skills Section
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#0F172A').text('CORE SKILLS & TECHNOLOGIES');
      doc.moveDown(0.3);
      const skills = data.skills && data.skills.length > 0
        ? data.skills
        : ['TypeScript', 'Node.js', 'React', 'PostgreSQL', 'Docker', 'AWS', 'RESTful APIs', 'Git'];
      doc.fontSize(10).font('Helvetica').fillColor('#334155').text(skills.join('  |  '), { lineGap: 3 });
      doc.moveDown(1);

      // Professional Experience Section
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#0F172A').text('WORK EXPERIENCE');
      doc.moveDown(0.4);

      // Role 1
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1E293B').text(`Senior ${title}`, { continued: true });
      doc.font('Helvetica').fillColor('#64748B').text(' — Wayne Enterprises (2022 – Present)');
      doc.moveDown(0.2);
      doc.fontSize(9.5).font('Helvetica').fillColor('#475569').text('• Designed and deployed scalable distributed microservices handling 5M+ daily requests.');
      doc.text('• Implemented CI/CD pipelines and automated integration test suites reducing release cycle times by 40%.');
      doc.text('• Mentored team members on architecture best practices and automated observability.');
      doc.moveDown(0.75);

      // Role 2
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1E293B').text(`${title}`, { continued: true });
      doc.font('Helvetica').fillColor('#64748B').text(' — Apex Cloud Systems (2019 – 2022)');
      doc.moveDown(0.2);
      doc.fontSize(9.5).font('Helvetica').fillColor('#475569').text('• Developed REST and event-driven API backends using Node.js and PostgreSQL.');
      doc.text('• Enhanced query efficiency and database indexing, achieving sub-100ms response latencies.');
      doc.moveDown(1);

      // Education Section
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#0F172A').text('EDUCATION');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1E293B').text('Bachelor of Science in Computer Science');
      doc.fontSize(9.5).font('Helvetica').fillColor('#64748B').text('State University of Technology — Magna Cum Laude');

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Quick validation
if (process.argv[1]?.includes('pdf-generator')) {
  generateResumePdfBuffer({
    candidateName: 'Bruce Wayne',
    jobTitle: 'Senior Systems Architect',
    skills: ['Node.js', 'PostgreSQL', 'Kubernetes'],
    experienceYears: 7,
  })
    .then((buf) => pdfParse(buf))
    .then((parsed) => {
      console.log('PDF Generated Successfully!');
      console.log('Text preview:\n' + parsed.text.slice(0, 300));
    })
    .catch(console.error);
}
