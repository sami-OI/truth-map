import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── CORS ──────────────────────────────────────────────────────
  // Allows your Webflow site and local dev to call this API.
  // In production, replace '*' with your exact domain:
  //   origin: 'https://yoursite.webflow.io'
  app.enableCors({
  origin: true,   // allows ALL origins including file:// during development
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  credentials: false,
});

  // ── Global prefix ─────────────────────────────────────────────
  // Every route becomes /api/...
  // e.g. /api/truth-map/dashboard
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`\n✅  Truth Map API running on http://localhost:${port}/api`);
  console.log(`   Dashboard endpoint: http://localhost:${port}/api/truth-map/dashboard\n`);
}
bootstrap();
