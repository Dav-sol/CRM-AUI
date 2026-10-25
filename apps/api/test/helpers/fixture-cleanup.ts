import type { PrismaClient } from '@prisma/client';

/**
 * PIT-16 / E2E-01 · limpieza de fixtures acotada al tenant de la prueba.
 *
 * Antes, la mayoría de suites borraban auditorías solo por `module`
 * (`audit.deleteMany({ where: { module: 'purchases' } })`) o sin ningún `where`
 * (`auth.e2e-spec.ts` borraba TODA la tabla de auditoría y
 * `invitations.e2e-spec.ts` TODAS las invitaciones). Como `module` es
 * transversal a organizaciones, eso destruye registros de otros tenants — y,
 * como Jest ejecuta suites en paralelo contra la misma base, también registros
 * que otra suite esté creando en ese preciso instante.
 *
 * Estos helpers expriman la única regla segura: **borrar únicamente lo que
 * pertenece a las organizaciones de fixture de esta suite**. Los registros
 * compartidos (p. ej. auditorías con `organization_id` NULL, propias de la
 * plataforma) y los de otros tenants quedan fuera del alcance por construcción.
 *
 * Se comparten entre todas las suites para que `cleanup-safety.e2e-spec.ts`
 * pueda probar exactamente el predicado que las suites ejecutan de verdad.
 */

export interface FixtureOrganizations {
  /** Slugs de las organizaciones de fixture, cuando se conocen. */
  slugs?: string[];
  /** IDs de las organizaciones de fixture, cuando ya se han creado. */
  organizationIds?: string[];
}

type AuditClient = Pick<PrismaClient, 'audit' | 'invitation'>;

const EMPTY: never[] = [];

/**
 * Ámbito de organización compartido por todas las operaciones de limpieza.
 *
 * `Audit.organizationId` es anulable, así que la relación se filtra con `is` y
 * no con la forma abreviada: de ese modo las filas con organización NULL
 * (auditorías de plataforma, compartidas entre tenants) nunca entran.
 */
export function fixtureOrgScope(
  orgs: FixtureOrganizations,
): Record<string, unknown> {
  if (orgs.organizationIds && orgs.organizationIds.length > 0) {
    return { organizationId: { in: orgs.organizationIds } };
  }
  return { organization: { is: { slug: { in: orgs.slugs ?? EMPTY } } } };
}

/**
 * Borra solo las auditorías de las organizaciones de fixture.
 *
 * No se filtra por `module`: al borrar la organización al final de la suite,
 * una auditoría de otro módulo (p. ej. `identity`, creada al hacer login)
 * quedaría con `organization_id` NULL y sería imposible de distinguir después
 * de las auditorías compartidas. Al vaciar todo lo del tenant de la prueba se
 * evita ese residuo.
 */
export async function deleteFixtureAudits(
  prisma: AuditClient,
  orgs: FixtureOrganizations,
): Promise<{ count: number }> {
  return prisma.audit.deleteMany({ where: fixtureOrgScope(orgs) });
}

/**
 * Borra solo las invitaciones de las organizaciones de fixture. `Invitation`
 * tiene `organization_id` no anulable, por lo que el ámbito por organización es
 * también lo que permite borrar la organización después sin violar la FK.
 */
export async function deleteFixtureInvitations(
  prisma: AuditClient,
  orgs: FixtureOrganizations,
): Promise<{ count: number }> {
  return prisma.invitation.deleteMany({ where: fixtureOrgScope(orgs) });
}

/**
 * Borra las auditorías de un usuario de fixture concreto.
 *
 * Se usa en `auth.e2e-spec.ts`, donde el usuario de prueba es de plataforma
 * (`organization_id` NULL): ahí no hay organización por la que acotar y el
 * identificador inequívoco del registro es el propio usuario. Con el alcance
 * anterior esa suite borraba TODA la tabla de auditoría, incluidas las filas
 * que otras suites estuvieran escribiendo en paralelo.
 */
export async function deleteIdentityAuditsForUser(
  prisma: Pick<PrismaClient, 'audit'>,
  email: string,
): Promise<{ count: number }> {
  return prisma.audit.deleteMany({ where: { user: { email } } });
}
