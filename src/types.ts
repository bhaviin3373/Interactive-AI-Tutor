export interface UserProfile {
  id: string;
  name: string;
  email: string;
  bio?: string;
  avatar?: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  chapters: Chapter[];
  pdfData?: string;
  flashcards?: Flashcard[];
  progress?: StudentProgress;
  uploadedAt?: number;
  metadata?: {
    author?: string;
    numPages?: number;
    wordCount?: number;
    keyTerms?: { word: string; definition: string }[];
  };
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface Chapter {
  id: string;
  title: string;
  content?: string;
}

export interface Annotation {
  id: string;
  chapterId: string;
  text: string;
  start: number;
  end: number;
  color: 'yellow' | 'green' | 'pink' | 'blue';
  note?: string;
  createdAt: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  image?: {
    data: string; // base64
    mimeType: string;
    url: string; // object URL for immediate UI display
  };
}

export interface ChatHistory {
  [courseId: string]: Message[];
}

export interface StudentProgress {
  overallScore: number;
  weakAreas: string[];
  strongAreas: string[];
  recentQuizScores: Record<string, number>;
  performanceHistory: { date: string; score: number }[];
  totalActiveTime?: number;
  readingTime?: number;
  chattingTime?: number;
}

export interface SyncMetric {
  id: string;
  userId: string;
  email: string;
  courseId: string;
  courseTitle: string;
  timestamp: number;
  metricType: 'study_time' | 'quiz_score' | 'reading_goal' | 'progress_update';
  value: any;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
}

