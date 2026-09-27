// Creates the demo organization + admin that seed-demo.ts assumes already
// exist: that script exits with `Organization "baterias-del-caribe" not found`
// otherwise, and there is no API endpoint that creates organizations.
//
// Run from apps/api (dotenv loads apps/api/.env):
//   pnpm --filter api exec tsx prisma/seed-demo-org.ts
import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import {
  AccountType,
  OrganizationStatus,
  PrismaClient,
  RoleType,
  UserStatus,
} from '@prisma/client';

// Duplicated from seed-demo.ts on purpose: importing that file would execute
// its top-level main(). Keep in sync if the demo identity changes.
const ORG_SLUG = 'baterias-del-caribe';
const ORG_NAME = 'Baterías del Caribe';
const ADMIN_EMAIL = 'admin@bateriasdelcaribe.com';
const DEMO_PASSWORD = 'Demo12345!';
const BCRYPT_COST = 12;

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Ensuring demo organization and admin user...');

  // Upsert by slug with an empty `update`: an existing demo organization is
  // never modified (name/status/data stay whatever they are).
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {},
    create: {
      name: ORG_NAME,
      slug: ORG_SLUG,
      status: OrganizationStatus.ACTIVE,
    },
  });
  console.log(`  org: ${org.name} (${org.slug}) id=${org.id}`);

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

  // The demo admin must always be able to log in: login rejects anything that
  // is not ACTIVE (auth.service), and seed-demo.ts resets this same password.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);
  const admin = await prisma.user.upsert({
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
      firstName: 'Demo',
      lastName: 'Admin',
      passwordHash,
      status: UserStatus.ACTIVE,
      accountType: AccountType.ORGANIZATION,
      organizationId: org.id,
      roleId: role.id,
    },
  });
  console.log(`  admin: ${admin.email} status=${admin.status}`);
  console.log('  password: aligned with DEMO_PASSWORD in seed-demo.ts');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
