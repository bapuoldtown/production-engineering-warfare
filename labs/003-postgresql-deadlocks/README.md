# Lab 003 — PostgreSQL Deadlock Warfare

**Guided practice: reproduce → inspect → recover → prevent → verify.**

No Python, cloud account, or local PostgreSQL installation required. Docker Compose only. Uses port **55432** so it can coexist with an existing PostgreSQL on port 5432.

## 0. Start clean

From this directory:

```powershell
docker compose up -d --wait
docker compose exec postgres psql -U lab -d warfare -c "TABLE deadlock_accounts;"
```

Expected: account 1 and account 2 each have balance 10000. The SQL seed is applied on first volume initialization. To completely reset this **lab's** data only, run `docker compose down -v` then `docker compose up -d --wait`. **Never run down -v against a real environment.**

## 1. Reproduce a real deadlock

Open **two separate terminals**. In both:

```powershell
docker compose exec postgres psql -U lab -d warfare
```

**Terminal A**, run:

```sql
BEGIN;
UPDATE deadlock_accounts SET balance = balance - 1000 WHERE id = 1;
```

**Terminal B**, run:

```sql
BEGIN;
UPDATE deadlock_accounts SET balance = balance - 500 WHERE id = 2;
```

Back in **A**, run this. It will wait; do **not** cancel:

```sql
UPDATE deadlock_accounts SET balance = balance + 1000 WHERE id = 2;
```

Back in **B**, run this:

```sql
UPDATE deadlock_accounts SET balance = balance + 500 WHERE id = 1;
```

Expected: PostgreSQL detects a cycle, reports `ERROR: deadlock detected` (`SQLSTATE 40P01`) in one session, and aborts that transaction. The other session's blocked UPDATE can finish.

In the **aborted** session, run `ROLLBACK;`. In the **surviving** session, run `COMMIT;`. If unsure which session survived, inspect the psql prompt: `warfare=!#` indicates an aborted transaction. Do not commit the survivor until you've identified it.

**Why:** A holds row 1 and needs row 2. B holds row 2 and needs row 1. Neither can proceed. A simple one-way wait is **not** a deadlock.

## 2. Diagnose a wait (optional repeat)

Before running B's *second* UPDATE, open a third terminal and run:

```powershell
docker compose exec postgres psql -U lab -d warfare -c "SELECT pid, state, wait_event_type, wait_event, pg_blocking_pids(pid) AS blocked_by, left(query,100) AS query FROM pg_stat_activity WHERE datname='warfare' AND state='active';"
```

Expected: A is waiting on a transaction lock and lists B's PID as blocker. After B's second UPDATE, PostgreSQL detects the circular dependency automatically, usually after the configured `deadlock_timeout` (default commonly 1s).

## 3. Prevent the deadlock with consistent lock order

First reset this **lab-only** table, ensuring both sessions from step 1 have finished:

```powershell
docker compose exec postgres psql -U lab -d warfare -c "UPDATE deadlock_accounts SET balance=10000;"
```

Open two fresh psql terminals as in step 1.

**A:**

```sql
BEGIN;
SELECT id, balance FROM deadlock_accounts WHERE id = 1 FOR UPDATE;
SELECT id, balance FROM deadlock_accounts WHERE id = 2 FOR UPDATE;
```

**B:** Run the same two SELECTs, in the **same order**:

```sql
BEGIN;
SELECT id, balance FROM deadlock_accounts WHERE id = 1 FOR UPDATE;
SELECT id, balance FROM deadlock_accounts WHERE id = 2 FOR UPDATE;
```

B waits at the first SELECT; that is expected. **A** completes:

```sql
UPDATE deadlock_accounts SET balance=balance-1000 WHERE id=1;
UPDATE deadlock_accounts SET balance=balance+1000 WHERE id=2;
COMMIT;
```

Now **B** proceeds past the two SELECTs. Complete B:

```sql
UPDATE deadlock_accounts SET balance=balance-500 WHERE id=2;
UPDATE deadlock_accounts SET balance=balance+500 WHERE id=1;
COMMIT;
```

Verify:

```powershell
docker compose exec postgres psql -U lab -d warfare -c "SELECT id,balance FROM deadlock_accounts ORDER BY id; SELECT SUM(balance) AS total FROM deadlock_accounts;"
```

Expected after reset and both commits: account 1 = **9500**, account 2 = **10500**, total = **20000**.

The two explicit single-row SELECTs ensure the intended acquisition order; avoid assuming an unordered `IN (...)` query always locks in a particular order. Production code must enforce the same order across all write paths.

## 4. Staff-level discussion

- **Contention vs deadlock:** one-way waiting can finish after commit; circular waiting cannot without intervention.
- **Atomicity:** the victim transaction's changes roll back together. An aborted transaction cannot commit its partial debit.
- **Prevention:** consistent lock order, short transactions, appropriate indexes, avoid network calls while holding locks.
- **Recovery:** catch SQLSTATE `40P01`, roll back, and retry the **whole transaction** with bounded exponential backoff and jitter. Do not retry only the last UPDATE.
- **Payments:** add a durable idempotency key, transfer ledger, and audit trail before using this pattern for real money. Deadlock handling alone is not sufficient.
- **Operational checks:** `pg_stat_activity`, `pg_blocking_pids`, deadlock count in `pg_stat_database`, lock-wait duration, transaction duration.

## Cleanup

```powershell
docker compose down
```

This stops containers but preserves the lab volume. `docker compose down -v` deletes the lab's volume and all its data.

**Interview story:** We intentionally reproduced a circular row-lock dependency in PostgreSQL, inspected blockers, observed PostgreSQL abort a victim with 40P01, then removed the deadlock by acquiring account locks in deterministic ascending order while preserving the sum of balances.
