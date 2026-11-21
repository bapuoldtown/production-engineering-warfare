CREATE TABLE orders (
    id bigint PRIMARY KEY,
    customer_id integer NOT NULL,
    created_at timestamptz NOT NULL
);
INSERT INTO orders(id, customer_id, created_at)
SELECT g, (g % 1000) + 1, now() - (g * interval '1 second')
FROM generate_series(1, 500000) AS g;
ANALYZE orders;
