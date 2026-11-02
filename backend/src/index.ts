import { app } from './app';
import { ensureDatabaseRunning } from './db-helper';

const PORT = process.env.PORT || 4000;

async function bootstrap() {
  await ensureDatabaseRunning();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

