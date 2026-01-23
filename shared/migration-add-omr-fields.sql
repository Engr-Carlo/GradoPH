-- Migration: Add OMR fields to existing GradoPH database
-- Run this in Supabase SQL Editor if these columns don't exist

-- 1. Add num_questions to exams table (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'exams' AND column_name = 'num_questions'
  ) THEN
    ALTER TABLE exams ADD COLUMN num_questions INTEGER DEFAULT 50 CHECK (num_questions >= 1 AND num_questions <= 100);
    COMMENT ON COLUMN exams.num_questions IS 'Number of questions in the exam';
  END IF;
END $$;

-- 2. Verify scans table has image_path (should already exist from schema)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scans' AND column_name = 'image_path'
  ) THEN
    ALTER TABLE scans ADD COLUMN image_path VARCHAR(500) NOT NULL DEFAULT '';
    COMMENT ON COLUMN scans.image_path IS 'Path to uploaded scan image in Supabase Storage';
  END IF;
END $$;

-- 3. Verify scans table has confidence column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scans' AND column_name = 'confidence'
  ) THEN
    ALTER TABLE scans ADD COLUMN confidence DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 100);
    COMMENT ON COLUMN scans.confidence IS 'OMR detection confidence percentage (0-100)';
  END IF;
END $$;

-- 4. Add student_id_length to schools table if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'schools' AND column_name = 'student_id_length'
  ) THEN
    ALTER TABLE schools ADD COLUMN student_id_length INTEGER NOT NULL DEFAULT 10 CHECK (student_id_length >= 6 AND student_id_length <= 12);
    COMMENT ON COLUMN schools.student_id_length IS 'Length of student ID for bubble sheet template';
  END IF;
END $$;

-- 5. Update calculate_scan_score function to use dynamic question count
CREATE OR REPLACE FUNCTION calculate_scan_score()
RETURNS TRIGGER AS $$
DECLARE
  answer_key JSONB;
  correct_count INTEGER := 0;
  total_questions INTEGER;
  i INTEGER;
BEGIN
  -- Get the answer key and question count
  SELECT answer_key_json, num_questions INTO answer_key, total_questions 
  FROM exams 
  WHERE id = NEW.exam_id;
  
  -- Use actual number of questions instead of hardcoded 50
  IF total_questions IS NULL THEN
    total_questions := jsonb_array_length(answer_key);
  END IF;
  
  -- Compare answers
  FOR i IN 0..(total_questions - 1) LOOP
    IF (NEW.answers_json->i)::TEXT = (answer_key->i)::TEXT THEN
      correct_count := correct_count + 1;
    END IF;
  END LOOP;
  
  -- Update score
  NEW.score := correct_count;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Create storage bucket for scan images (if not exists)
-- Note: Run this in Supabase Dashboard -> Storage -> New Bucket
-- Bucket Name: scan-images
-- Public: YES (for testing - change to private in production)
-- Then add this policy:

INSERT INTO storage.buckets (id, name, public)
VALUES ('scan-images', 'scan-images', true)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist, then recreate them
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete" ON storage.objects;

-- Allow authenticated users to upload
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'scan-images');

-- Allow public read access (for testing)
CREATE POLICY "Allow public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'scan-images');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Allow authenticated delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'scan-images');

-- Verification queries (run these to check)
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'exams' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'scans' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'schools' ORDER BY ordinal_position;
-- SELECT * FROM storage.buckets WHERE id = 'scan-images';
