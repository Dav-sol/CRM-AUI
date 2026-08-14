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

  APP_NAME: Joi.string().default('automatize-it-api'),

  APP_VERSION: Joi.string().default('1.0.0'),
});
