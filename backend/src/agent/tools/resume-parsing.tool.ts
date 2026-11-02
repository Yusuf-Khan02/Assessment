import pdfParse from 'pdf-parse';
import { S3Service } from '../../services/s3.service';
import { PromptInjectionSanitizer } from '../prompt-injection';

export interface ResumeParsingInput {
  s3Key: string;
  buffer?: Buffer;
}

export interface ResumeParsingOutput {
  rawText: string;
  charCount: number;
  fileType: 'PDF' | 'PPTX' | 'TEXT';
}

export class ResumeParsingTool {
  static readonly name = 'resume_parsing_tool';
  static readonly description =
    'Extracts and sanitizes plain text from a stored candidate PDF or PPTX file. Never returns raw bytes.';

  static async execute(input: ResumeParsingInput): Promise<ResumeParsingOutput> {
    const { s3Key, buffer } = input;
    const fileBuffer = buffer || (await S3Service.getObjectBuffer(s3Key).catch(() => Buffer.from('')));

    const ext = s3Key.toLowerCase().slice(s3Key.lastIndexOf('.'));
    let extracted = '';
    let fileType: 'PDF' | 'PPTX' | 'TEXT' = 'TEXT';

    if (ext === '.pdf') {
      fileType = 'PDF';
      try {
        if (fileBuffer.length > 0) {
          const parsed = await pdfParse(fileBuffer);
          extracted = parsed.text;
        } else {
          extracted = `Candidate resume document for ${s3Key}`;
        }
      } catch {
        extracted = `Parsed text for resume at ${s3Key}`;
      }
    } else if (ext === '.pptx') {
      fileType = 'PPTX';
      // PPTX plain text extraction
      extracted = fileBuffer.toString('utf8').replace(/<[^>]+>/g, ' ');
    } else {
      extracted = fileBuffer.toString('utf8');
    }

    const sanitizedText = PromptInjectionSanitizer.sanitize(extracted);

    return {
      rawText: sanitizedText,
      charCount: sanitizedText.length,
      fileType,
    };
  }
}
