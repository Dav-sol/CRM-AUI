import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const macBatteries = [
  { id: 1, brand: 'MAC', name: 'Mac Silver 700 / Caja NS40HDL', model: '', voltage: '12V', cca: '350', warranty: '15 meses', price: '$300.000', polarity: 'Derecha', reserveCapacity: '55' },
  { id: 2, brand: 'MAC', name: 'Mac Silver 700 / Caja NS40L', model: '', voltage: '12V', cca: '350', warranty: '15 meses', price: '$300.000', polarity: 'Derecha', reserveCapacity: '55' },
  { id: 3, brand: 'MAC', name: 'Batería power taxi / Caja NS40HDL670', model: '', voltage: '12V', cca: '320', warranty: '15 meses', price: '$190.000', polarity: 'Derecha', reserveCapacity: '55' },
  { id: 4, brand: 'MAC', name: 'Batería power taxi / Caja NS40L670', model: '', voltage: '12V', cca: '320', warranty: '15 meses', price: '$190.000', polarity: 'Derecha', reserveCapacity: '55' },
  { id: 5, brand: 'MAC', name: 'Mac Silver 800 / Caja NS60L', model: '', voltage: '12V', cca: '410', warranty: '15 meses', price: '$340.000', polarity: 'Derecha', reserveCapacity: '70' },
  { id: 6, brand: 'MAC', name: 'Mac Silver 800 / Caja NS60S', model: '', voltage: '12V', cca: '410', warranty: '15 meses', price: '$340.000', polarity: 'Izquierda', reserveCapacity: '70' },
  { id: 7, brand: 'MAC', name: 'Mac Silver 750 / Caja 36IST', model: '', voltage: '12V', cca: '420', warranty: '15 meses', price: '$320.000', polarity: 'Derecha', reserveCapacity: '63' },
  { id: 8, brand: 'MAC', name: 'Mac Silver 850 / Caja 42IST', model: '', voltage: '12V', cca: '520', warranty: '15 meses', price: '$340.000', polarity: 'Derecha', reserveCapacity: '78' },
  { id: 9, brand: 'MAC', name: 'Mac Silver 950 / Caja 47950', model: 'caja 47950', voltage: '12V', cca: '550', warranty: '15 meses', price: '$340.000', polarity: 'Derecha', reserveCapacity: '100' },
  { id: 10, brand: 'MAC', name: 'Mac Silver 1000 / Caja 351000', model: 'caja 351000', voltage: '12V', cca: '555', warranty: '15 meses', price: '$420.000', polarity: 'Derecha', reserveCapacity: '105' },
  { id: 11, brand: 'MAC', name: 'Mac Silver 950 / Caja 42IST950', model: 'caja 42IST950', voltage: '12V', cca: '550', warranty: '15 meses', price: '$370.000', polarity: 'Derecha', reserveCapacity: '91' },
  { id: 12, brand: 'MAC', name: 'Mac ME 750 / Caja 42IST750', model: 'caja 42IST750', voltage: '12V', cca: '470', warranty: '15 meses', price: '$300.000', polarity: 'Derecha', reserveCapacity: '80' },
  { id: 13, brand: 'MAC', name: 'Mac Silver 1000 / Caja 48IST', model: 'caja 48', voltage: '12V', cca: '550', warranty: '15 meses', price: '$370.000', polarity: 'Derecha', reserveCapacity: '100' },
  { id: 14, brand: 'MAC', name: 'Mac Silver 1000 / Caja 48ST', model: 'caja 48ST', voltage: '12V', cca: '550', warranty: '15 meses', price: '$370.000', polarity: 'Izquierda', reserveCapacity: '100' },
  { id: 15, brand: 'MAC', name: 'Mac Silver 1450 / Caja 48IST', model: 'caja 48', voltage: '12V', cca: '660', warranty: '15 meses', price: '$420.000', polarity: 'Derecha', reserveCapacity: '118' },
  { id: 16, brand: 'MAC', name: 'Mac Silver 1250 / Caja 48ST', model: 'caja 48ST', voltage: '12V', cca: '660', warranty: '15 meses', price: '$420.000', polarity: 'Izquierda', reserveCapacity: '118' },
  { id: 17, brand: 'MAC', name: 'Mac Silver 950 / Caja 34RST', model: 'caja 34RST', voltage: '12V', cca: '550', warranty: '15 meses', price: '$400.000', polarity: 'Derecha', reserveCapacity: '100' },
  { id: 18, brand: 'MAC', name: 'Mac Silver 950 / Caja 34ST', model: 'caja 34ST', voltage: '12V', cca: '550', warranty: '15 meses', price: '$400.000', polarity: 'Izquierda', reserveCapacity: '100' },
  { id: 19, brand: 'MAC', name: 'Mac Silver 1100 / Caja 34RST', model: 'caja 34RST', voltage: '12V', cca: '650', warranty: '15 meses', price: '$470.000', polarity: 'Derecha', reserveCapacity: '120' },
  { id: 20, brand: 'MAC', name: 'Mac Silver 1100 / Caja 34ST', model: 'caja 34ST', voltage: '12V', cca: '650', warranty: '15 meses', price: '$470.000', polarity: 'Izquierda', reserveCapacity: '120' },
  { id: 21, brand: 'MAC', name: 'Mac Silver 950 / Caja LN2-950', model: 'caja LN2950', voltage: '12V', cca: '520', warranty: '15 meses', price: '$420.000', polarity: 'Derecha', reserveCapacity: '100' },
  { id: 22, brand: 'MAC', name: 'Mac Silver 1100 / Caja 651100', model: 'caja 651100', voltage: '12V', cca: '600', warranty: '15 meses', price: '$530.000', polarity: 'Derecha', reserveCapacity: '115' },
  { id: 23, brand: 'MAC', name: 'Mac Silver 900 / Caja 85900', model: 'caja 85900', voltage: '12V', cca: '520', warranty: '15 meses', price: '$400.000', polarity: 'Derecha', reserveCapacity: '86' },
  { id: 24, brand: 'MAC', name: 'Mac Silver 900 / Caja 86900', model: 'caja 86900', voltage: '12V', cca: '520', warranty: '15 meses', price: '$430.000', polarity: 'Izquierda', reserveCapacity: '86' },
  { id: 25, brand: 'MAC', name: 'Mac Silver 1200 / Caja 94R', model: 'caja 94R', voltage: '12V', cca: '800', warranty: '15 meses', price: '$650.000', polarity: 'Derecha', reserveCapacity: '140' },
  { id: 26, brand: 'MAC', name: 'Mac Silver 1200 / Caja 27R', model: 'caja 27R', voltage: '12V', cca: '710', warranty: '15 meses', price: '$530.000', polarity: 'Derecha', reserveCapacity: '150' },
  { id: 27, brand: 'MAC', name: 'Mac Silver 1150 / Caja 271150', model: 'caja 271150', voltage: '12V', cca: '710', warranty: '15 meses', price: '$520.000', polarity: 'Izquierda', reserveCapacity: '150' },
  { id: 28, brand: 'MAC', name: 'Mac Silver 1300 / Caja 31H Poste', model: 'caja 31H Poste', voltage: '12V', cca: '800', warranty: '15 meses', price: '$500.000', polarity: 'Izquierda', reserveCapacity: '150' },
  { id: 29, brand: 'MAC', name: 'Mac Silver 1300 / Caja 31H Tornillo', model: 'caja 31H Tornillo', voltage: '12V', cca: '800', warranty: '15 meses', price: '$540.000', polarity: 'Izquierda', reserveCapacity: '180' },
  { id: 30, brand: 'MAC', name: 'Mac Gold 900 / Caja L1', model: 'caja L1ST', voltage: '12V', cca: '420', warranty: '18 meses', price: '$380.000', polarity: 'Derecha', reserveCapacity: '75' },
  { id: 31, brand: 'MAC', name: 'Mac Gold 850 / Caja NS60ZL', model: 'caja NS60ZL', voltage: '12V', cca: '490', warranty: '18 meses', price: '$400.000', polarity: 'Derecha', reserveCapacity: '85' },
  { id: 32, brand: 'MAC', name: 'Mac Gold 850 / Caja NS60Z', model: 'caja NS60Z', voltage: '12V', cca: '490', warranty: '18 meses', price: '$400.000', polarity: 'Izquierda', reserveCapacity: '85' },
  { id: 33, brand: 'MAC', name: 'Mac Gold 1000 / Caja 42IST', model: 'caja 42', voltage: '12V', cca: '550', warranty: '18 meses', price: '$420.000', polarity: 'Derecha', reserveCapacity: '100' },
  { id: 34, brand: 'MAC', name: 'Mac Gold 1300 / Caja 48IST', model: 'caja 48', voltage: '12V', cca: '660', warranty: '18 meses', price: '$480.000', polarity: 'Derecha', reserveCapacity: '118' },
  { id: 35, brand: 'MAC', name: 'Mac Gold 1200 / Caja 34RST', model: 'caja 34RST', voltage: '12V', cca: '680', warranty: '18 meses', price: '$560.000', polarity: 'Derecha', reserveCapacity: '135' },
  { id: 36, brand: 'MAC', name: 'Mac Gold 1200 / Caja 34ST', model: 'caja 34ST', voltage: '12V', cca: '680', warranty: '18 meses', price: '$560.000', polarity: 'Izquierda', reserveCapacity: '135' },
  { id: 37, brand: 'MAC', name: 'Mac Gold 1300 / Caja 27R', model: 'caja 27R', voltage: '12V', cca: '710', warranty: '18 meses', price: '$650.000', polarity: 'Derecha', reserveCapacity: '150' },
  { id: 38, brand: 'MAC', name: 'Mac Gold 1300 / Caja 27', model: 'caja 27', voltage: '12V', cca: '710', warranty: '18 meses', price: '$60.000', polarity: 'Izquierda', reserveCapacity: '150' },
  { id: 39, brand: 'MAC', name: 'Mac Gold 1400 / Caja LN3', model: 'caja LN31', voltage: '12V', cca: '730', warranty: '18 meses', price: '$580.000', polarity: 'Derecha', reserveCapacity: '115' },
  { id: 40, brand: 'MAC', name: 'Mac Silver AGM / Caja LN2', model: 'caja LN2A', voltage: '12V', cca: '680', warranty: '24 meses', price: '$880.000', polarity: 'Derecha', reserveCapacity: 'N/A' },
  { id: 41, brand: 'MAC', name: 'Mac Silver AGM 760 / Caja LN3', model: 'caja LN3A', voltage: '12V', cca: '760', warranty: '24 meses', price: '$1.100.000', polarity: 'Derecha', reserveCapacity: 'N/A' },
  { id: 42, brand: 'MAC', name: 'Mac Silver AGM / Caja LN4', model: 'caja LN4', voltage: '12V', cca: '800', warranty: '24 meses', price: '$1.200.000', polarity: 'Derecha', reserveCapacity: 'N/A' },
  { id: 43, brand: 'MAC', name: 'SILVER AGM caja LN5', model: 'caja LN5', voltage: '12V', cca: '900', warranty: '24 meses', price: '$1.300.000', polarity: 'Derecha', reserveCapacity: 'N/A' },
];

const willardBatteries = [
  { id: 101, brand: 'WILLARD', name: 'EXTREMA 560/ Caja NS40D560PD', model: '560', caja: 'NS40', voltage: '12V', cca: '310', warranty: '12 meses', price: '$180.000', polarity: 'Derecha', reserveCapacity: '60' },
  { id: 102, brand: 'WILLARD', name: 'EXTREMA 670 / Caja NS40D670K', model: '670', caja: 'NS40', voltage: '12V', cca: '310', warranty: '12 meses', price: '$220.000', polarity: 'Derecha', reserveCapacity: '60' },
  { id: 103, brand: 'WILLARD', name: 'EXTREMA 850 / Caja 24BD850', model: '850', caja: '24', voltage: '12V', cca: '500', warranty: '12 meses', price: '$270.000', polarity: 'Derecha', reserveCapacity: '90' },
  { id: 104, brand: 'WILLARD', name: 'EXTREMA 850/ Caja 42BD850', model: '850', caja: '42', voltage: '12V', cca: '500', warranty: '12 meses', price: '$270.000', polarity: 'Derecha', reserveCapacity: '90' },
  { id: 105, brand: 'WILLARD', name: 'EXTREMA 1000/ Caja 34D/I-1000', model: '1000', caja: '34', voltage: '12V', cca: '550', warranty: '12 meses', price: '$350.000', polarity: 'Derecha', reserveCapacity: '96' },
  { id: 106, brand: 'WILLARD', name: 'CAMBIO INMEDIATO 950 / Caja 24BD950', model: '950', caja: '24', voltage: '12V', cca: '500', warranty: '12 meses', price: '$360.000', polarity: 'Derecha', reserveCapacity: '92' },
  { id: 107, brand: 'WILLARD', name: 'CAMBIO INMEDIATO 1000/ Caja 24BD1000', model: '1000', caja: '24', voltage: '12V', cca: '550', warranty: '18 meses', price: '$400.000', polarity: 'Derecha', reserveCapacity: '95' },
  { id: 108, brand: 'WILLARD', name: 'CAMBIO INMEDIATO 1000/ Caja 42D1000', model: '1000', caja: '42', voltage: '12V', cca: '550', warranty: '18 meses', price: '$420.000', polarity: 'Derecha', reserveCapacity: '95' },
  { id: 109, brand: 'WILLARD', name: 'CAMBIO INMEDIATO 800 / Caja 35800', model: '800', caja: '35', voltage: '12V', cca: '525', warranty: '15 meses', price: '$460.000', polarity: 'Derecha', reserveCapacity: '105' },
  { id: 110, brand: 'WILLARD', name: 'CAMBIO INMEDIATO 1100/ Caja 34D/I-1100', model: '1100', caja: '34', voltage: '12V', cca: '645', warranty: '15 meses', price: '$540.000', polarity: 'Derecha', reserveCapacity: '120' },
  { id: 111, brand: 'WILLARD', name: 'EXTREMA 1150/ Caja 31H1150', model: '1150', caja: '31H', voltage: '12V', cca: '700', warranty: '12 meses', price: '$420.000', polarity: 'Derecha', reserveCapacity: '170' },
  { id: 112, brand: 'WILLARD', name: 'CAMBIO INMEDIATO 1150/ Caja 27AD/AI-1150', model: '1150', caja: '27', voltage: '12V', cca: '700', warranty: '15 meses', price: '$520.000', polarity: 'Derecha', reserveCapacity: '145' },
  { id: 113, brand: 'WILLARD', name: 'CAMBIO INMEDIATO 1300/ Caja 48D1300', model: '1300', caja: '48', voltage: '12V', cca: '600', warranty: '18 meses', price: '$500.000', polarity: 'Derecha', reserveCapacity: '105' },
  { id: 114, brand: 'WILLARD', name: 'WILLARD ESBIC 680 /Caja 42D', model: '680', caja: '42', voltage: '12V', cca: '370', warranty: '12 meses', price: '$200.000', polarity: 'Derecha', reserveCapacity: '60' },
];

function parseWarrantyMonths(warranty: string): number {
  const match = warranty.match(/(\d+)\s*meses?/i);
  return match ? parseInt(match[1], 10) : 12;
}

function generateCode(brand: string, name: string, id: number): string {
  const brandPrefix = brand === 'MAC' ? 'MAC' : 'WIL';
  const namePart = name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20).toUpperCase();
  return `${brandPrefix}-${namePart}-${id}`;
}

async function main() {
  console.log('Seeding products...');

  const org = await prisma.organization.findFirst({
    where: { status: 'ACTIVE' },
  });

  if (!org) {
    console.error('No active organization found. Create one first.');
    process.exit(1);
  }

  console.log(`Using organization: ${org.name} (${org.id})`);

  const allBatteries = [...macBatteries, ...willardBatteries];

  for (const battery of allBatteries) {
    const warrantyMonths = parseWarrantyMonths(battery.warranty);
    const code = generateCode(battery.brand, battery.name, battery.id);

    try {
      await prisma.product.upsert({
        where: {
          organizationId_code: {
            organizationId: org.id,
            code,
          },
        },
        update: {
          name: battery.name,
          category: battery.brand,
          status: 'ACTIVE',
          warrantyMonths,
          updatedAt: new Date(),
        },
        create: {
          organizationId: org.id,
          code,
          name: battery.name,
          category: battery.brand,
          status: 'ACTIVE',
          warrantyMonths,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      console.log(`  ✓ ${code} - ${battery.name} (${warrantyMonths} meses)`);
    } catch (error) {
      console.error(`  ✗ Failed to seed ${code}:`, error);
    }
  }

  console.log('Product seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });