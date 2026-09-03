ALTER TABLE inventory
ADD COLUMN remaining_quantity INTEGER NOT NULL DEFAULT 0
CHECK (remaining_quantity >= 0);

UPDATE inventory
SET remaining_quantity = quantity;

ALTER TABLE demands
ADD COLUMN remaining_quantity INTEGER NOT NULL DEFAULT 0
CHECK (remaining_quantity >= 0);

UPDATE demands
SET remaining_quantity = requested_quantity;
