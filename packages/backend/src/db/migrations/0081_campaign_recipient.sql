-- Campaign recipient targeting: send to the customer (default), their dealer
-- (agent), or both. Mirrors the flow send-node recipient. Dealer sends deliver
-- to the dealer while keeping the customer as the content context.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS recipient varchar(20) NOT NULL DEFAULT 'customer';
