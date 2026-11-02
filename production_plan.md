# Vendor–Hiring Manager Contract Management Module
## A-to-Z Build Plan (Phased, Test-Gated)

> Target: Production-grade multi-tenant hiring platform with a real LLM tool-calling agent.
> Rule for the AI agent executing this plan: **Do not proceed to the next phase until the
> current phase's test gate passes.** If a test gate fails, fix the code, re-run, and only
> then advance. Report pass/fail status explicitly after each phase.

---

## Phase 0 — Project Scaffolding & Tooling

### Goals
- Repo structure, language/framework choices, linting, CI skeleton.

### Tasks
1. Initialize monorepo (or separate `/backend`, `/frontend`) with:
   - Backend: Node.js + TypeScript + Express/Fastify/NestJS (pick one, document choice)
   - ORM: Prisma
   - DB: PostgreSQL (via Docker Compose for local dev)
   - Frontend: React + TypeScript + Vite
2. Add `.env.example` with all required vars (`DATABASE_URL`, `S3_BUCKET`, `S3_REGION`,
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `JWT_SECRET`, `LLM_PROVIDER`,
   `LLM_API_KEY`, `LLM_MODEL`).
3. Configure ESLint + Prettier + Husky pre-commit hooks.
4. Set up Jest (or Vitest) for backend, React Testing Library for frontend.
5. Set up Docker Compose: Postgres + localstack (S3 emulation) for local/dev/test.
6. Create CI workflow (GitHub Actions) that runs lint + unit tests on push.

### Test Gate 0
- [ ] `docker compose up` starts Postgres + S3 emulation cleanly.
- [ ] `npm run lint` passes with zero errors.
- [ ] `npm test` runs (even with 0 tests) without crashing.
- [ ] CI pipeline is green on initial commit.

**Do not continue until Gate 0 passes.**

---

## Phase 1 — Database Schema & Migrations

### Goals
- Implement the exact Prisma schema from the spec, plus a `Tenants` and `User` model
  (spec references `Tenants` and `hiringManagerId`/`uploadedBy` as user identifiers but
  doesn't give a User model — add one, since auth requires it).

### Tasks
1. Create Prisma schema:
   - `Tenants` model (`tenantId` PK, `name`)
   - `User` model (`id`, `tenantId`, `email`, `passwordHash`, `role` enum
     [`IT_VENDOR`, `HIRING_MANAGER`], `name`, timestamps)
   - `Opening` model exactly as specified (fields, enum `OpeningStatus`, index on `tenantId`)
   - `hiringProfile` model exactly as specified (fields, enum `ProfileStatus`, indexes on
     `openingId` and `recommended`)
   - Relations: `Opening.hiringManagerId` → `User.id`; `hiringProfile.uploadedBy` → `User.id`
2. Add a migration.
3. Write a seed script (`prisma/seed.ts`):
   - Tenant: `"Bruce Wayne Corp"`
   - At least 1 `HIRING_MANAGER` user and 1+ `IT_VENDOR` user under that tenant
   - At least 12 `Opening` records, varied `title`, `experienceMin/Max`, `contractType`,
     `location`, `status`
   - All seed data under the same `tenantId`
4. Add a `check-tenant-isolation.ts` script/test that asserts no cross-tenant FK leakage.

### Test Gate 1
- [ ] `npx prisma migrate dev` runs cleanly against the Dockerized DB.
- [ ] `npx prisma db seed` populates exactly 1 tenant, ≥12 openings, correct relations.
- [ ] Unit test: querying openings filtered by `tenantId` returns only that tenant's rows.
- [ ] Unit test: schema matches spec field-for-field (types, defaults, indexes).

**Do not continue until Gate 1 passes.**

---

## Phase 2 — Auth, RBAC & Tenant Isolation Middleware

### Goals
- JWT-based auth; role + tenant enforcement at the API layer, not just UI.

### Tasks
1. `/api/auth/login` (and optionally `/register` for seeding test users) issuing JWT with
   `{ userId, tenantId, role }`.
2. Auth middleware: verifies JWT, attaches `req.user`.
3. RBAC middleware: `requireRole('IT_VENDOR' | 'HIRING_MANAGER')`.
4. Tenant-scoping middleware/helper: every Prisma query for openings/profiles must inject
   `tenantId: req.user.tenantId` (or `hiringManagerId: req.user.id` where applicable) —
   centralize this so individual route handlers can't forget it.
5. Explicitly implement the rule matrix from the spec:
   - IT_VENDOR: view openings (own tenant), upload, view own uploads, soft-delete own
     uploads, submit — **cannot** view AI recommendation, **cannot** shortlist/reject.
   - HIRING_MANAGER: view own openings only (`opening.hiringManagerId === user.id`), view
     profiles + AI recommendation, shortlist/reject — **cannot** upload.
6. Ensure failure path = 403 with no data leakage (don't reveal existence of other
   tenants'/managers' resources).

### Test Gate 2
- [ ] Unit tests: login issues valid JWT; invalid creds rejected.
- [ ] Unit tests for every rule in the matrix above (positive + negative cases).
- [ ] Integration test: IT_VENDOR hitting a hiring-manager-only endpoint → 403.
- [ ] Integration test: HIRING_MANAGER A cannot access HIRING_MANAGER B's opening → 403/404.
- [ ] Integration test: cross-tenant access attempt → 403/404, zero data returned.

**Do not continue until Gate 2 passes.**

---

## Phase 3 — S3 Integration & IT Vendor Upload APIs

### Goals
- Presigned upload flow, backend-only S3 access, transactional profile submission.

### Tasks
1. S3 client wrapper (works against localstack in dev/test, real S3 in prod).
2. `GET /api/vendor/openings` — paginated, tenant-filtered.
3. `GET /api/vendor/openings/:id` — includes hiring manager name, experience range,
   profile count, uploaded profiles list (own uploads only).
4. `POST /api/vendor/openings/:id/profiles/presign` — generates presigned PUT URL(s),
   key pattern `<bucket>/<tenantId>/<openingId>/<timestamp>_<filename>`, validates file
   type (PDF/PPTX only) and tenant/opening ownership before issuing URL.
5. `POST /api/vendor/openings/:id/profiles/upload` — records `hiringProfile` rows inside a
   **Prisma transaction**; rejects if any row fails (no partial writes).
6. Soft delete endpoint (`isDeleted = true`), restricted to the uploader.
7. Input validation (zod/yup) on all endpoints; reject malformed payloads with 400.

### Test Gate 3
- [ ] Unit tests: presign rejects non-PDF/PPTX, rejects opening not in vendor's tenant.
- [ ] Integration test: full upload flow (presign → PUT to S3 emulator → submit) creates
      correct `hiringProfile` rows with correct `s3Key` pattern.
- [ ] Integration test: transaction rollback — simulate a failure mid-batch-upload and
      assert zero rows persisted.
- [ ] Integration test: vendor A cannot see vendor B's uploads within the same opening.
- [ ] Integration test: soft-deleted profiles excluded from default list queries.

**Do not continue until Gate 3 passes.**

---

## Phase 4 — IT Vendor Frontend

### Goals
- `/vendor/openings` list + `/vendor/openings/:id` detail with upload UX.

### Tasks
1. Auth-gated routing (route guards redirect unauthenticated/wrong-role users).
2. Openings table: Title, Location, Contract Type, Posted Date, Hiring Manager Name —
   paginated, loading skeletons, error boundary.
3. Opening detail page: details panel, drag-and-drop multi-file upload (PDF/PPTX),
   progress indicators, calls presign → direct-to-S3 PUT → submit flow.
4. Uploaded profiles list (own uploads), soft-delete action, backend-proxied file preview
   (no direct S3 links exposed to frontend).
5. Light/dark theme toggle (persisted).
6. Client-side validation mirroring backend (file type/size) for fast feedback — backend
   remains source of truth.

### Test Gate 4
- [ ] Component tests: openings table renders, paginates, handles empty/error states.
- [ ] Component tests: upload flow (mocked API) handles success, validation error, and
      network failure paths.
- [ ] E2E (Playwright/Cypress) happy path: login as vendor → view opening → upload file →
      see it listed.
- [ ] Manual/automated a11y check (route guards, keyboard nav on upload widget).

**Do not continue until Gate 4 passes.**

---

## Phase 5 — AI Recommendation Agent (Core Requirement)

> This is the highest-scrutiny phase per the spec. Read the "Strict Failure Conditions"
> section before writing any code here.

### Goals
- Real LLM tool-calling agent (Gemini or Groq free-tier model), not a single-shot wrapper.

### Architecture (must match spec exactly)

Controller (no business logic)
→ Recommendation Service
→ Agent Orchestrator (maintains reasoning state, retry loop)
→ LLM Core (tool/function-calling enabled)
→ Tool Registry:
- Resume Parsing Tool
- Feature Extraction Tool
- Skill Normalization Tool
- Deterministic Matching Engine (tool)
- Scoring Engine (tool)
→ Schema Validator (validates every tool output + final LLM output)
→ Decision Policy (applies thresholds)
→ Persist Result (transactional)

### Tasks
1. **LLM Core**: integrate Groq (e.g. Llama 3.1/3.3 tool-calling) or Gemini (function
   calling) SDK. Wrap in a provider-agnostic interface so the model can be swapped.
2. **Tool Registry** — implement each as an independently callable, independently testable
   function with a JSON schema:
   - *Resume Parsing Tool*: fetches file from S3 (backend-only), extracts text (PDF via
     `pdf-parse`, PPTX via a PPTX text extractor), returns raw text — **never** returns raw
     file bytes to the LLM, only extracted text.
   - *Feature Extraction Tool*: LLM-assisted or hybrid extraction of
     `{ experienceYears, skills, normalizedSkills, location, education, keywords }` from
     parsed text, validated against the schema in the spec.
   - *Skill Normalization Tool*: maps raw skill strings to a canonical taxonomy (e.g.
     "ReactJS"/"React.js"/"react" → "React").
   - *Deterministic Matching Engine*: pure function, no LLM, implements:
     - Experience: `<min → 0`, `within range → 1`, `>max → 0.8`
     - Skill match: `overlap / requiredSkills`
     - Location: `remote → 1`, `onsite mismatch → 0.5`, `exact → 1`
   - *Scoring Engine*: pure function, **outside the LLM**, computes
     `FinalScore = 0.5*skillMatchScore + 0.3*experienceMatchScore + 0.2*locationMatchScore`,
     returns `{ skillMatchScore, experienceMatchScore, locationMatchScore, finalScore }`.
3. **Prompt injection mitigation**: sanitize all resume-derived text before it enters any
   LLM prompt — strip/escape instruction-like patterns (e.g. "ignore previous instructions"),
   never interpolate raw resume text directly into a system prompt; pass it as clearly
   delimited/tagged user-content data, and instruct the model to treat it as data only.
4. **Agent Orchestrator**:
   - Decides dynamically (via the LLM's tool-calling, not hardcoded sequencing) when to
     invoke parsing/extraction/normalization/matching/scoring.
   - Maintains reasoning state across tool calls (conversation/transcript object).
   - Retry logic: if LLM output fails schema validation, retry up to N times (e.g. 3) with
     corrective feedback injected; log each attempt.
   - Logs token usage and latency per call.
5. **Schema Validator**: zod schema for both intermediate tool outputs and the final agent
   output:
   ```json
   { "recommended": true, "score": 0.82, "confidence": 0.91, "reason": "..." }
   ```
   Reject and retry on validation failure; never persist unvalidated output.
6. **Decision Policy**: thresholds — `≥0.75 Recommended`, `0.5–0.74 Borderline`,
   `<0.5 Not Recommended`.
7. **Persistence**: single Prisma transaction writing all `recommendation*` fields +
   `recommendationLatencyMs`, `recommendationVersion`, `recommendedAt`. Idempotent —
   re-running for the same profile overwrites cleanly, no duplicate/partial state.
8. **Trigger**: automatically fire the agent when a profile status becomes `SUBMITTED` by
   an `IT_VENDOR` (event/hook after Phase 3's submit endpoint, run async/background so the
   upload request isn't blocked).
9. **Observability**: structured JSON logs for start time, parsing time, matching time,
   final score, and any errors, per the Observability section of the spec.

### Test Gate 5
- [ ] Unit tests: Scoring Engine — exact formula correctness across boundary values
      (candidateExp = min-1, min, mid-range, max, max+1).
- [ ] Unit tests: Skill Match — overlap/requiredSkills edge cases (0 overlap, full overlap,
      empty requiredSkills).
- [ ] Unit tests: Location Match — remote/onsite-match/onsite-mismatch.
- [ ] Unit tests: Schema Validator rejects malformed LLM output; retry logic triggers and
      caps at max attempts.
- [ ] Unit tests: prompt-injection fixture (resume text containing "ignore all previous
      instructions...") does not alter agent behavior or leak into system prompt verbatim.
- [ ] Integration test (with LLM calls mocked/stubbed): full agent run — parse → extract →
      normalize → match → score → decide → persist — produces correct DB row and correct
      `recommendationLatencyMs`.
- [ ] Integration test (real LLM, rate-limited/sandboxed): at least one live end-to-end run
      against a sample resume to confirm actual tool-calling works, not just mocks.
- [ ] Idempotency test: re-triggering recommendation for the same profile does not create
      duplicate/partial rows.
- [ ] Log assertions: structured JSON logs contain all required fields.

**Do not continue until Gate 5 passes. This phase is the core evaluation criterion —
do not skip or stub out real tool-calling.**

---

## Phase 6 — Hiring Manager APIs

### Goals
- Own-openings scoping, profile review with AI data, shortlist/reject actions.

### Tasks
1. `GET /api/hiring-manager/openings` — only `hiringManagerId === req.user.id`.
2. `GET /api/hiring-manager/openings/:id/profiles` — includes recommendation badge, score,
   confidence, explanation, latency; excludes soft-deleted profiles.
3. `POST /api/hiring-manager/profiles/:id/shortlist` — enforces
   `opening.hiringManagerId === loggedInUser.id`; sets `shortlistedBy`/`shortlistedAt`,
   status → `SHORTLISTED`, inside a transaction.
4. `POST /api/hiring-manager/profiles/:id/reject` — same ownership check, status →
   `REJECTED`, transactional.
5. Guard: a manager cannot shortlist/reject a profile belonging to another manager's
   opening, even by guessing profile IDs (test this explicitly).

### Test Gate 6
- [ ] Unit/integration tests for the ownership condition on every endpoint.
- [ ] Integration test: shortlist/reject are transactional and idempotent (double-clicking
      doesn't corrupt state).
- [ ] Integration test: profiles list correctly surfaces all AI fields from Phase 5.
- [ ] Integration test: manager cannot act on another manager's profile via direct ID.

**Do not continue until Gate 6 passes.**

---

## Phase 7 — Hiring Manager Frontend

### Goals
- `/hiring-manager/openings` and `/hiring-manager/openings/:id` with profile review UX.

### Tasks
1. Openings list (own openings only), route-guarded.
2. Opening detail: profile cards showing file name, upload date, recommendation badge
   (🟢 Recommended / 🟡 Borderline / 🔴 Not Recommended), score %, confidence %,
   explanation, processing time, Shortlist/Reject buttons.
3. Table virtualization for >50 records (e.g. `react-window`).
4. Skeleton loaders, error boundaries, dark mode, responsive layout.
5. Optimistic UI or clear loading state on shortlist/reject actions, with rollback on
   failure.

### Test Gate 7
- [ ] Component tests: profile card renders all required fields and correct badge color
      per threshold band.
- [ ] Component tests: virtualization kicks in above 50 records (render count check).
- [ ] E2E happy path: login as manager → view opening → see AI recommendation → shortlist
      a profile → status updates in UI.
- [ ] E2E negative path: action on a profile under another manager's opening is blocked.

**Do not continue until Gate 7 passes.**

---

## Phase 8 — Cross-Cutting: ACID, Observability, Performance Hardening

### Goals
- Tie together transactional integrity, logging, and the strict performance SLAs.

### Tasks
1. Audit every write path (uploads, recommendation persistence, shortlist/reject) to
   confirm single-transaction, no-partial-write behavior.
2. Add async/queue-based processing for the recommendation agent if not already
   non-blocking (e.g. a lightweight job queue — BullMQ/Redis, or an async worker) so
   upload requests return immediately and recommendation runs in the background.
3. Enforce performance budgets in code paths:
   - Per-profile agent processing ≤ 1500ms (log + alert if exceeded).
   - No single blocking API call > 2000ms.
4. Centralize structured JSON logging (start time, parsing time, matching time, final
   score, errors) across all services, not just the agent.
5. Add request-id correlation across controller → service → agent → persistence for
   traceability.

### Test Gate 8
- [ ] Integration test: simulate a mid-transaction failure in the submit/upload flow and
      confirm zero partial rows.
- [ ] Integration test: simulate a mid-transaction failure in shortlist/reject and confirm
      no state corruption.
- [ ] Load test harness ready (see Phase 9) — confirm async queue doesn't block the HTTP
      response thread.

**Do not continue until Gate 8 passes.**

---

## Phase 9 — Full Test Suite & Performance Validation

### Goals
- Satisfy every explicit testing requirement in the spec.

### Tasks
1. **Unit tests** (consolidate/complete from earlier phases):
   - Experience boundary tests
   - Skill overlap accuracy
   - Score formula correctness
   - Location logic
   - Unauthorized access tests
   - Tenant leakage tests
2. **Integration test**: full flow — Upload → Submit → Recommend → Shortlist — single
   end-to-end test asserting correct state at each step.
3. **Performance test**: simulate 100 profiles submitted concurrently (or in rapid
   succession); assert:
   - P95 recommendation latency < 2000ms
   - No individual blocking call exceeds 2000ms
4. Produce a coverage report; target meaningful coverage on business-logic modules
   (scoring, matching, RBAC, agent orchestrator) — not just line-count padding.

### Test Gate 9
- [ ] All unit tests pass (full list above, 100%).
- [ ] Full-flow integration test passes.
- [ ] Performance test passes P95 < 2000ms over 100 simulated profiles.
- [ ] Coverage report generated and reviewed for gaps in critical paths.

**Do not continue until Gate 9 passes.**

---

## Phase 10 — Seeding, Docs & Final Spec Compliance Pass

### Goals
- Confirm every explicit requirement and every "Strict Failure Condition" is satisfied.

### Tasks
1. Re-run seed script against a clean DB; verify tenant `"Bruce Wayne Corp"`, ≥12 openings,
   varied roles/experience/contract types, single-tenant isolation intact.
2. Write `README.md`: setup instructions, env vars, how to run migrations/seed, how to run
   tests, architecture diagram (controller → service → orchestrator → tools), and a short
   write-up of the scoring formula and decision thresholds for reviewer reference.
3. Walk the "Strict Failure Conditions" checklist from the spec and confirm each is
   addressed:
   - [ ] LLM tool-calling actually used (not simulated)
   - [ ] Scoring logic is NOT embedded in the controller
   - [ ] Resume parsing is NOT purely regex without agent invocation
   - [ ] Schema validation layer exists
   - [ ] Prompt injection mitigation exists
   - [ ] Retry logic on malformed LLM response exists
   - [ ] Token usage logging exists
4. Walk the "Final System Expectations" checklist:
   - [ ] 2 personas supported
   - [ ] Strict RBAC enforced
   - [ ] Tenant isolation maintained
   - [ ] S3 files securely managed (no direct frontend access)
   - [ ] Deterministic AI agent implemented
   - [ ] Performance SLAs met
   - [ ] Production-grade, testable, explainable

### Test Gate 10 (Final Acceptance)
- [ ] Every checkbox above is checked and backed by a passing automated test or a
      documented manual verification.
- [ ] Full CI pipeline (lint + unit + integration + performance) green on a clean clone.
- [ ] Fresh `git clone` → `docker compose up` → `prisma migrate` → `prisma db seed` →
      `npm run dev` works with zero manual intervention.

---

## Execution Notes for the AI Agent

- Work phase-by-phase, strictly in order; Phase 5 depends on Phases 1–3, Phase 6/7 depend
  on Phase 5's output shape.
- After each phase, run that phase's **Test Gate** and paste the actual test output/results
  before moving on — do not claim a gate passed without running it.
- If a test gate fails, stop, diagnose, fix, and re-run before advancing — do not patch
  forward in later phases.
- Treat the "Strict Failure Conditions" section as hard blockers, not suggestions —
  especially around the AI agent (Phase 5): a single LLM call mapped directly to the DB is
  an explicit rejection condition.