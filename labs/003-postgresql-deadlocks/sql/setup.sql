CREATE TABLE IF NOT EXISTS deadlock_accounts (
    id integer PRIMARY KEY,
    balance integer NOT NULL CHECK (balance >= 0)
);
INSERT INTO deadlock_accounts (id, balance)
VALUES (1, 10000), (2, 10000)
ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance;
