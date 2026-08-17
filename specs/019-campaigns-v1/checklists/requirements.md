# Checklist: Campaigns v1 (checklists/requirements.md)

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
- [ ] T184 generated: `add_campaigns_v1` migration with two additive columns (`start_at`, `segment JSONB`).
- [ ] SQL reviewed per data-model.md (additive, nullable, zero impact on existing rows).
- [ ] `prisma migrate status` OK; typegen `npm run typegen` OK.

## CR-04: DTOs & validation
- [ ] All DTOs in `dto/` with class-validator decorators.
- [ ] create-campaign.dto.ts: name/description?/type/template/segment?/startAt? (≥1 segment field if segment present).
- [ ] update-campaign.dto.ts: optional fields, PATCH DRAFT only.
- [ ] Segment DTO: at least one of city/productId/purchaseFrom/purchaseTo/customerStatus required; case-insensitive contains for city (consistent with customers list filter).
- [ ] Validation errors surface as 400 VALIDATION_ERROR / 400 SEGMENT_TOO_LARGE / 404 CAMPAIGN_NOT_FOUND.

## CR-05: Service logic
- [ ] campaigns.service.ts implements all business logic (activate guard + segment + count limit + batch creation; pause/resume/cancel; finish detection @OnEvent; audit never-throw).
- [ ] Activate: guarded DRAFT→ACTIVE in same transaction; batch 500; over limit → 400 SEGMENT_TOO_LARGE.
- [ ] Finish detection: @OnEvent('AutomationExecuted') consumer; guarded ACTIVE→FINISHED when zero SCHEDULED; idempotent.
- [ ] Scheduler integration additive changes: whatsapp executeDueAutomations where + include campaign.template + content resolution (T19x).

## CR-06: Controller & roles
- [ ] campaigns.controller.ts: all endpoints JwtAuthGuard only (no @Roles → all org roles, HG-3).
- [ ] PATCH /update only DRAFT; other states → 400.
- [ ] All role matrix per HG-1/HG-3/HG-5 documented in controller.spec.

## CR-06: Tests & coverage
- [ ] Unit campaigns.service.spec.ts green (~40-50 cases, AS-001..014 or equivalent).
- [ ] Unit campaigns.controller.spec.ts green (role matrix, envelope).
- [ ] e2e campaigns.e2e-spec.ts green (C1..C9 scenarios, ~14 cases AS-001..014).
- [ ] Coverage target >80% (stmts/lines/branches/funcs per module Constitution X).

## CR-07: OpenAPI & quality
- [ ] specs/api/paths/campaigns.yaml filled (9 endpoints).
- [ ] Schemas Campaign/* (9 files) filled per contract.
- [ ] info/tags.yaml tag `Campaigns` confirmed present.
- [ ] openapi.yaml root refs added.
- [ ] npm run api:validate green.
- [ ] lint (eslint/prettier) clean.
- [ ] nest build clean.
- [ ] tsc clean (no type errors).

## CR-08: Conventional Commit & delivery
- [ ] Commit `feat(campaigns): implement campaigns v1` created on top of main.
- [ ] No unrelated files modified.
- [ ] No secrets introduced.
- [ ] Push to origin/main (if/when requested).

## CR-09: Documentation cross-links
- [ ] plan.md Constitution Check PASS recorded.
- [ ] HG-1..HG-9 all documented in plan.md clarifications section.
- [ ] Specs/019 referenced from any roadmap or module index that lists Módulo 06.