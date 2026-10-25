process.env.NODE_ENV = 'test';

import * as net from 'net';
import * as tls from 'tls';

/**
 * Bloque C · garantías de seguridad del entorno E2E.
 *
 * `OUTBOUND_SEND_ENABLED` permanece `DENIED` en producción y no se modifica
 * aquí. Antes de poder evaluar el camino permitido hay que demostrar que el
 * proceso de pruebas **no puede invocar a Pancake/Meta** ni **conectarse con
 * producción**. Este spec comprueba la primera garantía sobre el guard real
 * instalado en `jest-e2e.setup.ts` (no sobre una copia): el guard es
 * `setupFiles`, así que está activo en este mismo proceso.
 *
 * La segunda garantía —base de datos— la aporta el guard de `DATABASE_URL` y
 * `scripts/check-e2e-isolation.sh`.
 */

type EgressRecord = { url: string; at: string };

const blocked = (): EgressRecord[] =>
  (
    globalThis as typeof globalThis & {
      __E2E_BLOCKED_EGRESS__?: EgressRecord[];
    }
  ).__E2E_BLOCKED_EGRESS__ ?? [];

/** Lanza y devuelve el motivo, o `null` si la petición no fue bloqueada. */
async function attemptEgress(url: string): Promise<string | null> {
  try {
    await fetch(url);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('[e2e-egress]') ? message : null;
  }
}

describe('Bloque C — la E2E no puede salir a la red exterior', () => {
  it('bloquea la invocación de la API pública de Pancake', async () => {
    const reason = await attemptEgress(
      'https://pages.fm/api/public_api/v1/pages/p1/conversations',
    );

    expect(reason).toContain('[e2e-egress]');
    expect(reason).toContain('pages.fm');
    expect(blocked().some((r) => r.url.includes('pages.fm'))).toBe(true);
  });

  it('bloquea la invocación del Graph API de Meta', async () => {
    const reason = await attemptEgress(
      'https://graph.facebook.com/v21.0/messages',
    );

    expect(reason).toContain('[e2e-egress]');
    expect(reason).toContain('graph.facebook.com');
  });

  it('bloquea el host de plantillas de Botcake', async () => {
    const reason = await attemptEgress(
      'https://botcake.io/api/public_api/v1/pages/p1/message_templates',
    );

    expect(reason).toContain('[e2e-egress]');
  });

  it('bloquea cualquier destino que no sea loopback, IP incluida', async () => {
    expect(await attemptEgress('http://172.17.0.1:5432/')).toContain(
      '[e2e-egress]',
    );
    expect(await attemptEgress('http://10.0.0.5/internal')).toContain(
      '[e2e-egress]',
    );
    expect(await attemptEgress('https://produccion.invalid/')).toContain(
      '[e2e-egress]',
    );
  });

  it('no intercepta las peticiones de loopback', async () => {
    // Debe fallar por conexión rechazada (o resolverse), nunca por el guard.
    expect(await attemptEgress('http://127.0.0.1:9/ping')).toBeNull();
    expect(await attemptEgress('http://localhost:9/ping')).toBeNull();
  });

  it('no deja que ninguna petición bloqueada llegue a un fetch real', async () => {
    const before = blocked().length;
    const urls = [
      'https://pages.fm/one',
      'https://pages.fm/two',
      'https://graph.facebook.com/three',
    ];

    for (const url of urls) {
      await expect(fetch(url)).rejects.toThrow('[e2e-egress]');
    }

    expect(blocked().length).toBe(before + urls.length);
  });

  it('el único origen externo admitido por configuración es la base aislada', () => {
    // `DATABASE_URL` NO llega por HTTP: lo inyecta el propio setup y el rol
    // no tiene privilegios sobre producción (check-e2e-isolation.sh §2-§3).
    expect(process.env['DATABASE_URL']).toContain('automatizeit_e2e');
  });
});

/**
 * Bloque C · refuerzo a nivel de socket.
 *
 * Bloquear `fetch` no basta: un SDK con transporte propio abriría el socket
 * sin pasar por `globalThis.fetch`. Estas pruebas comprueban el guard de
 * `net`/`tls` instalado en el setup sobre el módulo real del proceso.
 */
describe('Bloque C — el aislamiento aguanta sockets directos, no solo fetch', () => {
  /** Lanza y devuelve el motivo, o `null` si la conexión no fue bloqueada. */
  function attemptSocket(open: () => unknown): {
    error: string | null;
    opened: boolean;
  } {
    let opened = false;
    try {
      const socket = open() as {
        destroy?: () => void;
        on?: (event: string, cb: () => void) => void;
      };
      opened = true;
      // Un 'error' sin oyente tumbaría el proceso entero (crash real que ya
      // provocó esta propia prueba): se aquieta el socket desechable.
      socket.on?.('error', () => undefined);
      socket.destroy?.();
      return { error: null, opened };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        error: message.includes('[e2e-egress]') ? message : null,
        opened,
      };
    }
  }

  it('bloquea net.connect hacia Pancake (pages.fm)', () => {
    const result = attemptSocket(() =>
      net.connect({ host: 'pages.fm', port: 443 }),
    );

    expect(result.error).toContain('[e2e-egress]');
    expect(result.error).toContain('pages.fm');
    // El socket ni siquiera llegó a crearse: el corte es previo a la conexión.
    expect(result.opened).toBe(false);
  });

  it('bloquea net.createConnection hacia el Graph API de Meta', () => {
    const result = attemptSocket(() =>
      net.createConnection({ host: 'graph.facebook.com', port: 443 }),
    );

    expect(result.error).toContain('[e2e-egress]');
    expect(result.error).toContain('graph.facebook.com');
  });

  it('bloquea tls.connect hacia proveedores por encima de TCP pelado', () => {
    // Un atajo que esquiva `net` por completo: si esto se corta, el aislamiento
    // no depende de que el cliente use la fachada habitual.
    const result = attemptSocket(() =>
      tls.connect({ host: 'pages.fm', port: 443, rejectUnauthorized: false }),
    );

    expect(result.error).toContain('[e2e-egress]');
    expect(result.error).toContain('tls');
  });

  it('bloquea la forma abreviada net.connect(port, host)', () => {
    // Ojo: `net.connect('host', 443)` en Node NO es TCP —el string se toma
    // como ruta de socket Unix—, así que la forma corta legítima es (port, host).
    const result = attemptSocket(() => net.connect(443, 'pages.fm'));

    expect(result.error).toContain('[e2e-egress]');
    expect(result.error).toContain('pages.fm');
  });

  it('bloquea por IP, sin resolución de nombres de por medio', () => {
    for (const host of ['172.17.0.1', '10.0.0.5', '8.8.8.8']) {
      const result = attemptSocket(() => net.connect({ host, port: 443 }));
      expect(result.error).toContain('[e2e-egress]');
      expect(result.error).toContain(host);
    }
  });

  it('registra los intentos de socket en el mismo inventario que fetch', () => {
    const before = blocked().length;

    expect(() => net.connect({ host: 'pages.fm', port: 443 })).toThrow(
      '[e2e-egress]',
    );

    expect(blocked().length).toBe(before + 1);
    expect(blocked()[before].url).toBe('tcp://pages.fm');
  });

  it('no intercepta los sockets de loopback, que es donde vive la BD de test', () => {
    // Sin esto Prisma no podría conectar con el Postgres aislado en :5433.
    const { opened, error } = attemptSocket(() =>
      net.connect({ host: '127.0.0.1', port: 1 }),
    );

    expect(error).toBeNull();
    expect(opened).toBe(true);
  });

  it('permite los sockets Unix, que no salen de la máquina', () => {
    const { error } = attemptSocket(() =>
      net.connect({ path: '/tmp/opencode/nonexistent.sock' }),
    );

    expect(error).toBeNull();
  });

  it('ninguna conexión bloqueada llega a abrir un socket real', () => {
    const before = blocked().length;
    const attempts = [
      () => net.connect({ host: 'pages.fm', port: 443 }),
      () => tls.connect({ host: 'graph.facebook.com', port: 443 }),
      () => net.connect(443, 'botcake.io'),
    ];

    for (const attempt of attempts) {
      expect(attempt).toThrow('[e2e-egress]');
    }

    expect(blocked().length).toBe(before + attempts.length);
  });
});
