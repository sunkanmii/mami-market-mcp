ALTER TABLE participants
ADD COLUMN phone_number TEXT;

ALTER TABLE participants
ADD COLUMN preferred_contact_method TEXT
CHECK (preferred_contact_method IN ('call', 'whatsapp', 'either'));

ALTER TABLE participants
ADD COLUMN meetup_location TEXT;

ALTER TABLE participants
ADD COLUMN contact_sharing_consented_at TEXT;

