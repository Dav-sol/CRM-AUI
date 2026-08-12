import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string().required(),

  JWT_SECRET: Joi.string().min(32).required(),

  JWT_EXPIRES_IN: Joi.string().default('1d'),

  REDIS_URL: Joi.string().required(),

  APP_NAME: Joi.string().default('automatize-it-api'),

  APP_VERSION: Joi.string().default('1.0.0'),
});
