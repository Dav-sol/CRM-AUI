// Crea la organización UAT para la prueba integral del Lifecycle P0, vacía.
//
// Por qué un script y no la API: no existe endpoint para crear
// organizaciones (lo documenta el propio seed-demo-org.ts) y la invitación
// entre organizaciones está bloqueada de forma explícita en
// invitations.service.ts (`cross_organization`), así que un ADMINISTRADOR de
// otra organización no puede dar acceso a una nueva. Este script es el
// único mecanismo disponible y sigue el mismo patrón idempotente.
//
// Qué NO hace, a propósito:
//   - no ejecuta seed-demo (borra en físico el tenant real)
//   - no copia datos de otra organización
//   - no borra ni modifica ninguna otra organización
//   - no crea clientes, compras, ciclos, campañas ni fixtures
//   - no aplica migraciones
//
// La contraseña se genera y se imprime una sola vez: no se guarda en el
// repositorio.
//
// Uso desde apps/api:
//   pnpm --filter api exec tsx prisma/create-uat-org.ts
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import {
  AccountType,
  OrganizationStatus,
  PrismaClient,
  RoleType,
  UserStatus,
} from '@prisma/client';

const ORG_SLUG = 'uat-lifecycle-p0';
const ORG_NAME = 'UAT Lifecycle P0';
const ADMIN_EMAIL =
  process.env.UAT_ADMIN_EMAIL ?? '_david.solano15@hotmail.com';
const BCRYPT_COST = 12;

const prisma = new PrismaClient();

function generatePassword(): string {
  // 20 caracteres de un alfabeto sin ambiguos, con un símbolo y un dígito.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(20);
  const base = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${base.slice(0, 16)}7#${base.slice(16, 19)}`;
}

async function main(): Promise<void> {
  // 1) Organización. `update: {}` = si ya existe no se toca. Nunca se borra.
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: {
      name: ORG_NAME,
      slug: ORG_SLUG,
      status: OrganizationStatus.ACTIVE,
    },
  });
  const created = org.createdAt.getTime() === org.updatedAt.getTime();
  console.log(`org:    ${org.name} (${org.slug})`);
  console.log(`id:     ${org.id}`);
  console.log(`uuid:   ${org.uuid}`);
  console.log(`estado: ${org.status}${created ? ' (nueva)' : ' (ya existía)'}`);

  // 2) Rol ADMINISTRADOR de esta organización (único por org según el schema).
  const role = await prisma.role.upsert({
    where: {
      organizationId_name: {
        organizationId: org.id,
        name: RoleType.ADMINISTRADOR,
      },
    },
    update: {},
    create: { organizationId: org.id, name: RoleType.ADMINISTRADOR },
  });
  console.log(`rol:    ${role.name} (${role.id})`);

  // 3) Usuario de acceso. Se reutiliza si el email ya existe en ESTA organización;
  //    si existiera en otra, el unique de email lo impediría y el script falla
  //    en vez de mover usuarios entre organizaciones.
  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, organizationId: true, deletedAt: true },
  });
  if (existing && existing.organizationId !== org.id) {
    throw new Error(
      `ABORTADO: ${ADMIN_EMAIL} ya pertenece a otra organización ` +
        `(organizationId=${existing.organizationId}). No se modifica. ` +
        `Usa UAT_ADMIN_EMAIL con otro correo.`,
    );
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      status: UserStatus.ACTIVE,
      deletedAt: null,
      accountType: AccountType.ORGANIZATION,
      organizationId: org.id,
      roleId: role.id,
      passwordHash,
    },
    create: {
      email: ADMIN_EMAIL,
      firstName: 'David',
      lastName: 'Solano',
      passwordHash,
      status: UserStatus.ACTIVE,
      accountType: AccountType.ORGANIZATION,
      organizationId: org.id,
      roleId: role.id,
    },
  });
  console.log(`usuario: ${user.email} (${user.uuid})`);
  console.log(`acceso:  ${user.accountType} / ${role.name} / ${user.status}`);
  console.log('');
  console.log('>>> CONTRASEÑA (se imprime una sola vez, no se guarda):');
  console.log(`>>> ${password}`);
  console.log('');
  console.log('Aviso: el sandbox de WhatsApp se define en');
  console.log(
    '  infrastructure/docker/.env.extra → WHATSAPP_SANDBOX_ORGANIZATION_IDS',
  );
  console.log(
    `Si esta organización (${org.id}) no está en esa lista, sus envíos`,
  );
  console.log('NO se simulan. Compruébalo antes de importar datos.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
