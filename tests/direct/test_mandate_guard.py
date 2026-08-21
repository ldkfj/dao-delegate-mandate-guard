from pathlib import Path
import json
import hashlib
from datetime import datetime, timezone, timedelta
import pytest
from gltest.direct import VMContext


CONTRACT_PATH = Path(__file__).resolve().parents[2] / "contracts" / "dao_delegate_mandate_guard.py"


def to_hex_addr(addr: bytes | str) -> str:
    if isinstance(addr, bytes):
        import genlayer.py.types as gt
        return gt.Address(addr).as_hex
    return str(addr)


def test_create_mandate_success_and_readback(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)

    now = datetime.now(timezone.utc)
    expiry = (now + timedelta(days=30)).isoformat()
    policy_uri = "https://dao.example.com/mandates/001"
    policy_text = "Delegate is authorized to vote YES on infrastructure upgrades and security fixes."
    exclusions_text = "Delegate must NEVER vote in favor of treasury disbursements exceeding 100k USDC."

    # Owner creates mandate with Alice as delegate
    mandate_id = contract.create_mandate(
        direct_alice,
        policy_uri,
        policy_text,
        exclusions_text,
        expiry,
    )

    assert mandate_id == 0
    assert contract.get_mandate_count() == 1

    # Read back mandate
    mandate_json = contract.get_mandate(0)
    mandate_data = json.loads(mandate_json)

    expected_hash = hashlib.sha256(f"{policy_text}\n---\n{exclusions_text}".encode("utf-8")).hexdigest()

    assert mandate_data["id"] == 0
    assert mandate_data["owner"] == to_hex_addr(direct_owner)
    assert mandate_data["delegate"] == to_hex_addr(direct_alice)
    assert mandate_data["policy_uri"] == policy_uri
    assert mandate_data["policy_text"] == policy_text
    assert mandate_data["exclusions_text"] == exclusions_text
    assert mandate_data["content_hash"] == expected_hash
    assert mandate_data["status"] == "ACTIVE"
    assert mandate_data["is_expired"] is False
    assert mandate_data["revocation_reason"] == ""

    # Audit entry verification
    assert contract.get_audit_count() == 1
    audit_data = json.loads(contract.get_audit_entry(0))
    assert audit_data["index"] == 0
    assert audit_data["event_kind"] == "MANDATE_CREATED"
    assert audit_data["actor"] == to_hex_addr(direct_owner)
    assert audit_data["mandate_id"] == 0
    assert audit_data["capability_id"] == 0
    assert audit_data["prior_state"] == "NONE"
    assert audit_data["new_state"] == "ACTIVE"
    assert audit_data["content_hash"] == expected_hash


def test_create_mandate_validation_errors(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    now = datetime.now(timezone.utc)
    valid_expiry = (now + timedelta(days=30)).isoformat()
    zero_address = "0x0000000000000000000000000000000000000000"

    # Reject zero address delegate
    with direct_vm.expect_revert("DELEGATE_CANNOT_BE_ZERO_ADDRESS"):
        contract.create_mandate(zero_address, "https://example.com", "Policy", "", valid_expiry)

    # Reject self-delegation (owner == delegate)
    with direct_vm.expect_revert("DELEGATE_CANNOT_BE_OWNER"):
        contract.create_mandate(direct_owner, "https://example.com", "Policy", "", valid_expiry)

    # Reject blank policy text
    with direct_vm.expect_revert("POLICY_TEXT_OUT_OF_BOUNDS"):
        contract.create_mandate(direct_alice, "https://example.com", "   ", "", valid_expiry)

    # Reject policy text > 8000 chars
    with direct_vm.expect_revert("POLICY_TEXT_OUT_OF_BOUNDS"):
        contract.create_mandate(direct_alice, "https://example.com", "A" * 8001, "", valid_expiry)

    # Reject exclusions text > 4000 chars
    with direct_vm.expect_revert("EXCLUSIONS_TEXT_OUT_OF_BOUNDS"):
        contract.create_mandate(direct_alice, "https://example.com", "Policy", "E" * 4001, valid_expiry)

    # Reject non-https URL
    with direct_vm.expect_revert("POLICY_URI_MUST_START_WITH_HTTPS"):
        contract.create_mandate(direct_alice, "http://insecure.example.com", "Policy", "", valid_expiry)

    # Reject past expiry
    past_expiry = (now - timedelta(days=1)).isoformat()
    with direct_vm.expect_revert("EXPIRY_MUST_BE_IN_FUTURE"):
        contract.create_mandate(direct_alice, "https://example.com", "Policy", "", past_expiry)

    # Reject expiry > 365 days
    too_distant_expiry = (now + timedelta(days=366)).isoformat()
    with direct_vm.expect_revert("EXPIRY_TOO_DISTANT"):
        contract.create_mandate(direct_alice, "https://example.com", "Policy", "", too_distant_expiry)

    # Reject invalid expiry format
    with direct_vm.expect_revert("INVALID_EXPIRY_FORMAT"):
        contract.create_mandate(direct_alice, "https://example.com", "Policy", "", "not-a-date")


def test_submit_proposal_authorization_and_deduplication(direct_vm, direct_deploy, direct_owner, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Vote YES on security fixes",
        "No treasury transfers",
        expiry,
    )

    proposal_url = "https://dao.example.com/prop/12"
    proposal_title = "Patch reentrancy vulnerability in Vault"
    proposal_text = "This proposal fixes a critical reentrancy bug in Vault.sol without moving treasury funds."

    # Non-delegate (Bob) cannot submit proposal
    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("UNAUTHORIZED_NOT_DELEGATE"):
            contract.submit_proposal(mandate_id, proposal_url, proposal_title, proposal_text)

    # Non-delegate (Owner) cannot submit proposal
    with direct_vm.expect_revert("UNAUTHORIZED_NOT_DELEGATE"):
        contract.submit_proposal(mandate_id, proposal_url, proposal_title, proposal_text)

    # Delegate (Alice) submits proposal
    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(mandate_id, proposal_url, proposal_title, proposal_text)
        assert cap_id == 0

    assert contract.get_capability_count() == 1

    cap_data = json.loads(contract.get_capability(cap_id))
    expected_prop_hash = hashlib.sha256(proposal_text.encode("utf-8")).hexdigest()
    assert cap_data["id"] == 0
    assert cap_data["mandate_id"] == 0
    assert cap_data["proposal_url"] == proposal_url
    assert cap_data["proposal_title"] == proposal_title
    assert cap_data["proposal_hash"] == expected_prop_hash
    assert cap_data["status"] == "PENDING"

    # Re-submitting the exact same proposal under the same mandate fails (duplicate)
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("DUPLICATE_PROPOSAL_SNAPSHOT"):
            contract.submit_proposal(mandate_id, proposal_url, proposal_title, proposal_text)

    # Submitting a revised proposal with different text succeeds
    revised_text = proposal_text + " Addendum: peer reviewed."
    with direct_vm.prank(direct_alice):
        cap_id2 = contract.submit_proposal(mandate_id, proposal_url, proposal_title, revised_text)
        assert cap_id2 == 1


def test_evaluate_capability_within_mandate(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Vote YES on security fixes and code quality improvements.",
        "Never approve token inflation.",
        expiry,
    )

    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop/1",
            "Security Fix 1",
            "Implement reentrancy lock on Vault.",
        )

    # Mock LLM to return WITHIN_MANDATE
    llm_resp = json.dumps({
        "verdict": "WITHIN_MANDATE",
        "reasoning": "The proposal directly addresses a security fix within mandate scope.",
        "condition_category": "",
        "condition_summary": ""
    })
    direct_vm.mock_llm(".*", llm_resp)

    with direct_vm.prank(direct_alice):
        contract.evaluate_capability(cap_id)

    # Validator verification
    val_res = direct_vm.run_validator()
    assert val_res is True

    cap_data = json.loads(contract.get_capability(cap_id))
    assert cap_data["status"] == "GRANTED"
    assert cap_data["verdict"] == "WITHIN_MANDATE"
    assert cap_data["condition_category"] == ""
    assert "security fix" in cap_data["reasoning"]


def test_evaluate_capability_conditional(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Vote YES on developer tooling grants under 50k.",
        "No grants without milestones.",
        expiry,
    )

    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop/2",
            "Tooling Grant",
            "Requesting 40k grant for IDE plugin.",
        )

    # Mock LLM to return CONDITIONAL with category BUDGET_CAP
    llm_resp = json.dumps({
        "verdict": "CONDITIONAL",
        "reasoning": "Authorized conditionally provided total cost is strictly capped under 50k.",
        "condition_category": "BUDGET_CAP",
        "condition_summary": "Total expenditure must remain under 50k."
    })
    direct_vm.mock_llm(".*", llm_resp)

    with direct_vm.prank(direct_alice):
        contract.evaluate_capability(cap_id)

    val_res = direct_vm.run_validator()
    assert val_res is True

    cap_data = json.loads(contract.get_capability(cap_id))
    assert cap_data["status"] == "GRANTED"
    assert cap_data["verdict"] == "CONDITIONAL"
    assert cap_data["condition_category"] == "BUDGET_CAP"
    assert cap_data["condition_summary"] == "Total expenditure must remain under 50k."


def test_evaluate_capability_outside_mandate(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Vote YES on security fixes.",
        "Never approve treasury token sales.",
        expiry,
    )

    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop/3",
            "Treasury Sale",
            "Sell 1M DAO tokens for stables.",
        )

    # Mock LLM to return OUTSIDE_MANDATE
    llm_resp = json.dumps({
        "verdict": "OUTSIDE_MANDATE",
        "reasoning": "Explicitly violates mandate exclusion against treasury token sales.",
        "condition_category": "",
        "condition_summary": ""
    })
    direct_vm.mock_llm(".*", llm_resp)

    with direct_vm.prank(direct_alice):
        contract.evaluate_capability(cap_id)

    val_res = direct_vm.run_validator()
    assert val_res is True

    cap_data = json.loads(contract.get_capability(cap_id))
    assert cap_data["status"] == "DENIED"
    assert cap_data["verdict"] == "OUTSIDE_MANDATE"


def test_evaluate_capability_ambiguous(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Vote generally in alignment with long-term ecosystem prosperity.",
        "",
        expiry,
    )

    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop/4",
            "Vague Proposal",
            "Initiate a strategic partnership initiative with unspecified parameters.",
        )

    # Mock LLM to return AMBIGUOUS
    llm_resp = json.dumps({
        "verdict": "AMBIGUOUS",
        "reasoning": "Evidence and terms are too vague to determine authorization reliably.",
        "condition_category": "",
        "condition_summary": ""
    })
    direct_vm.mock_llm(".*", llm_resp)

    with direct_vm.prank(direct_alice):
        contract.evaluate_capability(cap_id)

    val_res = direct_vm.run_validator()
    assert val_res is True

    cap_data = json.loads(contract.get_capability(cap_id))
    assert cap_data["status"] == "DENIED"
    assert cap_data["verdict"] == "AMBIGUOUS"


def test_validator_rejects_semantic_forgery(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Vote on infrastructure only.",
        "No grants.",
        expiry,
    )

    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop/5",
            "Funding Request",
            "Requesting grant funding.",
        )

    # Leader produces WITHIN_MANDATE (forgery / drift)
    leader_resp = json.dumps({
        "verdict": "WITHIN_MANDATE",
        "reasoning": "Leader mistakenly or dishonestly approved.",
        "condition_category": "",
        "condition_summary": ""
    })
    direct_vm.mock_llm(".*", leader_resp)

    with direct_vm.prank(direct_alice):
        contract.evaluate_capability(cap_id)

    # Now validator executes independently and gets OUTSIDE_MANDATE
    validator_resp = json.dumps({
        "verdict": "OUTSIDE_MANDATE",
        "reasoning": "Proposal violates exclusion: No grants.",
        "condition_category": "",
        "condition_summary": ""
    })
    direct_vm.clear_mocks()
    direct_vm.mock_llm(".*", validator_resp)

    # Validator must reject the leader's fraudulent/inconsistent verdict
    val_passed = direct_vm.run_validator()
    assert val_passed is False


def test_validator_rejects_condition_category_divergence(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Approve tooling.",
        "",
        expiry,
    )

    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop/6",
            "Tooling Dev",
            "Develop tooling.",
        )

    # Leader: CONDITIONAL with BUDGET_CAP
    leader_resp = json.dumps({
        "verdict": "CONDITIONAL",
        "reasoning": "Approved with budget cap.",
        "condition_category": "BUDGET_CAP",
        "condition_summary": "Budget capped."
    })
    direct_vm.mock_llm(".*", leader_resp)

    with direct_vm.prank(direct_alice):
        contract.evaluate_capability(cap_id)

    # Validator: CONDITIONAL with TIMELINE_CONSTRAINT
    val_resp = json.dumps({
        "verdict": "CONDITIONAL",
        "reasoning": "Approved with timeline constraint.",
        "condition_category": "TIMELINE_CONSTRAINT",
        "condition_summary": "Timeline limited."
    })
    direct_vm.clear_mocks()
    direct_vm.mock_llm(".*", val_resp)

    # Validator must reject because condition categories do not match
    val_passed = direct_vm.run_validator()
    assert val_passed is False


def test_conditional_acknowledgement_and_use_flow(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Approve marketing initiatives under 25k.",
        "",
        expiry,
    )

    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop/7",
            "Marketing Campaign",
            "Launch Q3 social campaign.",
        )

    # Evaluate as CONDITIONAL with REPORTING_REQUIRED
    llm_resp = json.dumps({
        "verdict": "CONDITIONAL",
        "reasoning": "Marketing requires weekly reporting.",
        "condition_category": "REPORTING_REQUIRED",
        "condition_summary": "Weekly metrics reporting is mandatory."
    })
    direct_vm.mock_llm(".*", llm_resp)

    with direct_vm.prank(direct_alice):
        contract.evaluate_capability(cap_id)

    # Attempt to use before recording intent -> fails
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("INTENT_NOT_RECORDED"):
            contract.use_capability(cap_id, "Voting YES on snapshot.")

    # Record intent WITHOUT acknowledging REPORTING_REQUIRED -> fails
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("INTENT_MISSING_CONDITION_ACKNOWLEDGEMENT"):
            contract.record_intent(cap_id, "I intend to vote YES because marketing is good.")

    # Record intent WITH explicit acknowledgement of REPORTING_REQUIRED -> succeeds
    with direct_vm.prank(direct_alice):
        contract.record_intent(
            cap_id,
            "I intend to vote YES in full compliance with the REPORTING_REQUIRED constraint."
        )

    # Now use capability -> succeeds
    with direct_vm.prank(direct_alice):
        contract.use_capability(cap_id, "Vote cast YES on snapshot id 0x123abc.")

    cap_data = json.loads(contract.get_capability(cap_id))
    assert cap_data["status"] == "USED"
    assert cap_data["use_note"] == "Vote cast YES on snapshot id 0x123abc."

    # Cannot reuse a USED capability
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("CANNOT_USE_CAPABILITY_IN_STATE: USED"):
            contract.use_capability(cap_id, "Attempt second use.")


def test_expiry_blocks_submit_evaluate_and_use(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    t0 = datetime(2026, 9, 1, 12, 0, 0, tzinfo=timezone.utc)
    direct_vm.warp(t0.isoformat())

    expiry = (t0 + timedelta(days=10)).isoformat()
    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Short term mandate",
        "",
        expiry,
    )

    # 1. Create capability 1 before expiry, evaluate to GRANTED, and record intent before expiry
    with direct_vm.prank(direct_alice):
        cap_id_granted = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop/8a",
            "Prop 8a",
            "Prop 8a text.",
        )

    llm_resp = json.dumps({
        "verdict": "WITHIN_MANDATE",
        "reasoning": "Authorized before expiry.",
        "condition_category": "",
        "condition_summary": "",
    })
    direct_vm.mock_llm(".*", llm_resp)

    with direct_vm.prank(direct_alice):
        contract.evaluate_capability(cap_id_granted)
        contract.record_intent(cap_id_granted, "Intent before expiry.")

    cap_data_pre = json.loads(contract.get_capability(cap_id_granted))
    assert cap_data_pre["status"] == "GRANTED"

    # 2. Create capability 2 before expiry, leave it PENDING
    with direct_vm.prank(direct_alice):
        cap_id_pending = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop/8b",
            "Prop 8b",
            "Prop 8b text.",
        )

    audit_count_before_warp = contract.get_audit_count()

    # Warp time PAST expiry (11 days later)
    t_after = t0 + timedelta(days=11)
    direct_vm.warp(t_after.isoformat())

    # Readback shows mandate is EXPIRED
    mandate_data = json.loads(contract.get_mandate(mandate_id))
    assert mandate_data["status"] == "EXPIRED"
    assert mandate_data["is_expired"] is True

    # Readback shows granted capability is effectively EXPIRED
    cap_granted_data = json.loads(contract.get_capability(cap_id_granted))
    assert cap_granted_data["status"] == "EXPIRED"
    assert cap_granted_data["used_at"] == ""
    assert cap_granted_data["use_note"] == ""

    # Readback shows pending capability is effectively EXPIRED
    cap_pending_data = json.loads(contract.get_capability(cap_id_pending))
    assert cap_pending_data["status"] == "EXPIRED"

    # use_capability on granted capability after expiry reverts with MANDATE_EXPIRED
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("MANDATE_EXPIRED"):
            contract.use_capability(cap_id_granted, "Attempting use after expiry")

    # Authoritative capability readback remains effectively EXPIRED with empty use_note and used_at
    cap_granted_after_attempt = json.loads(contract.get_capability(cap_id_granted))
    assert cap_granted_after_attempt["status"] == "EXPIRED"
    assert cap_granted_after_attempt["used_at"] == ""
    assert cap_granted_after_attempt["use_note"] == ""

    # Audit count has not changed on the rejected use
    assert contract.get_audit_count() == audit_count_before_warp

    # Submit proposal on expired mandate fails
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("MANDATE_EXPIRED"):
            contract.submit_proposal(mandate_id, "https://dao.example.com/p", "Title", "Text")

    # Evaluate capability on expired mandate fails
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("MANDATE_EXPIRED"):
            contract.evaluate_capability(cap_id_pending)


def test_revocation_before_use_denies_capability(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Active mandate",
        "",
        expiry,
    )

    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop/9",
            "Prop 9",
            "Prop 9 text.",
        )

    llm_resp = json.dumps({
        "verdict": "WITHIN_MANDATE",
        "reasoning": "Valid.",
        "condition_category": "",
        "condition_summary": ""
    })
    direct_vm.mock_llm(".*", llm_resp)

    with direct_vm.prank(direct_alice):
        contract.evaluate_capability(cap_id)
        contract.record_intent(cap_id, "Intent recorded.")

    # Owner revokes the mandate
    contract.revoke_mandate(mandate_id, "Delegate trust revoked due to policy divergence.")

    mandate_data = json.loads(contract.get_mandate(mandate_id))
    assert mandate_data["status"] == "REVOKED"
    assert mandate_data["revocation_reason"] == "Delegate trust revoked due to policy divergence."

    # Capability reflects DENIED effective state
    cap_data = json.loads(contract.get_capability(cap_id))
    assert cap_data["status"] == "DENIED"

    # Delegate cannot use capability under revoked mandate
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("MANDATE_NOT_ACTIVE"):
            contract.use_capability(cap_id, "Attempting use.")

    # Cannot revoke already revoked mandate
    with direct_vm.expect_revert("MANDATE_ALREADY_REVOKED"):
        contract.revoke_mandate(mandate_id, "Second revocation attempt.")


def test_revocation_after_use_preserves_used_history(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Active mandate",
        "",
        expiry,
    )

    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop/10",
            "Prop 10",
            "Prop 10 text.",
        )

    llm_resp = json.dumps({
        "verdict": "WITHIN_MANDATE",
        "reasoning": "Valid.",
        "condition_category": "",
        "condition_summary": ""
    })
    direct_vm.mock_llm(".*", llm_resp)

    with direct_vm.prank(direct_alice):
        contract.evaluate_capability(cap_id)
        contract.record_intent(cap_id, "Intent.")
        contract.use_capability(cap_id, "Used successfully.")

    # Owner revokes mandate after capability has already been USED
    contract.revoke_mandate(mandate_id, "Post-use revocation.")

    # Used capability status remains immutably USED
    cap_data = json.loads(contract.get_capability(cap_id))
    assert cap_data["status"] == "USED"
    assert cap_data["use_note"] == "Used successfully."


def test_audit_trail_order_and_immutability(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    # Step 1: create_mandate (audit 0)
    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Mandate policy",
        "Exclusions",
        expiry,
    )

    # Step 2: submit_proposal (audit 1)
    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop/11",
            "Prop 11",
            "Prop 11 text.",
        )

    # Step 3: evaluate_capability (audit 2)
    llm_resp = json.dumps({
        "verdict": "WITHIN_MANDATE",
        "reasoning": "All good.",
        "condition_category": "",
        "condition_summary": ""
    })
    direct_vm.mock_llm(".*", llm_resp)
    with direct_vm.prank(direct_alice):
        contract.evaluate_capability(cap_id)

    # Step 4: record_intent (audit 3)
    with direct_vm.prank(direct_alice):
        contract.record_intent(cap_id, "I intend to vote YES.")

    # Step 5: use_capability (audit 4)
    with direct_vm.prank(direct_alice):
        contract.use_capability(cap_id, "Vote executed.")

    # Step 6: revoke_mandate (audit 5)
    contract.revoke_mandate(mandate_id, "Closing mandate.")

    # Total audit count must be exactly 6
    assert contract.get_audit_count() == 6

    expected_events = [
        ("MANDATE_CREATED", "NONE", "ACTIVE", to_hex_addr(direct_owner)),
        ("PROPOSAL_SUBMITTED", "NONE", "PENDING", to_hex_addr(direct_alice)),
        ("CAPABILITY_EVALUATED", "PENDING", "GRANTED", to_hex_addr(direct_alice)),
        ("INTENT_RECORDED", "GRANTED", "GRANTED", to_hex_addr(direct_alice)),
        ("CAPABILITY_USED", "GRANTED", "USED", to_hex_addr(direct_alice)),
        ("MANDATE_REVOKED", "ACTIVE", "REVOKED", to_hex_addr(direct_owner)),
    ]

    for idx, (event_kind, prior_st, new_st, actor) in enumerate(expected_events):
        entry = json.loads(contract.get_audit_entry(idx))
        assert entry["index"] == idx
        assert entry["event_kind"] == event_kind
        assert entry["prior_state"] == prior_st
        assert entry["new_state"] == new_st
        assert entry["actor"] == actor

    # Out of bounds audit entry query reverts
    with direct_vm.expect_revert("AUDIT_ENTRY_NOT_FOUND"):
        contract.get_audit_entry(6)


def test_address_normalization_forms(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    addr_lower = "0x5b38da6a701c568545dcfcb03fcb875f56beddc4"
    addr_checksum = "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4"
    addr_no_0x = "5b38da6a701c568545dcfcb03fcb875f56beddc4"
    addr_bytes = bytes.fromhex("5b38da6a701c568545dcfcb03fcb875f56beddc4")
    addr_int = int.from_bytes(addr_bytes, byteorder="big")

    # Lowercase
    m_id1 = contract.create_mandate(
        addr_lower,
        "https://dao.example.com/mandate1",
        "Policy 1",
        "",
        expiry,
    )
    # Checksum
    m_id2 = contract.create_mandate(
        addr_checksum,
        "https://dao.example.com/mandate2",
        "Policy 2",
        "",
        expiry,
    )
    # No 0x prefix
    m_id3 = contract.create_mandate(
        addr_no_0x,
        "https://dao.example.com/mandate3",
        "Policy 3",
        "",
        expiry,
    )
    # Raw bytes
    m_id4 = contract.create_mandate(
        addr_bytes,
        "https://dao.example.com/mandate4",
        "Policy 4",
        "",
        expiry,
    )
    # Integer address form (Studio integer encoding)
    m_id5 = contract.create_mandate(
        addr_int,
        "https://dao.example.com/mandate5",
        "Policy 5",
        "",
        expiry,
    )

    data1 = json.loads(contract.get_mandate(m_id1))
    data2 = json.loads(contract.get_mandate(m_id2))
    data3 = json.loads(contract.get_mandate(m_id3))
    data4 = json.loads(contract.get_mandate(m_id4))
    data5 = json.loads(contract.get_mandate(m_id5))

    # All normalize to the exact same checksummed hex string
    assert data1["delegate"] == addr_checksum
    assert data2["delegate"] == addr_checksum
    assert data3["delegate"] == addr_checksum
    assert data4["delegate"] == addr_checksum
    assert data5["delegate"] == addr_checksum

    # Malformed string addresses fail
    with direct_vm.expect_revert("MALFORMED_ADDRESS"):
        contract.create_mandate("invalid-hex-address", "https://dao.example.com/m", "Policy", "", expiry)

    with direct_vm.expect_revert("MALFORMED_ADDRESS"):
        contract.create_mandate("0x1234", "https://dao.example.com/m", "Policy", "", expiry)

    # Negative integer rejects with MALFORMED_ADDRESS
    with direct_vm.expect_revert("MALFORMED_ADDRESS"):
        contract.create_mandate(-1, "https://dao.example.com/m", "Policy", "", expiry)

    # 2**160 out-of-range integer rejects with MALFORMED_ADDRESS
    with direct_vm.expect_revert("MALFORMED_ADDRESS"):
        contract.create_mandate(2**160, "https://dao.example.com/m", "Policy", "", expiry)

    # Integer zero address reaches DELEGATE_CANNOT_BE_ZERO_ADDRESS guard
    with direct_vm.expect_revert("DELEGATE_CANNOT_BE_ZERO_ADDRESS"):
        contract.create_mandate(0, "https://dao.example.com/m", "Policy", "", expiry)


def test_wrong_ids_and_invalid_transitions_fail_without_state_drift(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Policy",
        "",
        expiry,
    )

    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop",
            "Title",
            "Text",
        )

    initial_audit_count = contract.get_audit_count()
    initial_cap_count = contract.get_capability_count()
    initial_mandate_count = contract.get_mandate_count()

    # Querying invalid mandate ID reverts
    with direct_vm.expect_revert("MANDATE_NOT_FOUND"):
        contract.get_mandate(999)

    # Submitting proposal with invalid mandate ID reverts
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("MANDATE_NOT_FOUND"):
            contract.submit_proposal(999, "https://dao.example.com/p", "Title", "Text")

    # Revoking invalid mandate ID reverts
    with direct_vm.expect_revert("MANDATE_NOT_FOUND"):
        contract.revoke_mandate(999, "Reason")

    # Querying invalid capability ID reverts
    with direct_vm.expect_revert("CAPABILITY_NOT_FOUND"):
        contract.get_capability(999)

    # Evaluating invalid capability ID reverts
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("CAPABILITY_NOT_FOUND"):
            contract.evaluate_capability(999)

    # Recording intent on invalid capability ID reverts
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("CAPABILITY_NOT_FOUND"):
            contract.record_intent(999, "Intent")

    # Using invalid capability ID reverts
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("CAPABILITY_NOT_FOUND"):
            contract.use_capability(999, "Note")

    # Recording intent on PENDING capability reverts
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("CAPABILITY_NOT_GRANTED"):
            contract.record_intent(cap_id, "Premature intent")

    # Using PENDING capability reverts
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert("CANNOT_USE_CAPABILITY_IN_STATE: PENDING"):
            contract.use_capability(cap_id, "Premature use")

    # Verify no state drift occurred
    assert contract.get_audit_count() == initial_audit_count
    assert contract.get_capability_count() == initial_cap_count
    assert contract.get_mandate_count() == initial_mandate_count


def test_nondet_failure_rollback_and_retry_preserves_pending(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Policy",
        "",
        expiry,
    )

    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop",
            "Title",
            "Text",
        )

    # Simulate LLM returning malformed JSON
    direct_vm.mock_llm(".*", "THIS_IS_NOT_JSON")

    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert():
            contract.evaluate_capability(cap_id)

    # Capability must remain PENDING
    cap_data = json.loads(contract.get_capability(cap_id))
    assert cap_data["status"] == "PENDING"

    # Now mock valid LLM response
    valid_resp = json.dumps({
        "verdict": "WITHIN_MANDATE",
        "reasoning": "Valid evaluation.",
        "condition_category": "",
        "condition_summary": ""
    })
    direct_vm.clear_mocks()
    direct_vm.mock_llm(".*", valid_resp)

    # Retry evaluation -> succeeds
    with direct_vm.prank(direct_alice):
        contract.evaluate_capability(cap_id)

    val_res = direct_vm.run_validator()
    assert val_res is True

    cap_data_after = json.loads(contract.get_capability(cap_id))
    assert cap_data_after["status"] == "GRANTED"
    assert cap_data_after["verdict"] == "WITHIN_MANDATE"


def test_llm_response_schema_validation_rejections(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT_PATH)
    expiry = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()

    mandate_id = contract.create_mandate(
        direct_alice,
        "https://dao.example.com/mandate",
        "Policy",
        "",
        expiry,
    )

    with direct_vm.prank(direct_alice):
        cap_id = contract.submit_proposal(
            mandate_id,
            "https://dao.example.com/prop",
            "Title",
            "Text",
        )

    initial_audit_count = contract.get_audit_count()

    # 1. Missing required key (missing condition_summary)
    missing_key_resp = json.dumps({
        "verdict": "WITHIN_MANDATE",
        "reasoning": "Missing summary key.",
        "condition_category": "",
    })
    direct_vm.mock_llm(".*", missing_key_resp)
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert():
            contract.evaluate_capability(cap_id)
    assert json.loads(contract.get_capability(cap_id))["status"] == "PENDING"
    assert contract.get_audit_count() == initial_audit_count

    # 2. Unexpected extra key (has confidence)
    extra_key_resp = json.dumps({
        "verdict": "WITHIN_MANDATE",
        "reasoning": "Valid reasoning",
        "condition_category": "",
        "condition_summary": "",
        "confidence": 0.99,
    })
    direct_vm.clear_mocks()
    direct_vm.mock_llm(".*", extra_key_resp)
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert():
            contract.evaluate_capability(cap_id)
    assert json.loads(contract.get_capability(cap_id))["status"] == "PENDING"
    assert contract.get_audit_count() == initial_audit_count

    # 3. Invalid verdict token
    invalid_verdict_resp = json.dumps({
        "verdict": "ALLOWED",
        "reasoning": "Looks fine",
        "condition_category": "",
        "condition_summary": ""
    })
    direct_vm.clear_mocks()
    direct_vm.mock_llm(".*", invalid_verdict_resp)
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert():
            contract.evaluate_capability(cap_id)
    assert json.loads(contract.get_capability(cap_id))["status"] == "PENDING"
    assert contract.get_audit_count() == initial_audit_count

    # 4. Blank reasoning string
    blank_reasoning_resp = json.dumps({
        "verdict": "WITHIN_MANDATE",
        "reasoning": "   ",
        "condition_category": "",
        "condition_summary": ""
    })
    direct_vm.clear_mocks()
    direct_vm.mock_llm(".*", blank_reasoning_resp)
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert():
            contract.evaluate_capability(cap_id)
    assert json.loads(contract.get_capability(cap_id))["status"] == "PENDING"
    assert contract.get_audit_count() == initial_audit_count

    # 5. Invalid condition category on CONDITIONAL
    invalid_cat_resp = json.dumps({
        "verdict": "CONDITIONAL",
        "reasoning": "Condition applied",
        "condition_category": "UNLIMITED_BUDGET",
        "condition_summary": "Summary"
    })
    direct_vm.clear_mocks()
    direct_vm.mock_llm(".*", invalid_cat_resp)
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert():
            contract.evaluate_capability(cap_id)
    assert json.loads(contract.get_capability(cap_id))["status"] == "PENDING"
    assert contract.get_audit_count() == initial_audit_count

    # 6. Blank condition summary on CONDITIONAL
    blank_sum_resp = json.dumps({
        "verdict": "CONDITIONAL",
        "reasoning": "Condition applied",
        "condition_category": "BUDGET_CAP",
        "condition_summary": "   "
    })
    direct_vm.clear_mocks()
    direct_vm.mock_llm(".*", blank_sum_resp)
    with direct_vm.prank(direct_alice):
        with direct_vm.expect_revert():
            contract.evaluate_capability(cap_id)
    assert json.loads(contract.get_capability(cap_id))["status"] == "PENDING"
    assert contract.get_audit_count() == initial_audit_count

    # Capability still remains PENDING after all invalid attempts
    cap_data = json.loads(contract.get_capability(cap_id))
    assert cap_data["status"] == "PENDING"
