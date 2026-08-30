import json
import re

import pytest


SNAPSHOT_GRAPHQL_URL = "https://hub.snapshot.org/graphql"
SNAPSHOT_ID = "0x79598415badd9cd9b9285d313399421f7a04a99be7183dd8a6b1b308ab3e2c5b"
SNAPSHOT_SPACE = "capncompany.eth"
SNAPSHOT_TITLE = "CIP-13: Encumbered"
SNAPSHOT_BODY = "Canonical Snapshot body used by the direct contract tests."


@pytest.fixture(autouse=True)
def canonical_snapshot_mock(direct_vm):
    payload = {
        "data": {
            "proposal": {
                "id": SNAPSHOT_ID,
                "title": SNAPSHOT_TITLE,
                "body": SNAPSHOT_BODY,
                "space": {"id": SNAPSHOT_SPACE},
                "choices": ["Add the Encumbered Debuff", "Reject"],
                "start": 1787889215,
                "end": 1788062015,
                "state": "closed",
                "scores": [2022061, 0],
                "scores_total": 2022061,
            }
        }
    }
    direct_vm.mock_web(
        re.escape(SNAPSHOT_GRAPHQL_URL),
        {"method": "POST", "status": 200, "body": json.dumps(payload)},
    )
