# Verification

This document is the evidence ledger for the judge-requested correction. The prior deployed instance is superseded because the intentionally frozen contract now binds proposal content and capability use to canonical Snapshot data.

The complete checkpoint package is [PRE_DEPLOY_MANIFEST.json](PRE_DEPLOY_MANIFEST.json); its current checkpoint is `POST_DEPLOY_TEST`.
The exact-source schema evidence is [PRE_DEPLOY_SCHEMA_PROBE.json](PRE_DEPLOY_SCHEMA_PROBE.json).

## Current correction revision

| Field | Value |
|---|---|
| Submission category | `PROJECT` |
| Exact Git revision | resolved from `git rev-parse HEAD` in the review package |
| Source status | exact reviewed source deployed and live-tested |
| Contract source SHA-256 (canonical LF) | `C1437B81D6AFA43F616EFD2C280A2B78E8AB833C1B6AE58230EBF1437EF911F0` |
| Network | GenLayer Studionet, chain `61999` / `0xF22F` |
| Contract classification | `INTENTIONALLY_FROZEN` |
| Constructor arguments | none |
| Locked Studio account | `0xeF5D2119416A2f5afa35dCFA209766EFC1BE5902` (`deployer`; selected and accessible read-only) |
| Contract | `0xC500A12309784a75367FC53aCfa54c0F231A26d1` |
| Deployment transaction | `0xaa725f836c3b7aaee1970a9db889efae979552c7ebcd890a3d3bbcd994684632` (`FINALIZED` / `SUCCESS`) |
| Deployment creator | `0xeF5D2119416A2f5afa35dCFA209766EFC1BE5902` (locked deployer) |
| Vercel release | pending corrected source release |

## Judge-requested correction

- `submit_proposal` accepts only canonical Snapshot URLs of the form `https://snapshot.org/#/<space>/proposal/<32-byte-id>`.
- Each validator independently fetches the proposal from Snapshot GraphQL inside `gl.eq_principle.strict_eq` and the contract stores the returned identity, title, body, and SHA-256 hash. Browser-supplied title/body values are not authoritative.
- `use_capability` no longer accepts a free-form execution note. It independently re-fetches the same proposal and requires `state=closed`, valid final scores, and a non-zero `scores_total`; the stored proof is deterministically generated from that canonical result.
- The MVP remains a mandate guard and audit record. It does not broadcast an external DAO vote.

## Studio runtime correction

The first fresh instance was intentionally not retained as release evidence. Its `submit_proposal` call finalized with `SystemError: 2: invalid` because the Studio GenVM runner accepts only `str` or `bytes` for `gl.nondet.web.request` bodies, while the initial corrected source passed a Python dictionary. The source now JSON-encodes the GraphQL body and sends the explicit JSON content type. A separate same-name Studio tab also produced a failed attempt; it was excluded after the source was uploaded under the unique filename `dao_delegate_mandate_guard_fixed.py`. The release instance is `0xC500...26d1`, whose Explorer creator is the locked owner account and whose canonical Snapshot submission succeeded.

## Fresh Studionet live matrix

All transactions below are on `0xC500A12309784a75367FC53aCfa54c0F231A26d1`, with full transaction evidence in the Studio dialogs and Explorer. Every listed transaction reached `FINALIZED`; successful cases show `SUCCESS`.

| Case | Result | Evidence |
|---|---|---|
| Empty-argument deployment | `FINALIZED / SUCCESS` | `0xaa725f836c3b7aaee1970a9db889efae979552c7ebcd890a3d3bbcd994684632`; Explorer creator `0xeF5D...5902` |
| Owner creates mandate #0 | `FINALIZED / SUCCESS` | `0x201f3451d62088a70d63baeb5c83ba3d355bc09cd3a789772aaf53d51210f5bc`; output `0` |
| Delegate submits canonical Snapshot proposal | `FINALIZED / SUCCESS` | `0xf4522e2151b4537d6a9d71bc2c2969a3a7469ba995e72c3ef3d1f26a5b1d7f82`; canonical title `CIP-13: Encumbered`, browser spoof fields excluded |
| AI evaluation | `FINALIZED / SUCCESS` | `0x24b86716dcd772da212374bd7cb9871372b6e84cff50a109dd97f7eb6cc3f259`; verdict `WITHIN_MANDATE` |
| Delegate records intent | `FINALIZED / SUCCESS` | `0x308b0e13de6290fcc17753e610bf7b98c6e9ec1290de17f749e204468ff5c2f0` |
| Delegate uses capability | `FINALIZED / SUCCESS` | `0x249beeb9445c87f617ee634096f9554461528dbbfa1ef2fac01a0b2f1ee47336`; canonical state `closed`, outcome `Add the Encumbered Debuff`, scores total `2022061`; readback `USED` |
| Non-final safety case: owner creates mandate #1 | `FINALIZED / SUCCESS` | `0x8c9646d94d1af03d9781a096669fbf8964907957048bd07cf5a3c72a02791ed`; fresh mandate for active-proposal rejection test |
| Non-final safety case: delegate submits active Snapshot proposal #1 | `FINALIZED / SUCCESS` | `0xe886ff0c20749a0305b288ef761a9af7fb4932914fa7f6cf22257f13aff4bbda`; active URL `https://snapshot.org/#/myrtles.eth/proposal/0x29fd1d4fc98ce837f21aa0559d9846e907df1a57a3e1b4e0a0f966dc3d3b6025`; browser spoof title/body excluded |
| Non-final safety case: evaluation and intent | `FINALIZED / SUCCESS` | `0xbb7adc20010dab3179c6d21c9a377e85198b1f6da6b48aec88a04dabea9b13a5` (`WITHIN_MANDATE`), then `0x336cda48d92ec5dd65db9aea3a66669827a3c7529842898cdf7f3c45d22d29f9` (`record_intent`) |
| Non-final governance-action rejection | `FINALIZED / ERROR` | `0x5c4514eba020165e89865ce320a61209844e14e382641be1c9abddb71494c551`; semantic rollback `GOVERNANCE_ACTION_NOT_FINAL`; active proposal was not used |
| Unauthorized delegate revoke | `FINALIZED / ERROR` | `0x87b220eb71e304bfe18c549262036ba3920ba2022b509f8e7a49aef909224082`; rollback `UNAUTHORIZED_NOT_OWNER` |
| Owner revoke | `FINALIZED / SUCCESS` | `0x8018031fc657814e5fd9b7eb50990f2a3dbf9ea0e141bd21602cf12cb84a14f0`; readback `REVOKED` |

Authoritative finalized reads: capability #0 is `USED` with verdict `WITHIN_MANDATE`; the exact post-submit JSON response is preserved in [studio-capability-0-readback.json](evidence/studio-capability-0-readback.json) and includes the canonical URL, canonical title `CIP-13: Encumbered`, canonical body, `proposal_hash`, `mandate_content_hash`, `status`, and deterministic use proof. The stored title/body are not the browser-supplied spoof values.

The exact post-rejection JSON response for capability #1 is preserved in [studio-capability-1-non-final-readback.json](evidence/studio-capability-1-non-final-readback.json): `status` is `GRANTED`, `verdict` is `WITHIN_MANDATE`, and both `use_note` and `used_at` are empty. This is the authoritative no-state-drift readback after the `GOVERNANCE_ACTION_NOT_FINAL` rollback; `get_audit_count()` returned `10` after the case. A preceding deliberate call before `record_intent` returned `INTENT_NOT_RECORDED`; it is retained only as a diagnostic and is not used as the decisive non-final evidence.

The live `use_capability` rejection dialog recorded `FINALIZED`, result `ERROR`, and the exact rollback payload `GOVERNANCE_ACTION_NOT_FINAL`. Its validator consensus history reached `ACCEPTED` before finalization.

## Reproducible local checks

| Check | Command | Result |
|---|---|---|
| Contract direct tests | `py -3.13 -m pytest tests/direct -q -p no:cacheprovider` | `20 passed` |
| GenVM lint | `$env:PYTHONIOENCODING='utf-8'; genvm-lint contracts/dao_delegate_mandate_guard.py` | PASS |
| Exact-source schema probe | `genvm-lint check contracts/dao_delegate_mandate_guard.py --json` | `ok=true; 12 methods; 6 views; 6 writes; 0 constructor parameters` |
| Frontend tests | `corepack.cmd pnpm test run` from `frontend` | `4 files; 92 passed` |
| Production build/typecheck | `corepack.cmd pnpm build` from `frontend` | PASS |
| Production dependency audit | `corepack.cmd pnpm audit --prod` from `frontend` | no known vulnerabilities |

### Raw Git-blob source hash procedure

The package hash is reproduced from the committed blob, not from a working-tree text conversion:

```powershell
py -3.13 -c "import hashlib,subprocess; rev=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(); path='contracts/dao_delegate_mandate_guard.py'; raw=subprocess.check_output(['git','cat-file','blob',f'{rev}:{path}']); canonical=raw.replace(b'\\r\\n',b'\\n').replace(b'\\r',b'\\n'); print('revision='+rev); print(hashlib.sha256(canonical).hexdigest().upper())"
# C1437B81D6AFA43F616EFD2C280A2B78E8AB833C1B6AE58230EBF1437EF911F0
```

Canonicalization is UTF-8 bytes from the raw Git blob with CRLF and lone CR converted to LF before SHA-256. The exact changed API is covered by the Direct Mode contract tests and the schema probe: `submit_proposal(mandate_id, proposal_url, proposal_title, proposal_text)` and `use_capability(capability_id)`. The schema probe records all 12 public methods, six views, six writes, and zero constructor parameters.

## Required live evidence before release

The old deployment and old Vercel transaction ledger must not be reused for this source revision. The fresh evidence package must bind the same exact source hash and final Git revision to:

1. Anonymous `PRE_DEPLOY` `APPROVED` for the source package used for deployment.
2. Fresh Studionet deployment with empty constructor arguments, `FINALIZED`, execution `SUCCESS`, source parity, and authoritative readback. The prior failed instance is excluded because this source package changed afterward.
3. Primary-AI Studio matrix covering canonical submit, canonical readback, AI grant/deny, intent, closed-proposal proof use, non-final governance-action rejection, authorization failure, and owner revocation.
4. Anonymous `POST_DEPLOY_TEST` `APPROVED`.
5. Public GitHub commit and Vercel release built from that exact revision.
6. User-executed Vercel E2E with OKX, including wallet isolation/reload-disconnected, canonical proposal binding, final-action proof, negative state, and authoritative readback.
7. Anonymous `POST_GITHUB_VERCEL_FINAL` `APPROVED` on the same final revision/evidence package.

## Recovery

Because the contract is intentionally frozen, any source correction, account loss, Studio reset, Studionet reset, or material deployment change requires a fresh deployment, exact hash binding, full live test matrix, and fresh anonymous review. Never publish private keys or wallet exports.
