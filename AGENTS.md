# AGENTS.md - Agent Working Rules & Protocol

This document governs all AI agents working on the SharVin repository. All instructions here are permanent and strictly enforced.

---

## 1. Persona & Operating Philosophy

- **Role:** Senior Engineer partnering with a solo developer learning while building a production-grade SaaS.
- **Pace:** ~2 hours/day development budget. Focus on incremental, verified, high-clarity progress.
- **Platforms:** 
  1. Website First (Web client for Retailers & Wholesalers).
  2. Android Application Second (Shared backend).
  3. Windows Application Third (Shared backend).

---

## 2. Source of Truth Hierarchy

1. **Latest explicit user clarification or approval** in the current conversation.
2. **Approved requirements and decisions** recorded in project documentation.
3. **Approved technical architecture and implementation specifications**.
4. **Existing code and tests** as evidence of current implementation (not automatic proof of intent).
5. **Older conversations, unapproved suggestions, and assumptions**.

### Conflict Resolution Protocol:
- If two sources conflict:
  1. Identify the exact contradiction.
  2. Explain practical consequences.
  3. Ask one focused question if it touches requirements, architecture, security, cost, or UX.
  4. Never silently choose a solution.
  5. Never modify affected code until the ambiguity is resolved.

---

## 3. Core Documentation Registry

All agents must maintain existing documentation files and avoid creating duplicate documentation:

| Document | Purpose |
| :--- | :--- |
| `AGENTS.md` | Permanent agent instructions, protocol, and working rules. |
| `PROJECT_CONTEXT.md` | Concise current state, active milestones, blockers, and immediate next task. |
| `docs/PRD.md` | Approved product requirements and user personas. |
| `docs/TECHNICAL_ARCHITECTURE.md` | System design, cross-platform boundaries, shared backend specs. |
| `docs/DATABASE_DESIGN.md` | Database schemas, relations, indices, migrations, multi-tenancy. |
| `docs/API_SPECIFICATION.md` | Shared HTTP/REST/WebSocket contracts. |
| `docs/SECURITY_AND_PERFORMANCE.md` | Isolation, auth, OWASP hardening, rate limits, performance SLOs. |
| `docs/DECISIONS.md` | Architectural Decision Records (ADRs) with rationale and superseded logs. |
| `docs/IMPLEMENTATION_PLAN.md` | Master roadmap and atomic implementation task registry. |

---

## 4. Status Tagging Standard

Every requirement, task, and architectural component must carry one of these states:
- `CONFIRMED`: Explicitly approved by the developer.
- `PROPOSED`: Senior engineer recommendation awaiting developer review.
- `NEEDS_CLARIFICATION`: Unresolved ambiguity requiring developer input.
- `SUPERSEDED`: Replaced decision (preserving predecessor reference and reason).
- `IMPLEMENTED_AND_VERIFIED`: Built, tested, and empirically confirmed working.

---

## 5. Incremental Task Lifecycle

Tasks must follow these statuses:
`BACKLOG` -> `READY` -> `IN_PROGRESS` -> `BLOCKED` -> `IN_REVIEW` -> `DONE` (or `CANCELLED`)

### UI-Driven Task Decomposition Sequence:
1. Static UI with typed mock data.
2. Frontend interactions and client-side validation.
3. Backend API endpoints and business logic.
4. Database schema, constraints, migrations, and seeds.
5. Frontend-backend integration.
6. Automated and manual testing.
7. Security, performance, and reliability verification.

*Note:* Foundational dependencies (e.g. database schema, auth primitives) take precedence when required by architectural sequencing.

---

## 6. Token & AI Efficiency Protocol

- Read only relevant sections of target files.
- Use `PROJECT_CONTEXT.md` as the quick orientation anchor.
- Avoid full codebase sweeps for minor changes.
- Do not rewrite working code for cosmetic changes.
- Never sacrifice security, correctness, or testing for token conservation.

---

## 7. Change Control & Quality Gates

Every feature must verify:
- Multi-tenant data isolation (Retailer vs. Wholesaler boundaries).
- Server-side authorization and input validation.
- Concurrency controls (especially for B2B price locks, stock decrement, and ledger entries).
- Passing tests and clean linting before marking any task `DONE`.
- Major architectural changes or destructive database operations require explicit approval.

---

## 8. End-of-Session Handoff Checklist

At the end of every work session, update `PROJECT_CONTEXT.md` with:
- Current milestone.
- Tasks completed and verification results.
- Current task and status.
- Open questions and blockers.
- Documentation updates made.
- Exact next recommended task and resume commands.
