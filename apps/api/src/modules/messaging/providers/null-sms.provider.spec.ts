import { NullSmsProvider } from './null-sms.provider';
import { SendBlockedError } from '../../../core/safety/send-permit';

/**
 * AUTO-SAFETY-004 — el proveedor SMS simulado también está detrás de la
 * política. No hace red, pero ninguna ruta de salida puede quedar sin control:
 * si mañana se sustituye por un transporte real, la dependencia ya es
 * obligatoria.
 */
describe('NullSmsProvider · política de salida', () => {
  const INPUT = {
    to: '573001234567',
    from: 'Demo',
    content: 'mensaje de prueba',
    organizationId: 'org-1',
  };

  function build(allowed: boolean) {
    const permit = {
      assert: jest.fn(() => {
        if (!allowed) {
          throw new SendBlockedError('SWITCH_DENIED', 'SMS');
        }
      }),
      evaluate: jest.fn(() =>
        allowed
          ? { allowed: true }
          : { allowed: false, reason: 'SWITCH_DENIED' as const },
      ),
    };
    const provider = new NullSmsProvider(permit as never);
    return { provider, permit };
  }

  it('con política DENIED rechaza el envío', async () => {
    const { provider, permit } = build(false);

    await expect(provider.send(INPUT)).rejects.toBeInstanceOf(SendBlockedError);
    expect(permit.assert).toHaveBeenCalledWith('org-1', 'SMS');
  });

  it('con política DENIED no devuelve identificador simulado', async () => {
    const { provider } = build(false);

    // Si el bloqueo fallara, el proveedor devolvería `sms-sim-<uuid>`. Este
    // test falla si ese camino llegara a ejecutarse.
    await expect(provider.send(INPUT)).rejects.toBeInstanceOf(SendBlockedError);
  });

  it('con política ENABLED devuelve el identificador simulado', async () => {
    const { provider } = build(true);

    const result = await provider.send(INPUT);

    expect(result.providerMessageId).toMatch(/^sms-sim-/);
  });
});
