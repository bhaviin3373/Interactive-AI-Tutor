import { useState } from 'react';
import { Course, Flashcard } from '../types';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';

export function FlashcardsView({ course, onBack, isDarkMode }: { course: Course, onBack: () => void, isDarkMode: boolean }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const flashcards = course.flashcards || [];

  if (flashcards.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <p className="text-sm text-slate-500 mb-4 items-center flex">No flashcards available for this course.</p>
        <button onClick={onBack} className="px-4 py-2 bg-indigo-600 text-white rounded text-xs font-bold">Go Back</button>
      </div>
    );
  }

  const handleNext = () => {
    setIsFlipped(false);
    if (currentIndex < flashcards.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    setIsFlipped(false);
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  return (
    <div className={`flex-1 flex flex-col items-center justify-center p-8 bg-slate-50 dark:bg-slate-900 transition-colors`}>
      <div className="w-full max-w-2xl flex flex-col h-full">
        <div className="flex items-center justify-between mb-8 shrink-0">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center gap-2 text-sm font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Chat
          </button>
          <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">
             Flashcards: {course.title}
          </div>
          <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
            {currentIndex + 1} / {flashcards.length}
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center relative perspective-[1000px]">
           <div 
             className={`w-full h-80 cursor-pointer transition-transform duration-500 transform-style-3d relative ${isFlipped ? 'rotate-y-180' : ''}`}
             onClick={() => setIsFlipped(!isFlipped)}
           >
              {/* Front */}
              <div className="absolute inset-0 w-full h-full backface-hidden bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl shadow-lg flex flex-col items-center justify-center p-8 text-center text-slate-800 dark:text-slate-100">
                 <p className="text-xs font-bold text-slate-400 mb-6 uppercase tracking-wider">Question</p>
                 <h2 className="text-2xl font-semibold leading-relaxed">{flashcards[currentIndex].front}</h2>
                 <p className="absolute bottom-6 text-[10px] text-slate-400 flex items-center gap-2">
                    <RotateCcw className="w-3 h-3" /> Click to flip
                 </p>
              </div>
              
              {/* Back */}
              <div className="absolute inset-0 w-full h-full backface-hidden bg-indigo-50 dark:bg-indigo-900/40 border-2 border-indigo-200 dark:border-indigo-800 rounded-2xl shadow-lg flex flex-col items-center justify-center p-8 text-center text-indigo-900 dark:text-indigo-100 rotate-y-180">
                 <p className="text-xs font-bold text-indigo-400 dark:text-indigo-500 mb-6 uppercase tracking-wider">Answer</p>
                 <p className="text-lg font-medium leading-relaxed">{flashcards[currentIndex].back}</p>
              </div>
           </div>
        </div>

        <div className="flex justify-center items-center gap-6 mt-8 shrink-0">
           <button 
             onClick={handlePrev} 
             disabled={currentIndex === 0}
             className="w-12 h-12 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
           >
             <ArrowLeft className="w-5 h-5" />
           </button>
           <div className="w-32 bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
             <div className="bg-indigo-500 h-full transition-all" style={{ width: `${((currentIndex + 1) / flashcards.length) * 100}%` }}></div>
           </div>
           <button 
             onClick={handleNext} 
             disabled={currentIndex === flashcards.length - 1}
             className="w-12 h-12 rounded-full border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
           >
             <ArrowRight className="w-5 h-5" />
           </button>
        </div>
      </div>
    </div>
  );
}
