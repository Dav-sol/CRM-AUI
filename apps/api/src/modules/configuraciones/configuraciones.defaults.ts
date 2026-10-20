/**
 * Effective configuration of a parameter, resolved with the precedence
 * `database > environment > code default` (specs/024-configuraciones-v1 §6).
 *
 * `source` is reported to the UI and to /configuraciones/efectivas so an
 * administrator can tell whether a value was set here, inherited from the
 * installation, or is still the built-in default.
 */
export type ConfigSource = 'db' | 'env' | 'default';

export type EffectiveValue<T> = {
  valor: T;
  source: ConfigSource;
};

/**
 * Business parameters configurable per organization. Credentials are not here:
 * integrations stay in the environment (spec §3).
 */
export const PARAMETROS = [
  'maxCommercialPer60d',
  'minDaysBetweenCommercial',
  'quoteExpiryDays',
  'whatsappMessageCost',
  'whatsappMessageCostCommercial',
  'smsCostPerSegment',
  'smsCurrency',
] as const;

export type ParametroKey = (typeof PARAMETROS)[number];

/**
 * Column in `OrganizationConfig` for each parameter.
 */
export const PARAMETRO_COLUMN: Record<ParametroKey, string> = {
  maxCommercialPer60d: 'maxCommercialPer60d',
  minDaysBetweenCommercial: 'minDaysBetweenCommercial',
  quoteExpiryDays: 'quoteExpiryDays',
  whatsappMessageCost: 'whatsappMessageCost',
  whatsappMessageCostCommercial: 'whatsappMessageCostCommercial',
  smsCostPerSegment: 'smsCostPerSegment',
  smsCurrency: 'smsCurrency',
};

/**
 * Environment variable backing each parameter: the installation fallback.
 */
export const PARAMETRO_ENV: Record<ParametroKey, string> = {
  maxCommercialPer60d: 'journeys.maxCommercialPer60d',
  minDaysBetweenCommercial: 'journeys.minDaysBetweenCommercial',
  quoteExpiryDays: 'quotes.expiryDays',
  whatsappMessageCost: 'campaigns.messageCost',
  whatsappMessageCostCommercial: 'campaigns.messageCostCommercial',
  smsCostPerSegment: 'sms.costPerSegment',
  smsCurrency: 'sms.currency',
};

/**
 * Code defaults: the values the platform used before this module existed, so an
 * organization without a configuration row behaves exactly as before.
 */
export const PARAMETRO_DEFAULT: Record<ParametroKey, number | string> = {
  maxCommercialPer60d: 3,
  minDaysBetweenCommercial: 3,
  quoteExpiryDays: 7,
  whatsappMessageCost: 200,
  whatsappMessageCostCommercial: 400,
  smsCostPerSegment: 100,
  smsCurrency: 'COP',
};

/** Weekdays accepted in `businessDays`. */
export const BUSINESS_DAYS = [
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN',
] as const;

export type BusinessDay = (typeof BUSINESS_DAYS)[number];

/** Minutes in a day; business hours are stored as minutes from midnight. */
export const MINUTES_IN_DAY = 1440;

export const DEFAULT_BUSINESS_DAYS: BusinessDay[] = [
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
];

export const DEFAULT_TIMEZONE = 'America/Bogota';
