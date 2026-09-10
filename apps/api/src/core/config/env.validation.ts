import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required(),

  JWT_REFRESH_SECRET: Joi.string().min(32).required(),

  ACCESS_TOKEN_TTL: Joi.string().default('15m'),

  REFRESH_TOKEN_TTL: Joi.string().default('7d'),

  INVITATION_TOKEN_TTL: Joi.string().default('48h'),

  PASSWORD_RESET_TOKEN_TTL: Joi.string().default('1h'),

  REFRESH_COOKIE_NAME: Joi.string().default('refresh_token'),

  COOKIE_SECURE: Joi.boolean().default(true),

  REDIS_URL: Joi.string().required(),

  WHATSAPP_API_TOKEN: Joi.string().min(1).required(),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().min(1).required(),
  WHATSAPP_API_URL: Joi.string()
    .uri()
    .default('https://graph.facebook.com/v21.0'),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: Joi.string().min(1).required(),
  WHATSAPP_WEBHOOK_SECRET: Joi.string().min(1).required(),
  WHATSAPP_DEFAULT_ORGANIZATION_ID: Joi.string().min(1).required(),
  WHATSAPP_SANDBOX_ORGANIZATION_IDS: Joi.string().optional(),

  // Pancake (WhatsApp via Pancake Public API). Optional: when configured, only
  // the PANCAKE_ORGANIZATION_ID organization routes sends through Pancake.
  PANCAKE_API_TOKEN: Joi.string().optional(),
  PANCAKE_BOTCAKE_API_TOKEN: Joi.string().optional(),
  PANCAKE_PAGE_ID: Joi.string().optional(),
  // Approved WhatsApp template id used for every Pancake send (global v1).
  PANCAKE_TEMPLATE_ID: Joi.string().optional(),
  PANCAKE_API_BASE_URL: Joi.string().uri().optional(),
  PANCAKE_TEMPLATES_API_URL: Joi.string().uri().optional(),
  PANCAKE_ORGANIZATION_ID: Joi.string().optional(),
  PANCAKE_SENDER_ID: Joi.string().optional(),
  PANCAKE_TIMEOUT_MS: Joi.number().integer().positive().optional(),
  PANCAKE_MIN_INTERVAL_MS: Joi.number().integer().min(0).optional(),
  PANCAKE_RETRY_ON_AMBIGUOUS: Joi.boolean().optional(),
  PANCAKE_RESOLVE_CONVERSATION_ID: Joi.boolean().optional(),

  JOURNEYS_MAX_COMMERCIAL_PER_60D: Joi.number().integer().min(0).optional(),
  JOURNEYS_MIN_DAYS_BETWEEN_COMMERCIAL: Joi.number()
    .integer()
    .min(0)
    .optional(),
  WHATSAPP_MESSAGE_COST: Joi.number().integer().min(0).optional(),
  WHATSAPP_MESSAGE_COST_COMMERCIAL: Joi.number().integer().min(0).optional(),
  QUOTE_EXPIRY_DAYS: Joi.number().integer().min(1).optional(),
  WHATSAPP_EXECUTING_TIMEOUT_MS: Joi.number().integer().min(0).optional(),

  // SMS provider configuration
  SMS_PROVIDER: Joi.string()
    .valid('NULL', 'ALTIRIA', 'TWILIO', 'VONAGE', 'BIRD', 'INFOBIP', 'HABLAME')
    .default('NULL'),
  SMS_API_KEY: Joi.string().optional(),
  SMS_API_SECRET: Joi.string().optional(),
  SMS_SENDER: Joi.string().optional(),
  SMS_API_URL: Joi.string().uri().optional(),
  SMS_WEBHOOK_BASE_URL: Joi.string().uri().optional(),
  SMS_WEBHOOK_SECRET: Joi.string().optional(),
  SMS_DEFAULT_COUNTRY_PREFIX: Joi.string().default('57'),
  ALTIRIA_USERNAME: Joi.string().optional(),
  ALTIRIA_API_PASSWORD: Joi.string().optional(),
  SMS_COST_PER_SEGMENT: Joi.number().min(0).default(100),
  SMS_CURRENCY: Joi.string().length(3).default('COP'),
  SMS_COMMERCIAL_QUIET_HOURS_START: Joi.number()
    .integer()
    .min(0)
    .max(23)
    .default(20),
  SMS_COMMERCIAL_QUIET_HOURS_END: Joi.number()
    .integer()
    .min(0)
    .max(23)
    .default(9),
  SMS_TIMEZONE: Joi.string().default('America/Bogota'),
  SMS_EXECUTING_TIMEOUT_MS: Joi.number().integer().min(0).optional(),

  APP_NAME: Joi.string().default('automatize-it-api'),

  APP_VERSION: Joi.string().default('1.0.0'),
});
