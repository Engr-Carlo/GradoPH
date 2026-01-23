-- Migration: Add scanner features (custom barcode hash and bubble threshold)
-- Run this in Supabase SQL Editor after migration-add-omr-fields.sql

-- 1. Add exam_code_hash to exams table for custom barcode matching
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exams' AND column_name = 'exam_code_hash'
  ) THEN
    ALTER TABLE exams ADD COLUMN exam_code_hash INTEGER;
    COMMENT ON COLUMN exams.exam_code_hash IS '32-bit hash of exam_id for custom barcode encoding';
  END IF;
END $$;

-- 2. Add bubble_threshold to schools table for calibration
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schools' AND column_name = 'bubble_threshold'
  ) THEN
    ALTER TABLE schools ADD COLUMN bubble_threshold INTEGER DEFAULT 50 CHECK (bubble_threshold >= 20 AND bubble_threshold <= 70);
    COMMENT ON COLUMN schools.bubble_threshold IS 'Bubble detection sensitivity threshold (20-70%, default 50%)';
  END IF;
END $$;

-- 3. Create function to generate hash from UUID
CREATE OR REPLACE FUNCTION generate_exam_hash(exam_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  hash_value BIGINT;
BEGIN
  -- Use hashtext function on UUID string and convert to 32-bit integer
  hash_value := hashtext(exam_uuid::text);
  -- Mask to 32-bit positive integer
  RETURN (hash_value & 2147483647)::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Backfill exam_code_hash for existing exams
UPDATE exams 
SET exam_code_hash = generate_exam_hash(id)
WHERE exam_code_hash IS NULL;

-- 5. Make exam_code_hash NOT NULL after backfill
ALTER TABLE exams ALTER COLUMN exam_code_hash SET NOT NULL;

-- Create index for fast hash lookup
CREATE INDEX IF NOT EXISTS idx_exams_code_hash ON exams(exam_code_hash);

-- Verification queries
-- SELECT id, name, exam_code_hash FROM exams LIMIT 5;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'schools' AND column_name = 'bubble_threshold';
