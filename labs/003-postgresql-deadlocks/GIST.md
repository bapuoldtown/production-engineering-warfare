# Mission 003 — The Gist: PostgreSQL Deadlock Warfare

## Production scenario
Two concurrent account-transfer transactions acquire row locks in opposite orders and wait for each other.

## Lock cycle
- Transaction A locks account 1, then requests account 2.
- Transaction B locks account 2, then requests account 1.
- A waits for B; B waits for A. PostgreSQL detects the cycle and aborts a victim transaction with SQLSTATE `40P01`.

## Reproduce and diagnose
Use two `psql` terminals against the lab's Docker Compose PostgreSQL instance. Inspect `pg_stat_activity` and `pg_blocking_pids` to see blockers. Distinguish a one-way lock wait from a circular deadlock.

## Recovery and prevention
- Roll back the aborted transaction and retry the **entire transaction**, with bounded backoff and jitter.
- Acquire row locks in deterministic order (account 1, then 2) across **all** competing write paths.
- Keep transactions short; avoid remote API calls while holding locks.
- For real money transfers, use durable idempotency keys, a ledger, and auditability.

## Verification target
After the README's reset and two transfers, expected balances are account 1 = 9500 and account 2 = 10500, preserving total 20000. These are documented expected results, not independently verified execution evidence in this gist.

## Engineering tradeoffs
Deterministic lock order prevents this particular cycle but does not eliminate all contention. Retrying too aggressively can amplify overload.

## Interview answer
"Detect a cycle in the wait-for graph, let PostgreSQL abort a victim, retry the full unit of work safely, and prevent repeat cycles with a globally consistent lock-acquisition order."

## Reproduce
See [README.md](README.md), [docker-compose.yml](docker-compose.yml), and [sql/](sql/).
