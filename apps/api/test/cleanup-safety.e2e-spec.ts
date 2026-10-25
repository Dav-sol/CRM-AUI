process.env.NODE_ENV = 'test';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/core/database/prisma.service';
import { configureApp } from './../src/app.setup';
import {
  deleteFixtureAudits,
  deleteFixtureInvitations,
} from './helpers/fixture-cleanup';

/**
 * E2E-01 · prueba de seguridad de la limpieza de fixtures.
 *
 * Demuestra que el ámbito de borrado nuevo —organización de la suite— conserva
 * los registros de otros tenants. Se cubren tres clases de fila:
 *
 *   1. fixture     → debe desaparecer;
 *   2. otro tenant → debe sobrevivir intacta;
 *   3. plataforma  → `organization_id` NULL, compartida → debe sobrevivir.
 *
 * También se comprueba la consecuencia estructural: al borrar la organización
 * de fixture al final de la suite, ninguna auditoría queda huérfana con
 * organización NULL (residuo que sería imposible de distinguir después de las
 * auditorías compartidas).
 *
 * La suite se ejecuta contra la base aislada de E2E, nunca contra producción.
 */
describe('Cleanup de fixtures (e2e) — acotado por organización de prueba', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const fixtureSlug = 'safety-fixture-org';
  const foreignSlug = 'safety-foreign-org';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Idempotencia: un fallo previo no debe dejar filas que contaminen la
    // siguiente ejecución. El ámbito es deliberadamente el mismo que el de las
    // suites reales: solo las dos organizaciones de esta prueba.
    const slugs = [fixtureSlug, foreignSlug];
    await prisma.audit.deleteMany({
      where: { organization: { is: { slug: { in: slugs } } } },
    });
    await prisma.invitation.deleteMany({
      where: { organization: { is: { slug: { in: slugs } } } },
    });
    await prisma.organization.deleteMany({ where: { slug: { in: slugs } } });
  });

  it('borra las auditorías del tenant de la prueba y conserva las de otros tenants y las de plataforma', async () => {
    const fixtureOrg = await prisma.organization.create({
      data: { name: 'Safety Fixture Org', slug: fixtureSlug },
      select: { id: true },
    });
    const foreignOrg = await prisma.organization.create({
      data: { name: 'Safety Foreign Org', slug: foreignSlug },
      select: { id: true },
    });

    const modules = ['identity', 'purchases', 'whatsapp'] as const;

    // Auditorías del tenant de la suite (incluye `identity`: se crean al hacer
    // login, y con el alcance anterior sobrevivían a la limpieza para acabar en
    // NULL al borrar la organización).
    const fixtureAudits = await Promise.all(
      modules.map((module) =>
        prisma.audit.create({
          data: {
            organizationId: fixtureOrg.id,
            module,
            action: `${module}.cleanup-safety.fixture`,
          },
          select: { id: true },
        }),
      ),
    );

    // Auditorías de OTRO tenant con exactamente los mismos módulos. Este es el
    // dato que el alcance antiguo (`where: { module }`) destruía.
    const foreignAudits = await Promise.all(
      modules.map((module) =>
        prisma.audit.create({
          data: {
            organizationId: foreignOrg.id,
            module,
            action: `${module}.cleanup-safety.foreign`,
          },
          select: { id: true },
        }),
      ),
    );

    // Auditorías de plataforma: sin organización, compartidas entre tenants.
    const platformAudits = await Promise.all(
      ['platform.a', 'platform.b'].map((action) =>
        prisma.audit.create({
          data: { module: 'identity', action, organizationId: null },
          select: { id: true },
        }),
      ),
    );

    // El alcance anterior era transversal al tenant: alcanzaba también las
    // filas del otro tenant. Se comprueba por pertenencia de ID y no por un
    // recuento global, porque el recuento depende de lo que otras suites
    // estén escribiendo en la misma base en ese instante.
    const moduleOnlyIds = new Set(
      (
        await prisma.audit.findMany({
          where: { module: 'purchases' },
          select: { id: true },
        })
      ).map((row) => row.id),
    );
    expect(moduleOnlyIds.has(fixtureAudits[1].id)).toBe(true);
    expect(moduleOnlyIds.has(foreignAudits[1].id)).toBe(true); // lo habría borrado

    // ---- limpieza real de la suite ------------------------------------------
    const deleted = await deleteFixtureAudits(prisma, { slugs: [fixtureSlug] });

    expect(deleted.count).toBe(fixtureAudits.length);

    const fixtureLeft = await prisma.audit.count({
      where: { organizationId: fixtureOrg.id },
    });
    expect(fixtureLeft).toBe(0);

    const foreignLeft = await prisma.audit.findMany({
      where: { id: { in: foreignAudits.map((a) => a.id) } },
    });
    expect(foreignLeft).toHaveLength(foreignAudits.length);
    for (const row of foreignLeft) {
      expect(row.organizationId).toBe(foreignOrg.id);
      expect(row.action).toContain('cleanup-safety.foreign');
    }

    const platformLeft = await prisma.audit.count({
      where: { id: { in: platformAudits.map((a) => a.id) } },
    });
    expect(platformLeft).toBe(platformAudits.length);

    // ---- fin de suite: la suite borra su organización ------------------------
    // Con el alcance antiguo, las auditorías `identity` del fixture no se
    // habrían borrado y la FK habría escrito NULL en `organization_id`,
    // dejando residuos indistinguibles de las auditorías compartidas.
    await prisma.organization.delete({ where: { id: fixtureOrg.id } });

    const orphaned = await prisma.audit.count({
      where: { organizationId: null, action: { contains: 'cleanup-safety' } },
    });
    expect(orphaned).toBe(0);

    // ---- limpieza propia ----------------------------------------------------
    await prisma.audit.deleteMany({
      where: { organizationId: foreignOrg.id },
    });
    await prisma.audit.deleteMany({
      where: { id: { in: platformAudits.map((a) => a.id) } },
    });
    await prisma.organization.delete({ where: { id: foreignOrg.id } });
  });

  it('borra las invitaciones del tenant de la prueba y conserva las de otros tenants', async () => {
    const fixtureOrg = await prisma.organization.create({
      data: { name: 'Safety Fixture Org', slug: fixtureSlug },
      select: { id: true },
    });
    const foreignOrg = await prisma.organization.create({
      data: { name: 'Safety Foreign Org', slug: foreignSlug },
      select: { id: true },
    });

    const seedOrgFixture = async (organizationId: string, prefix: string) => {
      const inviter = await prisma.user.create({
        data: {
          email: `${prefix}-inviter@org.test`,
          passwordHash: 'x',
          firstName: 'Cleanup',
          lastName: 'Safety',
          accountType: 'ORGANIZATION',
          organizationId,
          roleId: null,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      const role = await prisma.role.create({
        data: { organizationId, name: 'OPERADOR' },
        select: { id: true },
      });
      return { inviterId: inviter.id, roleId: role.id };
    };

    const fixtureSeed = await seedOrgFixture(fixtureOrg.id, 'safety-fx');
    const foreignSeed = await seedOrgFixture(foreignOrg.id, 'safety-fo');

    const makeInvitations = (
      organizationId: string,
      inviterId: string,
      roleId: string,
      prefix: string,
      count: number,
    ) =>
      Promise.all(
        Array.from({ length: count }, (_, i) =>
          prisma.invitation.create({
            data: {
              organizationId,
              invitedById: inviterId,
              email: `${prefix}-${i}@org.test`,
              roleId,
              tokenHash: `cleanup-safety-${prefix}-${i}`,
              expiresAt: new Date('2030-01-01T00:00:00Z'),
            },
            select: { id: true },
          }),
        ),
      );

    const fixtureInvitations = await makeInvitations(
      fixtureOrg.id,
      fixtureSeed.inviterId,
      fixtureSeed.roleId,
      'safety-fx',
      2,
    );
    const foreignInvitations = await makeInvitations(
      foreignOrg.id,
      foreignSeed.inviterId,
      foreignSeed.roleId,
      'safety-fo',
      2,
    );

    // El alcance anterior era `invitation.deleteMany({})`: la tabla entera,
    // es decir, también estas invitaciones de otro tenant.
    const wholeTableIds = new Set(
      (await prisma.invitation.findMany({ select: { id: true } })).map(
        (i) => i.id,
      ),
    );
    expect(wholeTableIds.has(foreignInvitations[0].id)).toBe(true);

    // ---- limpieza real de la suite ------------------------------------------
    const deleted = await deleteFixtureInvitations(prisma, {
      slugs: [fixtureSlug],
    });
    expect(deleted.count).toBe(fixtureInvitations.length);

    const foreignLeft = await prisma.invitation.findMany({
      where: { id: { in: foreignInvitations.map((i) => i.id) } },
    });
    expect(foreignLeft).toHaveLength(foreignInvitations.length);
    for (const row of foreignLeft) {
      expect(row.organizationId).toBe(foreignOrg.id);
      expect(row.email).toContain('safety-fo-');
    }

    // ---- fin de suite: borrar la organización ya no exige vaciar la tabla ----
    // `Invitation.organizationId` es no anulable, así que el orden
    // invitación → organización sigue siendo obligatorio; lo que cambia es que
    // el alcance del primer paso ya no arrastra invitaciones ajenas.
    await prisma.organization.delete({ where: { id: fixtureOrg.id } });

    // ---- limpieza propia ----------------------------------------------------
    await prisma.invitation.deleteMany({
      where: { organizationId: foreignOrg.id },
    });
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'safety-' } },
    });
    await prisma.role.deleteMany({
      where: { organizationId: foreignOrg.id },
    });
    await prisma.organization.delete({ where: { id: foreignOrg.id } });
  });
});
