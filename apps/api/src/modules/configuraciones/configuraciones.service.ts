import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';

import type { AuthUser } from '../../core/decorators/current-user.decorator';
import { PrismaService } from '../../core/database/prisma.service';
import { AuditIdentityService } from '../auth/audit.identity.service';
import {
  buildConfigUpdatedEvent,
  type ConfigEventPayload,
} from './configuraciones.events';
import {
  BUSINESS_DAYS,
  DEFAULT_BUSINESS_DAYS,
  DEFAULT_TIMEZONE,
  PARAMETRO_COLUMN,
  PARAMETRO_DEFAULT,
  PARAMETRO_ENV,
  PARAMETROS,
  type BusinessDay,
  type EffectiveValue,
  type ParametroKey,
} from './configuraciones.defaults';
import {
  UpdateHorariosDto,
  UpdateParametrosDto,
} from './dto/update-configuraciones.dto';

const MODULE = 'configuraciones';

type ConfigRow = Prisma.OrganizationConfigGetPayload<object> | null;

export type HorariosView = {
  businessHoursEnabled: boolean;
  timezone: string;
  businessDays: string[];
  businessHoursStart: number | null;
  businessHoursEnd: number | null;
};

/**
 * Configuración efectiva de la organización (specs/024-configuraciones-v1).
 *
 * Resolution order per value: `OrganizationConfig` row > environment variable >
 * code default. The row is created lazily on the first write, so an
 * organization that never configured anything reads exactly the values the
 * platform used before this module existed.
 *
 * No cache in v1: one read per operation. The volume does not justify it and it
 * removes a whole class of stale-configuration bugs (spec §6).
 */
@Injectable()
export class ConfiguracionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditIdentityService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** organizationId comes from the JWT only (NR-001). */
  requireOrganizationId(user: AuthUser): string {
    if (user.accountType === 'PLATFORM' || !user.organizationId) {
      throw new ForbiddenException({
        error: {
          code: 'FORBIDDEN',
          message: 'Configuración requiere una organización',
        },
      });
    }
    return user.organizationId;
  }

  private requireOrg(user: AuthUser): string {
    return this.requireOrganizationId(user);
  }

  private async readRow(organizationId: string): Promise<ConfigRow> {
    return this.prisma.organizationConfig.findUnique({
      where: { organizationId },
    });
  }

  /** Effective value of one parameter plus where it comes from. */
  async effectiveParametro<T extends number | string>(
    organizationId: string,
    key: ParametroKey,
  ): Promise<EffectiveValue<T>> {
    const row = await this.readRow(organizationId);
    const column = PARAMETRO_COLUMN[key] as keyof NonNullable<ConfigRow>;
    const stored = row ? (row[column] as T | null) : null;
    if (stored !== null && stored !== undefined) {
      return { valor: stored, source: 'db' };
    }
    const fromEnv = this.configService.get<T | undefined>(PARAMETRO_ENV[key]);
    if (fromEnv !== undefined && fromEnv !== null) {
      return { valor: fromEnv, source: 'env' };
    }
    return { valor: PARAMETRO_DEFAULT[key] as T, source: 'default' };
  }

  /**
   * Plain effective value, for the modules that only need the number and not
   * where it comes from (campaign costs, anti-spam, quote expiry).
   */
  async valueOf(
    organizationId: string,
    key: ParametroKey,
  ): Promise<number | string> {
    return (await this.effectiveParametro(organizationId, key)).valor;
  }

  /** All parameters with their origin, for GET /configuraciones/parametros. */
  async parametros(organizationId: string) {
    const entries = await Promise.all(
      PARAMETROS.map(
        async (key) =>
          [key, await this.effectiveParametro(organizationId, key)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }

  async horarios(organizationId: string): Promise<HorariosView> {
    const row = await this.readRow(organizationId);
    return {
      businessHoursEnabled: row?.businessHoursEnabled ?? false,
      timezone: row?.timezone ?? DEFAULT_TIMEZONE,
      businessDays: row?.businessDays ?? DEFAULT_BUSINESS_DAYS,
      businessHoursStart: row?.businessHoursStart ?? null,
      businessHoursEnd: row?.businessHoursEnd ?? null,
    };
  }

  /**
   * Zona horaria de la organización. La usa el gate de ventanas de envío
   * (spec 025 §4.4) para resolver el día y la hora locales.
   */
  async timeZoneOrganizacion(organizationId: string): Promise<string> {
    const row = await this.readRow(organizationId);
    return row?.timezone ?? DEFAULT_TIMEZONE;
  }

  /**
   * True when `at` falls inside the organization's commercial window (AU-009).
   * With hours disabled, or without a window, nothing is restricted: the
   * scheduler behaves exactly as before this module existed.
   */
  async dentroDeHorario(
    organizationId: string,
    at: Date = new Date(),
  ): Promise<boolean> {
    const horarios = await this.horarios(organizationId);
    if (!horarios.businessHoursEnabled) return true;
    if (
      horarios.businessHoursStart === null ||
      horarios.businessHoursEnd === null
    ) {
      return true;
    }

    const local = new Intl.DateTimeFormat('en-US', {
      timeZone: horarios.timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(at);

    const part = (type: string): string =>
      local.find((p) => p.type === type)?.value ?? '';
    const weekday = part('weekday').toUpperCase();
    const minutes = Number(part('hour')) * 60 + Number(part('minute'));

    if (!horarios.businessDays.includes(weekday)) return false;

    const { businessHoursStart: start, businessHoursEnd: end } = horarios;
    // The window may cross midnight (for example 20:00 -> 09:00).
    if (start <= end) return minutes >= start && minutes < end;
    return minutes >= start || minutes < end;
  }

  async updateHorarios(
    user: AuthUser,
    dto: UpdateHorariosDto,
  ): Promise<HorariosView> {
    const organizationId = this.requireOrg(user);
    this.validateHorarios(dto);
    const data = this.horariosData(dto);

    await this.prisma.organizationConfig.upsert({
      where: { organizationId },
      create: {
        organizationId,
        ...data,
        createdBy: user.id,
        updatedBy: user.id,
      },
      update: { ...data, updatedBy: user.id },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'configuration.horarios.updated',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: 'organization configuration horarios updated',
      metadata: { keys: Object.keys(dto) },
    });
    this.emitConfigUpdated(user, organizationId, 'horarios', Object.keys(dto));

    return this.horarios(organizationId);
  }

  async updateParametros(user: AuthUser, dto: UpdateParametrosDto) {
    const organizationId = this.requireOrg(user);

    await this.prisma.organizationConfig.upsert({
      where: { organizationId },
      create: {
        organizationId,
        ...dto,
        createdBy: user.id,
        updatedBy: user.id,
      },
      update: { ...dto, updatedBy: user.id },
    });

    await this.auditService.record({
      module: MODULE,
      action: 'configuration.parametros.updated',
      outcome: 'success',
      userId: user.id,
      organizationId,
      description: 'organization configuration parametros updated',
      metadata: { keys: Object.keys(dto) },
    });
    this.emitConfigUpdated(
      user,
      organizationId,
      'parametros',
      Object.keys(dto),
    );

    return this.parametros(organizationId);
  }

  private horariosData(dto: UpdateHorariosDto) {
    return {
      ...(dto.businessHoursEnabled !== undefined
        ? { businessHoursEnabled: dto.businessHoursEnabled }
        : {}),
      ...(dto.timezone !== undefined ? { timezone: dto.timezone } : {}),
      ...(dto.businessDays !== undefined
        ? { businessDays: dto.businessDays as BusinessDay[] }
        : {}),
      ...(dto.businessHoursStart !== undefined
        ? { businessHoursStart: dto.businessHoursStart }
        : {}),
      ...(dto.businessHoursEnd !== undefined
        ? { businessHoursEnd: dto.businessHoursEnd }
        : {}),
    };
  }

  private validateHorarios(dto: UpdateHorariosDto): void {
    for (const day of dto.businessDays ?? []) {
      if (!BUSINESS_DAYS.includes(day as BusinessDay)) {
        throw new BadRequestException({
          error: { code: 'VALIDATION_ERROR', message: `Día inválido: ${day}` },
        });
      }
    }
    // Solo es un error cuando ambos son el mismo minuto. `null` limpia la
    // ventana, así que null === null (limpiar inicio y fin) es válido.
    if (
      dto.businessHoursStart !== undefined &&
      dto.businessHoursEnd !== undefined &&
      dto.businessHoursStart !== null &&
      dto.businessHoursEnd !== null &&
      dto.businessHoursStart === dto.businessHoursEnd
    ) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'La hora de inicio y la de fin no pueden ser iguales',
        },
      });
    }
  }

  /** Domain event emitted after the write (spec §8); no consumer in v1. */
  private emitConfigUpdated(
    user: AuthUser,
    organizationId: string,
    section: ConfigEventPayload['section'],
    keys: string[],
  ): void {
    const event = buildConfigUpdatedEvent(
      section,
      keys,
      user.id,
      organizationId,
    );
    this.eventEmitter.emit('OrganizationConfigUpdated', {
      ...event,
      userId: user.id,
      organizationId,
    });
  }
}
