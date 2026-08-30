# DAO Delegate Mandate Guard

DAO Delegate Mandate Guard turns a human-readable delegation policy into an auditable, AI-evaluated on-chain boundary for DAO voting actions.

## Verified links

- Detailed evidence: [docs/VERIFICATION.md](docs/VERIFICATION.md)
- PRE_DEPLOY manifest: [docs/PRE_DEPLOY_MANIFEST.json](docs/PRE_DEPLOY_MANIFEST.json)
- This judge-requested correction is a fresh immutable source revision. The prior Studionet address, deployment transaction, and Vercel release are superseded and are not evidence for this revision.

## Trust problem

A DAO owner may delegate voting authority without trusting the delegate to interpret a broad mandate faithfully. Proposal authors can also phrase actions ambiguously. A private frontend decision is not enough: the mandate, proposal, AI verdict, delegate intent, capability use, and revocation history must remain independently inspectable.

## Why GenLayer is essential

Whether a natural-language proposal stays inside a natural-language mandate is nondeterministic. The contract uses `gl.exec_prompt` under GenLayer validator consensus to classify each proposal as `WITHIN_MANDATE`, `CONDITIONAL`, `OUTSIDE_MANDATE`, or `AMBIGUOUS`. Only an approved result creates a usable capability; the verdict and reasoning become on-chain state and append-only audit evidence.

## How it works

1. An owner creates a mandate for a delegate with policy text, exclusions, and expiry.
2. A canonical Snapshot proposal URL is submitted; validators fetch and pin the proposal identity, title, body, and hash from Snapshot's GraphQL endpoint.
3. GenLayer validators evaluate the proposal and persist the verdict and reasoning.
4. For a granted capability, the delegate records voting intent; capability use re-fetches the canonical proposal and requires a closed proposal with non-zero final scores, then stores a deterministic governance-action proof.
5. The owner can revoke the mandate; unauthorized revocation fails without changing state.
6. Anyone can inspect mandates, capabilities, and the audit timeline.

The frontend supports exactly MetaMask, OKX Wallet, and Rabby through EIP-6963/EIP-1193 discovery. Opening the chooser performs no account request, the selected provider remains isolated, and every reload starts disconnected.

## Architecture

```text
React/Vite frontend
  ├─ wallet boundary: provider discovery, explicit selection, Studionet switch
  ├─ contract service: submit, finality/execution checks, reconciliation
  └─ parsers/UI: canonical readback and audit presentation
                │
                ▼
GenLayer Studionet Intelligent Contract
  ├─ deterministic authorization and state transitions
  ├─ canonical Snapshot proposal binding and final governance-action proof
  ├─ nondeterministic proposal evaluation via validator consensus
  └─ authoritative mandates, capabilities, and append-only audit log
```

The chain is the source of truth. The browser stores no durable wallet session and does not infer entity IDs from aggregate counters.

## Intelligent Contract

- Actors: mandate owner, named delegate, and public readers.
- Mandate states: `ACTIVE` → `REVOKED`; expiry is derived from the stored UTC timestamp.
- Capability states: `PENDING` → `GRANTED` / `DENIED`; `record_intent` appends an `INTENT_RECORDED` audit event while status remains `GRANTED`, then verified final Snapshot state transitions `GRANTED` → `USED`.
- Core writes: `create_mandate`, `submit_proposal`, `evaluate_capability`, `record_intent`, `use_capability`, `revoke_mandate`.
- Core reads: mandate/capability/audit getters and counts.
- AI equivalence is constrained to a canonical JSON decision schema and fixed verdict/condition categories.
- Proposal title/body fields supplied by the browser are not authoritative; the contract stores only the validator-agreed canonical Snapshot record. Use notes are generated from the verified closed proposal outcome.
- Deployment classification: `INTENTIONALLY_FROZEN`; there is no public upgrade path or upgrader claim.

## Transaction lifecycle

The frontend reports `SIGNING → SUBMITTED → CONSENSUS_PENDING → FINALIZED → EXECUTION_SUCCESS → READBACK_CONFIRMED`. `ACCEPTED` is not treated as final. Timeout, cancellation, execution failure, and readback mismatch are distinct terminal outcomes; uncertain outcomes surface `RECONCILIATION_REQUIRED` instead of encouraging a blind retry.

## Run locally

Prerequisites: Python 3.12 with `uv`, and the existing Node/Corepack runtime.

```powershell
uv sync --frozen
cd frontend
corepack.cmd pnpm install --frozen-lockfile
Copy-Item .env.example .env
```

Set this non-secret value in `frontend/.env`:

```dotenv
VITE_CONTRACT_ADDRESS=0x0366737fedfe950b7Baa3D9e05F439a591809a20
```

Then run `corepack.cmd pnpm dev` from `frontend`.

## Tests and verification

Verified on 2026-08-30 for the judge-requested correction:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\direct -q
# 20 passed

cd frontend
corepack.cmd pnpm test run --reporter=dot
# 4 files, 92 tests passed

corepack.cmd pnpm build
# TypeScript and Vite production build passed

corepack.cmd pnpm audit --prod
# No known vulnerabilities
```

Live Studionet evidence and the complete proof matrix are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Deployment

- Network: GenLayer Studionet
- Chain ID: `61999` (`0xF22F`)
- RPC: `https://studio.genlayer.com/api`
- Explorer: `https://explorer-studio.genlayer.com`
- Constructor arguments: none
- Contract deployment: pending fresh PRE_DEPLOY review and Studionet redeployment for this correction.
- Contract source SHA-256 after canonical LF normalization: `EB71FDBD9BB1E07B02DF69E1DC1AD724E24AE9C361A376DE1FBB11C407622B7A`.

If Studionet or local Studio state is reset, redeploy the same reviewed source as a fresh immutable instance, update the public address, rerun the live matrix, and obtain a refreshed review. Never reuse private keys or deployment state from another task.

## Security and trust boundaries

- Owner and delegate authorization is enforced by the contract, not the UI.
- Unknown injected wallets are excluded; requests go only to the provider explicitly selected by the user.
- Contract responses pass strict canonical JSON parsing before rendering.
- Writes require finality, successful execution, and authoritative readback.
- No private key, wallet export, credential, or secret belongs in this repository.
- AI consensus evaluates scope; it does not replace deterministic actor, lifecycle, or revocation checks.

## Known limitations

- Studionet is a development network and may reset; addresses and state are not production guarantees.
- The contract is intentionally frozen. Corrections require a reviewed fresh deployment and address update.
- AI verdict quality depends on the clarity of the mandate and proposal text; `AMBIGUOUS` fails closed.
- The production JavaScript bundle is about 781 kB before gzip (about 186 kB gzip); Vite reports a non-blocking chunk-size warning.
- Live Vercel E2E for the corrected contract is pending the fresh Studionet deployment and release.
