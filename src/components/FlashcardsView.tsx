import { useState } from 'react';
import { Course, Flashcard } from '../types';
import { ArrowLeft, ArrowRight, RotateCcw, Plus, X, Trash2 } from 'lucide-react';

export function FlashcardsView({ 
  course, 
  onBack, 
  isDarkMode,
  onAddFlashcard,
  onDeleteFlashcard
}: { 
  course: Course; 
  onBack: () => void; 
  isDarkMode: boolean;
  onAddFlashcard?: (front: string, back: string) => void;
  onDeleteFlashcard?: (id: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFront, setNewFront] = useState('');
  const [newBack, setNewBack] = useState('');

  const flashcards = course.flashcards || [];

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

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFront.trim() || !newBack.trim()) return;
    if (onAddFlashcard) {
      onAddFlashcard(newFront.trim(), newBack.trim());
      setNewFront('');
      setNewBack('');
      setShowAddForm(false);
      // Auto move index to newly added last card
      setCurrentIndex(flashcards.length);
    }
  };

  const handleRemoveCard = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (onDeleteFlashcard) {
      onDeleteFlashcard(id);
      if (currentIndex > 0 && currentIndex >= flashcards.length - 1) {
        setCurrentIndex(prev => prev - 1);
      }
      setIsFlipped(false);
    }
  };

  return (
    <div className={`flex-1 flex flex-col md:flex-row items-stretch justify-center p-4 sm:p-8 bg-slate-50 dark:bg-slate-900 transition-colors gap-6 min-h-screen overflow-y-auto`}>
      {/* Left / Main Section */}
      <div className="flex-1 flex flex-col justify-center max-w-3xl">
        <div className="flex items-center justify-between mb-6 shrink-0">
          <button onClick={onBack} className="text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center gap-2 text-sm font-medium transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Study Desk
          </button>
          <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest hidden sm:block">
             Deck: {course.title}
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-500/10 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Custom Card</span>
          </button>
        </div>

        {flashcards.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl min-h-[300px]">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 text-center">No active revision flashcards found for this material deck.</p>
            <p className="text-xs text-slate-400 dark:text-slate-550 mb-4 max-w-xs text-center">Generate automated AI study sets inside the chat or manually draft questions below.</p>
            <button 
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-xs font-bold"
            >
              Write First Flashcard
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 flex items-center justify-center relative perspective-[1000px] py-4 min-h-[340px]">
               <div 
                 className={`w-full max-w-2xl h-80 cursor-pointer transition-transform duration-500 transform-style-3d relative ${isFlipped ? 'rotate-y-180' : ''}`}
                 onClick={() => setIsFlipped(!isFlipped)}
               >
                  {/* Front */}
                  <div className="absolute inset-0 w-full h-full backface-hidden bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-md flex flex-col items-center justify-center p-8 text-center text-slate-800 dark:text-slate-100">
                     <div className="absolute top-4 right-4 flex items-center gap-2">
                       <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-mono">
                         Card {currentIndex + 1} of {flashcards.length}
                       </span>
                       <button
                         onClick={(e) => handleRemoveCard(e, flashcards[currentIndex].id)}
                         className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                         title="Delete this study card"
                       >
                         <Trash2 className="w-3.5 h-3.5" />
                       </button>
                     </div>
                     <p className="text-xs font-bold text-indigo-500 mb-6 uppercase tracking-widest font-mono">Question</p>
                     <h2 className="text-xl sm:text-2xl font-semibold leading-relaxed px-4">{flashcards[currentIndex].front}</h2>
                     <p className="absolute bottom-6 text-[10px] text-slate-400 dark:text-slate-505 flex items-center gap-2 font-medium">
                        <RotateCcw className="w-3 h-3 animate-pulse" /> Click anywhere to reveal answer
                     </p>
                  </div>
                  
                  {/* Back */}
                  <div className="absolute inset-0 w-full h-full backface-hidden bg-indigo-50/70 dark:bg-slate-900 border border-indigo-150/40 dark:border-slate-850 rounded-2xl shadow-lg flex flex-col items-center justify-center p-8 text-center text-indigo-900 dark:text-slate-100 rotate-y-180">
                     <p className="text-xs font-bold text-indigo-500 dark:text-indigo-400 mb-6 uppercase tracking-widest font-mono">Answer Translation</p>
                     <p className="text-base sm:text-lg font-medium leading-relaxed max-w-xl text-slate-705 dark:text-slate-200 px-4">{flashcards[currentIndex].back}</p>
                     <p className="absolute bottom-6 text-[10px] text-indigo-400/80 dark:text-indigo-500/80 font-medium">
                       Click to view original question
                     </p>
                  </div>
               </div>
            </div>

            <div className="flex justify-center items-center gap-6 mt-6 shrink-0">
               <button 
                 onClick={handlePrev} 
                 disabled={currentIndex === 0}
                 className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
               >
                 <ArrowLeft className="w-5 h-5" />
               </button>
               <div className="w-48 bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                 <div className="bg-indigo-500 h-full transition-all" style={{ width: `${((currentIndex + 1) / flashcards.length) * 100}%` }}></div>
               </div>
               <button 
                 onClick={handleNext} 
                 disabled={currentIndex === flashcards.length - 1}
                 className="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
               >
                 <ArrowRight className="w-5 h-5" />
               </button>
            </div>
          </>
        )}
      </div>

      {/* Right Custom Flashcard Form Panel */}
      {showAddForm && (
        <div className="w-full md:w-80 border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 rounded-3xl shadow-lg shrink-0 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-850 mb-4">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 text-xs uppercase tracking-wider">Custom Flashcard</h4>
              <button 
                onClick={() => setShowAddForm(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-amber-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono text-slate-400 dark:text-slate-500 font-bold uppercase mb-1">
                  Card Question / Term
                </label>
                <textarea
                  value={newFront}
                  onChange={(e) => setNewFront(e.target.value)}
                  placeholder="e.g. What is the Big-O complexity of binary search?"
                  rows={3}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-500/5 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 dark:text-slate-500 font-bold uppercase mb-1">
                  Correct Answer / Definition
                </label>
                <textarea
                  value={newBack}
                  onChange={(e) => setNewBack(e.target.value)}
                  placeholder="e.g. O(log n) because the search space is divided in half each step."
                  rows={4}
                  className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-500/5 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
              >
                Save New Card
              </button>
            </form>
          </div>

          <div className="p-3 bg-zinc-50 dark:bg-slate-900/50 border border-zinc-150/10 rounded-xl text-[10px] text-slate-400 leading-relaxed mt-4">
            <p className="font-bold text-slate-600 dark:text-slate-350 mb-0.5">Study Desk Note:</p>
            Adding custom questions integrates them directly into this active training run. Your scores will be charted automatically.
          </div>
        </div>
      )}
    </div>
  );
}

