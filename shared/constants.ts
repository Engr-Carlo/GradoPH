// Shared constants for GradoPH

// Template specifications
export const TEMPLATE_CONFIG = {
  TOTAL_QUESTIONS: 50,
  CHOICES_PER_QUESTION: 4,
  CHOICES: ['A', 'B', 'C', 'D'] as const,
  STUDENT_ID_MIN_LENGTH: 6,
  STUDENT_ID_MAX_LENGTH: 12,
  
  // A4 dimensions in mm
  PAGE_WIDTH: 210,
  PAGE_HEIGHT: 297,
  MARGIN: 10,
  
  // Bubble specifications (mm)
  BUBBLE_DIAMETER: 6,
  BUBBLE_SPACING: 3,
  
  // Corner dots for perspective correction
  CORNER_DOT_DIAMETER: 8,
  
  // Grid layout
  QUESTIONS_PER_COLUMN: 25,
  COLUMNS: 2,
} as const;

// OMR Processing thresholds
export const OMR_CONFIG = {
  MIN_CONFIDENCE: 95, // Minimum confidence to accept scan
  BUBBLE_FILL_THRESHOLD: 0.6, // 60% filled = marked
  BLUR_THRESHOLD: 100, // Laplacian variance for blur detection
  UPLOAD_TIMEOUT_MS: 30000, // 30 seconds
  IMAGE_QUALITY: 85, // JPEG compression quality
  MAX_IMAGE_SIZE_KB: 200,
} as const;

// API endpoints (relative to base URL)
export const API_ROUTES = {
  // Auth
  LOGIN: '/auth/login',
  SIGNUP: '/auth/signup',
  LOGOUT: '/auth/logout',
  
  // Exams
  CREATE_EXAM: '/exams',
  GET_EXAM: '/exams/:id',
  LIST_EXAMS: '/exams',
  DOWNLOAD_TEMPLATE: '/exams/:id/template',
  
  // Scans
  UPLOAD_SCAN: '/scans',
  CHECK_DUPLICATE: '/exams/:exam_id/scans/check/:student_id',
  LIST_SCANS: '/exams/:exam_id/scans',
  
  // Students
  CREATE_STUDENT: '/students',
  IMPORT_STUDENTS: '/students/import',
  LIST_STUDENTS: '/classes/:class_id/students',
  
  // Analytics
  GET_ANALYTICS: '/exams/:exam_id/analytics',
  EXPORT_RESULTS: '/exams/:exam_id/export',
} as const;

// Supabase Storage
export const STORAGE_CONFIG = {
  BUCKET_NAME: 'scan-images',
  IMAGE_PATH_PATTERN: '{exam_id}/{student_id}_{timestamp}.jpg',
} as const;

// Session configuration
export const SESSION_CONFIG = {
  TOKEN_KEY: 'gradoph_auth_token',
  DEVICE_ID_KEY: 'gradoph_device_id',
  SESSION_DURATION_HOURS: 168, // 7 days
} as const;

// Database tables
export const DB_TABLES = {
  SCHOOLS: 'schools',
  TEACHERS: 'teachers',
  CLASSES: 'classes',
  STUDENTS: 'students',
  EXAMS: 'exams',
  SCANS: 'scans',
} as const;

// Validation
export const VALIDATION = {
  MIN_STUDENT_NAME_LENGTH: 2,
  MAX_STUDENT_NAME_LENGTH: 100,
  MIN_EXAM_NAME_LENGTH: 3,
  MAX_EXAM_NAME_LENGTH: 100,
} as const;
