import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../core/database/prisma.service';
import { AuditIdentityService } from '../auth/audit.identity.service';
import { ConfiguracionesService } from './configuraciones.service';

const orgUser = {
  id: 'user-1',
  uuid: 'u1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
} as never;

const platformUser = {
  id: 'user-9',
  uuid: 'u9',
  accountType: 'PLATFORM',
  organizationId: null,
  role: 'PLATFORM_OWNER',
} as never;

describe('ConfiguracionesService: precedencia BD > env > default', () => {
  let service: ConfiguracionesService;
  let prisma: {
    organizationConfig: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let audit: { record: jest.Mock };
  let emitter: { emit: jest.Mock };
  let env: Record<string, unknown>;

  beforeEach(async () => {
    env = {};
    prisma = {
      organizationConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    emitter = { emit: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ConfiguracionesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditIdentityService, useValue: audit },
        { provide: EventEmitter2, useValue: emitter },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => env[key] },
        },
      ],
    }).compile();

    service = moduleRef.get(ConfiguracionesService);
  });

  describe('effectiveParametro', () => {
    it('sin fila ni env usa el default del código', async () => {
      const result = await service.effectiveParametro(
        'org-1',
        'quoteExpiryDays',
      );
      expect(result).toEqual({ valor: 7, source: 'default' });
    });

    it('la variable de entorno gana sobre el default', async () => {
      env['quotes.expiryDays'] = 14;
      const result = await service.effectiveParametro(
        'org-1',
        'quoteExpiryDays',
      );
      expect(result).toEqual({ valor: 14, source: 'env' });
    });

    it('la fila en BD gana sobre la variable de entorno', async () => {
      env['quotes.expiryDays'] = 14;
      prisma.organizationConfig.findUnique.mockResolvedValue({
        quoteExpiryDays: 7,
      });
      const result = await service.effectiveParametro(
        'org-1',
        'quoteExpiryDays',
      );
      expect(result).toEqual({ valor: 7, source: 'db' });
    });

    it('una columna null en BD cae al env', async () => {
      env['quotes.expiryDays'] = 14;
      prisma.organizationConfig.findUnique.mockResolvedValue({
        quoteExpiryDays: null,
      });
      const result = await service.effectiveParametro(
        'org-1',
        'quoteExpiryDays',
      );
      expect(result).toEqual({ valor: 14, source: 'env' });
    });

    it('reporta el origen de cada parámetro', async () => {
      env['sms.currency'] = 'USD';
      prisma.organizationConfig.findUnique.mockResolvedValue({
        maxCommercialPer60d: 5,
      });

      const all = await service.parametros('org-1');

      expect(all.maxCommercialPer60d).toEqual({ valor: 5, source: 'db' });
      expect(all.smsCurrency).toEqual({ valor: 'USD', source: 'env' });
      expect(all.quoteExpiryDays).toEqual({ valor: 7, source: 'default' });
      expect(all.whatsappMessageCost).toEqual({
        valor: 200,
        source: 'default',
      });
      expect(all.whatsappMessageCostCommercial).toEqual({
        valor: 400,
        source: 'default',
      });
      expect(all.minDaysBetweenCommercial).toEqual({
        valor: 3,
        source: 'default',
      });
      expect(all.smsCostPerSegment).toEqual({ valor: 100, source: 'default' });
    });
  });

  describe('horarios', () => {
    it('sin fila: horario desactivado y defaults', async () => {
      await expect(service.horarios('org-1')).resolves.toEqual({
        businessHoursEnabled: false,
        timezone: 'America/Bogota',
        businessDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        businessHoursStart: null,
        businessHoursEnd: null,
      });
    });

    it('dentroDeHorario no restringe con el horario desactivado', async () => {
      await expect(
        service.dentroDeHorario('org-1', new Date('2026-01-03T03:00:00Z')),
      ).resolves.toBe(true);
    });

    it('dentroDe horario: L-V 08:00-18:00 America/Bogota', async () => {
      prisma.organizationConfig.findUnique.mockResolvedValue({
        businessHoursEnabled: true,
        timezone: 'America/Bogota',
        businessDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
        businessHoursStart: 480,
        businessHoursEnd: 1080,
      });

      // Viernes 2026-01-09 14:00 Bogotá (UTC-5) = 19:00 UTC → dentro.
      await expect(
        service.dentroDeHorario('org-1', new Date('2026-01-09T19:00:00Z')),
      ).resolves.toBe(true);
      // 22:00 Bogotá = 03:00 UTC del sábado → fuera por hora y por día.
      await expect(
        service.dentroDeHorario('org-1', new Date('2026-01-10T03:00:00Z')),
      ).resolves.toBe(false);
      // Sábado 10:00 Bogotá dentro del rango horario pero no del calendario.
      await expect(
        service.dentroDeHorario('org-1', new Date('2026-01-10T15:00:00Z')),
      ).resolves.toBe(false);
    });

    it('soporta una ventana que cruza medianoche', async () => {
      prisma.organizationConfig.findUnique.mockResolvedValue({
        businessHoursEnabled: true,
        timezone: 'America/Bogota',
        businessDays: ['MON'],
        businessHoursStart: 1200, // 20:00
        businessHoursEnd: 540, // 09:00
      });

      // Lunes 21:00 Bogotá = 02:00 UTC del martes → dentro.
      await expect(
        service.dentroDeHorario('org-1', new Date('2026-01-13T02:00:00Z')),
      ).resolves.toBe(true);
      // Lunes 12:00 Bogotá = 17:00 UTC → fuera.
      await expect(
        service.dentroDeHorario('org-1', new Date('2026-01-12T17:00:00Z')),
      ).resolves.toBe(false);
    });

    it('sin ventana configurada no restringe', async () => {
      prisma.organizationConfig.findUnique.mockResolvedValue({
        businessHoursEnabled: true,
        timezone: 'America/Bogota',
        businessDays: ['MON'],
        businessHoursStart: null,
        businessHoursEnd: null,
      });
      await expect(
        service.dentroDeHorario('org-1', new Date('2026-01-10T03:00:00Z')),
      ).resolves.toBe(true);
    });
  });

  describe('escritura', () => {
    it('upsert de horarios, auditoría y evento', async () => {
      prisma.organizationConfig.findUnique.mockResolvedValue({
        businessHoursEnabled: true,
        timezone: 'America/Bogota',
        businessDays: ['MON', 'TUE'],
        businessHoursStart: 480,
        businessHoursEnd: 1080,
      });

      const result = await service.updateHorarios(orgUser, {
        businessHoursEnabled: true,
        businessHoursStart: 480,
        businessHoursEnd: 1080,
      });

      const [upsertArg] = prisma.organizationConfig.upsert.mock.calls[0] as [
        {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        },
      ];
      expect(upsertArg.create).toMatchObject({
        organizationId: 'org-1',
        businessHoursEnabled: true,
        businessHoursStart: 480,
        updatedBy: 'user-1',
      });
      expect(upsertArg.update).toMatchObject({
        businessHoursEnabled: true,
        updatedBy: 'user-1',
      });
      expect(result.businessHoursEnabled).toBe(true);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'configuration.horarios.updated',
          organizationId: 'org-1',
        }),
      );
      expect(emitter.emit).toHaveBeenCalledWith(
        'OrganizationConfigUpdated',
        expect.objectContaining({ organizationId: 'org-1' }),
      );
    });

    it('patch parcial no borra lo no enviado', async () => {
      await service.updateParametros(orgUser, { quoteExpiryDays: 21 });

      expect(prisma.organizationConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { quoteExpiryDays: 21, updatedBy: 'user-1' },
        }),
      );
    });

    it('rechaza inicio y fin iguales', async () => {
      await expect(
        service.updateHorarios(orgUser, {
          businessHoursStart: 600,
          businessHoursEnd: 600,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.organizationConfig.upsert).not.toHaveBeenCalled();
    });

    it('aceptar null en inicio y fin limpia la ventana', async () => {
      await service.updateHorarios(orgUser, {
        businessHoursEnabled: false,
        businessHoursStart: null,
        businessHoursEnd: null,
      });

      const [upsertArg] = prisma.organizationConfig.upsert.mock.calls[0] as [
        { update: Record<string, unknown> },
      ];
      expect(upsertArg.update).toMatchObject({
        businessHoursEnabled: false,
        businessHoursStart: null,
        businessHoursEnd: null,
      });
    });

    it('una cuenta de plataforma no tiene organización que configurar', async () => {
      await expect(
        service.updateParametros(platformUser, { quoteExpiryDays: 10 }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.organizationConfig.upsert).not.toHaveBeenCalled();
    });
  });
});
