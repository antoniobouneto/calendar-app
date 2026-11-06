import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Security headers (item 4): helmet with explicit policy, no info leak.
  app.use(helmet({
    contentSecurityPolicy: false, // API JSON only; frontend sets its own CSP.
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cookieParser());

  // CORS restrito + credentials (cookies httpOnly exigem credentials:true, item 4).
  const origins = config.get<string>('CORS_ORIGINS', 'http://localhost:3000')
    .split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  logger.log(`CORS origins: ${origins.join(', ')}`);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  const port = process.env.PORT || 5000;
  await app.listen(port);
  console.log(`Server is running on port ${port}`);
}
bootstrap();
