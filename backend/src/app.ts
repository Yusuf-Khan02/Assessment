import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import authRoutes from './routes/auth.routes';
import vendorRoutes from './routes/vendor.routes';
import hiringManagerRoutes from './routes/hiring-manager.routes';
import testGuardRoutes from './routes/test-guard.routes';
import { S3Service } from './services/s3.service';

dotenv.config();

export const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(requestIdMiddleware);

// Local storage upload endpoint for dev/test environments
app.put('/api/storage/uploads/*', express.raw({ type: '*/*', limit: '25mb' }), async (req: Request, res: Response) => {
  try {
    const rawPath = req.params[0] || req.path.replace(/^\/api\/storage\/uploads\//, '');
    const s3Key = decodeURIComponent(rawPath);
    await S3Service.saveLocalObject(s3Key, req.body as Buffer);
    res.status(200).json({ message: 'File saved successfully', s3Key });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save file';
    res.status(500).json({ error: message });
  }
});

// Local storage download endpoint
app.get('/api/storage/downloads/*', async (req: Request, res: Response) => {
  try {
    const rawPath = req.params[0] || req.path.replace(/^\/api\/storage\/downloads\//, '');
    const s3Key = decodeURIComponent(rawPath);
    const buffer = await S3Service.getObjectBuffer(s3Key);
    const ext = s3Key.toLowerCase().slice(s3Key.lastIndexOf('.'));
    const contentType =
      ext === '.pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${s3Key.slice(s3Key.lastIndexOf('/') + 1)}"`);
    res.send(buffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'File not found';
    res.status(404).json({ error: message });
  }
});

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/hiring-manager', hiringManagerRoutes);
app.use('/api/test', testGuardRoutes);
