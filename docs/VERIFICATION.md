# Verification

This document binds the public project to the exact Studionet deployment and the evidence verified before release.

## Revision and deployment

| Field | Value |
|---|---|
| Submission category | `PROJECT` |
| Deployed-source commit | `406c518db2b9b51b70c8caeb28816506ba83ac81` |
| Contract source SHA-256 (canonical LF) | `A40B8B5ADA8CF2E038AD322585F13596E4F74754FD39440D48AA1FCCBCC5DFC8` |
| Network | GenLayer Studionet, chain `61999` / `0xF22F` |
| Contract | [`0x0366737fedfe950b7Baa3D9e05F439a591809a20`](https://explorer-studio.genlayer.com/address/0x0366737fedfe950b7Baa3D9e05F439a591809a20) |
| Deployment transaction | [`0x6390e98018e1616950bfa493a3167a311f5b67a01cd10b153e94ba77c2a4c2cf`](https://explorer-studio.genlayer.com/tx/0x6390e98018e1616950bfa493a3167a311f5b67a01cd10b153e94ba77c2a4c2cf) |
| Constructor arguments | none |
| Deployment execution | `FINALIZED`, consensus accepted, execution `SUCCESS` |
| Classification | `INTENTIONALLY_FROZEN` |
| Live web | [dao-delegate-mandate-guard.vercel.app](https://dao-delegate-mandate-guard.vercel.app) |

The deployed Studio source and `contracts/dao_delegate_mandate_guard.py` at the deployed-source commit have the same canonical-LF SHA-256 shown above. No upgrade path or upgrader address is claimed.

## Reproducible local checks

Verified 2026-08-23:

| Check | Command | Result |
|---|---|---|
| Contract direct tests | `.\.venv\Scripts\python.exe -m pytest tests\direct -q` | `18 passed` |
| Frontend tests | `corepack.cmd pnpm test run --reporter=dot` from `frontend` | `4 files; 92 passed` |
| Production build/typecheck | `corepack.cmd pnpm build` from `frontend` | PASS |
| Production dependency audit | `corepack.cmd pnpm audit --prod` from `frontend` | no known vulnerabilities |
| Local governance gate audit | `audit-genlayer-project-gates.ps1 -ProjectName dao-delegate-mandate-guard` | PASS |

## Live Studionet proof matrix

Every successful write below reached `FINALIZED`, consensus accepted, GenVM execution `SUCCESS`, and was followed by authoritative state readback. The failure case reached finality with the expected contract rejection and no state transition.

| Case | Actor | Method and expected proof | Transaction | Authoritative result |
|---|---|---|---|---|
| Create mandate | owner | `create_mandate`; create active mandate 0 | [`0xb53c…e192`](https://explorer-studio.genlayer.com/tx/0xb53c683d5c2f55c04e78368d99feb7316e245af2de9b0f9a9f37f9b7d1fbe192) | mandate 0 `ACTIVE`; count 1; owner/delegate/policy/exclusions match |
| Submit compliant proposal | owner | `submit_proposal`; create capability 0 | [`0x93fc…116a`](https://explorer-studio.genlayer.com/tx/0x93fc7be4b538381329372b0a9dfdc47ed32618c2de8404679f3e3381ab9a116a) | capability 0 created for mandate 0 |
| Evaluate compliant proposal | owner | `evaluate_capability`; grant within mandate | [`0xac44…d051`](https://explorer-studio.genlayer.com/tx/0xac4437622d3ade90bff46cfbfaceea96f59e975ee3ab1ec43e787b187402d051) | `GRANTED`, `WITHIN_MANDATE` |
| Record delegate intent | delegate | `record_intent(0, …)` | [`0x3ac5…63eb`](https://explorer-studio.genlayer.com/tx/0x3ac5aeb03bacfeb870738e3780cc632feb8c601f9e305b544ebdff632bc563eb) | audit index 3 `INTENT_RECORDED`; exact delegate and intent persisted |
| Record capability use | delegate | `use_capability(0, …)` | [`0xb918…0a32`](https://explorer-studio.genlayer.com/tx/0xb918ef4a70bd4f5b641f97ac17e3c380b0338d7cc833aac225226c59da320a32) | capability 0 `USED`; intent and use note preserved |
| Submit excluded proposal | owner | `submit_proposal`; create capability 1 | [`0x29ed…c2ac`](https://explorer-studio.genlayer.com/tx/0x29edbb6c5b01be6ba669fa2d4497d50bd2166c019deeffbd38ca061e0c8ec2ac) | capability 1 created for mandate 0 |
| Evaluate excluded proposal | owner | `evaluate_capability`; deny exclusions | [`0x237f…5e45`](https://explorer-studio.genlayer.com/tx/0x237f3e177efac68afe6787d8aaa860b06f1f4a2fd320dc3d3d633da07bf85e45) | `DENIED`, `OUTSIDE_MANDATE`; token-sale and validator-compensation exclusions cited |
| Reject unauthorized revocation | delegate | `revoke_mandate`; no owner authority | [`0x8ab3…8abb`](https://explorer-studio.genlayer.com/tx/0x8ab30b60294e45a4db7cf1ca5494df67f660557d4631bee96d302b0c634d8abb) | `UNAUTHORIZED_NOT_OWNER`; mandate remains `ACTIVE`; no audit append |
| Owner revokes mandate | owner | `revoke_mandate`; close authority | [`0x4339…9176`](https://explorer-studio.genlayer.com/tx/0x433939732f4ba682d8a2fc034dd36a6f6a40bafa32fdc661fb36d0cafac69176) | mandate 0 `REVOKED`; reason/time persisted |

Final readback: mandate count 1, capability count 2, audit count 8; capability 0 is `USED`, capability 1 is `DENIED`, and mandate 0 is `REVOKED`.

## Wallet and web acceptance boundary

The final release must be configured with the exact contract above. The mandatory user-executed Vercel E2E uses a fresh, independent MetaMask, OKX Wallet, or Rabby account that is not any Studio deployer/test account. Every consequential web write must be verified by transaction hash for actor, target contract/method, `FINALIZED`, execution `SUCCESS`, and post-transaction readback. This section is not marked complete until that exact final Vercel release passes.

## Recovery

Because the contract is intentionally frozen, source corrections, account loss, Studio local-state loss, or a Studionet reset require a fresh deployment from the reviewed source. Preserve the source/hash, record the new address and transaction, rerun the complete live matrix, update frontend configuration and public evidence, and obtain refreshed review approval. Never publish or reuse secrets.

## Known limitations

- Studionet can reset and is not a production network.
- The intentionally frozen contract cannot be upgraded in place.
- Natural-language evaluation can return `AMBIGUOUS`; this fails closed.
- Vite reports a non-blocking chunk-size warning for the current single-page bundle.
- Final GitHub, Vercel, and user web-E2E evidence are checkpoint-specific and cannot be replaced by these local or Studio results.
