import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/database/prisma.service';
import { AuthUser } from '../../core/decorators/current-user.decorator';
import { ReportsService, reportBucketLabel } from './reports.service';

const orgUser: AuthUser = {
  id: 'u-1',
  uuid: 'uu-1',
  accountType: 'ORGANIZATION',
  organizationId: 'org-1',
  role: 'ADMINISTRADOR',
};

describe('reportBucketLabel', () => {
  // ---------------------------------------------------------------------
  // Agrupacion por dia
  // ---------------------------------------------------------------------
  it('dia: devuelve el dia UTC del instante', () => {
    expect(reportBucketLabel(new Date('2026-08-01T14:02:45.265Z'), 'day')).toBe(
      '2026-08-01',
    );
  });

  it('dia: un instante a medianoche UTC sigue siendo ese dia', () => {
    // En `America/Bogota` este instante es el 31 de julio a las 19:00. Con
    // getters locales la etiqueta habria sido "2026-07-31".
    expect(reportBucketLabel(new Date('2026-08-01T00:00:00.000Z'), 'day')).toBe(
      '2026-08-01',
    );
  });

  // ---------------------------------------------------------------------
  // Agrupacion por semana
  // ---------------------------------------------------------------------
  it('semana: la semana empieza en domingo', () => {
    // 2026-08-01 es sabado -> su semana arranca el domingo 2026-07-26.
    expect(
      reportBucketLabel(new Date('2026-08-01T12:00:00.000Z'), 'week'),
    ).toBe('2026-07-26');
    // El propio domingo es el inicio de su semana.
    expect(
      reportBucketLabel(new Date('2026-07-26T12:00:00.000Z'), 'week'),
    ).toBe('2026-07-26');
    // El lunes siguiente sigue en la semana del domingo anterior.
    expect(
      reportBucketLabel(new Date('2026-07-27T12:00:00.000Z'), 'week'),
    ).toBe('2026-07-26');
  });

  it('semana: no depende de la zona horaria del proceso', () => {
    // Este es el defecto corregido: con `setDate(getDate() - getDay())` el
    // calculo usaba getters LOCALES y la salida se emitia en UTC. Con el
    // proceso en `America/Bogota`, un instante a medianoche UTC caia en el dia
    // anterior local y la etiqueta semanal se desplazaba un dia.
    const medianocheUtc = new Date('2026-08-01T00:00:00.000Z');
    expect(reportBucketLabel(medianocheUtc, 'week')).toBe('2026-07-26');
    // El mismo instante, doce horas despues, pertenece a la misma semana.
    expect(
      reportBucketLabel(new Date('2026-08-01T12:00:00.000Z'), 'week'),
    ).toBe('2026-07-26');
  });

  it('semana: cruza el cambio de anio permaneciendo en el ano de su domingo', () => {
    // 2026-12-31 es jueves -> domingo 2026-12-27 (ano 2026).
    expect(
      reportBucketLabel(new Date('2026-12-31T12:00:00.000Z'), 'week'),
    ).toBe('2026-12-27');
    // 2027-01-01 es viernes -> la MISMA semana, cuyo domingo sigue en 2026.
    expect(
      reportBucketLabel(new Date('2027-01-01T12:00:00.000Z'), 'week'),
    ).toBe('2026-12-27');
  });

  // ---------------------------------------------------------------------
  // Agrupacion por mes
  // ---------------------------------------------------------------------
  it('mes: devuelve el mes UTC del instante', () => {
    expect(
      reportBucketLabel(new Date('2026-08-01T12:00:00.000Z'), 'month'),
    ).toBe('2026-08');
  });

  it('mes: cruza el limite de ano', () => {
    expect(
      reportBucketLabel(new Date('2026-12-31T23:59:59.999Z'), 'month'),
    ).toBe('2026-12');
    expect(
      reportBucketLabel(new Date('2027-01-01T00:00:00.000Z'), 'month'),
    ).toBe('2027-01');
  });

  it('mes: cruza el limite de mes', () => {
    expect(
      reportBucketLabel(new Date('2026-07-31T23:59:59.999Z'), 'month'),
    ).toBe('2026-07');
    expect(
      reportBucketLabel(new Date('2026-08-01T00:00:00.000Z'), 'month'),
    ).toBe('2026-08');
  });

  it('las tres agrupaciones se calculan en el mismo marco', () => {
    // La etiqueta de la semana cae en el mes de su domingo, que puede ser el
    // anterior al del dato: es el comportamiento previo, ahora independiente
    // de la zona del proceso.
    const instante = new Date('2026-08-01T12:00:00.000Z');
    expect(reportBucketLabel(instante, 'day')).toBe('2026-08-01');
    expect(reportBucketLabel(instante, 'week')).toBe('2026-07-26');
    expect(reportBucketLabel(instante, 'month')).toBe('2026-08');
    expect(reportBucketLabel(instante, 'week').slice(0, 7)).toBe('2026-07');
  });
});

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: {
    purchase: {
      count: jest.Mock;
      aggregate: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      purchase: {
        count: jest.fn().mockResolvedValue(3),
        aggregate: jest.fn().mockResolvedValue({
          _sum: { value: 300 },
          _count: { _all: 3 },
        }),
        findMany: jest.fn().mockResolvedValue([
          // Sabado -> pertenece a la semana que arranca el domingo 2026-07-26.
          { purchaseDate: new Date('2026-08-01T14:02:45.265Z'), value: 100 },
          // Domingo -> ARRANCA su propia semana (2026-08-02).
          { purchaseDate: new Date('2026-08-02T09:00:00.000Z'), value: 100 },
          // Miercoles -> se une a la semana del domingo 2026-08-02.
          { purchaseDate: new Date('2026-08-05T00:00:00.000Z'), value: 100 },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ReportsService);
  });

  it('agrupa las compras por la semana UTC de la fecha de compra', async () => {
    const report = await service.purchases(orgUser, { groupBy: 'week' });

    // 2026-08-01 (sabado) pertenece a la semana que arranca el 2026-07-26.
    // El domingo 2026-08-02 arranca OTRA semana, a la que se une el miercoles
    // 2026-08-05. Un domingo es siempre el inicio de su semana.
    expect(report.rows).toEqual([
      { label: '2026-07-26', value: 1, totalValue: 100 },
      { label: '2026-08-02', value: 2, totalValue: 200 },
    ]);
  });

  it('agrupa las compras por el mes UTC de la fecha de compra', async () => {
    const report = await service.purchases(orgUser, { groupBy: 'month' });

    expect(report.rows).toEqual([
      { label: '2026-08', value: 3, totalValue: 300 },
    ]);
  });

  it('agrupa las compras por el dia UTC de la fecha de compra', async () => {
    const report = await service.purchases(orgUser, { groupBy: 'day' });

    expect(report.rows.map((row) => row.label)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-05',
    ]);
  });
});
