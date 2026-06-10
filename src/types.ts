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
}
