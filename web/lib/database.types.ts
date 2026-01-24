// Database types for GradoPH Supabase

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      schools: {
        Row: {
          id: string
          name: string
          student_id_length: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          student_id_length: number
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          student_id_length?: number
          created_at?: string
        }
        Relationships: []
      }
      teachers: {
        Row: {
          id: string
          email: string
          school_id: string | null
          full_name: string
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          school_id?: string | null
          full_name: string
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          school_id?: string | null
          full_name?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            referencedRelation: "schools"
            referencedColumns: ["id"]
          }
        ]
      }
      classes: {
        Row: {
          id: string
          school_id: string | null
          name: string
          grade_level: string | null
          section: string | null
          teacher_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          school_id?: string | null
          name: string
          grade_level?: string | null
          section?: string | null
          teacher_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          school_id?: string | null
          name?: string
          grade_level?: string | null
          section?: string | null
          teacher_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          }
        ]
      }
      students: {
        Row: {
          id: string
          student_id: string
          name: string
          class_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          student_id: string
          name: string
          class_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          student_id?: string
          name?: string
          class_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            referencedRelation: "classes"
            referencedColumns: ["id"]
          }
        ]
      }
      exams: {
        Row: {
          id: string
          name: string
          class_id: string | null
          template_id: string
          answer_key_json: Json
          answer_key_locked: boolean
          created_by: string | null
          exam_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          class_id?: string | null
          template_id: string
          answer_key_json: Json
          answer_key_locked?: boolean
          created_by?: string | null
          exam_date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          class_id?: string | null
          template_id?: string
          answer_key_json?: Json
          answer_key_locked?: boolean
          created_by?: string | null
          exam_date?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exams_class_id_fkey"
            columns: ["class_id"]
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          }
        ]
      }
      scans: {
        Row: {
          id: string
          student_id: string
          exam_id: string | null
          answers_json: Json
          confidence: number
          is_unknown_student: boolean
          image_path: string
          score: number | null
          scanned_at: string
          scanned_by: string | null
        }
        Insert: {
          id?: string
          student_id: string
          exam_id?: string | null
          answers_json: Json
          confidence: number
          is_unknown_student?: boolean
          image_path: string
          score?: number | null
          scanned_at?: string
          scanned_by?: string | null
        }
        Update: {
          id?: string
          student_id?: string
          exam_id?: string | null
          answers_json?: Json
          confidence?: number
          is_unknown_student?: boolean
          image_path?: string
          score?: number | null
          scanned_at?: string
          scanned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scans_exam_id_fkey"
            columns: ["exam_id"]
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scans_scanned_by_fkey"
            columns: ["scanned_by"]
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
