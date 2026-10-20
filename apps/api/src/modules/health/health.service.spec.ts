import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';
import { SendPermitGuard } from '../../core/safety/send-permit.guard';

/**
 * AUTO-SAFETY-004 — el healthcheck debe seguir respondiendo y debe informar de
 * que la salida está bloqueada. Es la vía por la que un operador comprueba la
 * contención sin leer el entorno.
 */
describe('HealthService', () => {
  let service: HealthService;
  let permit: { status: jest.Mock; evaluate: jest.Mock; assert: jest.Mock };

  async function build(status: Record<string, unknown>): Promise<void> {
    permit = {
      status: jest.fn(() => status),
      evaluate: jest.fn(),
      assert: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: SendPermitGuard, useValue: permit },
      ],
    }).compile();
    service = module.get(HealthService);
  }

  it('responde 200 con la salida bloqueada', async () => {
    await build({
      policyVersion: 'v1',
      allowed: false,
      reason: 'SWITCH_DENIED',
      allowedOrganizationCount: 0,
      allowedChannels: [],
      expiresAt: '',
    });

    const health = service.getHealth();

    expect(health.status).toBe('ok');
    expect(health.outboundSend.allowed).toBe(false);
    expect(health.outboundSend.reason).toBe('SWITCH_DENIED');
  });

  it('expone la política sin allowlist ni credenciales', async () => {
    await build({
      policyVersion: 'v1',
      allowed: false,
      reason: 'SWITCH_DENIED',
      allowedOrganizationCount: 0,
      allowedChannels: [],
      expiresAt: '',
    });

    const health = service.getHealth() as unknown as Record<string, unknown>;
    const serialized = JSON.stringify(health);

    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toMatch(/\+?\d{10,}/); // ningún teléfono
    // Solo agregados: nunca la lista concreta de organizaciones.
    expect(serialized).toContain('allowedOrganizationCount');
  });

  it('mantiene el resto del contrato de health intacto', async () => {
    await build({
      policyVersion: 'v1',
      allowed: false,
      reason: 'SWITCH_DENIED',
      allowedOrganizationCount: 0,
      allowedChannels: [],
      expiresAt: '',
    });

    const health = service.getHealth();

    expect(health.service).toBe('automatizeit-api');
    expect(typeof health.timestamp).toBe('string');
  });
});
