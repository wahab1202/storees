# Storees Operating Model — the build team

**Status:** Standing structure (v1). How every serious initiative is built from here on.
**Owner:** Wahab (founder) + Co-PM. Codified by the Documenter role.

This is not org theatre. Each role is a *lens with authority*: analysts shape what gets built; **gates can block a ship.** Nothing reaches a branch tip without passing the always-on gates.

---

## Roles

### A · Direction & Product — *what & why*
| Role | Mandate |
|---|---|
| **Co-Product Manager** (Wahab + assistant) | Frames the problem, prioritizes, makes the product call. The standing partnership. |
| **Senior UX Engineer** | UX-primary. Holds a veto: "this isn't compliant with the customer / this is confusing / too many steps." Judges the *experience*, not the pixels. |
| **Research Analyst** | Competitive + mechanism research (CleverSend, MoEngage, Klaviyo, GoKwik…). Brings patterns to copy and pitfalls to avoid. |

### B · Engineering — *how*
| Role | Mandate |
|---|---|
| **Technical Architect** | System design + consistency. Enforces "extend the existing mechanism, no parallel systems." Owns the data model. |
| **Integration / Data Specialist** | Third-party data (Shopflo, connectors, webhooks) → bindable, normalized, discoverable. |
| **UI Engineer** | Implements to the design system. (UX critiques; UI builds.) |
| **Fixer / Un-viber** | De-vibes fast-shipped code: reuse, simplify, optimize, remove dead paths. Turns "it works" into "a senior would approve it." |

### C · Delivery & Coordination
| Role | Mandate |
|---|---|
| **Delivery PM** | Sequences into shippable increments; tracks dependencies, effort, risk. |
| **Engineering Manager / Synthesizer** | Orchestrates the team, merges the lenses, resolves disagreements into one plan. |

### D · Quality & Safety — *always-on gates (can block a ship)*
| Gate | Blocks the ship unless… |
|---|---|
| **Tester** | Test cases exist for the change, they pass, and "is it actually complete" is answered — not just "typecheck is green." |
| **Security & Privacy / DPDP** | No cross-tenant leak, no PII exposure, consent respected, no new Data-Fiduciary surface shipped without sign-off. *Owns the question nobody owned when the tenant-isolation incident shipped.* |
| **Release / Deploy-safety (SRE)** | Behavior-changing work is flag-gated, migrations are additive, rollout is staged, and there's a smoke test + rollback path. *This gate would have caught the prod incident.* |
| **Adversarial Reviewer** | Actively tries to break every claim/finding before it's trusted (the refute-first pass we already use in swarms). |

### E · Knowledge
| Role | Mandate |
|---|---|
| **Documenter** | Records decisions, plans, and the "why" as we go (this file, plans, ADRs). Memory that survives context resets. |

---

## How an initiative flows

1. **Frame** — Co-PM sets the goal + priority.
2. **Understand** *(on-demand analysts, often a swarm)* — Research + Architect + Integration + UX map the space and the existing mechanism. Synthesizer merges into one plan; Delivery PM sequences it.
3. **Build** — Architect/UI/Integration implement the smallest gated increment.
4. **Gate** *(always-on, every increment)* — Tester → Security/DPDP → Release-safety → Adversarial. Any gate can send it back.
5. **Harden** — Fixer/Un-viber does the quality pass before it's "done."
6. **Record** — Documenter captures the decision + updates the relevant plan/memory.
7. **Ship** — flag-gated, staged, on both branches, with the gates green.

**Cadence rules of thumb**
- *Always-on gates* run on every change; *on-demand analysts* spin up per initiative; *standing partners* (Co-PM, EM, Documenter) are continuous.
- No behavior-changing deploy without the **Release-safety** gate. No identity/consent/PII change without the **Security/DPDP** gate. These two are non-negotiable — they're the lessons from this quarter written down.

---

## Backlog this model inherits (owed a Fixer/Security pass)
Everything shipped since the last full audit was fast + additive and has *not* had a hardening pass:
- Identity 2a–2d (merge engine, cross-brand network, consent), decisioning (Steps 1–2), the journey + WhatsApp templates.
- First job for **Fixer + Security/DPDP + Tester** once the dynamic-content plan lands.
