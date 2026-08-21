# DAO Delegate Mandate Guard

## Local Verification Commands

```bash
genvm-lint check contracts/dao_delegate_mandate_guard.py
pytest tests/direct -v --cache-clear
python -m compileall contracts tests/direct
```
