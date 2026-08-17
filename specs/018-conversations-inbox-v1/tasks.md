# Conversations Inbox v1 — Tasks

## Phase 0 — Research & gates (pending approval)

- [ ] T170: Kit 018-conversations-inbox-v1 (plan, spec, research, data-model, contracts, quickstart, tasks, checklists) — HG-1..HG-8 approved 2026-08-17 (plan.md Constitution Check PASS).

## Phase 1 — Persistence (migration)

- [ ] T171: Prisma schema delta (per data-model.md): new models `ConversationTag`, `ConversationTagAssignment`, `ConversationNote`, `QuickReply` + back-relations on `Conversation` (notes, tagAssignments). No enum/column changes (HG-2, R-011).
- [ ] T172: Generate migration (`add_conversations_inbox_v1`), SQL reviewed per data-model.md (new tables only), applied, `prisma migrate status` + typegen verified.

## Phase 2 — Domain (conversations module)

- [ ] T173: `dto/` — `query-conversations.dto.ts` (extend 017 filters: `assigned`, `tagIds`), `query-conversation-tags.dto.ts`, `query-quick-replies.dto.ts`, `create/update-conversation-tag.dto.ts`, `create-conversation-note.dto.ts`, `create/update-quick-reply.dto.ts`, `assign-conversation.dto.ts`, `reply-conversation.dto.ts`, path params (class-validator; pagination/filters/sort whitelist per contract).
- [ ] T174: `conversations.events.ts` — envelope + builders (module `conversations`) for `ConversationAssigned`, `ConversationTransferred`, `ConversationClosed`, `ConversationArchived` (07:214-226) with traceability payloads (07:383-395).
- [ ] T175: `conversations.service.ts`:
  - List/get conversation (extend 017 read: preload advisor + tags + notes, no N+1 NR-003; bandeja filters `assigned`/`tagIds`).
  - `assign()`/`transfer()` (FR-004): same-org advisor check, guarded `advisorId` update, same-advisor no-op, emit `ConversationAssigned`/`ConversationTransferred`, audit; all roles (HG-4).
  - `close()`/`archive()`/`reopen()` (FR-005): single-row guarded status updates (CO-003), emit `ConversationClosed`/`ConversationArchived`, audit; all roles (HG-5).
  - `reply()` (FR-003, HG-6): transaction = OUTGOING/OUTBOUND Message QUEUED + reopen CLOSED→OPEN; after commit provider call via `WhatsappService` (R-002), update SENT/FAILED, emit Message events, audit; ARCHIVED → 400; `quickReplyId` validated; Idempotency-Key honored.
  - Tags (FR-006): catalog CRUD (unique name, soft-delete cascade to assignments) + assign/remove (P2002 → no-op), audit.
  - Notes (FR-007): append-only create + list, audit; content never logged/emitted (NR-009).
  - Quick replies (FR-008): org CRUD, audit.
- [ ] T176: `conversations.controller.ts` — `GET /conversations` (extended) + `GET /conversations/{uuid}` (detail with notes/tags), `POST /conversations/{uuid}/messages` (reply), `/assign`, `/transfer`, `/close`, `/archive`, `/reopen`, `/notes` (POST/GET), `/tags/{tagUuid}` (POST/DELETE), `GET/POST /conversation-tags`, `PATCH/DELETE /conversation-tags/{uuid}`, `GET/POST /quick-replies`, `PATCH/DELETE /quick-replies/{uuid}`; `@Roles` per HG-1/HG-3/HG-4/HG-5 (all roles except tag catalog + quick replies mgmt); `ConversationsModule` imports `WhatsappModule` (R-002) and is registered in AppModule; `WhatsappModule` exports `WhatsappService`.

## Phase 3 — Tests

- [ ] T177: Unit `conversations.service.spec.ts` — bandeja filters (AS-001), detail preloads (AS-002), reply send + reopen (AS-003/004), archived → 400 (AS-005), assign/transfer any role + same-org + no-op + events (AS-006/007), close/archive/reopen guards + events (AS-008), tags CRUD + assign/remove + P2002 no-op (AS-009), notes append-only (AS-010), quick replies CRUD (AS-011), cross-tenant 404 (AS-012), audit never-throw (AS-013), idempotency (AS-014). ~35 cases.
- [ ] T178: Unit `conversations.controller.spec.ts` — role matrix per HG (AS-006/009/011), envelope (NR-002).
- [ ] T179: e2e `conversations.e2e-spec.ts` — bandeja filter (AS-001), detail (AS-002), reply 201 + reopen (AS-003/004), archived 400 (AS-005), assign/transfer any role (AS-006/007), transitions + events (AS-008), tags (AS-009), notes (AS-010), quick replies (AS-011), cross-tenant 404 (AS-012), audit rows (AS-013), concurrency no-ops (AS-014). ~14 cases.

## Phase 4 — OpenAPI

- [ ] T180: `specs/api/paths/conversations.yaml` extended (bandeja filters + reply/assign/transfer/close/archive/reopen/notes/tags sub-paths) + new `specs/api/paths/conversation-tags.yaml` + `specs/api/paths/quick-replies.yaml`; schemas `ConversationTag`, `ConversationNote`, `QuickReply` (Summary/Details/ListResponse/Response) + requests (`CreateConversationTagRequest`, `UpdateConversationTagRequest`, `CreateConversationNoteRequest`, `CreateQuickReplyRequest`, `UpdateQuickReplyRequest`, `AssignConversationRequest`, `ReplyConversationRequest`); tags `Conversation Tags`, `Quick Replies` in `info/tags.yaml`; `npm run api:validate` green.

## Phase 5 — Gates & delivery

- [ ] T181: Lint/typecheck/format; `nest build`; unit + e2e suites green; coverage target >80% (conversations module); no side effects in other suites.
- [ ] T182: Update spec checklist (checklists/requirements.md → done/notes); review diff (no unrelated files, no secrets); Conventional Commit `feat(conversations): implement conversations inbox v1` (no push unless requested).

## Out of scope (explicit)

AU-006/007 (HG-10: pause automations on open conversation, advisor notification), WhatsApp SOCIAL / multi-channel (HG-6 of 017), message templates/plantillas (HG-7 of 017), campañas (AU-010), retries of FAILED replies, media/attachments, multi-tenant channel config, dashboard consumers of Conversation*/Message* events, auto-assignment/round-robin routing, dashboard/KPI endpoints.