export default () => ({
  app: {
    name: process.env.APP_NAME ?? 'automatize-it-api',
    version: process.env.APP_VERSION ?? '1.0.0',
    environment: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '3000', 10),
  },

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
    refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? '7d',
    invitationTokenTtl: process.env.INVITATION_TOKEN_TTL ?? '48h',
    passwordResetTokenTtl: process.env.PASSWORD_RESET_TOKEN_TTL ?? '1h',
    refreshCookieName: process.env.REFRESH_COOKIE_NAME ?? 'refresh_token',
    cookieSecure:
      process.env.COOKIE_SECURE === undefined
        ? true
        : process.env.COOKIE_SECURE === 'true',
  },

  redis: {
    url: process.env.REDIS_URL,
  },

  evolution: {
    url: process.env.EVOLUTION_API_URL,
    apiKey: process.env.EVOLUTION_API_KEY,
  },
});
