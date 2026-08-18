# Checklist: Campaigns v1 (checklists/requirements.md)

> Estado: implementación completa (DTOs/service/controller/module/whatsapp/tests/OpenAPI) + gates verificados.
> Pendientes: commit/push (salvo orden).

## CR-01: Specs verification
- [x] plan.md present in specs/019-campaigns-v1/ with Constitution Check PASS.
- [x] spec.md present in specs/019-campaigns-v1/ with full FR/NR/AS definitions.
- [x] research.md present with all R-0xx notes (R-001..R-015).
- [x] data-model.md present with additive delta (startAt, segment).
- [x] contracts/campaigns-api.md present with full endpoint shapes.
- [x] quickstart.md present with C1..C9 scenarios.
- [x] tasks.md present with T183..T193.
- [x] All kit 019 spec files follow 018 kit format (plan/spec/research/data-model/contracts/quickstart/tasks/checklists).

## CR-02: Human Gates approval (HG-1..HG-9)
- [x] HG-1: Kit 019 = Campañas (Módulo 06) — approved.
- [x] HG-2: Campaign.template = texto libre; sin entidad Template (Configuración diferida) — approved.
- [x] HG-3: Todos los roles de la org pueden gestionar campañas — approved.
- [x] HG-4: AU-010 diferido a Configuración; sin período hardcodeado en v1 — approved.
- [x] HG-5: "Programada" → ACTIVE con startAt futura; sin SCHEDULED al enum — approved.
- [x] HG-6: Solo clientes con compras (purchaseId NOT NULL) — approved.
- [x] HG-7: Segmentación ciudad+producto+fecha+estado (AND), ≥1 criterio — approved.
- [x] HG-8: Límite configurable + batches + transacción; rechazo si excede — approved.
- [x] HG-9: Dashboard kit 020; 019 no emite eventos de dashboard — approved.

## CR-03: Migration & data model
- [x] T184 generated: `add_campaigns_v1` migration with two additive columns (`start_at`, `segment JSONB`) — migración `20260817212416_add_campaigns_v1` presente y aplicada en el commit 63364f1.
- [x] SQL reviewed per data-model.md (additive, nullable, zero impact on existing rows).
- [x] `prisma migrate status` OK (2026-08-18: "Database schema is up to date!"); typegen OK (schema sin cambios desde la migración).

## CR-04: DTOs & validation
- [x] All DTOs in `dto/` with class-validator decorators (9 archivos, Zod no usado: class-validator es el estándar del repo).
- [x] create-campaign.dto.ts: name/description?/type/template/segment?/startAt? (≥1 segment field if segment present).
- [x] update-campaign.dto.ts: optional fields (PATCH), DRAFT only enforcement en service.
- [x] Segment DTO (`campaign-segment.dto.ts`): ≥1 criterio requerido (constraint `SegmentHasCriterionConstraint`), city case-insensitive contains, enum `CustomerStatus`.
- [x] Validation errors surface as 400 VALIDATION_ERROR / 400 SEGMENT_TOO_LARGE / 404 CAMPAIGN_NOT_FOUND (contrato §11).
- [x] Query DTO: sort whitelist `createdAt|updatedAt|name|status|type|startAt` (±`-`), page/limit/status/type/search.

## CR-05: Service logic
- [x] campaigns.service.ts implements all business logic (activate guard + segment + count limit + batch creation; pause/resume/cancel; finish detection @OnEvent; audit never-throw).
- [x] Activate: guarded DRAFT→ACTIVE en la misma transacción (`updateMany` count guard); batch 500; over limit → 400 SEGMENT_TOO_LARGE (campaign sigue DRAFT).
- [x] Finish detection: `@OnEvent('AutomationExecuted')` consumer; guarded ACTIVE→FINISHED cuando quedan 0 SCHEDULED; idempotente (guard de estado); logs y traga errores.
- [x] Scheduler integration additive: whatsapp `executeDueAutomations` `OR: [{campaignId: null}, {campaign: {status: 'ACTIVE'}}]` + include `campaign.template` + `buildAutomaticContent` con `campaign?.template ?? AUTOMATIC_TEMPLATE` (sin cambio de comportamiento para 016/017).

## CR-06: Controller & roles
- [x] campaigns.controller.ts: 9 endpoints, `@UseGuards(JwtAuthGuard)` en clase (sin `@Roles` → todos los roles de org, HG-3).
- [x] PATCH /update solo DRAFT; otros estados → 400 VALIDATION_ERROR.
- [x] Role matrix HG-3 documentada en campaigns.controller.spec.ts (guard JwtAuthGuard presente, sin metadata ROLES_KEY; OPERADOR probado como usuario representativo).
- [x] `CampaignsModule` registrado en `app.module.ts` (imports: PrismaModule + AuthModule).

## CR-06: Tests & coverage
- [x] Unit campaigns.service.spec.ts green (32 casos: 10 métodos + guardas de estado, segmento completo, límite 5.000, finish idempotente).
- [x] Unit campaigns.controller.spec.ts green (11 casos: envelope `{ data }`, 9 endpoints, preview sin body, guard HG-3).
- [x] e2e campaigns.e2e-spec.ts green (11 casos, C1..C9 + variantes: aislamiento multi-tenant, segmento vacío, doble activación; suite e2e completa 144/144 con DB local).
- [x] Coverage target >80%: campaigns.service.ts 95.78% lines / 81.95% branch; campaigns.controller.ts 100% stmts/funcs/lines.
- [x] Suite global: 415 tests / 32 suites, todos verdes (incluidos 77 tests whatsapp con los cambios aditivos).

## CR-07: OpenAPI & quality
- [x] specs/api/paths/campaigns.yaml filled (9 endpoints).
- [x] Schemas Campaign/* (9 files: Campaign, CampaignSummary, CampaignDetails, CampaignResponse, CampaignListResponse, CreateCampaignRequest, UpdateCampaignRequest, CampaignSegment, SegmentPreviewResponse) per contract §12.
- [x] info/tags.yaml tag `Campaigns` confirmado presente.
- [x] openapi.yaml root refs added (9 rutas).
- [x] npm run api:validate green (redocly lint + spectral: "No results with a severity of 'error'"; único warning pre-existente no-server-example-com en servers.yaml).
- [x] lint (eslint) clean en todos los archivos tocados.
- [x] prettier clean.
- [x] nest build clean.
- [x] tsc clean (0 errores).

## CR-08: Conventional Commit & delivery
- [ ] Commit `feat(campaigns): implement campaigns v1` creado sobre main — PENDIENTE de orden (convención "no push salvo orden"; el commit 63364f1 previo quedó obsoleto por el fix-forward).
- [x] No unrelated files modified (solo campañas + whatsapp aditivo + OpenAPI + app.module).
- [x] No secrets introduced.
- [ ] Push to origin/main — solo si se solicita.

## CR-09: Documentation cross-links
- [x] plan.md Constitution Check PASS registrado (fase III gate PASS).
- [x] HG-1..HG-9 documentados en plan.md clarifications.
- [ ] Specs/019 referencia a roadmap/índice de Módulo 06 — verificar en PR (fuera del diff actual).
