import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { SendPermitGuard } from './core/safety/send-permit.guard';

async function bootstrap() {
  // rawBody: el webhook de WhatsApp verifica la firma HMAC sobre los bytes
  // originales. Sin esto, el controlador solo vería el JSON re-serializado y
  // ninguna firma real pasaría. No añade otro parser: es la opción nativa que
  // configura `verify` en los parsers por defecto de Nest/Express.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);

  // AUTO-SAFETY-002: fail loudly at boot on an incoherent outbound policy.
  // `ENABLED` with no allowlist, no channel or an expired window can never be
  // honoured, so starting anyway would advertise a permission that does not
  // exist. Anything else (including DENIED, the default) boots normally.
  const sendPermit = app.get(SendPermitGuard);
  const problems = sendPermit.validateStartup();
  const status = sendPermit.status();
  if (problems.length > 0) {
    throw new Error(
      `outbound send policy is inconsistent:\n${problems.join('\n')}`,
    );
  }
  // Single operator-visible line. No allowlist, no tokens, no customer data.
  console.log(
    `[safety] outbound send policy=${status.allowed ? 'ALLOW' : 'DENY'}` +
      (status.allowed
        ? ` orgs=${status.allowedOrganizationCount} channels=${status.allowedChannels.join('|')} until=${status.expiresAt}`
        : ` reason=${status.reason ?? 'UNKNOWN'}`),
  );

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
