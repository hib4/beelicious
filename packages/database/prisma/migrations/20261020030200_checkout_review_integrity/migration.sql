-- A late settled historical checkout must remain reviewable even if a new checkout
-- has already begun. Service locks block new work when any review is outstanding.
DROP INDEX "Order_one_unresolved_per_session";
CREATE UNIQUE INDEX "Order_one_pending_per_session" ON "Order" ("sessionId") WHERE "status" = 'PENDING_PAYMENT';
CREATE FUNCTION checkout_payment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."orderId", NEW."provider", NEW."merchantId", NEW."providerOrderId", NEW."amount", NEW."currency") IS DISTINCT FROM (OLD."orderId", OLD."provider", OLD."merchantId", OLD."providerOrderId", OLD."amount", OLD."currency") THEN RAISE EXCEPTION 'Payment identity and amount immutable'; END IF;
  IF OLD."status" = 'SUCCEEDED' AND NEW."status" <> 'SUCCEEDED' THEN RAISE EXCEPTION 'Successful payment cannot regress'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payment_immutable BEFORE UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION checkout_payment_immutable();
