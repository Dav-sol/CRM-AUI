import 'dotenv/config';
import { PrismaClient, TemplateCategory, TemplateTone, TemplateAngle } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();

const ORG_SLUG = 'baterias-del-caribe';
const DEMO_PASSWORD = 'Demo12345!';
const BCRYPT_COST = 12;
const FLAGSHIP_MAX_CUSTOMERS = 100;

type HeroPurchaseSpec = {
  // Days from "now" until the warranty expires (negative = already expired).
  expiryOffsetDays: number;
  warrantyMonths: 12 | 15 | 18 | 24;
  quantity: number;
  value: string;
};

type Hero = {
  codcli: string;
  name: string;
  city: string;
  phone: string;
  email: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  purchases: HeroPurchaseSpec[];
};

// Demo curada (playbook): cada cliente cuenta una historia distinta del ciclo
// de vida de la batería. `expiryOffsetDays` ubica el vencimiento de la garantía
// relativo a hoy para que los journeys se vean en vivo.
const HEROES: Hero[] = [
  {
    codcli: 'DEMO-0001',
    name: 'Carlos Mendoza',
    city: 'Barranquilla',
    phone: '+57 300 111 2233',
    email: 'carlos.mendoza@example.com',
    purchases: [
      // Recomprador: 2 compras → 2 ciclos activos (AU-003: no se cancela el previo).
      { expiryOffsetDays: 30, warrantyMonths: 12, quantity: 1, value: '270000.00' },
      { expiryOffsetDays: 355, warrantyMonths: 12, quantity: 1, value: '300000.00' },
    ],
  },
  {
    codcli: 'DEMO-0002',
    name: 'María Torres',
    city: 'Cartagena',
    phone: '+57 301 444 5566',
    email: 'maria.torres@example.com',
    purchases: [
      { expiryOffsetDays: 355, warrantyMonths: 12, quantity: 1, value: '290000.00' },
    ],
  },
  {
    codcli: 'DEMO-0003',
    name: 'Luis Pérez',
    city: 'Santa Marta',
    phone: '+57 302 555 6677',
    email: 'luis.perez@example.com',
    purchases: [
      { expiryOffsetDays: 715, warrantyMonths: 24, quantity: 1, value: '880000.00' },
    ],
  },
  {
    codcli: 'DEMO-0004',
    name: 'Ana Gómez',
    city: 'Soledad',
    phone: '+57 303 666 7788',
    email: 'ana.gomez@example.com',
    purchases: [
      // Mitad de garantía 12 meses (Mes 6 → D-180).
      { expiryOffsetDays: 180, warrantyMonths: 12, quantity: 1, value: '320000.00' },
    ],
  },
  {
    codcli: 'DEMO-0005',
    name: 'Jorge Ramírez',
    city: 'Barranquilla',
    phone: '+57 304 777 8899',
    email: 'jorge.ramirez@example.com',
    purchases: [
      { expiryOffsetDays: 225, warrantyMonths: 15, quantity: 1, value: '460000.00' },
    ],
  },
  {
    codcli: 'DEMO-0006',
    name: 'Diana Castro',
    city: 'Cartagena',
    phone: '+57 305 888 9900',
    email: 'diana.castro@example.com',
    purchases: [
      { expiryOffsetDays: 270, warrantyMonths: 18, quantity: 1, value: '420000.00' },
    ],
  },
  {
    codcli: 'DEMO-0007',
    name: 'Pedro Díaz',
    city: 'Malambo',
    phone: '+57 306 999 0011',
    email: 'pedro.diaz@example.com',
    purchases: [
      { expiryOffsetDays: 360, warrantyMonths: 24, quantity: 1, value: '650000.00' },
    ],
  },
  {
    codcli: 'DEMO-0008',
    name: 'Sofía Rodríguez',
    city: 'Barranquilla',
    phone: '+57 307 111 2234',
    email: 'sofia.rodriguez@example.com',
    purchases: [
      // Próximo a vencer: D-60.
      { expiryOffsetDays: 60, warrantyMonths: 12, quantity: 1, value: '350000.00' },
    ],
  },
  {
    codcli: 'DEMO-0009',
    name: 'Andrés López',
    city: 'Cartagena',
    phone: '+57 308 222 3345',
    email: 'andres.lopez@example.com',
    purchases: [
      // Próximo a vencer: D-30.
      { expiryOffsetDays: 30, warrantyMonths: 12, quantity: 1, value: '270000.00' },
    ],
  },
  {
    codcli: 'DEMO-0010',
    name: 'Laura Martínez',
    city: 'Santa Marta',
    phone: '+57 309 333 4456',
    email: 'laura.martinez@example.com',
    purchases: [
      { expiryOffsetDays: 30, warrantyMonths: 15, quantity: 1, value: '540000.00' },
    ],
  },
  {
    codcli: 'DEMO-0011',
    name: 'Camilo Rojas',
    city: 'Soledad',
    phone: '+57 310 444 5567',
    email: 'camilo.rojas@example.com',
    purchases: [
      { expiryOffsetDays: 60, warrantyMonths: 24, quantity: 1, value: '780000.00' },
    ],
  },
  {
    codcli: 'DEMO-0012',
    name: 'Valentina Morales',
    city: 'Barranquilla',
    phone: '+57 311 555 6678',
    email: 'valentina.morales@example.com',
    purchases: [
      // Garantía vencida hace 30 días → conversión de recompra hoy.
      { expiryOffsetDays: -30, warrantyMonths: 12, quantity: 1, value: '310000.00' },
    ],
  },
  {
    codcli: 'DEMO-0013',
    name: 'Felipe Torres',
    city: 'Cartagena',
    phone: '+57 312 666 7789',
    email: 'felipe.torres@example.com',
    purchases: [
      // Vencido hace ~90 días → post-garantía / renovación.
      { expiryOffsetDays: -90, warrantyMonths: 24, quantity: 1, value: '900000.00' },
    ],
  },
  {
    codcli: 'DEMO-0014',
    name: 'Martín Peña',
    city: 'Soledad',
    phone: '+57 313 777 8890',
    email: 'martin.pena@example.com',
    purchases: [
      { expiryOffsetDays: -75, warrantyMonths: 12, quantity: 1, value: '280000.00' },
    ],
  },
  {
    codcli: 'DEMO-0015',
    name: 'Carmen Duarte',
    city: 'Barranquilla',
    phone: '+57 314 888 9901',
    email: 'carmen.duarte@example.com',
    purchases: [
      { expiryOffsetDays: -120, warrantyMonths: 12, quantity: 1, value: '340000.00' },
    ],
  },
  {
    codcli: 'DEMO-0016',
    name: 'Natalia Ríos',
    city: 'Santa Marta',
    phone: '+57 315 999 0012',
    email: 'natalia.rios@example.com',
    status: 'INACTIVE',
    purchases: [
      // Inactiva: última compra hace ~28 meses.
      { expiryOffsetDays: -420, warrantyMonths: 12, quantity: 1, value: '300000.00' },
    ],
  },
  {
    codcli: 'DEMO-0017',
    name: 'Óscar Herrera',
    city: 'Malambo',
    phone: '+57 316 111 2235',
    email: 'oscar.herrera@example.com',
    status: 'INACTIVE',
    purchases: [
      { expiryOffsetDays: -540, warrantyMonths: 24, quantity: 1, value: '700000.00' },
    ],
  },
  {
    codcli: 'DEMO-0018',
    name: 'Gabriela Vargas',
    city: 'Barranquilla',
    phone: '+57 317 222 3346',
    email: 'gabriela.vargas@example.com',
    purchases: [
      { expiryOffsetDays: 120, warrantyMonths: 12, quantity: 1, value: '320000.00' },
    ],
  },
  {
    codcli: 'DEMO-0019',
    name: 'Roberto Silva',
    city: 'Cartagena',
    phone: '+57 318 333 4457',
    email: 'roberto.silva@example.com',
    status: 'BLOCKED',
    purchases: [
      { expiryOffsetDays: -200, warrantyMonths: 12, quantity: 1, value: '290000.00' },
    ],
  },
  {
    codcli: 'DEMO-0020',
    name: 'Daniela Ortega',
    city: 'Santa Marta',
    phone: '+57 319 444 5568',
    email: 'daniela.ortega@example.com',
    purchases: [
      { expiryOffsetDays: 335, warrantyMonths: 15, quantity: 1, value: '480000.00' },
    ],
  },
];

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
  // Playbook §29: batería de 12 meses → mitad de ciclo Mes 6 (D-180).
  {
    name: 'Secuencia Demo — Journey Garantía 12 meses',
    description:
      'Journey de vida de la batería de 12 meses (playbook: bienvenida, revisión mitad de garantía, prevención D-60, preparación D-30, vencimiento y post-garantía).',
    warrantyMonths: 12,
    stages: [
      {
        name: 'Bienvenida y satisfacción (D0)',
        anchor: 'PURCHASE_DATE',
        offsetDays: 0,
        template:
          'Hola {customerName}, gracias por confiar en {organizationName}. Tu batería {productName} quedó instalada y con garantía activa. ¿Todo funciona correctamente? Ante cualquier consulta estamos a tu disposición.',
      },
      {
        name: 'Revisión mitad de garantía (Mes 6)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -180,
        template:
          'Hola {customerName}, tu batería {productName} completó la mitad de su garantía. Te recomendamos una revisión gratuita de alternador y voltaje en la fábrica o taller autorizado del fabricante para prevenir inconvenientes.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} está fuera de su ciclo recomendado. Podemos revisar su estado y, si corresponde, ofrecerte una opción de renovación.',
      },
      {
        name: 'Prevención pre-vencimiento (D-60)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -60,
        template:
          'Hola {customerName}, tu batería {productName} tiene la garantía próxima a vencer. Te invitamos a una revisión preventiva de diagnóstico para asegurar su buen estado.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} está fuera de su ciclo recomendado. Podemos ayudarte a revisar su estado.',
      },
      {
        name: 'Preparación para renovación (D-30)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -30,
        template:
          'Hola {customerName}, en 30 días vence la garantía de tu batería {productName}. En {organizationName} podemos revisarla y asesorarte sobre el mejor momento para tu próxima batería, sin compromiso.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} ya superó su garantía. Las baterías pueden durar más que su garantía; si notas fallas, podemos revisarla y asesorarte.',
      },
      {
        name: 'Vencimiento de garantía (D0)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: 0,
        template:
          'Hola {customerName}, hoy vence la garantía de tu batería {productName}. Una batería fuera de garantía no implica que deba reemplazarse: podemos revisar su estado en nuestro taller y orientarte con datos reales.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} venció su garantía. Sin asumir un reemplazo, podemos revisar su estado y, si corresponde, ofrecerte una opción de renovación.',
      },
      {
        name: 'Post-garantía / oportunidad de renovación (+90d)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: 90,
        template:
          'Hola {customerName}, queremos saber cómo sigue tu batería {productName}. Si notaste fallas al arrancar o menor rendimiento, en {organizationName} podemos diagnosticarla y recomendarte la mejor opción.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} ya lleva tiempo fuera de garantía. Podemos revisarla y, si lo necesitas, ofrecerte una opción de renovación acorde a tu vehículo.',
      },
    ],
  },
  // Playbook §9: 15 meses → mitad Mes 8 (D-210).
  {
    name: 'Secuencia Demo — Journey Garantía 15 meses',
    description:
      'Journey de vida de la batería de 15 meses (playbook §9).',
    warrantyMonths: 15,
    stages: [
      {
        name: 'Bienvenida y satisfacción (D0)',
        anchor: 'PURCHASE_DATE',
        offsetDays: 0,
        template:
          'Hola {customerName}, gracias por confiar en {organizationName}. Tu batería {productName} quedó instalada y con garantía activa. ¿Todo funciona correctamente?',
      },
      {
        name: 'Revisión mitad de garantía (Mes 8)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -210,
        template:
          'Hola {customerName}, tu batería {productName} completó parte de su garantía. Te recomendamos una revisión gratuita de alternador y voltaje en la fábrica o taller autorizado del fabricante.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} está fuera de su ciclo recomendado. Podemos revisar su estado y asesorarte.',
      },
      {
        name: 'Prevención pre-vencimiento (D-60)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -60,
        template:
          'Hola {customerName}, tu batería {productName} tiene la garantía próxima a vencer. Te invitamos a una revisión preventiva de diagnóstico.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} está fuera de su ciclo recomendado. Podemos ayudarte a revisar su estado.',
      },
      {
        name: 'Preparación para renovación (D-30)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -30,
        template:
          'Hola {customerName}, en 30 días vence la garantía de tu batería {productName}. En {organizationName} podemos revisarla y asesorarte sin compromiso.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} ya superó su garantía. Si notas fallas, podemos revisarla y asesorarte.',
      },
      {
        name: 'Vencimiento de garantía (D0)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: 0,
        template:
          'Hola {customerName}, hoy vence la garantía de tu batería {productName}. Sin asumir un reemplazo, podemos revisar su estado y orientarte con datos reales.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} venció su garantía. Podemos revisar su estado y, si corresponde, ofrecerte una opción de renovación.',
      },
    ],
  },
  // Playbook §9: 18 meses → mitad Mes 9 (D-270).
  {
    name: 'Secuencia Demo — Journey Garantía 18 meses',
    description:
      'Journey de vida de la batería de 18 meses (playbook §9).',
    warrantyMonths: 18,
    stages: [
      {
        name: 'Bienvenida y satisfacción (D0)',
        anchor: 'PURCHASE_DATE',
        offsetDays: 0,
        template:
          'Hola {customerName}, gracias por confiar en {organizationName}. Tu batería {productName} quedó instalada y con garantía activa. ¿Todo funciona correctamente?',
      },
      {
        name: 'Revisión mitad de garantía (Mes 9)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -270,
        template:
          'Hola {customerName}, tu batería {productName} completó parte de su garantía. Te recomendamos una revisión gratuita de alternador y voltaje en la fábrica o taller autorizado del fabricante.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} está fuera de su ciclo recomendado. Podemos revisar su estado y asesorarte.',
      },
      {
        name: 'Prevención pre-vencimiento (D-60)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -60,
        template:
          'Hola {customerName}, tu batería {productName} tiene la garantía próxima a vencer. Te invitamos a una revisión preventiva de diagnóstico.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} está fuera de su ciclo recomendado. Podemos ayudarte a revisar su estado.',
      },
      {
        name: 'Preparación para renovación (D-30)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -30,
        template:
          'Hola {customerName}, en 30 días vence la garantía de tu batería {productName}. En {organizationName} podemos revisarla y asesorarte sin compromiso.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} ya superó su garantía. Si notas fallas, podemos revisarla y asesorarte.',
      },
      {
        name: 'Vencimiento de garantía (D0)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: 0,
        template:
          'Hola {customerName}, hoy vence la garantía de tu batería {productName}. Sin asumir un reemplazo, podemos revisar su estado y orientarte con datos reales.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} venció su garantía. Podemos revisar su estado y, si corresponde, ofrecerte una opción de renovación.',
      },
    ],
  },
  // Playbook §30: batería de 24 meses → mitad Mes 12 (D-360).
  {
    name: 'Secuencia Demo — Journey Garantía 24 meses',
    description:
      'Journey de vida de la batería de 24 meses (playbook: satisfacción D0, revisión intermedia Mes 12, prevención D-60, preparación D-30, vencimiento y post-garantía).',
    warrantyMonths: 24,
    stages: [
      {
        name: 'Bienvenida y satisfacción (D0)',
        anchor: 'PURCHASE_DATE',
        offsetDays: 0,
        template:
          'Hola {customerName}, gracias por confiar en {organizationName}. Tu batería {productName} quedó instalada y con garantía activa. ¿Todo funciona correctamente?',
      },
      {
        name: 'Revisión mitad de garantía (Mes 12)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -360,
        template:
          'Hola {customerName}, tu batería {productName} completó la mitad de su garantía. Te recomendamos una revisión gratuita de alternador y voltaje en la fábrica o taller autorizado del fabricante para prevenir inconvenientes.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} está fuera de su ciclo recomendado. Podemos revisar su estado y asesorarte.',
      },
      {
        name: 'Prevención pre-vencimiento (D-60)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -60,
        template:
          'Hola {customerName}, tu batería {productName} tiene la garantía próxima a vencer. Te invitamos a una revisión preventiva de diagnóstico para asegurar su buen estado.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} está fuera de su ciclo recomendado. Podemos ayudarte a revisar su estado.',
      },
      {
        name: 'Preparación para renovación (D-30)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: -30,
        template:
          'Hola {customerName}, en 30 días vence la garantía de tu batería {productName}. En {organizationName} podemos revisarla y asesorarte sobre el mejor momento para tu próxima batería, sin compromiso.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} ya superó su garantía. Las baterías pueden durar más que su garantía; si notas fallas, podemos revisarla y asesorarte.',
      },
      {
        name: 'Vencimiento de garantía (D0)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: 0,
        template:
          'Hola {customerName}, hoy vence la garantía de tu batería {productName}. Una batería fuera de garantía no implica que deba reemplazarse: podemos revisar su estado en nuestro taller y orientarte con datos reales.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} venció su garantía. Sin asumir un reemplazo, podemos revisar su estado y, si corresponde, ofrecerte una opción de renovación.',
      },
      {
        name: 'Post-garantía / oportunidad de renovación (+90d)',
        anchor: 'WARRANTY_EXPIRY',
        offsetDays: 90,
        template:
          'Hola {customerName}, queremos saber cómo sigue tu batería {productName}. Si notaste fallas al arrancar o menor rendimiento, en {organizationName} podemos diagnosticarla y recomendarte la mejor opción.',
        templateOnPast:
          'Hola {customerName}, tu batería {productName} ya lleva tiempo fuera de garantía. Podemos revisarla y, si lo necesitas, ofrecerte una opción de renovación acorde a tu vehículo.',
      },
    ],
  },
];

const CAMPAIGNS = [
  {
    name: 'Journey Postventa — Garantía 12 meses',
    description:
      'Ciclo de vida de la batería de 12 meses: bienvenida, revisión mitad de garantía, prevención, vencimiento y post-garantía.',
    type: 'REPURCHASE' as const,
    status: 'ACTIVE' as const,
    segment: { warrantyMonths: 12 },
    sequenceName: 'Secuencia Demo — Journey Garantía 12 meses',
    startAt: addDays(new Date(), -30),
    template:
      'Hola {customerName}, tu batería {productName} tiene garantía activa. Seguimos su ciclo para cuidar tu inversión.',
  },
  {
    name: 'Journey Postventa — Garantía 24 meses',
    description:
      'Ciclo de vida de la batería de 24 meses: bienvenida, revisión intermedia, prevención, vencimiento y post-garantía.',
    type: 'REPURCHASE' as const,
    status: 'APPROVED' as const,
    segment: { warrantyMonths: 24 },
    sequenceName: 'Secuencia Demo — Journey Garantía 24 meses',
    startAt: addDays(new Date(), 7),
    template:
      'Hola {customerName}, tu batería {productName} tiene garantía activa. Seguimos su ciclo para cuidar tu inversión.',
  },
  {
    name: 'Journey Postventa — Garantía 15 meses',
    description: 'Ciclo de vida de la batería de 15 meses (playbook §9).',
    type: 'REPURCHASE' as const,
    status: 'DRAFT' as const,
    segment: { warrantyMonths: 15 },
    sequenceName: 'Secuencia Demo — Journey Garantía 15 meses',
    startAt: addDays(new Date(), 14),
    template:
      'Hola {customerName}, tu batería {productName} tiene garantía activa.',
  },
  {
    name: 'Journey Postventa — Garantía 18 meses',
    description: 'Ciclo de vida de la batería de 18 meses (playbook §9).',
    type: 'REPURCHASE' as const,
    status: 'DRAFT' as const,
    segment: { warrantyMonths: 18 },
    sequenceName: 'Secuencia Demo — Journey Garantía 18 meses',
    startAt: addDays(new Date(), 14),
    template:
      'Hola {customerName}, tu batería {productName} tiene garantía activa.',
  },
  {
    name: 'Reactivación de clientes inactivos',
    description:
      'Clientes sin compras recientes (>24 meses) con una razón concreta para volver a contactarlos.',
    type: 'MANUAL' as const,
    status: 'APPROVED' as const,
    segment: {
      purchaseTo: addMonths(new Date(), -24).toISOString().slice(0, 10),
    },
    sequenceName: null,
    startAt: addDays(new Date(), 3),
    template:
      'Hola {customerName}, hace tiempo que no te contactamos. Queremos saber cómo está tu batería {productName} y si necesita una revisión.',
  },
  {
    name: 'Recompra — Oportunidades de fin de año',
    description:
      'Clientes de Barranquilla con oportunidad real de renovación (señal comercial, no asumir reemplazo).',
    type: 'REPURCHASE' as const,
    status: 'APPROVED' as const,
    segment: { city: 'Barranquilla' },
    sequenceName: null,
    startAt: addDays(new Date(), 10),
    template:
      'Hola {customerName}, en {organizationName} preparamos opciones para tu próximo cambio de {productName}.',
  },
  {
    name: 'Campaña pausada',
    description: 'Ejemplo de campaña pausada (sin envíos mientras no se reanude).',
    type: 'MANUAL' as const,
    status: 'PAUSED' as const,
    segment: { customerStatus: 'ACTIVE' },
    sequenceName: null,
    startAt: null,
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

// purchaseDate such that warrantyExpiresAt = purchaseDate + warrantyMonths lands
// `expiryOffsetDays` from today (negative = already expired).
function purchaseDateForExpiry(
  expiryOffsetDays: number,
  warrantyMonths: number,
): Date {
  return addDays(addMonths(new Date(), -warrantyMonths), expiryOffsetDays);
}

// Demo desde 0: borrado físico (solo de la org demo) en orden de dependencias.
// Se conservan org, admin, catálogo de productos e historial de otras orgs.
async function resetDemoOrg(orgId: string): Promise<void> {
  const scoped = { organizationId: orgId };
  await prisma.message.deleteMany({ where: scoped });
  await prisma.conversationNote.deleteMany({ where: scoped });
  await prisma.conversationTagAssignment.deleteMany({ where: scoped });
  await prisma.conversation.deleteMany({ where: scoped });
  await prisma.conversationTag.deleteMany({ where: scoped });
  await prisma.automation.deleteMany({ where: scoped });
  await prisma.commercialCycle.deleteMany({
    where: { purchase: { organizationId: orgId } },
  });
  await prisma.purchase.deleteMany({ where: scoped });
  await prisma.customer.deleteMany({ where: scoped });
  await prisma.campaign.deleteMany({ where: scoped });
  await prisma.followUpSequenceStage.deleteMany({
    where: { sequence: { organizationId: orgId } },
  });
  await prisma.followUpSequence.deleteMany({ where: scoped });
  await prisma.quickReply.deleteMany({ where: scoped });
  await prisma.template.deleteMany({ where: scoped });
  await prisma.import.deleteMany({ where: scoped });
  await prisma.audit.deleteMany({ where: scoped });
  console.log('  ✓ Demo organization reset (hard delete, org-scoped)');
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
): Promise<Array<{ id: string; uuid: string; name: string; codcli: string }>> {
  const heroes: Array<{
    id: string;
    uuid: string;
    name: string;
    codcli: string;
  }> = [];
  for (const hero of HEROES) {
    const existing = await prisma.customer.findFirst({
      where: { organizationId: orgId, codcli: hero.codcli, deletedAt: null },
      select: { id: true, uuid: true, name: true, codcli: true },
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
        status: hero.status ?? 'ACTIVE',
        createdBy: 'seed-demo',
      },
      select: { id: true, uuid: true, name: true, codcli: true },
    });
    heroes.push(created);
    console.log(`  ✓ Hero customer ${hero.codcli} (${hero.name})`);
  }
  return heroes;
}

// Pool de productos por duración de garantía (playbook §9: 12/15/18/24).
async function ensureProductPool(
  orgId: string,
): Promise<Map<number, string[]>> {
  const pool = new Map<number, string[]>();
  const allProducts = await prisma.product.findMany({
    where: { organizationId: orgId, deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, warrantyMonths: true },
  });
  for (const warranty of [12, 15, 18, 24]) {
    let ids = allProducts
      .filter((product) => product.warrantyMonths === warranty)
      .slice(0, 3)
      .map((product) => product.id);
    if (ids.length === 0) {
      const candidates = allProducts.filter(
        (product) => product.warrantyMonths !== warranty,
      );
      for (const product of candidates.slice(0, 2)) {
        await prisma.product.update({
          where: { id: product.id },
          data: { warrantyMonths: warranty },
        });
        ids.push(product.id);
      }
    }
    pool.set(warranty, ids);
    console.log(
      `  ✓ Product pool warranty=${warranty} (${ids.length} referencias)`,
    );
  }
  return pool;
}

async function ensureHeroPurchases(
  orgId: string,
  heroes: Array<{ id: string; uuid: string }>,
  productPool: Map<number, string[]>,
): Promise<void> {
  let createdCount = 0;
  for (let h = 0; h < heroes.length; h++) {
    const hero = heroes[h];
    const heroSpec = HEROES[h];
    for (let p = 0; p < heroSpec.purchases.length; p++) {
      const spec = heroSpec.purchases[p];
      const bucket = productPool.get(spec.warrantyMonths) ?? [];
      const productId = bucket[p % Math.max(bucket.length, 1)];
      const purchaseDate = purchaseDateForExpiry(
        spec.expiryOffsetDays,
        spec.warrantyMonths,
      );
      const invoiceNumber = `DEMO-${hero.uuid.slice(0, 6).toUpperCase()}-${p + 1}`;
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
      createdCount++;
    }
  }
  console.log(`  ✓ Hero purchases created (${createdCount})`);
}


async function ensureSequences(orgId: string): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  for (const seq of SEQUENCES) {
    const existing = await prisma.followUpSequence.findFirst({
      where: { organizationId: orgId, name: seq.name, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      // Demo D2: refresh stages so the sequences always reflect the current
      // anchor model (PURCHASE_DATE + WARRANTY_EXPIRY + templateOnPast).
      await prisma.followUpSequenceStage.updateMany({
        where: { sequenceId: existing.id, deletedAt: null },
        data: { deletedAt: new Date(), deletedBy: 'seed-demo' },
      });
      await prisma.followUpSequenceStage.createMany({
        data: seq.stages.map((stage) => ({
          sequenceId: existing.id,
          name: stage.name,
          anchor: stage.anchor,
          offsetDays: stage.offsetDays,
          template: stage.template,
          templateOnPast: stage.templateOnPast,
        })),
      });
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
    template: string;
  }> = [];
  for (const camp of CAMPAIGNS) {
    const existing = await prisma.campaign.findFirst({
      where: { organizationId: orgId, name: camp.name, deletedAt: null },
      select: { id: true, uuid: true, name: true, status: true, template: true },
    });
    if (existing) {
      // Demo desde 0: refresca descripción/fechas/estado en re-ejecución.
      await prisma.campaign.update({
        where: { id: existing.id },
        data: {
          status: camp.status,
          startAt: camp.startAt,
          description: camp.description,
          followUpSequenceId: camp.sequenceName
            ? (sequenceIds.get(camp.sequenceName) ?? null)
            : null,
        },
      });
      campaigns.push(existing);
      continue;
    }
    const created = await prisma.campaign.create({
      data: {
        organizationId: orgId,
        name: camp.name,
        description: camp.description,
        type: camp.type,
        status: camp.status,
        startAt: camp.startAt,
        template: camp.template,
        segment: camp.segment,
        followUpSequenceId: camp.sequenceName
          ? (sequenceIds.get(camp.sequenceName) ?? null)
          : null,
      },
      select: {
        id: true,
        uuid: true,
        name: true,
        status: true,
        template: true,
      },
    });
    campaigns.push(created);
    console.log(`  ✓ Campaign "${camp.name}" [${camp.status}]`);
  }
  return campaigns;
}




async function generateFlagshipAutomations(
  orgId: string,
  campaign: { id: string },
  campaignTemplate: string,
  stages: Array<{
    name: string;
    anchor: 'PURCHASE_DATE' | 'WARRANTY_EXPIRY';
    offsetDays: number;
    template: string;
    templateOnPast: string | null;
  }>,
): Promise<void> {
  // Demo D2: refresh the flagship story. Soft-delete previous demo automations
  // and regenerate with the runtime semantics (anchor + recompra + omit).
  await prisma.automation.updateMany({
    where: { campaignId: campaign.id, deletedAt: null },
    data: { deletedAt: new Date(), deletedBy: 'seed-demo' },
  });

  const purchases = await prisma.purchase.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      warrantyMonths: 12,
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

  const now = new Date();
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

    // Mirrors the runtime HG-SEM-03 semantics (reference = now at generation):
    // past WARRANTY_EXPIRY stages become a single repurchase; past
    // PURCHASE_DATE stages are omitted; the rest are scheduled.
    let repurchase: {
      stage: (typeof stages)[number];
      computed: Date;
    } | null = null;

    for (const stage of stages) {
      if (stage.anchor === 'WARRANTY_EXPIRY' && !row.warrantyExpiresAt) {
        continue;
      }
      const base =
        stage.anchor === 'PURCHASE_DATE'
          ? row.purchaseDate
          : (row.warrantyExpiresAt as Date);
      const computed = addDays(base, stage.offsetDays);
      if (computed.getTime() < now.getTime()) {
        if (stage.anchor === 'WARRANTY_EXPIRY') {
          if (
            !repurchase ||
            computed.getTime() > repurchase.computed.getTime()
          ) {
            repurchase = { stage, computed };
          }
        }
        continue;
      }
      // F4 mirror: the repurchase conversion substitutes later post-warranty
      // recompra stages of the same purchase (one renovation contact).
      if (
        repurchase &&
        stage.anchor === 'WARRANTY_EXPIRY' &&
        stage.offsetDays > 0
      ) {
        continue;
      }
      await prisma.automation.create({
        data: {
          organizationId: orgId,
          purchaseId: row.id,
          campaignId: campaign.id,
          commercialCycleId: cycle.id,
          scheduledDate: computed,
          status: 'SCHEDULED',
          priority: 0,
          purpose: 'TRANSACTIONAL',
          stageName: stage.name,
          messageTemplate: stage.template,
          createdBy: 'seed-demo',
        },
      });
      createdCount++;
    }

    if (repurchase) {
      await prisma.automation.create({
        data: {
          organizationId: orgId,
          purchaseId: row.id,
          campaignId: campaign.id,
          commercialCycleId: cycle.id,
          scheduledDate: now,
          status: 'SCHEDULED',
          priority: 0,
          // La conversión de recompra es COMMERCIAL (anti-spam 3/60d).
          purpose: 'COMMERCIAL',
          stageName: 'Recompra / renovación',
          messageTemplate: repurchase.stage.templateOnPast ?? campaignTemplate,
          createdBy: 'seed-demo',
        },
      });
      createdCount++;
    }
  }
  console.log(
    `  ✓ Flagship campaign automations regenerated: ${createdCount} (${rows.length} clientes)`,
  );
}

// Demo D2: hide noise that hurts the demo narrative (org-scoped, reversible
// soft-delete). No global catalog changes.
async function hideDemoNoise(orgId: string): Promise<void> {
  const noise = await prisma.product.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      OR: [
        { name: { contains: 'BORNE DE BATERIA', mode: 'insensitive' } },
        { name: { contains: 'BORNES', mode: 'insensitive' } },
        { name: { contains: 'ADAPTADOR', mode: 'insensitive' } },
        { name: { contains: 'MARCO PARA', mode: 'insensitive' } },
        { name: { startsWith: 'CAJA ', mode: 'insensitive' } },
        { name: { contains: 'SERVICIO TALLER', mode: 'insensitive' } },
        { category: 'TUDOR' },
      ],
    },
    select: { id: true },
  });
  if (noise.length === 0) {
    return;
  }
  await prisma.product.updateMany({
    where: { id: { in: noise.map((p) => p.id) } },
    data: { deletedAt: new Date(), deletedBy: 'seed-demo' },
  });
  console.log(`  ✓ Demo noise hidden (soft-delete): ${noise.length} productos`);
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
        const base =
          stage.anchor === 'PURCHASE_DATE'
            ? purchase.purchaseDate
            : (purchase.warrantyExpiresAt ?? addMonths(new Date(), -6));
        const execDate = addDays(base, stage.offsetDays);
        // Only create EXECUTED automations with dates in the past
        if (execDate.getTime() > Date.now()) {
          continue;
        }
        await prisma.automation.create({
          data: {
            organizationId: orgId,
            purchaseId: purchase.id,
            campaignId: flagshipCampaignId,
            commercialCycleId: cycle.id,
            scheduledDate: execDate,
            executedDate: execDate,
            status: 'EXECUTED',
            stageName: stage.name,
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
        const scheduledDate = addDays(base, stage.offsetDays);
        // P0-2: nunca crear una automatización "Programada" con fecha pasada
        // (para héroes con garantía vencida el journey ya fue cubierto por la
        // conversión de recompra en generateFlagshipAutomations).
        if (scheduledDate.getTime() <= Date.now()) {
          continue;
        }
        await prisma.automation.create({
          data: {
            organizationId: orgId,
            purchaseId: purchase.id,
            campaignId: flagshipCampaignId,
            commercialCycleId: cycle.id,
            scheduledDate,
            status: 'SCHEDULED',
            priority: 0,
            stageName: stage.name,
            messageTemplate: stage.template,
            createdBy: 'seed-demo',
          },
        });
      }
    }
    console.log(`  ✓ Hero automations for ${hero.uuid}`);
  }
}

type ConvMsg = {
  dir: 'in' | 'out-auto' | 'out-manual';
  text: string;
  minsAgo: number;
  replyTo?: boolean; // escenario D: respuesta atribuida a la automatización.
};

// Matriz de escenarios (Fase 5, T18): la demo representa los flujos reales de
// conversación (empresa inicia, cliente inicia, respuesta a automatización,
// respuesta negativa, precio→oportunidad, compra, no contactar, manual).
const CONV_SCENARIOS: Record<string, ConvMsg[]> = {
  'DEMO-0001': [
    // A. Empresa inicia → cliente responde
    { dir: 'out-auto', text: 'Hola Carlos, queremos confirmar que todo esté funcionando correctamente con su batería.', minsAgo: 300 },
    { dir: 'in', text: 'Sí, todo bien, gracias.', minsAgo: 295 },
  ],
  'DEMO-0002': [
    // B. Empresa inicia → cliente no responde
    { dir: 'out-auto', text: 'Hola María, queremos confirmar que todo esté funcionando correctamente con su batería.', minsAgo: 600 },
  ],
  'DEMO-0003': [
    // C. Cliente inicia → asesor responde
    { dir: 'in', text: 'Hola, quiero cotizar una batería para mi camioneta. ¿Me pueden ayudar?', minsAgo: 240 },
    { dir: 'out-manual', text: '¡Hola Luis! Claro, con gusto. ¿Qué modelo de vehículo tienes?', minsAgo: 238 },
    { dir: 'in', text: 'Es una Silverado. ¿Cuánto cuesta la AGM?', minsAgo: 236 },
  ],
  'DEMO-0004': [
    // D. Cliente responde a una automatización (atribuida)
    { dir: 'out-auto', text: 'Hola Ana, tu batería completó la mitad de su garantía. Te recomendamos una revisión gratuita.', minsAgo: 180 },
    { dir: 'in', text: 'Sí, quiero agendar la revisión por favor.', minsAgo: 175, replyTo: true },
  ],
  'DEMO-0005': [
    // E. Cliente responde negativamente
    { dir: 'out-auto', text: 'Hola Jorge, tu batería tiene la garantía próxima a vencer. Te invitamos a una revisión preventiva.', minsAgo: 120 },
    { dir: 'in', text: 'Por ahora no necesito cambiarla, gracias.', minsAgo: 118 },
  ],
  'DEMO-0006': [
    // F. Cliente solicita precio → oportunidad comercial
    { dir: 'out-auto', text: 'Hola Diana, tu batería está en plena garantía. Te recordamos la revisión gratuita de alternador y voltaje.', minsAgo: 90 },
    { dir: 'in', text: '¿Cuánto vale una batería de caja 42? ¿Hacen financiación?', minsAgo: 88 },
  ],
  'DEMO-0007': [
    // G. Cliente compra (la venta se registra desde la conversación)
    { dir: 'in', text: 'Necesito una batería nueva urgente, se me dañó la de mi carro.', minsAgo: 45 },
    { dir: 'out-manual', text: '¡Hola Pedro! Tenemos disponibilidad hoy. ¿Cuál es el vehículo?', minsAgo: 43 },
    { dir: 'in', text: 'Es un Duster. ¿La tienen para hoy?', minsAgo: 41 },
  ],
  'DEMO-0008': [
    // H. Cliente solicita no recibir mensajes (opt-out)
    { dir: 'out-auto', text: 'Hola Sofía, tu batería tiene la garantía próxima a vencer. Te invitamos a una revisión preventiva.', minsAgo: 60 },
    { dir: 'in', text: 'Por favor no me escriban más, no estoy interesada.', minsAgo: 58 },
  ],
  'DEMO-0009': [
    // I. Conversación manual iniciada por el asesor
    { dir: 'out-manual', text: 'Hola Andrés, vimos que tu garantía vence pronto. ¿Quieres que te reservemos una revisión?', minsAgo: 30 },
    { dir: 'in', text: 'Gracias, me avisas cuándo puedo pasar.', minsAgo: 28 },
  ],
};

const GENERIC_CONVERSATIONS: ConvMsg[][] = [
  [
    { dir: 'in', text: 'Hola, ¿me pueden dar más información sobre el cambio de batería?', minsAgo: 400 },
    { dir: 'out-manual', text: '¡Hola! Con gusto te asesoramos. ¿Qué vehículo tienes?', minsAgo: 398 },
  ],
  [
    { dir: 'out-auto', text: 'Hola, gracias por confiar en nosotros. ¿Todo funciona correctamente con tu batería?', minsAgo: 500 },
    { dir: 'in', text: 'Sí, todo perfecto.', minsAgo: 497 },
  ],
  [
    { dir: 'in', text: 'Necesito una batería para un taxi, ¿qué me recomiendan?', minsAgo: 700 },
  ],
];

async function ensureHeroConversations(
  orgId: string,
  heroes: Array<{ id: string; uuid: string; name: string; codcli: string }>,
): Promise<void> {
  const flagship = await prisma.campaign.findFirst({
    where: { organizationId: orgId, name: 'Journey Postventa — Garantía 12 meses' },
    select: { uuid: true },
  });
  const automation = await prisma.automation.findFirst({
    where: {
      organizationId: orgId,
      deletedAt: null,
      campaignId: { not: null },
      status: 'EXECUTED',
    },
    orderBy: { executedDate: 'desc' },
    select: { uuid: true },
  });
  const campaignUuid = flagship?.uuid ?? null;
  const automationUuid = automation?.uuid ?? null;

  let genericIndex = 0;
  for (const hero of heroes) {
    const heroSpec = HEROES.find((h) => h.codcli === hero.codcli) ?? null;
    const scenario =
      CONV_SCENARIOS[heroSpec?.codcli ?? ''] ??
      GENERIC_CONVERSATIONS[genericIndex++ % GENERIC_CONVERSATIONS.length];

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

    for (let i = 0; i < scenario.length; i++) {
      const msg = scenario[i];
      const createdAt = new Date(Date.now() - msg.minsAgo * 60_000);
      const isOut = msg.dir !== 'in';
      await prisma.message.create({
        data: {
          organizationId: orgId,
          conversationId: conversation.id,
          type: (msg.dir === 'out-auto'
            ? 'AUTOMATIC'
            : msg.dir === 'out-manual'
              ? 'OUTGOING'
              : 'INCOMING') as never,
          direction: isOut ? 'OUTBOUND' : 'INBOUND',
          content: msg.text,
          status: 'SENT',
          providerMessageId: `demo-${hero.uuid}-${i}`,
          providerConversationId: `demo-conv-${hero.uuid}`,
          sentAt: createdAt,
          createdAt,
          ...(msg.replyTo
            ? {
                inReplyToCampaignId: campaignUuid,
                inReplyToAutomationId: automationUuid,
              }
            : {}),
        },
      });
    }
    console.log(
      `  ✓ Hero conversation for ${hero.uuid} (${scenario.length} mensajes)`,
    );
  }
}

// Demo activity (P0-3): registros de auditoría de negocio para que el feed del
// dashboard muestre eventos comerciales legibles, sin IDs internos. El backend
// humaniza las acciones; aquí solo se referencia la automatización real para
// que la descripción se enriquezca con el nombre del cliente.
async function seedDemoActivity(orgId: string): Promise<void> {
  const automations = await prisma.automation.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      status: 'EXECUTED',
      campaignId: { not: null },
    },
    orderBy: { executedDate: 'desc' },
    take: 3,
    select: { uuid: true },
  });

  const entries: Array<{
    module: string;
    action: string;
    description: string | null;
    metadata?: Record<string, unknown>;
  }> = [
    { module: 'purchases', action: 'purchase.create', description: 'Compra registrada' },
    { module: 'campaigns', action: 'campaign.activate', description: 'Campaña activada' },
    ...automations.map((automation) => ({
      module: 'whatsapp' as const,
      action: 'automation.executed' as const,
      description: null,
      metadata: { automationId: automation.uuid },
    })),
    { module: 'whatsapp', action: 'message.send', description: 'Mensaje enviado al cliente' },
    { module: 'conversations', action: 'conversation.opened', description: 'Conversación abierta' },
  ];

  const now = Date.now();
  await prisma.audit.createMany({
    data: entries.map((entry, index) => ({
      organizationId: orgId,
      module: entry.module,
      action: entry.action,
      description: entry.description ?? null,
      metadata: entry.metadata,
      createdAt: new Date(now - index * 60_000),
    })),
  });
  console.log(`  ✓ Demo activity seeded (${entries.length} eventos de negocio)`);
}

// ---------------------------------------------------------------------------
// Fase 2: Biblioteca de copy (150 piezas: 50 plantillas × 3 tonos).
// Se leen desde templates-seed.json generado por parse-biblioteca.mjs
// desde specs/Biblioteca/biblioteca.md.
// ---------------------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url));

interface TemplateSeedRow {
  code: string;
  name: string;
  group: string;
  category: string;
  tone: string;
  angle: string;
  goal: string | null;
  recommendedUse: string | null;
  body: string;
}

async function seedTemplates(orgId: string): Promise<void> {
  const raw: TemplateSeedRow[] = JSON.parse(
    readFileSync(join(here, 'templates-seed.json'), 'utf8'),
  );
  await prisma.template.deleteMany({ where: { organizationId: orgId } });
  const BATCH = 50;
  for (let i = 0; i < raw.length; i += BATCH) {
    const chunk = raw.slice(i, i + BATCH);
    await prisma.template.createMany({
      data: chunk.map((t) => ({
        organizationId: orgId,
        code: t.code,
        name: t.name,
        group: t.group,
        category: t.category as TemplateCategory,
        tone: t.tone as TemplateTone,
        angle: t.angle as TemplateAngle,
        goal: t.goal,
        recommendedUse: t.recommendedUse,
        body: t.body,
      })),
    });
  }
  console.log(`  ✓ Biblioteca de copy sembrada (${raw.length} plantillas)`);
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

  await resetDemoOrg(orgId);
  await ensureAdminPassword();

  await hideDemoNoise(orgId);

  const heroes = await ensureHeroes(orgId);
  const productPool = await ensureProductPool(orgId);
  await ensureHeroPurchases(orgId, heroes, productPool);

  const sequenceIds = await ensureSequences(orgId);
  const campaigns = await ensureCampaigns(orgId, sequenceIds);

  const flagshipName = 'Journey Postventa — Garantía 12 meses';
  const flagship = campaigns.find((c) => c.name === flagshipName);
  const seq12 = await prisma.followUpSequence.findFirst({
    where: {
      organizationId: orgId,
      name: 'Secuencia Demo — Journey Garantía 12 meses',
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
    await generateFlagshipAutomations(
      orgId,
      flagship,
      flagship.template,
      seq12.stages,
    );
    await ensureHeroAutomations(orgId, heroes, flagship.id, seq12.stages);
  }

  await ensureHeroConversations(orgId, heroes);
  await seedDemoActivity(orgId);
  await seedTemplates(orgId);

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
