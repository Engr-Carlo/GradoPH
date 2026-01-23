// Shared TypeScript types for GradoPH

export type Answer = 'A' | 'B' | 'C' | 'D';

export interface School {
  id: string;
  name: string;
  student_id_length: number; // 6-12
  created_at: string;
}

export interface Teacher {
  id: string;
  email: string;
  school_id: string;
  full_name: string;
  created_at: string;
}

export interface Class {
  id: string;
  school_id: string;
  name: string;
  grade_level: string;
  section: string;
  teacher_id: string;
  created_at: string;
}

export interface Student {
  id: string;
  student_id: string; // Configurable length
  name: string;
  class_id: string;
  created_at: string;
}

export interface Exam {
  id: string;
  name: string;
  class_id: string;
  template_id: string;
  answer_key_json: Answer[]; // Array of 50 answers
  answer_key_locked: boolean;
  created_by: string; // teacher_id
  exam_date: string;
  created_at: string;
}

export interface Scan {
  id: string;
  student_id: string;
  exam_id: string;
  answers_json: Answer[]; // Array of 50 answers
  confidence: number; // 0-100
  is_unknown_student: boolean;
  image_path: string; // Supabase storage path
  scanned_at: string;
  scanned_by: string; // teacher_id
  score?: number; // Calculated after grading
}

export interface ScanResult extends Scan {
  student_name?: string;
  correct_count?: number;
  incorrect_answers?: number[]; // Question indices
}

export interface TemplateMetadata {
  exam_id: string;
  template_id: string;
  student_id_length: number;
}

export interface BubbleDetection {
  question_number: number; // 1-50
  detected_answers: Answer[]; // Can be multiple if multi-mark
  is_multi_mark: boolean;
  confidence: number;
}

export interface StudentIDDetection {
  student_id: string;
  confidence: number;
  all_digits_detected: boolean;
}

export interface OMRProcessingResult {
  success: boolean;
  confidence: number;
  student_id?: StudentIDDetection;
  answers?: BubbleDetection[];
  error?: string;
  qr_data?: TemplateMetadata;
}

export interface AnalyticsData {
  class_average: number;
  median_score: number;
  std_deviation: number;
  score_distribution: { score: number; count: number }[];
  question_difficulty: { question: number; percent_correct: number }[];
  total_students: number;
  scanned_count: number;
}
