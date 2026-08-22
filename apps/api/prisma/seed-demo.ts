import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ORG_SLUG = 'baterias-del-caribe';
const DEMO_PASSWORD = 'Demo12345!';
const BCRYPT_COST = 12;
const FLAGSHIP_MAX_CUSTOMERS = 100;

const HEROES = [
  {
    codcli: 'DEMO-0001',
    name: 'Carlos Mendoza',
    city: 'Barranquilla',
    phone: '+57 300 111 2233',
    email: 'carlos.mendoza@example.com',
  },
  {
    codcli: 'DEMO-0002',
    name: 'María Torres',
    city: 'Cartagena',
    phone: '+57 301 444 5566',
    email: 'maria.torres@example.com',
  },
] as const;

const HERO_PURCHASES = [
  { monthsAgo: 18, warrantyMonths: 18, quantity: 1, value: '380.00' },
  { monthsAgo: 12, warrantyMonths: 15, quantity: 1, value: '300.00' },
  { monthsAgo: 6, warrantyMonths: 12, quantity: 2, value: '540.00' },
] as const;

type SeedStage = {
  name: string;
  anchor: 'PURCHASE_DATE' | 'WARRANTY_EXPIRY';
  offsetDays: number;
  template: string;
  templateOnPast?: string;
};

const SEQUENCES: Array<{
  name: string;
  description: string;
  warrantyMonths: number;
  stages: SeedStage[];
}> = [
  {
    name: 'Secuencia Demo — Garantía 12 meses',
    description: 'Secuencia de seguimiento para garantía de 12 meses.',
    warrantyMonths: 12,
    stages: [
      {
        name: 'Garantía digital',
        anchor: 'PURCHASE_DATE',
        offsetDays: 0,
        template:
          'Hola {customerName}, activamos la garantía digital de tu batería {productName}. Guardá este comprobante.',
      },
      {
        name: 'Confirmación postventa',
        anchor: 'PURCHASE_DATE',
        offsetDays: 3,
        template:
          'Hola {customerName}, ¿cómo va tu batería {productName}? Ante cualquier consulta estamos para ayudarte.',
      },
      {
        name: 'Alerta de vencimiento',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -60,
        template:
          'Hola {customerName}, tu batería {productName} está por vencer su garantía. Queremos ayudarte a revisarla.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} ya está fuera de su ciclo recomendado. Podemos ayudarte a revisar su estado y ofrecerte una opción de reemplazo.',
      },
      {
        name: 'Oferta de renovación',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -30,
        template:
          'Hola {customerName}, tu batería {productName} vence pronto. Aprovechá nuestra oferta de renovación.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} ya está fuera de su ciclo recomendado. Podemos ayudarte a revisar su estado y ofrecerte una opción de reemplazo.',
      },
    ],
  },
  {
    name: 'Secuencia Demo — Garantía 24 meses',
    description: 'Secuencia de seguimiento para garantía de 24 meses.',
    warrantyMonths: 24,
    stages: [
      {
        name: 'Confirmación postventa',
        anchor: 'PURCHASE_DATE',
        offsetDays: 3,
        template: 'Hola {customerName}, ¿cómo va tu batería {productName}?',
      },
      {
        name: 'Vencimiento de garantía',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: 0,
        template:
          'Hola {customerName}, hoy vence la garantía de tu {productName}. Programá tu revisión con {organizationName}.',
      },
      {
        name: '+180 días post-garantía',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: 180,
        template:
          'Hola {customerName}, te ofrecemos una oferta especial para tu próximo cambio de {productName}.',
      },
      {
        name: '+365 días post-garantía',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: 365,
        template:
          'Hola {customerName}, un año después de tu garantía seguimos con descuentos exclusivos en {organizationName}.',
      },
    ],
  },
];

const CAMPAIGNS = [
  {
    name: 'Campaña Demo — Garantía 12 meses',
    type: 'REPURCHASE' as const,
    status: 'ACTIVE' as const,
    segment: { warrantyMonths: 12 },
    sequenceName: 'Secuencia Demo — Garantía 12 meses',
    template:
      'Hola {customerName}, tu batería {productName} tiene garantía activa.',
  },
  {
    name: 'Campaña Demo — Recompra fin de año',
    type: 'REPURCHASE' as const,
    status: 'DRAFT' as const,
    segment: { city: 'Barranquilla' },
    sequenceName: null,
    template:
      'Hola {customerName}, en {organizationName} preparamos ofertas de fin de año para tu {productName}.',
  },
  {
    name: 'Campaña Demo — Pausada',
    type: 'MANUAL' as const,
    status: 'PAUSED' as const,
    segment: { customerStatus: 'ACTIVE' },
    sequenceName: null,
    template: 'Hola {customerName}, queremos saber cómo va tu {productName}.',
  },
] as const;

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  if (day > lastDay) result.setUTCDate(lastDay);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function monthsAgo(n: number): Date {
  return addMonths(new Date(), -n);
}

async function ensureAdminPassword(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: 'admin@bateriasdelcaribe.com' },
  });
  if (!user) {
    console.warn(
      '  ⚠ admin@bateriasdelcaribe.com not found; skipping password.',
    );
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST) },
  });
  console.log(
    `  ✓ Password set for admin@bateriasdelcaribe.com (${DEMO_PASSWORD})`,
  );
}

async function ensureHeroes(
  orgId: string,
): Promise<Array<{ id: string; uuid: string; name: string }>> {
  const heroes: Array<{ id: string; uuid: string; name: string }> = [];
  for (const hero of HEROES) {
    const existing = await prisma.customer.findFirst({
      where: { organizationId: orgId, codcli: hero.codcli, deletedAt: null },
      select: { id: true, uuid: true, name: true },
    });
    if (existing) {
      heroes.push(existing);
      continue;
    }
    const created = await prisma.customer.create({
      data: {
        organizationId: orgId,
        codcli: hero.codcli,
        name: hero.name,
        city: hero.city,
        phone: hero.phone,
        email: hero.email,
        status: 'ACTIVE',
        createdBy: 'seed-demo',
      },
      select: { id: true, uuid: true, name: true },
    });
    heroes.push(created);
    console.log(`  ✓ Hero customer ${hero.codcli} (${hero.name})`);
  }
  return heroes;
}

async function ensureWarrantyProducts(orgId: string): Promise<string[]> {
  const candidates = await prisma.product.findMany({
    where: { organizationId: orgId, deletedAt: null, purchases: { some: {} } },
    orderBy: { purchases: { _count: 'desc' } },
    take: 3,
    select: { id: true, warrantyMonths: true },
  });
  const fallback = await prisma.product.findMany({
    where: { organizationId: orgId, deletedAt: null },
    take: 3,
    select: { id: true, warrantyMonths: true },
  });
  const pool = [...candidates, ...fallback].slice(0, 3);
  const warrantyCycle = [18, 15, 12];
  const ids: string[] = [];
  for (let i = 0; i < pool.length; i++) {
    const product = pool[i];
    const warrantyMonths =
      product.warrantyMonths ?? warrantyCycle[i % warrantyCycle.length];
    if (product.warrantyMonths == null) {
      await prisma.product.update({
        where: { id: product.id },
        data: { warrantyMonths },
      });
      console.log(`  ✓ Product ${product.id} warrantyMonths=${warrantyMonths}`);
    }
    ids.push(product.id);
  }
  return ids;
}

async function ensureHeroPurchases(
  orgId: string,
  heroes: Array<{ id: string; uuid: string }>,
  productIds: string[],
): Promise<void> {
  for (let h = 0; h < heroes.length; h++) {
    const hero = heroes[h];
    for (let p = 0; p < HERO_PURCHASES.length; p++) {
      const spec = HERO_PURCHASES[p];
      const productId = productIds[p % productIds.length];
      const purchaseDate = monthsAgo(spec.monthsAgo);
      const invoiceNumber = `DEMO-${hero.uuid.slice(0, 6).toUpperCase()}-${p + 1}`;
      const existing = await prisma.purchase.findFirst({
        where: {
          organizationId: orgId,
          customerId: hero.id,
          productId,
          invoiceNumber,
          purchaseDate,
        },
        select: { id: true },
      });
      if (existing) continue;
      await prisma.purchase.create({
        data: {
          organizationId: orgId,
          customerId: hero.id,
          productId,
          invoiceNumber,
          purchaseDate,
          warrantyMonths: spec.warrantyMonths,
          warrantyExpiresAt: addMonths(purchaseDate, spec.warrantyMonths),
          quantity: spec.quantity,
          value: spec.value,
          status: 'COMPLETED',
          createdBy: 'seed-demo',
        },
      });
    }
  }
  console.log(
    `  ✓ Hero purchases created (${heroes.length} × ${HERO_PURCHASES.length})`,
  );
}

async function backfillWarranty(orgId: string): Promise<void> {
  const products = await prisma.product.findMany({
    where: {
      organizationId: orgId,
      warrantyMonths: null,
      deletedAt: null,
      purchases: { some: {} },
    },
    select: { id: true },
  });
  let updated = 0;
  for (let i = 0; i < products.length; i++) {
    const warrantyMonths = i % 2 === 0 ? 12 : 15;
    await prisma.product.update({
      where: { id: products[i].id },
      data: { warrantyMonths },
    });
    await prisma.purchase.updateMany({
      where: {
        organizationId: orgId,
        productId: products[i].id,
        warrantyMonths: null,
        deletedAt: null,
      },
      data: { warrantyMonths },
    });
    const purchases = await prisma.purchase.findMany({
      where: {
        organizationId: orgId,
        productId: products[i].id,
        warrantyMonths,
        warrantyExpiresAt: null,
        deletedAt: null,
      },
      select: { id: true, purchaseDate: true },
    });
    for (const purchase of purchases) {
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          warrantyExpiresAt: addMonths(purchase.purchaseDate, warrantyMonths),
        },
      });
      updated++;
    }
  }
  console.log(`  ✓ Warranty backfilled on ${updated} purchases (G1)`);
}

async function ensureSequences(orgId: string): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  for (const seq of SEQUENCES) {
    const existing = await prisma.followUpSequence.findFirst({
      where: { organizationId: orgId, name: seq.name, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      byName.set(seq.name, existing.id);
      continue;
    }
    const created = await prisma.followUpSequence.create({
      data: {
        organizationId: orgId,
        name: seq.name,
        description: seq.description,
        warrantyMonths: seq.warrantyMonths,
        createdBy: 'seed-demo',
        stages: {
          create: seq.stages.map((stage) => ({
            name: stage.name,
            anchor: stage.anchor,
            offsetDays: stage.offsetDays,
            template: stage.template,
            templateOnPast: stage.templateOnPast,
          })),
        },
      },
      select: { id: true },
    });
    byName.set(seq.name, created.id);
    console.log(`  ✓ Sequence "${seq.name}" (${seq.warrantyMonths} meses)`);
  }
  return byName;
}

async function ensureCampaigns(
  orgId: string,
  sequenceIds: Map<string, string>,
) {
  const campaigns: Array<{
    id: string;
    uuid: string;
    name: string;
    status: string;
  }> = [];
  for (const camp of CAMPAIGNS) {
    let existing = await prisma.campaign.findFirst({
      where: { organizationId: orgId, name: camp.name, deletedAt: null },
      select: { id: true, uuid: true, name: true, status: true },
    });
    if (!existing) {
      existing = await prisma.campaign.create({
        data: {
          organizationId: orgId,
          name: camp.name,
          type: camp.type,
          status: camp.status,
          template: camp.template,
          segment: camp.segment,
          followUpSequenceId: camp.sequenceName
            ? (sequenceIds.get(camp.sequenceName) ?? null)
            : null,
        },
        select: { id: true, uuid: true, name: true, status: true },
      });
      console.log(`  ✓ Campaign "${camp.name}" [${camp.status}]`);
    }
    campaigns.push(existing);
  }
  return campaigns;
}

async function generateFlagshipAutomations(
  orgId: string,
  campaign: { id: string },
  stages: Array<{
    name: string;
    anchor: 'PURCHASE_DATE' | 'WARRANTY_EXPIRY';
    offsetDays: number;
    template: string;
    templateOnPast: string | null;
  }>,
): Promise<void> {
  const existing = await prisma.automation.count({
    where: { campaignId: campaign.id, deletedAt: null },
  });
  if (existing > 0) {
    console.log(
      '  ∎ Flagship campaign already has automations; skipping generation.',
    );
    return;
  }

  const minExpiry = addDays(new Date(), 90);
  const purchases = await prisma.purchase.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      warrantyMonths: 12,
      warrantyExpiresAt: { gte: minExpiry },
      customer: { deletedAt: null, status: 'ACTIVE' },
    },
    orderBy: { purchaseDate: 'desc' },
    select: {
      id: true,
      customerId: true,
      purchaseDate: true,
      warrantyExpiresAt: true,
    },
    take: 2000,
  });

  const seen = new Set<string>();
  const rows: typeof purchases = [];
  for (const purchase of purchases) {
    if (seen.has(purchase.customerId)) continue;
    seen.add(purchase.customerId);
    rows.push(purchase);
    if (rows.length >= FLAGSHIP_MAX_CUSTOMERS) break;
  }

  let createdCount = 0;
  for (const row of rows) {
    let cycle = await prisma.commercialCycle.findUnique({
      where: { purchaseId: row.id },
      select: { id: true, status: true },
    });
    if (!cycle) {
      cycle = await prisma.commercialCycle.create({
        data: {
          purchaseId: row.id,
          status: 'ACTIVE',
          startDate: row.purchaseDate,
        },
        select: { id: true, status: true },
      });
    } else if (cycle.status !== 'ACTIVE') {
      await prisma.commercialCycle.update({
        where: { id: cycle.id },
        data: { status: 'ACTIVE' },
      });
      cycle.status = 'ACTIVE';
    }
    for (const stage of stages) {
      if (stage.anchor === 'WARRANTY_EXPIRY' && !row.warrantyExpiresAt) {
        continue;
      }
      const base =
        stage.anchor === 'PURCHASE_DATE'
          ? row.purchaseDate
          : (row.warrantyExpiresAt as Date);
      await prisma.automation.create({
        data: {
          organizationId: orgId,
          purchaseId: row.id,
          campaignId: campaign.id,
          commercialCycleId: cycle.id,
          scheduledDate: addDays(base, stage.offsetDays),
          status: 'SCHEDULED',
          priority: 0,
          messageTemplate: stage.template,
          createdBy: 'seed-demo',
        },
      });
      createdCount++;
    }
  }
  console.log(
    `  ✓ Flagship campaign automations generated: ${createdCount} (${rows.length} clientes × ${stages.length} etapas)`,
  );
}

async function ensureHeroAutomations(
  orgId: string,
  heroes: Array<{ id: string; uuid: string }>,
  flagshipCampaignId: string,
  stages: Array<{
    name: string;
    anchor: 'PURCHASE_DATE' | 'WARRANTY_EXPIRY';
    offsetDays: number;
    template: string;
    templateOnPast: string | null;
  }>,
): Promise<void> {
  for (const hero of heroes) {
    const heroExecuted = await prisma.automation.count({
      where: {
        organizationId: orgId,
        campaignId: flagshipCampaignId,
        status: 'EXECUTED',
        purchase: { customerId: hero.id },
        deletedAt: null,
      },
    });
    if (heroExecuted > 0) continue;

    const purchases = await prisma.purchase.findMany({
      where: { organizationId: orgId, customerId: hero.id, deletedAt: null },
      orderBy: { purchaseDate: 'desc' },
      select: { id: true, purchaseDate: true, warrantyExpiresAt: true },
      take: 3,
    });
    for (const purchase of purchases) {
      let cycle = await prisma.commercialCycle.findUnique({
        where: { purchaseId: purchase.id },
        select: { id: true, status: true },
      });
      if (!cycle) {
        cycle = await prisma.commercialCycle.create({
          data: {
            purchaseId: purchase.id,
            status: 'ACTIVE',
            startDate: new Date(),
          },
          select: { id: true, status: true },
        });
      }
      // 2 EXECUTED (past) for the 360 timeline
      for (let i = 0; i < 2; i++) {
        const stage = stages[i % stages.length];
        await prisma.automation.create({
          data: {
            organizationId: orgId,
            purchaseId: purchase.id,
            campaignId: flagshipCampaignId,
            commercialCycleId: cycle.id,
            scheduledDate: addDays(new Date(), -30 - i * 30),
            executedDate: addDays(new Date(), -30 - i * 30),
            status: 'EXECUTED',
            priority: 0,
            messageTemplate: stage.template,
            createdBy: 'seed-demo',
          },
        });
      }
      // 2 SCHEDULED (future) for the pipeline
      for (let i = 0; i < 2; i++) {
        const stage = stages[i % stages.length];
        const base =
          stage.anchor === 'PURCHASE_DATE'
            ? purchase.purchaseDate
            : (purchase.warrantyExpiresAt ?? addMonths(new Date(), 6));
        await prisma.automation.create({
          data: {
            organizationId: orgId,
            purchaseId: purchase.id,
            campaignId: flagshipCampaignId,
            commercialCycleId: cycle.id,
            scheduledDate: addDays(base, stage.offsetDays),
            status: 'SCHEDULED',
            priority: 0,
            messageTemplate: stage.template,
            createdBy: 'seed-demo',
          },
        });
      }
    }
    console.log(`  ✓ Hero automations for ${hero.uuid}`);
  }
}

async function ensureHeroConversations(
  orgId: string,
  heroes: Array<{ id: string; uuid: string; name: string }>,
): Promise<void> {
  for (const hero of heroes) {
    const existingConv = await prisma.conversation.findFirst({
      where: {
        organizationId: orgId,
        customerId: hero.id,
        channel: 'WHATSAPP_CLIENTS',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existingConv) continue;
    const conversation = await prisma.conversation.create({
      data: {
        organizationId: orgId,
        customerId: hero.id,
        channel: 'WHATSAPP_CLIENTS',
        status: 'OPEN',
      },
      select: { id: true },
    });
    const msgs = [
      {
        type: 'INCOMING',
        direction: 'INBOUND',
        content: `Hola, me llegó el recordatorio de la garantía de mi batería. ¿Me pueden dar más información?`,
        status: 'SENT',
        providerMessageId: `demo-in-${hero.uuid}`,
      },
      {
        type: 'MANUAL',
        direction: 'OUTBOUND',
        content: `¡Hola ${hero.name}! Claro, con gusto. Tu garantía sigue activa y podemos programar una revisión gratuita.`,
        status: 'SENT',
        providerMessageId: `demo-out-${hero.uuid}`,
      },
      {
        type: 'INCOMING',
        direction: 'INBOUND',
        content: 'Perfecto, agendo la cita para la próxima semana. Gracias.',
        status: 'SENT',
        providerMessageId: `demo-in2-${hero.uuid}`,
      },
    ];
    for (const msg of msgs) {
      await prisma.message.create({
        data: {
          organizationId: orgId,
          conversationId: conversation.id,
          type: msg.type as never,
          direction: msg.direction as never,
          content: msg.content,
          status: msg.status as never,
          providerMessageId: msg.providerMessageId,
          providerConversationId: `demo-conv-${hero.uuid}`,
          sentAt: new Date(),
        },
      });
    }
    console.log(`  ✓ Hero conversation for ${hero.uuid} (3 messages)`);
  }
}

async function main() {
  console.log('Seeding demo data...');

  const org = await prisma.organization.findFirst({
    where: { slug: ORG_SLUG },
  });
  if (!org) {
    console.error(`Organization "${ORG_SLUG}" not found.`);
    process.exit(1);
  }
  const orgId = org.id;
  console.log(`Using organization: ${org.name} (${orgId})`);

  await ensureAdminPassword();

  const heroes = await ensureHeroes(orgId);
  const productIds = await ensureWarrantyProducts(orgId);
  await ensureHeroPurchases(orgId, heroes, productIds);
  await backfillWarranty(orgId);

  const sequenceIds = await ensureSequences(orgId);
  const campaigns = await ensureCampaigns(orgId, sequenceIds);

  const flagshipName = 'Campaña Demo — Garantía 12 meses';
  const flagship = campaigns.find((c) => c.name === flagshipName);
  const seq12 = await prisma.followUpSequence.findFirst({
    where: {
      organizationId: orgId,
      name: 'Secuencia Demo — Garantía 12 meses',
      deletedAt: null,
    },
    select: {
      id: true,
      stages: {
        where: { deletedAt: null },
        orderBy: [{ anchor: 'asc' as const }, { offsetDays: 'asc' as const }],
        select: {
          name: true,
          anchor: true,
          offsetDays: true,
          template: true,
          templateOnPast: true,
        },
      },
    },
  });
  console.log('  ✓ Demo automations generation');
  if (flagship && seq12) {
    await generateFlagshipAutomations(orgId, flagship, seq12.stages);
    await ensureHeroAutomations(orgId, heroes, flagship.id, seq12.stages);
  }

  await ensureHeroConversations(orgId, heroes);

  console.log('Seed demo data complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
