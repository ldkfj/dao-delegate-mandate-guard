# DAO Delegate Mandate Guard

An AI-evaluated governance mandate and capability enforcement system built on GenLayer Studionet (`0xF22F` / `61999`).

The contract (`contracts/dao_delegate_mandate_guard.py`) uses GenVM intelligent validator consensus to enforce immutable policy boundaries on delegated DAO voting power. The frontend (`frontend/`) is a responsive Single-Page Application (SPA) built with React 19, TypeScript, and Vite, featuring an EIP-6963 / EIP-1193 multi-injected wallet connector gate, deterministic transaction lifecycle tracking, and an append-only audit trail.

---

## Key Features

1. **Intelligent Mandate Enforcement**:
   - DAO delegators issue on-chain mandates defining authorized scopes and explicit exclusions.
   - Proposals submitted against mandates undergo non-deterministic LLM consensus (`gl.exec_prompt`) to determine whether proposals are `WITHIN_MANDATE`, `CONDITIONAL`, `OUTSIDE_MANDATE`, or `AMBIGUOUS`.
   - Granted capabilities allow delegates to record voting intent and record execution proofs on-chain.

2. **EIP-6963 & EIP-1193 Multi-Injected Wallet Gate**:
   - Centralized RDNS allowlist filtering strictly supporting MetaMask (`io.metamask`), OKX Wallet (`com.okex.wallet`), and Rabby (`io.rabby`).
   - Zero RPC calls on opening the wallet chooser modal; `eth_requestAccounts` is dispatched only upon explicit wallet selection.
   - Complete provider isolation: all interactions route strictly through the captured provider instance with independent event listeners.
   - Automatic Studionet (`0xF22F` / `61999`) chain switching with exact EIP-1193 error code `4902` auto-add (`wallet_addEthereumChain`) and switch retry.
   - Reload-disconnected architecture by design (no involuntary auto-reconnects).

3. **Finite Transaction Lifecycle & Authoritative Readback**:
   - Multi-stage pipeline: `SIGNING` &rarr; `SUBMITTED` &rarr; `CONSENSUS_PENDING` &rarr; `FINALIZED` &rarr; `EXECUTION_SUCCESS` &rarr; `READBACK_CONFIRMED`.
   - Fail-closed terminal classifier treating `ACCEPTED` and pending consensus states strictly as non-final, requiring explicit `FINALIZED` status and explicit successful execution (`FINISHED_WITH_RETURN`) before `EXECUTION_SUCCESS`.
   - Immediate surfacing of terminal failures (`UNDETERMINED`, `CANCELED`, `VALIDATORS_TIMEOUT`, `LEADER_TIMEOUT`).
   - Single unified deadline across all polling iterations and transient RPC retries.
   - Extracts returned entity IDs (mandate ID, capability ID) from exact transaction receipt structures without aggregate counter inference.
   - Performs authoritative storage readback post-finality before confirming success.

4. **Comprehensive UI Suite & W3C Accessibility**:
   - **Header & Network Status**: Real-time Studionet network badge, contract configuration status, and wallet account pill.
   - **Mandate Studio**: Form builder with 20-byte address validation, ISO 8601 UTC date preset helpers (+7d, +30d, +90d, +1y), and live mandate lookup inspector.
   - **Proposal Evaluator & AI Consensus**: Proposal submission with one-click compliant/violation presets, direct AI consensus trigger, and capability status tracking.
   - **Capability & Action Inspector**: Displays AI consensus verdicts, condition categories, reasoning traces, intent recording, and execution proof logging.
   - **Audit Timeline**: Append-only chronological event log with event kind filters and keyword search.
   - **Transaction Lifecycle Monitor**: Live visual stepper and explorer link tracker with ARIA live accessibility.
   - **Accessible Modal Shell**: Application shell rendered with `inert` while wallet chooser is open, with full keyboard focus trapping (Tab/Shift+Tab wrapping) and focus restoration.

---

## Repository Structure

```
.
├── contracts/
│   └── dao_delegate_mandate_guard.py   # GenLayer Intelligent Contract
├── tests/
│   └── direct/
│       └── test_mandate_guard.py       # Contract unit & consensus tests (18 test cases)
├── frontend/
│   ├── src/
│   │   ├── wallet/                     # EIP-6963/1193 wallet discovery, connector, & context
│   │   ├── contract/                   # GenLayer client, parser, address validator, & service
│   │   ├── components/                 # UI components (Header, Builder, Cards, Timeline, TxPanel)
│   │   ├── __tests__/                  # Vitest suite (Wallet, parser, service, UI journeys - 91 tests)
│   │   ├── App.tsx                     # Main dashboard layout
│   │   ├── main.tsx                    # React root entry
│   │   ├── index.css                   # Native CSS design system
│   │   └── vite-env.d.ts               # Vite environment type declarations
│   ├── .env.example                    # Studionet default environment variables (blank contract address)
│   ├── package.json                    # Exact pinned dependencies (no carets)
│   ├── tsconfig.json                   # TypeScript configuration
│   └── vite.config.ts                  # Vite & Vitest configuration
├── pyproject.toml                      # Python dependencies & pytest config
├── .gitignore                          # Repository gitignore
└── README.md                           # Documentation & verification commands
```

---

## Pinned Dependencies

### Frontend (`frontend/package.json`)
- `react`: `19.2.8`
- `react-dom`: `19.2.8`
- `genlayer-js`: `1.1.8`
- `vite`: `8.2.2`
- `typescript`: `7.0.2`
- `@types/react`: `19.2.18`
- `@types/react-dom`: `19.2.4`
- `@vitejs/plugin-react`: `6.1.0`
- `vitest`: `4.1.11`
- `@testing-library/react`: `16.3.2`
- `@testing-library/user-event`: `14.6.5`
- `jsdom`: `30.0.1`

---

## Local Verification Commands

### 1. Contract Tests & Linting (Python / GenLayer VM)
```bash
# Run contract unit and consensus tests (18 passed)
uv run pytest tests/direct -v

# Run bytecode compilation check
python -m compileall contracts tests/direct
```

### 2. Frontend Tests & Typecheck (Node.js / pnpm / npm)
```bash
# Navigate to frontend
cd frontend

# Install exact pinned dependencies
corepack.cmd pnpm install --frozen-lockfile

# Run all 91 Vitest unit and integration tests
corepack.cmd pnpm test run

# Run TypeScript typecheck and Vite production build
corepack.cmd pnpm build
```

### 3. Local Development Server
```bash
cd frontend
corepack.cmd pnpm dev
```
Open `http://localhost:5173` in your browser. Configure `VITE_CONTRACT_ADDRESS=0x...` in `frontend/.env` to connect to a deployed Studionet contract instance.
