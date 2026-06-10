import { Course, StudentProgress } from './types';

export const COURSES: Course[] = [];

export const STUDENT_PROGRESS: StudentProgress = {
  overallScore: 84,
  weakAreas: ['Graph Theory Concepts', 'Dynamic Programming Optimization'],
  strongAreas: ['Greedy Algorithms', 'Time Complexity Analysis'],
  recentQuizScores: {
    'ch1': 95,
    'ch2': 70,
    'ch3': 85
  },
  performanceHistory: [
    { date: 'Week 1', score: 65 },
    { date: 'Week 2', score: 72 },
    { date: 'Week 3', score: 70 },
    { date: 'Week 4', score: 81 },
    { date: 'Week 5', score: 85 },
    { date: 'Week 6', score: 84 }
  ]
};
