import { Course, StudentProgress } from './types';

export const COURSES: Course[] = [
  {
    id: "eduai_guide",
    title: "Getting Started with EduAI",
    description: "A quick tutorial course to learn how to use your interactive study companion.",
    chapters: [
      {
        id: "edu_ch1",
        title: "Introduction to EduAI",
        content: `Welcome to **EduAI**, your premium AI-powered study companion! This pre-loaded course is designed to guide you through the primary interactive learning tools at your disposal.

### Core Learning Modules:
1. **AI Chat Tutor**: Send a message in the bottom input block. Your tutor parses course materials dynamically to deliver pristine guidance.
2. **Immersive Chapter Reader**: Use the **Read** button next to chapters to initiate the beautiful, paper-authentic full-screen modal. Highlight text or double-click to compose custom insights and notes.
3. **Listen Aloud (TTS)**: Trigger the **Listen** action to turn any module or chapter into an audiobook using high-fidelity system voice synthesis.
4. **Dynamic Flashcards**: Trigger the **Flashcard Mode** button directly in the Left Sidebar to review terms.

To get started with your own materials, click the **+ Upload Course PDF** button in the left sidebar!`
      },
      {
        id: "edu_ch2",
        title: "Optimizing Your Learning Path",
        content: `EduAI utilizes dynamic session telemetry to support your cognitive recall and retention goals.

### Advanced Study Integration Features:
- **Concentration Sounds**: Enable the **Focus Audio** player in the header block to stream Alpha-wave, binaural, or natural brown noise loops that filter distractions.
- **Reading Goal Tracker**: Define your custom daily minute milestones using the interactive linear controls in the Left Sidebar.
- **Diagnostics & Quizzes**: Use the Right Sidebar panel to check overall scoring Trends, review active homework items, or trigger a full interactive mock lecture with visual presenter slides.`
      }
    ],
    metadata: {
      author: "EduAI Engineering Team",
      numPages: 2,
      wordCount: 280
    }
  }
];

export const STUDENT_PROGRESS: StudentProgress = {
  overallScore: 88,
  weakAreas: ['Learning Diagnostics', 'PDF Text Slicing'],
  strongAreas: ['Immersive Reading Modal', 'Audio Synthesis (TTS)'],
  recentQuizScores: {
    'edu_ch1': 95,
    'edu_ch2': 80
  },
  performanceHistory: [
    { date: 'Day 1', score: 65 },
    { date: 'Day 2', score: 72 },
    { date: 'Day 3', score: 78 },
    { date: 'Day 4', score: 84 },
    { date: 'Day 5', score: 88 }
  ]
};
