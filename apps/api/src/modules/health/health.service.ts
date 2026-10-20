import { Injectable } from '@nestjs/common';
import { SendPermitGuard } from '../../core/safety/send-permit.guard';

@Injectable()
export class HealthService {
  constructor(private readonly sendPermit: SendPermitGuard) {}

  getHealth() {
    return {
      status: 'ok',
      service: 'automatizeit-api',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      // AUTO-SAFETY-002: effective outbound-send policy. Aggregates only — no
      // allowlist contents, no credentials, no customer data.
      outboundSend: this.sendPermit.status(),
    };
  }
}
