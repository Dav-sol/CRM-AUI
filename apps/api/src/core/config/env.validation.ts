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

  APP_NAME: Joi.string().default('automatize-it-api'),

  APP_VERSION: Joi.string().default('1.0.0'),
});
