# Conversations Inbox v1 — Research Notes

## R-001 — Foundation from kit 017 (state)

`whatsapp` module (017) already owns `Conversation`/`Message` aggregates, the `WhatsAppProvider` (Meta Cloud API adapter), the status-callback pipeline and the read endpoints (`GET /conversations`, `GET /conversations/{uuid}`, `GET /messages`, `GET /messages/{uuid}`, `POST /messages`). `Conversation.advisorId` (nullable, relation `ConversationAdvisor`, index `[advisorId]`) and `ConversationStatus {OPEN, CLOSED, ARCHIVED}` exist but are unused by 017 (HG-5). `MessageType` includes `OUTGOING` (schema.prisma:502-507), reserved in 017 (`specs/017-whatsapp-v1/contracts/whatsapp-api.md` Message.yaml: "OUTGOING (agent replies) belongs to the inbox kit (018)"). Kit 018 completes Módulo 07: bandeja, transitions, assignment, tags, notes, quick replies, asesor reply.

## R-002 — Aggregate ownership (design INFERENCIA)

Conversation/Message persistence stays in the `whatsapp` module (owner of the aggregates and the provider). The inbox surface is a **new `conversations` module** (`apps/api/src/modules/conversations/`) that: (a) owns the new inbox-only models (`ConversationTag`, `ConversationTagAssignment`, `ConversationNote`, `QuickReply`) and the Conversation state transitions/assignment via Prisma directly (models are global); (b) for the asesor reply reuses the exported `WhatsappService` (new public method `sendReply(conversation, advisorUser, content)` that records an OUTGOING Message + provider call). `ConversationsModule` imports `WhatsappModule`; the `whatsapp` module only gains an export + a `sendReply` method — no behavioral change to 017 paths. **INFERENCIA** (module split not prescribed; coherent with loose coupling, precedent of self-contained feature modules).

## R-003 — Bandeja (inbox) list (design)

The bandeja is the existing `GET /conversations` enriched by the kit: new filters `assigned` (true/false/unassigned), `tagIds` (any-of), `advisorId` already exists; sort whitelist extended. Conversation detail (`GET /conversations/{uuid}`) extended to include `tags[]`, `notes[]`, `advisor` (id/uuid/name). Reads remain open to all roles (017 FR-011 precedent — the asesor opens the bandeja, Flujo 07 step 1).

## R-004 — Transition model (CO-003 + event list)

CO-003 defines the only three states (Abierta/Cerrada/Archivada) and "nunca eliminadas". The event architecture (07:214-226) defines `ConversationClosed`, `ConversationArchived`, plus `ConversationAssigned`/`ConversationTransferred`. Assignment is a **field** (`advisorId`), not a state. Allowed transitions (design, HG-5): `OPEN → CLOSED`, `CLOSED → OPEN` (reopen), `OPEN → ARCHIVED`, `CLOSED → ARCHIVED`, `ARCHIVED → OPEN` (reopen). `ARCHIVED → CLOSED` and `CLOSED → OPEN` via same reopen endpoint. Guarded single-row status update (NR-005 precedent) so concurrent requests can't double-transition. Emit the matching event after commit.

## R-005 — Reply semantics (Flujo 07 step 3, HG-6)

Asesor reply = `POST /conversations/{uuid}/messages` → `Message` `type=OUTGOING`, `direction=OUTBOUND` (the reserved type). Lifecycle mirrors 017 manual send: persist QUEUED → provider after commit → SENT/FAILED (FR-003 precedent), emit `MessageQueued`/`MessageSent`/`MessageFailed`, audit `message.send`. Idempotency-Key honored (API_GUIDELINES §19). Replying to a CLOSED conversation **reopens it to OPEN** (the advisor continuing the conversation is the natural meaning of Flujo 07 "Responde"); replying to an ARCHIVED conversation returns `400 VALIDATION_ERROR` (archive = explicitly hidden; explicit reopen first). **INFERENCIA** (reopen-on-reply not prescribed; HG-5).

## R-006 — Tags (Módulo 07 "Etiquetas", HG-1)

Recommended model: org-scoped **tag catalog** (`ConversationTag`: name, color, soft-delete) + M2M assignment (`ConversationTagAssignment`: conversationId, tagId, unique pair, soft-delete). Rationale: multi-tag per conversation, consistent labeling for the bandeja filters (`tagIds`), no string-parsing, future reporting. Alternative rejected: free-form label array on Conversation (no catalog, no per-tag reporting/filter consistency, PII-free but fragile). Catalog management (create/update/delete) restricted to ADMINISTRADOR/GERENTE (configuration-ish); assignment/removal on a conversation by all roles (advisors label their working conversations). **HUMAN GATE (HG-1)** on the model + who manages the catalog.

## R-007 — Notes (Flujo 07 step 4 "Agrega notas", HG-2)

`ConversationNote`: conversationId, userId (author), content, timestamps, soft-delete. Recommended lifecycle: **append-only** — create + list; no edit/delete in v1 (a conversation log is audit-like; content is historical, CO-004 spirit). Notes are visible to all roles with read access to the conversation. Content may contain PII → never logged, never emitted in events (only `noteId`/`conversationId`). **HUMAN GATE (HG-2)** on append-only vs editable.

## R-008 — Quick replies (Módulo 07 "Respuestas rápidas", HG-3)

`QuickReply`: org-scoped, `title` (shortcut/label), `body` (the reusable text), timestamps, soft-delete. CRUD by ADMINISTRADOR/GERENTE (management); read/use by all roles. They are **not** the WhatsApp templates (HG-7, Módulo 10 Configuración) — quick replies are local reusable snippets for advisors; templates are provider-side message templates. The reply flow accepts an optional `quickReplyId` reference for audit, but the body is resolved server-side from the catalog (client never sends free text as a template key). **HUMAN GATE (HG-3)** on management roles.

## R-009 — Assignment/transfer (HG-4)

`POST /conversations/{uuid}/assign {advisorId}` sets `Conversation.advisorId` (must be a same-organization user; cross-tenant advisor → 400 `VALIDATION_ERROR`). `POST /conversations/{uuid}/transfer {advisorId}` = reassign to a different advisor. **Open to all authenticated roles** (approved HG-4: any advisor may pick up/hand off a conversation, Flujo 07). Assignment emits `ConversationAssigned`; transfer emits `ConversationTransferred`. If the conversation is CLOSED/ARCHIVED, assignment is still allowed (persisted metadata) — no state change. Idempotent: assigning the same advisor is a no-op (no event, no change).

## R-010 — Transition permissions (HG-5)

Close/archive/reopen open to **all authenticated roles** (any advisor may close/archive a conversation they handle — Flujo 07 step 5 "Cambia estado" by the asesor). **HUMAN GATE (HG-5)**. Guarded updates: only valid source states transition; invalid → 400 `VALIDATION_ERROR` (e.g. closing an already-closed conversation).

## R-011 — Data model delta (HG-2)

Additive only (precedent R-013 of 017):
- `model ConversationTag`: `id`, `uuid`, `organizationId`, `name` (unique per org, `@@unique([organizationId, name])`), `color` (hex, nullable), timestamps, soft-delete; indexes `[organizationId]`, `[organizationId, name]`.
- `model ConversationTagAssignment`: `id`, `conversationId`, `tagId`, `createdById`, timestamps, soft-delete; `@@unique([conversationId, tagId])` (active unique pair; soft-delete keeps history); indexes `[conversationId]`, `[tagId]`, `[organizationId]`.
- `model ConversationNote`: `id`, `uuid`, `conversationId`, `userId` (author), `content`, timestamps, soft-delete; indexes `[conversationId, createdAt]`, `[organizationId]`.
- `model QuickReply`: `id`, `uuid`, `organizationId`, `title`, `body`, `createdBy`, timestamps, soft-delete; indexes `[organizationId]`.
- `Conversation` gains a `notes ConversationNote[]` and `tags ConversationTagAssignment[]` relation (back-relations only). `Message` unchanged (OUTGOING already in enum).
- No enum changes; no destructive transformations; no business backfills.

## R-012 — Migration caution (precedent R-014 of 017)

Generate via `npx prisma migrate dev --create-only --name add_conversations_inbox_v1`, review SQL, apply. New tables only; unique `(conversation_id, tag_id)` allows multiple soft-deleted history rows (delete = set `deleted_at`, never hard-delete, CO-003).

## R-013 — Test infrastructure (state)

Unit 315/315; e2e 119/119 (whatsapp closure 2026-08-17). New suites: `conversations.service.spec.ts`, `conversations.controller.spec.ts`, `conversations.e2e-spec.ts`. Existing `whatsapp.e2e-spec.ts` untouched (018 does not change 017 endpoints). Coverage target >80% per module (Constitution X).

## R-014 — OpenAPI scaffolds (state)

`specs/api/paths/conversations.yaml` + `messages.yaml` and `Conversation/Message` schemas wired (017, commit 9bf8813). Kit 018 adds: `specs/api/paths/conversation-tags.yaml`, `quick-replies.yaml`, `conversation-notes.yaml`, transition/assign sub-paths in `conversations.yaml`, new schemas `ConversationTag`, `ConversationNote`, `QuickReply` (Summary/Details/ListResponse/Response per contract), `CreateQuickReplyRequest`, `UpdateQuickReplyRequest`, `CreateConversationNoteRequest`, `AssignConversationRequest`; tags `Conversation Tags`, `Quick Replies` added to `info/tags.yaml`; `npm run api:validate` green.

## R-015 — Events (07:214-226)

Emit after commit: `ConversationAssigned` (payload: conversationId, advisorId, assignedBy), `ConversationTransferred` (conversationId, fromAdvisorId, toAdvisorId, transferredBy), `ConversationClosed`, `ConversationArchived` (conversationId, closedBy/archivedBy, changedAt). Reuse the whatsapp envelope (`WhatsappEventEnvelope`, module `whatsapp`) or a new `ConversationsEventEnvelope` (module `conversations`). **Decision (R-002)**: the inbox module emits its own envelope with `module: 'conversations'`; `ConversationOpened` stays emitted by the whatsapp module (unchanged).

## R-016 — Audit (AD-001..003)

New actions via `AuditIdentityService` (never-throw, precedent R-007 of 017): `conversation.assign/.transfer/.close/.archive/.reopen.success/.failure`, `conversation.note.create`, `conversation.tag.assign/.remove`, `quick_reply.create/.update/.delete`, `message.send.success/.failure` (reply). Never log note/message content (NR-009 precedent).