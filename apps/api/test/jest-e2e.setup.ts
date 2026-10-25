import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';

process.env.NODE_ENV = 'test';

/**
 * PIT-16 · aislamiento de las pruebas E2E.
 *
 * `apps/api/.env` apunta a la base de PRODUCCIÓN (`automatizeit`). Si las E2E
 * arrancaran con ella, los `deleteMany` sin filtro de tenant de los propios specs
 * borrarían datos reales: `auth.e2e-spec.ts` ejecuta `audit.deleteMany({})` y
 * `invitations.e2e-spec.ts` ejecuta `invitation.deleteMany({})` sin `where`, y
 * varios specs borran `audit` solo por `module`, que es transversal a tenants.
 *
 * Por eso las E2E toman `DATABASE_URL` de `.env.e2e` (ignorado por git vía
 * `.env.*`), que apunta a `automatizeit_e2e` con un rol que no tiene privilegios
 * algunos sobre producción. Esa separación se demuestra con
 * `scripts/check-e2e-isolation.sh`.
 *
 * Este fichero es `setupFiles`, así que corre ANTES de que Nest arranque
 * ConfigModule. @nestjs/config solo asigna las claves que aún no existen en
 * `process.env` (`filter((key) => !(key in process.env))` en config.module.js),
 * de modo que el valor fijado aquí prevalece sobre el de `.env`.
 *
 * Si falta la configuración o no apunta a la base aislada, se falla en seco.
 * Jamás se continúa contra producción.
 */

const ENV_E2E = join(__dirname, '..', '.env.e2e');
const ALLOWED_DATABASE = 'automatizeit_e2e';
const FORBIDDEN_DATABASE = 'automatizeit';

function abort(message: string): never {
  throw new Error(
    `[e2e-isolation] ${message}\n` +
      `Las pruebas E2E escriben con DELETE sobre la base que indique ` +
      `DATABASE_URL, así que no se continúa sin un destino aislado.\n` +
      `Esperado: DATABASE_URL apuntando a '${ALLOWED_DATABASE}' en ${ENV_E2E}.\n` +
      `Comprueba el aislamiento con: scripts/check-e2e-isolation.sh`,
  );
}

if (!existsSync(ENV_E2E)) {
  abort(
    `no existe ${ENV_E2E}. Sin él, las E2E caerían en '.env' (producción).`,
  );
}

const raw = readFileSync(ENV_E2E, 'utf8');
const line = raw
  .split('\n')
  .filter((l) => l.trim().startsWith('DATABASE_URL='))
  .pop();

if (!line) {
  abort(`${ENV_E2E} no define DATABASE_URL.`);
}

const url = line.slice(line.indexOf('=') + 1).trim();
const database = url
  .replace(/[?#].*$/, '')
  .replace(/\/$/, '')
  .split('/')
  .pop();

if (!database) {
  abort('DATABASE_URL no contiene nombre de base.');
}
if (database === FORBIDDEN_DATABASE) {
  abort(
    `DATABASE_URL apunta a la base de producción ('${FORBIDDEN_DATABASE}').`,
  );
}
if (database !== ALLOWED_DATABASE) {
  abort(
    `DATABASE_URL apunta a '${database}', que no es la base de test aislada.`,
  );
}
const user =
  url
    .replace(/^postgres(ql)?:\/\//, '')
    .split('@')[0]
    ?.split(':')[0] ?? '';
if (user !== ALLOWED_DATABASE) {
  abort(
    `DATABASE_URL usa el rol '${user}'; se esperaba '${ALLOWED_DATABASE}'. ` +
      `El rol es lo que impide el acceso a producción.`,
  );
}

process.env.DATABASE_URL = url;

/**
 * Bloque C · SALIDA DE RED BLOQUEADA.
 *
 * `OUTBOUND_SEND_ENABLED` sigue `DENIED` en producción y no se toca aquí. Para
 * poder evaluar el camino permitido en E2E hace falta demostrar dos garantías:
 * que el proceso de test **no puede invocar a Pancake ni a Meta** y que **no
 * puede conectarse con producción**. La segunda ya la aporta el guard de
 * `DATABASE_URL` + los privilegios del rol (scripts/check-e2e-isolation.sh);
 * esta es la primera.
 *
 * `PancakeClient` y `MetaWhatsAppProvider` hablan por `fetch`, así que cortar
 * aquí toda destino que no sea loopback deja el proceso sin salida HTTP(S)
 * hacia el exterior. No se toca `net`: Prisma necesita su TCP hacia el
 * contenedor de Postgres de test.
 *
 * Los intentos quedan registrados en `globalThis.__E2E_BLOCKED_EGRESS__` para
 * que `egress-guard.e2e-spec.ts` los pueda comprobar.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const nativeFetch: typeof fetch | undefined =
  typeof globalThis.fetch === 'function'
    ? globalThis.fetch.bind(globalThis)
    : undefined;

const blockedEgress: Array<{ url: string; at: string }> = [];
(
  globalThis as typeof globalThis & {
    __E2E_BLOCKED_EGRESS__?: Array<{ url: string; at: string }>;
  }
).__E2E_BLOCKED_EGRESS__ = blockedEgress;

if (nativeFetch) {
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    let host: string | undefined;
    try {
      // Una URL relativa no sale del proceso: se deja a `fetch` nativo.
      host = new URL(raw).hostname;
    } catch {
      host = undefined;
    }

    if (host === undefined || LOOPBACK_HOSTS.has(host)) {
      return nativeFetch(input, init);
    }

    blockedEgress.push({ url: raw, at: new Date().toISOString() });
    throw new Error(
      `[e2e-egress] salida de red bloqueada hacia '${host}': ${raw}\n` +
        `Las pruebas E2E no pueden invocar a proveedores reales (Pancake/Meta) ` +
        `ni conectarse con producción. Comprueba el aislamiento con ` +
        `scripts/check-e2e-isolation.sh`,
    );
  };
}

/**
 * Bloque C · refuerzo a NIVEL DE SOCKET.
 *
 * Cortar `fetch` no basta: cualquier dependencia puede abrir un socket
 * directamente (`net.connect`, `tls.connect`, un cliente HTTP propio, un
 * SDK con transporte propio) e invocar a Pancake o a Meta sin pasar por
 * `globalThis.fetch`. Para que el aislamiento sea una garantía y no una
 * suposición, el corte se hace en la capa de transporte.
 *
 * Se parchean `net.Socket.prototype.connect`, `net.connect`,
 * `net.createConnection` y `tls.connect`. Todo destino que no sea loopback
 * se rechaza en seco y queda registrado en `__E2E_BLOCKED_EGRESS__` junto a
 * los bloqueos de `fetch`, para que `egress-guard.e2e-spec.ts` compruebe
 * ambas capas con el mismo inventario.
 *
 * Lo que se conserva:
 *  - loopback (`localhost`, `127.0.0.1`, `::1`): es el único destino
 *    legítimo de las E2E, porque la BD de test vive en el contenedor de
 *    Postgres publicado en `localhost:5433`. Sin ello Prisma no podría
 *    conectar.
 *  - los sockets ya conectados antes de que corra este `setupFiles`.
 *
 * Salvedad honesta: el motor nativo de Prisma abre sus sockets con código
 * nativo y no pasa por el módulo `net` de Node, así que este guard no lo
 * intercepta. Ese tráfico está cubierto por el otro lado del aislamiento —
 * `DATABASE_URL` apuntando a `automatizeit_e2e` con un rol sin privilegios
 * sobre producción, verificable con `scripts/check-e2e-isolation.sh` — y no
 * es el vector que aquí se cierra: el objetivo es que el proceso de test no
 * pueda *invocar* a un proveedor.
 */

type SocketConnectArgs = unknown[];

/**
 * No se usa `import * as net`: TypeScript lo transforma con `__importStar` en
 * un objeto COPIA cuyas propiedades tienen solo-getter (de ahí el error
 * "Cannot set property connect ... which has only a getter"). `createRequire`
 * devuelve el `module.exports` real y compartido, que sí admite escribir y es
 * el que verán el resto de dependencias del proceso.
 */
const nodeRequire = createRequire(__filename);
const netModule = nodeRequire('net') as typeof import('net');
const tlsModule = nodeRequire('tls') as typeof import('tls');

/** Extrae el host de las formas de invocación que admite `net.connect`. */
function hostFromConnectArgs(args: SocketConnectArgs): string | undefined {
  const [first] = args;

  if (typeof first === 'object' && first !== null) {
    const options = first as { host?: unknown; path?: unknown };
    // Un socket Unix (`path`) no sale de la máquina: se permite.
    if (typeof options.path === 'string') {
      return undefined;
    }
    return typeof options.host === 'string' ? options.host : 'localhost';
  }

  if (typeof first === 'number') {
    const host = args[1];
    return typeof host === 'string' ? host : 'localhost';
  }

  // `connect(path)` con un string: socket Unix, no sale de la máquina.
  return undefined;
}

function rejectNonLoopback(kind: string, host: string): never {
  blockedEgress.push({
    url: `${kind}://${host}`,
    at: new Date().toISOString(),
  });
  throw new Error(
    `[e2e-egress] salida de red bloqueada hacia '${host}' vía ${kind}.\n` +
      `Las pruebas E2E no abren sockets a destinos externos: ni Pancake ni Meta ` +
      `ni producción. Comprueba el aislamiento con scripts/check-e2e-isolation.sh`,
  );
}

function guardConnect(kind: string, args: SocketConnectArgs): void {
  const host = hostFromConnectArgs(args);
  if (host !== undefined && !LOOPBACK_HOSTS.has(host)) {
    rejectNonLoopback(kind, host);
  }
}

const originalSocketConnect = Reflect.get(
  netModule.Socket.prototype,
  'connect',
) as (
  this: import('net').Socket,
  ...args: SocketConnectArgs
) => import('net').Socket;
function patchedConnect(
  this: import('net').Socket,
  ...args: SocketConnectArgs
): import('net').Socket {
  guardConnect('tcp', args);
  return Reflect.apply(originalSocketConnect, this, args);
}
netModule.Socket.prototype.connect = patchedConnect;

/**
 * Además del prototipo se parchean las fachadas de módulo, por si alguna
 * implementación construyera el socket sin pasar por `Socket#connect`.
 * Los originales se capturan antes de tocar nada para no autoparchearse.
 */
const originalNetConnect = netModule.connect;
const originalNetCreateConnection = netModule.createConnection;
netModule.connect = function patchedNetConnect(
  ...args: SocketConnectArgs
): unknown {
  guardConnect('tcp', args);
  return Reflect.apply(originalNetConnect, netModule, args);
} as typeof netModule.connect;
netModule.createConnection = function patchedCreateConnection(
  ...args: SocketConnectArgs
): unknown {
  guardConnect('tcp', args);
  return Reflect.apply(originalNetCreateConnection, netModule, args);
} as typeof netModule.createConnection;

const originalTlsConnect = tlsModule.connect;
function patchedTlsConnect(...args: SocketConnectArgs): unknown {
  guardConnect('tls', args);
  return Reflect.apply(originalTlsConnect, tlsModule, args);
}
tlsModule.connect = patchedTlsConnect as typeof tlsModule.connect;
