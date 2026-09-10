-- Allow paste / receipt-image ingest alongside legacy sms/notification sources.
ALTER TABLE parser_events
  DROP CONSTRAINT IF EXISTS parser_events_source_type_chk;

ALTER TABLE parser_events
  ADD CONSTRAINT parser_events_source_type_chk
  CHECK (source_type IN ('sms', 'notification', 'paste', 'receipt_image'));
