-- GradoPH Database Schema for Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schools table
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  student_id_length INTEGER NOT NULL CHECK (student_id_length >= 6 AND student_id_length <= 12),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Teachers table
CREATE TABLE teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Classes table
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  grade_level VARCHAR(50),
  section VARCHAR(50),
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Students table
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id VARCHAR(12) NOT NULL,
  name VARCHAR(255) NOT NULL,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(student_id, class_id)
);

-- Exams table
CREATE TABLE exams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  class_id UUID REFERENCES classes(id) ON DELETE CASCADE,
  template_id VARCHAR(100) NOT NULL,
  answer_key_json JSONB NOT NULL,
  answer_key_locked BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES teachers(id) ON DELETE SET NULL,
  exam_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Scans table
CREATE TABLE scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id VARCHAR(12) NOT NULL,
  exam_id UUID REFERENCES exams(id) ON DELETE CASCADE,
  answers_json JSONB NOT NULL,
  confidence DECIMAL(5,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  is_unknown_student BOOLEAN DEFAULT FALSE,
  image_path VARCHAR(500) NOT NULL,
  score INTEGER,
  scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  scanned_by UUID REFERENCES teachers(id) ON DELETE SET NULL,
  UNIQUE(student_id, exam_id)
);

-- Indexes for performance
CREATE INDEX idx_students_class_id ON students(class_id);
CREATE INDEX idx_students_student_id ON students(student_id);
CREATE INDEX idx_exams_class_id ON exams(class_id);
CREATE INDEX idx_scans_exam_id ON scans(exam_id);
CREATE INDEX idx_scans_student_id ON scans(student_id);
CREATE INDEX idx_scans_is_unknown ON scans(is_unknown_student);

-- Function to lock answer key on first scan
CREATE OR REPLACE FUNCTION lock_answer_key_on_first_scan()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if this is the first scan for this exam
  IF (SELECT COUNT(*) FROM scans WHERE exam_id = NEW.exam_id) = 0 THEN
    UPDATE exams SET answer_key_locked = TRUE WHERE id = NEW.exam_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to lock answer key
CREATE TRIGGER trigger_lock_answer_key
BEFORE INSERT ON scans
FOR EACH ROW
EXECUTE FUNCTION lock_answer_key_on_first_scan();

-- Function to calculate and update score
CREATE OR REPLACE FUNCTION calculate_scan_score()
RETURNS TRIGGER AS $$
DECLARE
  answer_key JSONB;
  correct_count INTEGER := 0;
  i INTEGER;
BEGIN
  -- Get the answer key
  SELECT answer_key_json INTO answer_key FROM exams WHERE id = NEW.exam_id;
  
  -- Compare answers
  FOR i IN 0..49 LOOP
    IF (NEW.answers_json->i)::TEXT = (answer_key->i)::TEXT THEN
      correct_count := correct_count + 1;
    END IF;
  END LOOP;
  
  -- Update score
  NEW.score := correct_count;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to calculate score on insert/update
CREATE TRIGGER trigger_calculate_score
BEFORE INSERT OR UPDATE OF answers_json ON scans
FOR EACH ROW
EXECUTE FUNCTION calculate_scan_score();

-- Row Level Security (RLS) Policies
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;

-- Teachers can only see their own school's data
CREATE POLICY teachers_school_policy ON teachers
  FOR ALL USING (auth.uid()::UUID = id);

CREATE POLICY classes_school_policy ON classes
  FOR ALL USING (
    school_id IN (SELECT school_id FROM teachers WHERE id = auth.uid()::UUID)
  );

CREATE POLICY students_school_policy ON students
  FOR ALL USING (
    class_id IN (
      SELECT c.id FROM classes c
      JOIN teachers t ON c.school_id = t.school_id
      WHERE t.id = auth.uid()::UUID
    )
  );

CREATE POLICY exams_school_policy ON exams
  FOR ALL USING (
    class_id IN (
      SELECT c.id FROM classes c
      JOIN teachers t ON c.school_id = t.school_id
      WHERE t.id = auth.uid()::UUID
    )
  );

CREATE POLICY scans_school_policy ON scans
  FOR ALL USING (
    exam_id IN (
      SELECT e.id FROM exams e
      JOIN classes c ON e.class_id = c.id
      JOIN teachers t ON c.school_id = t.school_id
      WHERE t.id = auth.uid()::UUID
    )
  );
