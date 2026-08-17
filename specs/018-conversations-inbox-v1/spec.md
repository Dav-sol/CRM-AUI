# Conversations Inbox v1 — Feature Specification

## 1. Purpose

The Conversations Inbox module (Módulo 07 Conversaciones, `specs/02-modules.md:191-213`) completes the WhatsApp foundation delivered by kit 017 (HG-5, `specs/017-whatsapp-v1/spec.md:89,100`): the bandeja (inbox), conversation lifecycle (CO-003), advisor assignment (`Conversation.advisorId`), per-conversation tags and notes, org-scoped quick replies, and the asesor reply flow (Flujo 07 — Atención Comercial, `05-user-flows.md:188-207`). It extends the `Conversation`/`Message` aggregates (`04-domain-model.md:123-163`, `schema.prisma:242-298`) with the inbox-only models and the lifecycle events of `07-event-architecture.md:214-226` (`ConversationAssigned`, `ConversationTransferred`, `ConversationClosed`, `ConversationArchived`).

## 2. Clarifications (Q&A)

- **Q1: What is the kit 018 scope?** → A1: Bandeja + lifecycle transitions (OPEN/CLOSED/ARCHIVED + reopen), advisor assignment/transfer, tags, notes, quick replies, and the asesor reply (OUTBOUND `type=OUTGOING`). OUT: AU-006/007 (HG-10), WhatsApp SOCIAL, plantillas/templates (HG-7), campaigns, retries, multi-tenant channel config (all future kits/modules).
- **Q2: How do assignment, transitions and reply interact with the 017 states?** → A2: `Conversation.advisorId` is metadata (not a state). Only CO-003 states (OPEN/CLOSED/ARCHIVED) exist; assignment does not change state. A reply reopens a CLOSED conversation to OPEN; replying to ARCHIVED returns `400 VALIDATION_ERROR` (explicit reopen first). See Q5.
- **Q3: Where does the inbox module live?** → A3: New `conversations` module (`apps/api/src/modules/conversations/`) owning the inbox-only models and transitions; it reuses the exported `WhatsappService` (kit 017) for the reply provider call. `ConversationOpened` stays emitted by the whatsapp module; the inbox emits `ConversationAssigned/Transferred/Closed/Archived` with its own envelope (`module: 'conversations'`). No change to 017 endpoint behavior.
- **Q4: Which roles manage quick replies and tags?** → A4: Catalog management (create/update/delete of quick replies and tags) restricted to ADMINISTRADOR/GERENTE; **use/read/assignment open to all roles** (the asesor labels and replies). See HG-1/HG-3.
- **Q5: What are the transition and assignment rules?** → A5: Close/archive/reopen **and** assignment/transfer are open to all authenticated roles (the asesor answers conversations in Flujo 07; any advisor may pick up and hand off a conversation). All transitions are guarded single-row status updates; invalid source states → `400 VALIDATION_ERROR`. See HG-4/HG-5.
- **Q6: What are notes?** → A6: Append-only per-conversation log entries (author = user, content, timestamp). No edit/delete in v1 (historical log, CO-004 spirit). Content may be PII → never logged, never in events. See HG-2.
- **Q7: What are quick replies vs WhatsApp templates?** → A7: Quick replies are local org-scoped reusable snippets for advisors (title + body). WhatsApp templates/plantillas (HG-7) are provider-side message templates out of scope. The reply body is resolved server-side from the catalog.
- **Q8: How is the reply sent?** → A8: `POST /conversations/{uuid}/messages` creates `Message type=OUTGOING direction=OUTBOUND`, persists QUEUED, calls the provider after commit, updates SENT/FAILED, emits `MessageQueued`/`MessageSent`/`MessageFailed`; Idempotency-Key honored. Mirrors 017 manual send (FR-003/FR-004 precedent).
- **Q9: Is a reply different from the manual send?** → A9: Same provider lifecycle; the difference is the message `type` (`OUTGOING` = in-conversation asesor reply vs `MANUAL` = standalone manual send, 017) and the endpoint (conversation-scoped with reopen semantics). Both are `direction=OUTBOUND`.
- **Q10: How are tags modeled?** → A10: Org-scoped catalog (`ConversationTag`, unique name per org) + M2M assignments (`ConversationTagAssignment`, unique `(conversationId, tagId)`). Soft-delete keeps history (CO-003). See HG-1.
- **Q11: Tenant isolation?** → A11: `organizationId` from JWT only (API_GUIDELINES §18); catalog/assignments/notes/replies scoped to the owning conversation's organization; cross-tenant → 404 `CONVERSATION_NOT_FOUND` (never disclosure). Advisor target must belong to the conversation's organization → else 400 `VALIDATION_ERROR`.
- **Q12: Events?** → A12: `ConversationAssigned`, `ConversationTransferred`, `ConversationClosed`, `ConversationArchived` (07:214-226) with traceability payloads (07:383-395), emitted after commit; consumers idempotent (07:375-379).

## 3. User Stories

- **US1 (bandeja)**: As a user, I can list conversations with filters (status, assigned/unassigned, advisor, tags, customer, dates) and see advisor, tags and status in each row, so I can pick the conversations to attend.
- **US2 (detail)**: As a user, I open a conversation and see its message history, tags, notes, advisor and status in one view (Flujo 07 steps 1-2).
- **US3 (reply)**: As a user (the asesor), I reply to a customer conversation; an OUTGOING message is recorded and sent (Flujo 07 step 3), reopening a CLOSED conversation.
- **US4 (assignment)**: As a user, I assign a conversation to an advisor and transfer it between advisors; the advisor is recorded and events emitted.
- **US5 (lifecycle)**: As a user, I close, archive and reopen conversations; states follow CO-003 and events are emitted.
- **US6 (tags)**: As a user, I can tag a conversation with catalog tags; as ADMINISTRADOR/GERENTE I manage the catalog.
- **US7 (notes)**: As a user, I add notes to a conversation and read the conversation log.
- **US8 (quick replies)**: As a user, I use a quick reply snippet when replying; as ADMINISTRADOR/GERENTE I manage the catalog.
- **US9 (audit)**: Every inbox action is audited (AD-001..003); audit failures never break the flow.
- **US10 (events)**: The module emits lifecycle events with traceability payloads and idempotent consumers (07:214-226, 375-395).

## 4. Functional Requirements

- **FR-001**: Bandeja `GET /conversations` — extend filters `assigned` (`true|false`), `tagIds` (any-of), `status`, `channel`, `customerId`, `advisorId`, date range; rows include `advisor`, `tags[]`, `status`; pagination (≤100), sort whitelist; tenant-scoped — US1.
- **FR-002**: `GET /conversations/{uuid}` — detail includes messages (one query, no N+1), `tags[]`, `notes[]`, `advisor`; cross-tenant/unknown → 404 `CONVERSATION_NOT_FOUND` — US2.
- **FR-003**: `POST /conversations/{uuid}/messages` (reply) — OUTGOING/OUTBOUND Message, QUEUED → provider → SENT/FAILED, reopen CLOSED→OPEN; ARCHIVED → 400 `VALIDATION_ERROR`; Idempotency-Key honored; audit — US3.
- **FR-004**: `POST /conversations/{uuid}/assign` + `/transfer` — set `advisorId` (same-org target, else 400); same-advisor no-op; events `ConversationAssigned`/`ConversationTransferred`; all authenticated roles (HG-4) — US4.
- **FR-005**: `POST /conversations/{uuid}/close|archive|reopen` — guarded transitions per CO-003 (OPEN→CLOSED, OPEN→ARCHIVED, CLOSED→ARCHIVED, CLOSED/ARCHIVED→OPEN); invalid → 400 `VALIDATION_ERROR`; events `ConversationClosed`/`ConversationArchived`; all authenticated roles — US5.
- **FR-006**: `GET /conversation-tags`, `POST /conversation-tags`, `PATCH /conversation-tags/{uuid}`, `DELETE /conversation-tags/{uuid}` (catalog, org-scoped, soft-delete, unique name) — management ADMINISTRADOR/GERENTE; `POST/DELETE /conversations/{uuid}/tags/{tagUuid}` (assign/remove) all roles — US6.
- **FR-007**: `POST /conversations/{uuid}/notes`, `GET /conversations/{uuid}/notes` — append-only, author recorded, soft-delete reserved; all roles — US7.
- **FR-008**: `GET /quick-replies`, `POST /quick-replies`, `PATCH /quick-replies/{uuid}`, `DELETE /quick-replies/{uuid}` — org-scoped CRUD; management ADMINISTRADOR/GERENTE; reply may reference `quickReplyId` for audit — US8.
- **FR-009**: Audit via `AuditIdentityService` (never-throw): `conversation.assign/.transfer/.close/.archive/.reopen`, `conversation.note.create`, `conversation.tag.assign/.remove`, `quick_reply.create/.update/.delete`, `message.send` (reply) — US9.
- **FR-010**: Events emitted after commit with traceability payloads; consumers idempotent — US10.
- **FR-011**: Records never physically deleted (CO-003); soft-delete only (tags, notes, quick replies, assignments).
- **FR-012**: Dates ISO 8601 UTC; date-only filters whole-day inclusive (API_GUIDELINES §20-21, NR-010 precedent).

## 5. Non-Functional Requirements

- **NR-001**: `organizationId` from JWT only on REST (API_GUIDELINES §18); cross-tenant → 404.
- **NR-002**: Envelope `{ data }` / `{ data, meta }` / `{ error: { code, message, details? } }` (API_GUIDELINES §6-8).
- **NR-003**: No N+1: conversation detail preloads messages + tags + notes (single query); bandeja rows preload advisor + tags (precedent NR-003 of 017).
- **NR-004**: Transactional invariants: reply message + reopen transition atomic (FR-003); tag assignment/removal atomic.
- **NR-005**: Concurrency-safe transitions: single-row status-guarded updates; unique `(conversationId, tagId)` assignment backstop (P2002 → no-op never 500).
- **NR-006**: Idempotent event/state consumption (07:375-379).
- **NR-007**: Audit never-throw (AuditIdentityService pattern).
- **NR-008**: Controlled exceptions only; never leak internal errors (Constitution IX).
- **NR-009**: No secrets, credentials, note/message content or other PII in logs; events carry ids only (Constitution IX).
- **NR-010**: Date-only filters whole-day inclusive (precedent NR-010 of 016/017).

## 6. Acceptance Scenarios

- **AS-001**: Bandeja with `assigned=true|false` and `tagIds` filters returns tenant-scoped conversations with advisor + tags (US1, FR-001).
- **AS-002**: Conversation detail returns messages + tags + notes in one view (US2, FR-002, NR-003).
- **AS-003**: Reply → 201, OUTGOING/OUTBOUND message SENT, audit row (US3, FR-003, FR-009).
- **AS-004**: Reply to a CLOSED conversation reopens it to OPEN and sends (US3, Q2).
- **AS-005**: Reply to an ARCHIVED conversation → 400 `VALIDATION_ERROR` (Q2).
- **AS-006**: Assign/transfer by any role → advisor set, `ConversationAssigned`/`ConversationTransferred` emitted; same-advisor no-op (US4, FR-004).
- **AS-007**: Assign to a cross-tenant advisor → 400 `VALIDATION_ERROR` (Q11).
- **AS-008**: Close/archive/reopen by any role → state changes, `ConversationClosed`/`ConversationArchived` emitted; invalid transition → 400 (US5, FR-005).
- **AS-009**: Tag assign/remove + catalog CRUD; OPERADOR can assign but cannot create tags (403) (US6, FR-006).
- **AS-010**: Note create + list; notes visible to all roles (US7, FR-007).
- **AS-011**: Quick replies CRUD by ADMINISTRADOR/GERENTE; read/use by all roles (US8, FR-008).
- **AS-012**: Cross-tenant access to conversation/notes/tags/replies → 404 (FR-002, Q11).
- **AS-013**: Audit rows exist for assign/transfer/close/archive/reopen/note/tag/quick-reply/reply actions (FR-009, US9).
- **AS-014**: Repeated transition or duplicate assignment → guarded no-op or 400, never a second event or state flip (NR-005).

## 7. Out of Scope (v1)

- AU-006/007 (pause on open conversation, advisor notification) — HG-10 (`03:221-241`, `07:294-303`).
- WhatsApp SOCIAL / multi-channel — HG-6, Módulo 10.
- Message templates/plantillas — HG-7 (`03:271-275` CA-001).
- Campañas (AU-010) — future Campañas module.
- Retry of FAILED replies, media/attachments.
- Multi-tenant channel configuration (per-org WhatsApp numbers).
- Dashboard consumers of Conversation*/Message* events.
- Auto-assignment / round-robin routing (manual assignment only, Q5).

## 8. Known Conflicts (resolved via HG)

- **C-01** (assignment permissions): The asesor answers conversations (Flujo 07) but nothing in the base specs says who assigns. → **HG-4**: assignment/transfer open to all authenticated roles (any advisor may assign/transfer); catalog management (tags, quick replies) restricted to ADMINISTRADOR/GERENTE.
- **C-02** (transition permissions): CO-003 defines states but not who transitions. → **HG-5**: close/archive/reopen open to all authenticated roles (the asesor changes state, Flujo 07 step 5).
- **C-03** (tag model): "Etiquetas" (`02-modules.md:204`) has no rules. → **HG-1**: org-scoped catalog + M2M assignments; catalog management ADMINISTRADOR/GERENTE.
- **C-04** (notes lifecycle): "Notas" (`02-modules.md:205`) has no rules. → **HG-2**: append-only log (no edit/delete in v1); additive migration.
- **C-05** (quick replies ownership): "Respuestas rápidas" (`02-modules.md:205`) has no rules. → **HG-3**: org-scoped CRUD by ADMINISTRADOR/GERENTE, usage all roles; distinct from WhatsApp templates.
- **C-06** (reply type): 017 reserved `MessageType.OUTGOING` but defined no inbox reply endpoint. → **HG-6**: conversation-scoped reply endpoint creating OUTGOING/OUTBOUND, reopen-on-close, 400 on archived.
- **C-07** (module placement): The inbox operates on aggregates owned by the whatsapp module. → **R-002 (research)**: new `conversations` module reusing the exported `WhatsappService`; no behavioral change to 017 paths.
- **C-08** (reopen semantics): Replying to a CLOSED conversation could be rejected or reopen. → **HG-5**: reopen-on-reply (continuity is the natural meaning of Flujo 07 "Responde").

## 9. Dependency Justification (AGENTS.md)

- **No new runtime dependencies**: reply reuses the existing `WhatsAppProvider` via `WhatsappService` (kit 017) — no SDK, no new packages.
- `@nestjs/event-emitter` (installed): emit `ConversationAssigned/Transferred/Closed/Archived` (07:214-226).
- Env vars: **none new** — the inbox inherits whatsapp env config; no secrets introduced.
- `ConversationsModule` imports `WhatsappModule` (module dependency for the reply provider call); `WhatsappModule` exports `WhatsappService` (export-only change).

## 10. Role and Tenant Notes

- Reads (bandeja, detail, notes, tags, quick replies): all authenticated roles (017 FR-011 precedent).
- Writes: quick replies + tag catalog CRUD → ADMINISTRADOR/GERENTE (configuration); reply, notes, tag assign/remove, close/archive/reopen, **assignment/transfer** → all roles (HG-4/HG-5).
- `TenantScopeGuard` MUST NOT be used (precedent R-005); tenant enforcement in the service layer (`findScoped` pattern). Cross-tenant → 404, never disclosure.
- Advisor targets for assignment must belong to the conversation's organization (400 otherwise).
- Events/audit carry ids only (never message/note content).