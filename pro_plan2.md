# Production Plan 2.0 (`pro_plan2.md`)
## Gap Analysis & Remediation Plan for `Round_One_Task.pdf`

This document provides a thorough audit of the current application against the official specification document `Round_One_Task.pdf`, identifies all gaps/missing features, and outlines an actionable step-by-step implementation plan to achieve 100% specification compliance.

---

## 1. Executive Compliance Audit

| Specification Requirement in PDF | PDF Page | Current App Status | Notes / Findings |
| :--- | :---: | :---: | :--- |
| **IT Vendor Persona & Requisitions Table** | P. 1–2, 4–5 | ✅ **Implemented** | Paginated table, tenant-scoped, status badges, details panel. |
| **Secure Presigned Uploads (PDF, PPTX)** | P. 1, 5 | ✅ **Implemented** | `<bucket>/<tenantId>/<openingId>/<timestamp>_<filename>`. S3 credentials never exposed to client. |
| **Transactional Profile Submission** | P. 2, 5 | ✅ **Implemented** | Atomic batch creation inside single `prisma.$transaction(...)`. |
| **Vendor Soft-Delete** | P. 2, 6 | ✅ **Implemented** | `DELETE /api/vendor/profiles/:id` with tenant & uploader ownership check. |
| **File Preview via Backend** | **P. 6** | ❌ **MISSING** | **Backend preview endpoint and frontend "Preview Resume" button/modal are not yet implemented.** |
| **Strict Multi-Role RBAC & Tenant Scoping** | P. 2, 6–7 | ✅ **Implemented** | Full route guards, JWT verification, and AI field sanitization for IT Vendors. |
| **Seeding Requirements ("Bruce Wayne Corp", ≥12 openings)** | P. 4 | ✅ **Implemented** | 13 varied openings seeded under single tenant. |
| **Hiring Manager APIs & Dashboard** | P. 6–7, 12 | ✅ **Implemented** | `GET /openings`, `GET /openings/:id/profiles`, `POST /shortlist`, `POST /reject`. |
| **Hiring Manager Candidate Cards (Badge, Score %, Latency)** | P. 12–13 | ✅ **Implemented** | Cards display file name, date, badge color, score %, confidence %, explanation, processing time, actions. |
| **Table / List Virtualization (>50 records)** | P. 13 | ✅ **Implemented** | Virtualized via `react-window` `FixedSizeList` when records > 50. |
| **Skeleton Loaders** | **P. 13** | ⚠️ **PARTIAL** | **Uses basic spinning loader (`Loader2`); needs dedicated animated pulse skeleton cards.** |
| **Error Boundaries** | **P. 13** | ⚠️ **PARTIAL** | **Component-level error states exist, but top-level React `ErrorBoundary` class component is missing.** |
| **AI Recommendation Agent (Tool-Calling)** | P. 7–8 | ✅ **Implemented** | Multi-turn `AgentOrchestrator` calling tools via function calling. |
| **Prompt Injection Defense & Schema Validation** | P. 7–9 | ✅ **Implemented** | CDATA encapsulation, Zod schemas, self-correction retry loop up to 3 times. |
| **Deterministic Scoring Engine Outside LLM** | P. 8–10 | ✅ **Implemented** | Pure math tool `0.5*skills + 0.3*exp + 0.2*loc`. Rounded and bounded [0.0, 1.0]. |
| **Decision Thresholds (≥0.75, 0.5–0.74, <0.5)** | P. 11 | ✅ **Implemented** | `RECOMMENDED`, `BORDERLINE`, `NOT_RECOMMENDED`. |
| **Strict Performance Constraints (P95 < 2000ms)** | P. 11 | ✅ **Implemented** | Automated load test passed with P95 = 249ms, max HTTP blocking = 28ms. |
| **Persist Intermediate Reasoning Metadata** | **P. 7** | ⚠️ **PARTIAL** | **Intermediates are logged in JSON, but sub-score breakdowns (skillMatch, expMatch, locMatch) are not persisted to DB or visualized in UI.** |
| **Full Automated Test Suite & Coverage** | P. 14 | ✅ **Implemented** | 93 automated tests passing, 85.5% statement coverage report generated. |

---

## 2. Detailed Breakdown of Missing Items

### Gap 1: File Preview via Backend (PDF Page 5 & 6)
- **PDF Requirement**:
  - Page 5: *"No frontend → direct S3 access."*
  - Page 6: *"File preview via backend."*
- **Current State**:
  The application generates presigned PUT URLs for uploads, but neither the backend has a preview endpoint, nor does the frontend have a "View/Preview Resume" button.
- **What Needs to Be Built**:
  1. **Backend Endpoint**:
     - `GET /api/vendor/profiles/:id/preview`: Validates vendor role, tenant, and that the vendor uploaded the profile, then returns a short-lived presigned GET URL (or streams the file) for secure inline viewing.
     - `GET /api/hiring-manager/profiles/:id/preview`: Validates hiring manager role, tenant, and that the profile belongs to an opening owned by that manager, then returns the presigned preview URL.
  2. **Frontend UI**:
     - Add a "Preview" / eye icon button on each uploaded resume row in `VendorOpeningDetailPage.tsx`.
     - Add a "View Resume" / document button on each candidate card in `HiringManagerOpeningDetailPage.tsx`.
     - Create an accessible **Resume Preview Modal** (or secure new-tab viewer) that displays the document (PDF viewer / iframe).

---

### Gap 2: UI Skeleton Loaders (PDF Page 13)
- **PDF Requirement**:
  - Page 13: *"Must support: Skeleton loaders"*
- **Current State**:
  Components currently show a centered spinning icon (`<Loader2 className="animate-spin" />`) while fetching data.
- **What Needs to Be Built**:
  1. Create a reusable `SkeletonCard` and `SkeletonRow` component with Tailwind's `animate-pulse` effect:
     - Placeholder headers, badges, text lines, and button blocks matching exact layout dimensions.
  2. Integrate skeleton loaders into:
     - `VendorOpeningsPage`: Table row skeletons while fetching requisitions.
     - `VendorOpeningDetailPage`: Detail summary & file list skeletons.
     - `HiringManagerOpeningsPage`: Openings grid card skeletons.
     - `HiringManagerOpeningDetailPage`: Candidate profile card skeletons simulating AI score progress bars, badges, and action buttons.

---

### Gap 3: React Error Boundary Component (PDF Page 13)
- **PDF Requirement**:
  - Page 13: *"Must support: Error boundaries"*
- **Current State**:
  The application catches network errors in `try/catch` and displays simple conditional error banners, but lacks a React `ErrorBoundary` lifecycle component to catch unexpected JavaScript crashes in child component trees.
- **What Needs to Be Built**:
  1. Create `frontend/src/components/ErrorBoundary.tsx`:
     - Standard React class component implementing `componentDidCatch` and `getDerivedStateFromError`.
     - Displays an elegant recovery fallback UI with an error message and a "Reload Section" / "Back to Home" button.
  2. Wrap route trees and detail panels in `App.tsx` and detail pages with `<ErrorBoundary>`.

---

### Gap 4: Persist Intermediate Reasoning Metadata (PDF Page 7)
- **PDF Requirement**:
  - Page 7, Item 8: *"Persist intermediate reasoning metadata."*
  - Page 9: *"Pass structured feature vector to matching tool. Receive scoring breakdown. Use this result in reasoning step."*
- **Current State**:
  The orchestrator calculates `skillMatchScore`, `experienceMatchScore`, and `locationMatchScore`, and logs them to stdout (`[AGENT_OBSERVABILITY_LOG]`), but does not save these intermediate breakdown values in PostgreSQL.
- **What Needs to Be Built**:
  1. Add an optional JSON field `reasoningMetadata Json?` to the `hiringProfile` model in `schema.prisma`.
  2. During `RecommendationService.evaluateProfile`, persist `{ skillMatchScore, experienceMatchScore, locationMatchScore, matchingSkills, missingSkills }` into `reasoningMetadata`.
  3. Enrich `GET /api/hiring-manager/openings/:id/profiles` to return this intermediate breakdown.
  4. In `HiringManagerOpeningDetailPage.tsx`, display an expandable **AI Breakdown Sub-Panel** showing:
     - Skill Match: `80%` (Matches: React, TypeScript | Missing: AWS)
     - Experience Match: `100%` (5 yrs within 4–8 yrs range)
     - Location Match: `100%` (Remote)

---

## 3. Phased Implementation Roadmap for `pro_plan2.md`

### Phase 2.1 — Backend Secure File Preview APIs & S3 Presigned GET
- [ ] Add `S3Service.getPresignedDownloadUrl(s3Key, expiresInSeconds)`.
- [ ] Implement `GET /api/vendor/profiles/:id/preview` with tenant & vendor ownership validation.
- [ ] Implement `GET /api/hiring-manager/profiles/:id/preview` with tenant & manager opening ownership validation.
- [ ] Write integration test verifying unauthorized / cross-tenant preview attempts are rejected (403/404).

### Phase 2.2 — Intermediate Reasoning Metadata Persistence
- [ ] Update `prisma/schema.prisma` to include `reasoningMetadata Json?` on `hiringProfile`.
- [ ] Run migration `add_reasoning_metadata`.
- [ ] Update `RecommendationService` to persist intermediate breakdown `{ skillMatchScore, experienceMatchScore, locationMatchScore, normalizedSkills }`.
- [ ] Update `HiringManagerController.getProfiles` to expose `reasoningMetadata`.

### Phase 2.3 — Frontend UI Polish: Skeletons, Error Boundary, & Preview Modal
- [ ] Create `frontend/src/components/ErrorBoundary.tsx` and wrap application routes.
- [ ] Create `frontend/src/components/SkeletonLoader.tsx` with pulsing card and table skeletons.
- [ ] Update `VendorOpeningDetailPage.tsx` and `HiringManagerOpeningDetailPage.tsx` to display skeleton loaders during fetch states.
- [ ] Implement Resume Preview button and modal viewer in both Vendor and Hiring Manager views.
- [ ] Display the intermediate AI reasoning breakdown (Skills, Experience, Location) on the profile cards.

### Phase 2.4 — Verification & Test Gate 2.0
- [ ] Run all backend unit, integration, and load tests.
- [ ] Run all frontend component tests.
- [ ] Verify 0 lint errors across workspaces.
- [ ] Update `README.md` and complete final verification pass.

