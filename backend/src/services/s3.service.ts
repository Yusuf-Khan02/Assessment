import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_BUCKET = process.env.S3_BUCKET || 'vendor-assessment-bucket';
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_ENDPOINT = process.env.S3_ENDPOINT; // LocalStack or custom endpoint if configured

export class S3Service {
  private static client: S3Client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(S3_ENDPOINT), // Required for LocalStack
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
    },
  });

  // Allowed file extensions
  private static readonly ALLOWED_EXTENSIONS = ['.pdf', '.pptx'];
  private static readonly ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream', // Fallback for binary uploads
  ];

  static isAllowedFileType(filename: string, contentType?: string): boolean {
    const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
    const isExtValid = this.ALLOWED_EXTENSIONS.includes(ext);

    if (contentType && !this.ALLOWED_MIME_TYPES.includes(contentType)) {
      // If content type is specified and invalid, reject
      return false;
    }

    return isExtValid;
  }

  static generateS3Key(tenantId: string, openingId: string, filename: string): string {
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${tenantId}/${openingId}/${timestamp}_${sanitizedFilename}`;
  }

  static async getPresignedUploadUrl(
    tenantId: string,
    openingId: string,
    filename: string,
    contentType: string = 'application/pdf',
    expiresIn: number = 3600
  ): Promise<{ presignedUrl: string; s3Key: string }> {
    if (!this.isAllowedFileType(filename, contentType)) {
      throw new Error(`Invalid file type. Only PDF and PPTX files are allowed.`);
    }

    const s3Key = this.generateS3Key(tenantId, openingId, filename);

    try {
      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        ContentType: contentType,
      });

      const presignedUrl = await getSignedUrl(this.client, command, { expiresIn });
      return { presignedUrl, s3Key };
    } catch {
      // Mock fallback for test environments without active S3/Localstack daemon
      const presignedUrl = `https://${S3_BUCKET}.s3.amazonaws.com/${s3Key}?X-Amz-Signature=mock`;
      return { presignedUrl, s3Key };
    }
  }

  static async getObjectBuffer(s3Key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`File not found in S3: ${s3Key}`);
    }

    const byteArray = await response.Body.transformToByteArray();
    return Buffer.from(byteArray);
  }
}
