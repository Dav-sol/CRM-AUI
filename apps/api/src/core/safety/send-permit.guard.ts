import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  SEND_PERMIT_POLICY_VERSION,
  SendBlockedError,
  evaluateSendPermit,
  parseCsvList,
  type OutboundChannel,
  type SendPermitDecision,
  type SendPermitPolicy,
} from './send-permit';

/**
 * Única puerta de autorización de efectos externos (AUTO-SAFETY-002).
 *
 * Se invoca en el punto de salida (providers) y, antes de crear registros, en
 * la capa de aplicación. El control del provider es la última barrera: sigue
 * aplicándose aunque la comprobación previa se omita o la política cambie entre
 * la comprobación y la llamada de red.
 *
 * Todo error al leer la configuración se traduce en denegación. Este servicio
 * nunca lanza por una configuración ilegible: `evaluate` siempre devuelve una
 * decisión.
 */
@Injectable()
export class SendPermitGuard {
  private readonly logger = new Logger(SendPermitGuard.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Política cruda. Si la lectura falla, se devuelve una política vacía: eso
   * produce `SWITCH_MISSING` y, por tanto, denegación.
   */
  private readPolicy(): SendPermitPolicy {
    try {
      const get = <T>(key: string): T | undefined =>
        this.configService.get<T>(key);
      return {
        enabled: get<string>('safety.sendEnabled'),
        allowedOrganizations: parseCsvList(
          get<string>('safety.allowedOrganizationsCsv'),
        ),
        allowedChannels: parseCsvList(get<string>('safety.allowedChannelsCsv')),
        until: get<string>('safety.sendUntil'),
      };
    } catch (error) {
      this.logger.error(
        'send permit policy could not be read; denying by default',
        error instanceof Error ? error.stack : String(error),
      );
      return {
        enabled: undefined,
        allowedOrganizations: [],
        allowedChannels: [],
        until: undefined,
      };
    }
  }

  /** Decide sin lanzar. Es la API que usan los llamadores HTTP. */
  evaluate(
    organizationId: string | null | undefined,
    channel: OutboundChannel,
    now: Date = new Date(),
  ): SendPermitDecision {
    let policy: SendPermitPolicy;
    try {
      policy = this.readPolicy();
    } catch {
      // Red de seguridad: readPolicy ya captura, pero si algo se escapara
      // aquí la decisión sigue siendo denegar.
      return { allowed: false, reason: 'CONFIG_ERROR' };
    }
    return evaluateSendPermit(policy, organizationId, channel, now);
  }

  /**
   * Última barrera. Se llama inmediatamente antes de la llamada de red.
   * Lanza `SendBlockedError` — nunca un error de proveedor.
   */
  assert(
    organizationId: string | null | undefined,
    channel: OutboundChannel,
    now: Date = new Date(),
  ): void {
    const decision = this.evaluate(organizationId, channel, now);
    if (!decision.allowed) {
      throw new SendBlockedError(decision.reason ?? 'CONFIG_ERROR', channel);
    }
  }

  /**
   * Estado efectivo para `/health`. No expone la allowlist completa, ni
   * credenciales, ni datos personales: solo agregados.
   */
  status(now: Date = new Date()): {
    policyVersion: string;
    allowed: boolean;
    reason?: string;
    allowedOrganizationCount: number;
    allowedChannels: string[];
    expiresAt: string | null;
  } {
    const decision = this.evaluate(null, 'WHATSAPP', now);
    const policy = this.readPolicy();
    return {
      policyVersion: SEND_PERMIT_POLICY_VERSION,
      // `allowed` refleja solo el interruptor global: es lo que un operador
      // necesita saber de un vistazo (DENIED / Switch missing / etc.).
      allowed: decision.allowed,
      reason: decision.reason,
      allowedOrganizationCount: policy.allowedOrganizations.length,
      allowedChannels: [...policy.allowedChannels],
      expiresAt: policy.until ?? null,
    };
  }

  /**
   * Guardarraíl de arranque. Se invoca desde `main.ts` antes de `listen()`.
   *
   * Devuelve un problema si la política dice `ENABLED` pero no puede ser
   * realmente aplicable (sin allowlist, sin canal o ventana ya vencida). Es un
   * error de configuración, no de negocio: la contención exige que una
   * habilitación incompleta falle de forma ruidosa y no se despliegue a medias.
   */
  validateStartup(): string[] {
    const problems: string[] = [];
    const policy = this.readPolicy();

    if (policy.enabled !== 'ENABLED') {
      // Denegado explícitamente: no hay nada que validar.
      return problems;
    }
    if (policy.allowedOrganizations.length === 0) {
      problems.push(
        'OUTBOUND_SEND_ENABLED=ENABLED but OUTBOUND_SEND_ALLOWED_ORGANIZATION_IDS is empty',
      );
    }
    if (policy.allowedChannels.length === 0) {
      problems.push(
        'OUTBOUND_SEND_ENABLED=ENABLED but OUTBOUND_SEND_ALLOWED_CHANNELS is empty',
      );
    }
    if (!policy.until) {
      problems.push(
        'OUTBOUND_SEND_ENABLED=ENABLED but OUTBOUND_SEND_UNTIL is missing',
      );
    } else {
      const expiry = new Date(policy.until);
      if (Number.isNaN(expiry.getTime())) {
        problems.push('OUTBOUND_SEND_UNTIL is not a valid ISO-8601 instant');
      } else if (expiry.getTime() <= Date.now()) {
        problems.push('OUTBOUND_SEND_UNTIL has already expired');
      }
    }
    return problems;
  }
}
