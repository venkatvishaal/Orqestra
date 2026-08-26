import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { WorkerAppModule } from './worker-app.module';
import * as os from 'os';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerAppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const logger = app.get(Logger);
  logger.log(`Orqestra Worker started on ${os.hostname()} (PID: ${process.pid})`);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal} — initiating graceful shutdown...`);
    // The PollerService handles draining in-flight jobs
    await app.close();
    logger.log('Worker shut down cleanly');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
