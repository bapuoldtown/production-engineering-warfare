-- Run using psql without wrapping in an explicit transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_created
ON orders(customer_id, created_at DESC);
ANALYZE orders;
