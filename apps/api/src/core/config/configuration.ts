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

  whatsapp: {
    apiToken: process.env.WHATSAPP_API_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    apiUrl: process.env.WHATSAPP_API_URL ?? 'https://graph.facebook.com/v21.0',
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET,
    defaultOrganizationId: process.env.WHATSAPP_DEFAULT_ORGANIZATION_ID,
    // Demo decision D1: organizations whose WhatsApp sends are simulated.
    sandboxOrganizations: (process.env.WHATSAPP_SANDBOX_ORGANIZATION_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    // F7: EXECUTING automations older than this are orphaned (provider never
    // confirmed); they return to ERROR/retry (never auto-EXECUTED).
    executingTimeoutMs: parseInt(
      process.env.WHATSAPP_EXECUTING_TIMEOUT_MS ?? '600000',
      10,
    ),
  },

  // Journey anti-spam (playbook §14): maximum COMMERCIAL automations per
  // customer per 60 days, and a minimum distance between commercial contacts.
  // Transactional (warranty/post-purchase) never count.
  journeys: {
    maxCommercialPer60d: parseInt(
      process.env.JOURNEYS_MAX_COMMERCIAL_PER_60D ?? '3',
      10,
    ),
    // Fase 4 (T16): nunca dos comerciales demasiado cerca (playbook §14).
    minDaysBetweenCommercial: parseInt(
      process.env.JOURNEYS_MIN_DAYS_BETWEEN_COMMERCIAL ?? '3',
      10,
    ),
  },

  // Fase 3 (P0-5): costo estimado por mensaje de WhatsApp (COP). Solo estimado;
  // no hay cobro ni capa de presupuesto real en v1.
  // Fase P0.2 (D6): tarifas por propósito preparadas para costos reales de Meta.
  campaigns: {
    messageCost: parseInt(process.env.WHATSAPP_MESSAGE_COST ?? '200', 10),
    messageCostCommercial: parseInt(
      process.env.WHATSAPP_MESSAGE_COST_COMMERCIAL ?? '400',
      10,
    ),
  },

  // Fase P0-C: cotizaciones vencen automáticamente tras N días sin respuesta.
  quotes: {
    expiryDays: parseInt(process.env.QUOTE_EXPIRY_DAYS ?? '7', 10),
  },

  // outbound send policy (AUTO-SAFETY-002). DENY by default and fail-closed:
  // a real send requires ALL of switch === 'ENABLED' (exact token, never
  // truthy), an explicit organization allowlist, an explicit channel
  // allowlist, and a non-expired authorization window. Anything absent,
  // empty, malformed or unreadable denies. Values are kept raw on purpose:
  // the policy module owns validation, config only transports them.
  safety: {
    // Raw string. 'ENABLED' is the ONLY enabling value.
    sendEnabled: process.env.OUTBOUND_SEND_ENABLED,
    allowedOrganizationsCsv: process.env.OUTBOUND_SEND_ALLOWED_ORGANIZATION_IDS,
    allowedChannelsCsv: process.env.OUTBOUND_SEND_ALLOWED_CHANNELS,
    // ISO-8601 instant. Missing means "no window", which denies.
    sendUntil: process.env.OUTBOUND_SEND_UNTIL,
  },

  // Pancake (WhatsApp via Pancake Public API). Org-scoped: only the
  // organization in PANCAKE_ORGANIZATION_ID routes its sends through Pancake.
  // Two tokens: PANCAKE_API_TOKEN = page_access_token for pages.fm; the
  // PANCAKE_BOTCAKE_API_TOKEN (Botcake > Configuración > Integraciones > API)
  // is required to list WhatsApp message_templates via botcake.io (Bearer).
  pancake: {
    apiToken: process.env.PANCAKE_API_TOKEN, // page_access_token (Pancake)
    botcakeApiToken: process.env.PANCAKE_BOTCAKE_API_TOKEN, // Bearer for botcake.io
    pageId: process.env.PANCAKE_PAGE_ID, // e.g. waba_1146111635255630
    // Global v1 template (2026-09-10 decision): every Pancake send uses this
    // single APPROVED WhatsApp template (free-text InboxMessage always fails
    // on WhatsApp). Without it, Pancake sends fail terminally (no retry).
    templateId: process.env.PANCAKE_TEMPLATE_ID,
    apiBaseUrl:
      process.env.PANCAKE_API_BASE_URL ?? 'https://pages.fm/api/public_api',
    templatesApiUrl:
      process.env.PANCAKE_TEMPLATES_API_URL ??
      'https://botcake.io/api/public_api/v1',
    organizationId: process.env.PANCAKE_ORGANIZATION_ID,
    senderId: process.env.PANCAKE_SENDER_ID,
    timeoutMs: parseInt(process.env.PANCAKE_TIMEOUT_MS ?? '15000', 10),
    minIntervalMs: parseInt(process.env.PANCAKE_MIN_INTERVAL_MS ?? '250', 10),
    // Ambiguous failures (timeout/network) are terminal by default: never
    // auto-retry a send that may have reached the provider (no idempotency).
    retryOnAmbiguous:
      (process.env.PANCAKE_RETRY_ON_AMBIGUOUS ?? 'false') === 'true',
    // Resolve the real conversation id via GET before sending (handles the
    // "CO." PSID conversations that the composed [pageID]_[phone] misses).
    resolveConversationId:
      (process.env.PANCAKE_RESOLVE_CONVERSATION_ID ?? 'false') === 'true',
  },

  // SMS provider configuration (Fase 2: provider pluggable via env).
  sms: {
    provider: process.env.SMS_PROVIDER ?? 'NULL',
    apiKey: process.env.SMS_API_KEY,
    apiSecret: process.env.SMS_API_SECRET,
    sender: process.env.SMS_SENDER,
    apiUrl: process.env.SMS_API_URL,
    webhookBaseUrl: process.env.SMS_WEBHOOK_BASE_URL,
    webhookSecret: process.env.SMS_WEBHOOK_SECRET,
    defaultCountryPrefix: process.env.SMS_DEFAULT_COUNTRY_PREFIX ?? '57',
    altiria: {
      username: process.env.ALTIRIA_USERNAME ?? '',
      apiPassword: process.env.ALTIRIA_API_PASSWORD ?? '',
    },
    costPerSegment: parseInt(process.env.SMS_COST_PER_SEGMENT ?? '100', 10),
    currency: process.env.SMS_CURRENCY ?? 'COP',
    commercialQuietHoursStart: parseInt(
      process.env.SMS_COMMERCIAL_QUIET_HOURS_START ?? '20',
      10,
    ),
    commercialQuietHoursEnd: parseInt(
      process.env.SMS_COMMERCIAL_QUIET_HOURS_END ?? '9',
      10,
    ),
    timezone: process.env.SMS_TIMEZONE ?? 'America/Bogota',
    executingTimeoutMs: parseInt(
      process.env.SMS_EXECUTING_TIMEOUT_MS ?? '600000',
      10,
    ),
  },
});
