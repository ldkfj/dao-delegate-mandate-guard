# Verification

This document is the evidence ledger for the judge-requested correction. The prior deployed instance is superseded because the intentionally frozen contract now binds proposal content and capability use to canonical Snapshot data.

The complete checkpoint package is [PRE_DEPLOY_MANIFEST.json](PRE_DEPLOY_MANIFEST.json).

## Current correction revision

| Field | Value |
|---|---|
| Submission category | `PROJECT` |
| Source status | corrected; fresh PRE_DEPLOY review required |
| Contract source SHA-256 (canonical LF) | `EB71FDBD9BB1E07B02DF69E1DC1AD724E24AE9C361A376DE1FBB11C407622B7A` |
| Network | GenLayer Studionet, chain `61999` / `0xF22F` |
| Contract classification | `INTENTIONALLY_FROZEN` |
| Constructor arguments | none |
| Locked Studio account | `0xeF5D2119416A2f5afa35dCFA209766EFC1BE5902` (`deployer`; selected and accessible read-only) |
| Contract / deployment transaction | pending fresh deployment |
| Vercel release | pending corrected source release |

## Judge-requested correction

- `submit_proposal` accepts only canonical Snapshot URLs of the form `https://snapshot.org/#/<space>/proposal/<32-byte-id>`.
- Each validator independently fetches the proposal from Snapshot GraphQL inside `gl.eq_principle.strict_eq` and the contract stores the returned identity, title, body, and SHA-256 hash. Browser-supplied title/body values are not authoritative.
- `use_capability` no longer accepts a free-form execution note. It independently re-fetches the same proposal and requires `state=closed`, valid final scores, and a non-zero `scores_total`; the stored proof is deterministically generated from that canonical result.
- The MVP remains a mandate guard and audit record. It does not broadcast an external DAO vote.

## Reproducible local checks

| Check | Command | Result |
|---|---|---|
| Contract direct tests | `py -3.13 -m pytest tests/direct -q -p no:cacheprovider` | `20 passed` |
| GenVM lint | `$env:PYTHONIOENCODING='utf-8'; genvm-lint contracts/dao_delegate_mandate_guard.py` | PASS |
| Frontend tests | `corepack.cmd pnpm test run` from `frontend` | `4 files; 92 passed` |
| Production build/typecheck | `corepack.cmd pnpm build` from `frontend` | PASS |
| Production dependency audit | `corepack.cmd pnpm audit --prod` from `frontend` | no known vulnerabilities |

### Raw Git-blob source hash procedure

The package hash is reproduced from the committed blob, not from a working-tree text conversion:

```powershell
py -3.13 -c "import hashlib,subprocess; rev='cd77e2c7655bed7bb4955cd67cb48811a687e3ae'; path='contracts/dao_delegate_mandate_guard.py'; raw=subprocess.check_output(['git','cat-file','blob',f'{rev}:{path}']); canonical=raw.replace(b'\\r\\n',b'\\n').replace(b'\\r',b'\\n'); print(hashlib.sha256(canonical).hexdigest().upper())"
# EB71FDBD9BB1E07B02DF69E1DC1AD724E24AE9C361A376DE1FBB11C407622B7A
```

Canonicalization is UTF-8 bytes from the raw Git blob with CRLF and lone CR converted to LF before SHA-256. The exact changed API is covered by the Direct Mode contract tests and GenVM lint: `submit_proposal(mandate_id, proposal_url, proposal_title, proposal_text)` and `use_capability(capability_id)`.

## Required live evidence before release

The old deployment and old Vercel transaction ledger must not be reused for this source revision. The fresh evidence package must bind the same exact source hash and final Git revision to:

1. Anonymous `PRE_DEPLOY` `APPROVED`.
2. Fresh Studionet deployment with empty constructor arguments, `FINALIZED`, execution `SUCCESS`, source parity, and authoritative readback.
3. Primary-AI Studio matrix covering canonical submit, canonical readback, AI grant/deny, intent, closed-proposal proof use, non-final governance-action rejection, authorization failure, and owner revocation.
4. Anonymous `POST_DEPLOY_TEST` `APPROVED`.
5. Public GitHub commit and Vercel release built from that exact revision.
6. User-executed Vercel E2E with OKX, including wallet isolation/reload-disconnected, canonical proposal binding, final-action proof, negative state, and authoritative readback.
7. Anonymous `POST_GITHUB_VERCEL_FINAL` `APPROVED` on the same final revision/evidence package.

## Recovery

Because the contract is intentionally frozen, any source correction, account loss, Studio reset, Studionet reset, or material deployment change requires a fresh deployment, exact hash binding, full live test matrix, and fresh anonymous review. Never publish private keys or wallet exports.
