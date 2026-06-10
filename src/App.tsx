/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { Image as ImageIcon, X, Paperclip, Mic, MicOff, Moon, Sun, Bell, Volume2, Square, BookOpen, Search, ChevronRight } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Course, Chapter, Message, UserProfile } from './types';
import { COURSES, STUDENT_PROGRESS } from './data';
import { Auth } from './components/Auth';
import { Profile } from './components/Profile';
import { FlashcardsView } from './components/FlashcardsView';

export default function App() {
  const [courses, setCourses] = useState<Course[]>(COURSES);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(COURSES.length > 0 ? COURSES[0] : null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      text: "Hello! I'm your AI Tutor. How can I help you with your studies today?",
      timestamp: Date.now()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ url: string; data: string; mimeType: string } | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [view, setView] = useState<'auth' | 'main' | 'profile' | 'flashcards'>('auth');
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [speakingChapterId, setSpeakingChapterId] = useState<string | null>(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isReadModalOpen, setIsReadModalOpen] = useState(false);
  const [chapterSearchQuery, setChapterSearchQuery] = useState('');
  const coursePdfInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const currentProgress = selectedCourse?.progress || {
    overallScore: 0,
    weakAreas: [],
    strongAreas: [],
    recentQuizScores: {},
    performanceHistory: []
  };

  const filteredChapters = selectedCourse?.chapters.filter(chapter => 
    chapter.title.toLowerCase().includes(chapterSearchQuery.toLowerCase())
  ) || [];

  const notifications = [
    {
      id: 1,
      title: "Review Recommended",
      message: currentProgress.weakAreas.length > 0 ? `Based on your recent scores, reviewing chapters on ${currentProgress.weakAreas[0]} will help improve your mastery.` : "Upload a PDF to get recommendations.",
      isUnread: true,
      time: "2 hours ago"
    },
    {
      id: 2,
      title: "Upcoming Deadline",
      message: "Problem Set #4 is due in 2 days. Review foundational concepts before starting.",
      isUnread: true,
      time: "5 hours ago"
    }
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    // Initialize speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setInputValue((prev) => prev ? prev + ' ' + finalTranscript : finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognitionRef.current = recognition;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch (e) {
          console.error(e);
        }
      } else {
        alert("Speech recognition is not supported in this browser.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = (event.target?.result as string).split(',')[1];
      const url = URL.createObjectURL(file);
      setSelectedImage({
        url,
        data: base64String,
        mimeType: file.type
      });
    };
    reader.readAsDataURL(file);
    // Reset input value so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCoursePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("Please upload a PDF file.");
      return;
    }

    setIsUploadingPdf(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64String = (event.target?.result as string).split(',')[1];
      try {
        const response = await fetch('/api/parse-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pdfData: base64String,
            title: file.name
          })
        });
        if (!response.ok) throw new Error("API Error");
        const data = await response.json();
        
        const newCourse: Course = {
            id: `course_${Date.now()}`,
            title: file.name.replace('.pdf', ''),
            description: 'Custom uploaded course',
            chapters: data.chapters || [],
            pdfData: base64String,
            progress: data.progress
        };
        
        setCourses(prev => [...prev, newCourse]);
        setSelectedCourse(newCourse);
        setSelectedChapter(null);
      } catch (err) {
        console.error(err);
        alert("Failed to parse PDF.");
      } finally {
        setIsUploadingPdf(false);
      }
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  };

  const handleGenerateFlashcards = async () => {
    if (!selectedCourse || !selectedCourse.pdfData) return;
    
    if (selectedCourse.flashcards && selectedCourse.flashcards.length > 0) {
       setView('flashcards');
       return;
    }

    setIsGeneratingFlashcards(true);
    try {
      const response = await fetch('/api/generate-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfData: selectedCourse.pdfData,
          title: selectedCourse.title
        })
      });
      if (!response.ok) throw new Error("API Error");
      const data = await response.json();
      
      const updatedCourse = { ...selectedCourse, flashcards: data.flashcards || [] };
      setCourses(courses.map(c => c.id === updatedCourse.id ? updatedCourse : c));
      setSelectedCourse(updatedCourse);
      setView('flashcards');
    } catch (err) {
      console.error(err);
      alert("Failed to generate flashcards.");
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };

  const speakChapter = (chapter: Chapter) => {
    if (speakingChapterId === chapter.id) {
      window.speechSynthesis.cancel();
      setSpeakingChapterId(null);
      return;
    }
    window.speechSynthesis.cancel();
    if (!chapter.content) {
       alert("No readable content found for this chapter.");
       return;
    }
    const utterance = new SpeechSynthesisUtterance(chapter.content);
    utterance.onend = () => setSpeakingChapterId(null);
    utterance.onerror = () => setSpeakingChapterId(null);
    setSpeakingChapterId(chapter.id);
    window.speechSynthesis.speak(utterance);
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() && !selectedImage) return;

    const newUserMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: Date.now(),
      image: selectedImage ? { ...selectedImage } : undefined
    };

    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setInputValue('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: selectedCourse?.title || 'Unknown Course',
          chapterId: selectedChapter?.title || 'General Overview',
          messages: updatedMessages.map(m => ({ role: m.role, text: m.text, image: m.image })),
          progress: currentProgress,
          pdfData: selectedCourse?.pdfData
        })
      });

      if (!response.ok) throw new Error('API Error');
      const data = await response.json();

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: data.text,
        timestamp: Date.now()
      }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: "I'm sorry, I'm having trouble connecting right now. Please try again later.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (actionText: string) => {
    handleSendMessage(actionText);
  };

  if (view === 'auth') {
    return <Auth onLogin={(u) => { setUser(u); setView('main'); }} isDarkMode={isDarkMode} />;
  }

  if (view === 'profile') {
    return <Profile user={user!} onSave={(u) => { setUser(u); setView('main'); }} onCancel={() => setView('main')} isDarkMode={isDarkMode} />;
  }

  if (view === 'flashcards' && selectedCourse) {
    return <FlashcardsView course={selectedCourse} onBack={() => setView('main')} isDarkMode={isDarkMode} />;
  }

  return (
    <div className={`h-screen w-full flex flex-col font-sans transition-colors overflow-hidden ${isDarkMode ? 'dark bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Header */}
      <header className="h-16 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 shrink-0 transition-colors">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white rounded-sm"></div>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-white leading-tight">EduFlow AI</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Interactive Learning Assistant</p>
          </div>
        </div>
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-3 text-sm font-medium text-slate-600 dark:text-slate-300">
            {selectedCourse && <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs italic">{selectedCourse.id.toUpperCase()}: {selectedCourse.title}</span>}
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => { setUser(null); setView('auth'); }}
              className="text-xs font-bold text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-colors mr-2"
            >
              Logout
            </button>
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
                {notifications.some(n => n.isUnread) && (
                  <span className="absolute top-1 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-950"></span>
                )}
              </button>
  
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg z-50 overflow-hidden text-left">
                  <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                    <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">Notifications</h3>
                    <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="w-3 h-3" /></button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.map(notif => (
                      <div key={notif.id} className={`p-3 border-b border-slate-100 dark:border-slate-800 flex items-start space-x-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${notif.isUnread ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}>
                        <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${notif.isUnread ? 'bg-indigo-500' : 'bg-transparent'}`}></div>
                        <div>
                          <p className={`text-xs font-bold ${notif.isUnread ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>{notif.title}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{notif.message}</p>
                          <p className="text-[9px] text-slate-400 mt-1">{notif.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-2 text-center bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800">
                    <button className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Mark all as read</button>
                  </div>
                </div>
              )}
            </div>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)} 
              className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Toggle theme"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800"></div>
          <div className="flex items-center space-x-3 cursor-pointer p-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" onClick={() => setView('profile')} title="Edit Profile">
            <div className="text-right">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{user?.name}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">Student Account</p>
            </div>
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 rounded-full flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold hover:shadow-md transition-shadow">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Course Structure */}
        <aside className="w-64 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 overflow-y-auto transition-colors">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-3">Active Course</h3>
            <div className="space-y-2">
              {courses.map(course => (
                <button
                  key={course.id}
                  onClick={() => {
                    setSelectedCourse(course);
                    setSelectedChapter(null);
                  }}
                  className={`w-full text-left p-2 rounded text-sm transition-colors ${
                    selectedCourse?.id === course.id 
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 border-l-4 border-indigo-500 font-bold text-indigo-700 dark:text-indigo-300' 
                      : 'font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-4 border-transparent border'
                  }`}
                >
                  <span className="truncate block">{course.title}</span>
                </button>
              ))}
            </div>
           <div className="flex flex-col gap-2 mt-4">
               <button 
                 onClick={() => coursePdfInputRef.current?.click()}
                 disabled={isUploadingPdf || isGeneratingFlashcards}
                 className="flex items-center gap-2 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/50 w-full justify-center disabled:opacity-50 transition-colors"
               >
                 {isUploadingPdf ? <span className="animate-pulse">Processing PDF...</span> : <>+ Upload Course PDF</>}
               </button>
               {selectedCourse?.pdfData && (
                  <button 
                    onClick={handleGenerateFlashcards}
                    disabled={isGeneratingFlashcards}
                    className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/50 w-full justify-center disabled:opacity-50 transition-colors"
                  >
                    {isGeneratingFlashcards ? <span className="animate-pulse">Generating Cards...</span> : <>Flashcard Mode</>}
                  </button>
               )}
               <input type="file" accept="application/pdf" className="hidden" ref={coursePdfInputRef} onChange={handleCoursePdfUpload} />
            </div>
          </div>
          
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-3">Course Chapters</h3>
            <div className="mb-3 relative">
              <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search chapters..."
                value={chapterSearchQuery}
                onChange={(e) => setChapterSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-sm placeholder-slate-400 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>
            <div className="space-y-1">
              {(!chapterSearchQuery || "00 general overview".includes(chapterSearchQuery.toLowerCase())) && (
                <button
                   onClick={() => setSelectedChapter(null)}
                   className={`flex items-center justify-between w-full text-left p-2 rounded transition-colors ${
                    selectedChapter === null
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 border-l-4 border-indigo-500'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-4 border-transparent'
                   }`}
                >
                  <span className={`text-sm ${selectedChapter === null ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'font-medium text-slate-600 dark:text-slate-400'}`}>00 General Overview</span>
                  {selectedChapter === null && <div className="w-2 h-2 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-pulse"></div>}
                </button>
              )}
              {filteredChapters.map((chapter, index) => (
                <div key={chapter.id} className="flex items-center space-x-1">
                  <button
                    onClick={() => setSelectedChapter(chapter)}
                     className={`flex-1 flex items-center justify-between text-left p-2 rounded transition-colors ${
                      selectedChapter?.id === chapter.id
                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border-l-4 border-indigo-500'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-4 border-transparent'
                     }`}
                  >
                    <span className={`text-sm truncate block mr-2 ${selectedChapter?.id === chapter.id ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'font-medium text-slate-600 dark:text-slate-400'}`}>
                      {String(index + 1).padStart(2, '0')} {chapter.title}
                    </span>
                    {selectedChapter?.id === chapter.id && <div className="w-2 h-2 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-pulse"></div>}
                  </button>
                  {selectedChapter?.id === chapter.id && (
                    <div className="flex items-center space-x-1 shrink-0">
                      <button 
                         onClick={(e) => { e.stopPropagation(); setIsReadModalOpen(true); }} 
                         className="p-2 shrink-0 rounded transition-colors bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                         title="Read Chapter"
                      >
                         <BookOpen className="w-4 h-4" />
                      </button>
                      <button 
                         onClick={(e) => { e.stopPropagation(); speakChapter(chapter); }} 
                         className={`p-2 shrink-0 rounded transition-colors ${speakingChapterId === chapter.id ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                         title={speakingChapterId === chapter.id ? "Stop Reading" : "Read Aloud"}
                      >
                         {speakingChapterId === chapter.id ? <Square className="w-4 h-4 fill-current" /> : <Volume2 className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 flex-1">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-3">Learning Progress</h3>
            <div className="mb-4">
              <div className="flex justify-between text-[11px] mb-1 font-semibold text-slate-600 dark:text-slate-400">
                <span>Overall Score</span>
                <span>{currentProgress.overallScore}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 dark:bg-indigo-400" style={{ width: `${currentProgress.overallScore}%` }}></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="p-3 rounded-lg bg-indigo-900 dark:bg-indigo-900/80 text-white">
                <p className="text-[10px] font-bold uppercase opacity-60 mb-1">Goal for Today</p>
                <p className="text-xs leading-relaxed">
                  {selectedCourse ? `Complete the ${selectedChapter ? selectedChapter.title : 'General Overview'} and pass the mini-quiz.` : 'Upload a course to set a goal.'}
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Chat Content */}
        <section className="flex-1 flex flex-col bg-white dark:bg-slate-950 relative transition-colors">
          <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-white dark:from-slate-950 to-transparent pointer-events-none z-10 transition-colors"></div>
          <div className="flex-1 p-8 space-y-6 overflow-y-auto flex flex-col">
            
            <div className="flex-1"></div> {/* Spacer to push messages to bottom if short */}
            
            {messages.map((message) => (
              <div 
                key={message.id} 
                className={`flex items-start space-x-4 max-w-[80%] ${message.role === 'user' ? 'self-end justify-end' : ''}`}
              >
                {message.role === 'assistant' ? (
                  <>
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
                      <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full"></div>
                    </div>
                    <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-2xl rounded-tl-none border border-transparent dark:border-slate-800 shadow-sm">
                      <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed markdown-body prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-white dark:prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-slate-800 dark:prose-invert">
                        <Markdown remarkPlugins={[remarkGfm]}>{message.text}</Markdown>
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 block font-medium">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 p-4 rounded-2xl rounded-tr-none shadow-sm transition-colors">
                      {message.image && (
                        <div className="mb-3">
                          <img src={message.image.url} alt="Uploaded context" className="max-w-full max-h-48 rounded-lg shadow-sm border border-indigo-500/30" />
                        </div>
                      )}
                      <p className="text-sm text-white leading-relaxed font-medium whitespace-pre-wrap">{message.text}</p>
                      <span className="text-[10px] text-indigo-200 dark:text-indigo-100 mt-2 block font-medium text-right">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-indigo-500 dark:bg-indigo-600 flex items-center justify-center shrink-0 text-white text-[10px] font-bold shadow-sm">
                      SU
                    </div>
                  </>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-start space-x-4 max-w-[80%]">
                 <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 bg-indigo-600 dark:bg-indigo-400 rounded-full animate-pulse"></div>
                </div>
                <div className="bg-slate-100 dark:bg-slate-800/50 border border-transparent dark:border-slate-800 shadow-sm p-4 rounded-2xl rounded-tl-none flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 transition-colors">
            <div className="mt-0 mb-4 flex justify-center space-x-4">
               {messages.length < 3 && !isLoading && (
                  <>
                    <button onClick={() => handleQuickAction("Generate a quick 3-question quiz for me to test my knowledge.")} className="text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-colors">Generate Quiz</button>
                    <button onClick={() => handleQuickAction("Explain the core concepts of this chapter to me simply.")} className="text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-colors">Explain Concepts</button>
                    <button onClick={() => handleQuickAction("I have a doubt about the material. Can you help clarify?")} className="text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 rounded hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition-colors">Need Clarification</button>
                  </>
               )}
            </div>
            {selectedImage && (
              <div className="mb-3 relative inline-block">
                 <img src={selectedImage.url} alt="Preview" className="h-16 w-auto rounded border border-slate-200 dark:border-slate-700 shadow-sm" />
                 <button onClick={() => setSelectedImage(null)} type="button" className="absolute -top-2 -right-2 bg-white dark:bg-slate-800 text-slate-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 rounded-full border border-slate-200 dark:border-slate-700 p-0.5 shadow-sm">
                   <X className="w-3 h-3" />
                 </button>
              </div>
            )}
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSendMessage(inputValue); }}
              className="relative flex items-center"
            >
              <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
              <button 
                 type="button" 
                 onClick={() => fileInputRef.current?.click()}
                 className="absolute left-3 p-2 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors z-10"
              >
                  <Paperclip className="w-4 h-4" />
              </button>
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(inputValue);
                  }
                }}
                placeholder={`Ask about ${selectedChapter?.title || selectedCourse?.title || 'anything'}...`}
                className="w-full py-4 pl-12 pr-40 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:focus:border-indigo-500 text-sm resize-none shadow-sm dark:text-slate-100 dark:placeholder-slate-500 transition-colors"
                rows={1}
                disabled={isLoading}
              />
              <div className="absolute right-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`p-2 rounded-full transition-colors ${
                    isListening 
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 animate-pulse' 
                      : 'text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30'
                  }`}
                  title={isListening ? "Stop listening" : "Start listening"}
                >
                  <Mic className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  disabled={(!inputValue.trim() && !selectedImage) || isLoading}
                  className="px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50 hover:bg-indigo-700 dark:hover:bg-indigo-600 transition"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* Right Panel: Context & Insights */}
        <aside className="w-72 bg-slate-50 dark:bg-slate-900/50 border-l border-slate-200 dark:border-slate-800 flex flex-col shrink-0 overflow-y-auto transition-colors">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Relevant Resources</h3>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold cursor-pointer hover:underline">View All</span>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="w-6 h-6 bg-red-100 dark:bg-red-900/30 rounded flex items-center justify-center text-red-600 dark:text-red-400 text-[10px] font-bold">PDF</div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">Course Syllabus.pdf</p>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Official course guidelines</p>
              </div>
              <div 
                className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition"
                onClick={() => setIsVideoModalOpen(true)}
              >
                <div className="flex items-center space-x-3 mb-2">
                  <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded flex items-center justify-center text-blue-600 dark:text-blue-400 text-[10px] font-bold">VID</div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">{selectedChapter ? selectedChapter.title : (selectedCourse?.title || 'General')} Recap</p>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Click to play recommended video lecture</p>
              </div>
            </div>

            <div className="mt-8">
               <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-4">Performance Dashboard</h3>
               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 shadow-sm">
                 <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-2">Quiz Score Trend</p>
                 <div className="h-40 w-full">
                   <ResponsiveContainer width="100%" height="100%">
                     <LineChart data={currentProgress.performanceHistory} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                       <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDarkMode ? '#334155' : '#e2e8f0'} />
                       <XAxis 
                         dataKey="date" 
                         tick={{ fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#64748b' }} 
                         axisLine={false} 
                         tickLine={false} 
                       />
                       <YAxis 
                         tick={{ fontSize: 10, fill: isDarkMode ? '#94a3b8' : '#64748b' }} 
                         axisLine={false} 
                         tickLine={false} 
                         domain={[0, 100]} 
                       />
                       <Tooltip 
                         contentStyle={{ 
                           backgroundColor: isDarkMode ? '#0f172a' : '#ffffff', 
                           borderColor: isDarkMode ? '#1e293b' : '#e2e8f0',
                           fontSize: '12px',
                           borderRadius: '8px'
                         }} 
                       />
                       <Line 
                         type="monotone" 
                         dataKey="score" 
                         stroke="#6366f1" 
                         strokeWidth={3} 
                         dot={{ r: 4, strokeWidth: 2, fill: isDarkMode ? '#0f172a' : '#ffffff' }} 
                         activeDot={{ r: 6 }} 
                       />
                     </LineChart>
                   </ResponsiveContainer>
                 </div>
               </div>
            </div>

            <div className="mt-8">
               <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-4">Adaptive Path Recommendations</h3>
               
               {currentProgress.weakAreas.length > 0 && (
                 <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg shadow-sm">
                    <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase mb-1">Focus Area</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{currentProgress.weakAreas[0]}</p>
                    <button onClick={() => handleQuickAction(`I'm struggling with ${currentProgress.weakAreas[0]}. Can we go over some specific practice problems to help me improve?`)} className="mt-2 text-[10px] font-bold text-red-700 dark:text-red-400 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/50 px-2 py-1.5 rounded w-full text-center hover:bg-red-100 dark:hover:bg-red-900/30 transition shadow-sm">Practice This</button>
                 </div>
               )}
               
               {currentProgress.strongAreas.length > 0 && (
                 <div className="p-3 bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30 rounded-lg shadow-sm">
                    <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase mb-1">Mastery Challenge</p>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{currentProgress.strongAreas[0]}</p>
                    <button onClick={() => handleQuickAction(`Give me a difficult challenge problem involving ${currentProgress.strongAreas[0]} to test my mastery.`)} className="mt-2 text-[10px] font-bold text-green-700 dark:text-green-400 bg-white dark:bg-slate-900 border border-green-200 dark:border-green-900/50 px-2 py-1.5 rounded w-full text-center hover:bg-green-100 dark:hover:bg-green-900/30 transition shadow-sm">Take Challenge</button>
                 </div>
               )}
            </div>

            <div className="mt-8">
               <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-4">Active Assignments</h3>
               {selectedCourse ? (
                 <div className="p-4 bg-white dark:bg-slate-900 border-l-4 border-yellow-400 dark:border-yellow-500 rounded shadow-sm">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">Problem Set: {selectedCourse.title}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">Due in 2 days</p>
                    <div className="flex items-center justify-between">
                       <span className="text-[10px] font-bold text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-900/30 px-2 py-0.5 rounded">In Progress</span>
                       <button onClick={() => handleQuickAction(`I need help with my Active Assignment for ${selectedCourse.title}.`)} className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 underline">Get Help</button>
                    </div>
                 </div>
               ) : (
                 <p className="text-xs text-slate-500 italic">No active assignments.</p>
               )}
            </div>

            <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-800">
               <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-3">Chat History</h3>
               <div className="space-y-2 opacity-60">
                 <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 truncate cursor-pointer hover:underline">• Yesterday: Concept Review</div>
                 <div className="text-[11px] font-medium text-slate-600 dark:text-slate-400 truncate cursor-pointer hover:underline">• Monday: Practice Questions</div>
               </div>
            </div>
          </div>
          
          <div className="mt-auto p-4 bg-slate-100 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 italic">Was this session helpful?</p>
            <div className="flex space-x-2">
              <button className="w-6 h-6 border border-slate-300 dark:border-slate-700 rounded flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-green-600 dark:hover:text-green-400 transition-colors">✓</button>
              <button className="w-6 h-6 border border-slate-300 dark:border-slate-700 rounded flex items-center justify-center text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-red-600 dark:hover:text-red-400 transition-colors">✕</button>
            </div>
          </div>
        </aside>
      </main>

      {/* Video Modal */}
      {isVideoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-950 w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col transition-colors">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">
                {selectedChapter ? selectedChapter.title : (selectedCourse?.title || 'General')} - Video Lecture
              </h3>
              <button 
                onClick={() => setIsVideoModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors bg-white dark:bg-slate-800 p-1.5 rounded-full shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 bg-slate-100 dark:bg-slate-900 flex-1 flex flex-col items-center justify-center">
              <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shadow-md flex items-center justify-center relative">
                 <div className="absolute inset-0 bg-gradient-to-tr from-indigo-900/40 to-purple-900/40 mix-blend-overlay"></div>
                 <p className="text-white font-bold opacity-80 z-10 flex flex-col items-center gap-3">
                   <span className="w-16 h-16 bg-white/20 backdrop-blur rounded-full flex items-center justify-center shadow-lg border border-white/30 cursor-pointer hover:bg-white/30 transition-colors" title="Play Video">
                     <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                   </span>
                   <span className="text-center px-4">
                     Simulated Video Player for {selectedChapter ? selectedChapter.title : (selectedCourse?.title || 'General')}
                   </span>
                 </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Read Chapter Modal */}
      {isReadModalOpen && selectedChapter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-950 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col transition-colors">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 shrink-0">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-500" />
                {selectedChapter.title}
              </h3>
              <div className="flex items-center space-x-2">
                <button 
                  onClick={() => speakChapter(selectedChapter)} 
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded transition-colors ${speakingChapterId === selectedChapter.id ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400' : 'bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 shadow-sm border border-slate-200 dark:border-slate-700'}`}
                >
                  {speakingChapterId === selectedChapter.id ? <><Square className="w-4 h-4 fill-current" /> Stop</> : <><Volume2 className="w-4 h-4" /> Listen</>}
                </button>
                <button 
                  onClick={() => setIsReadModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors bg-white dark:bg-slate-800 p-1.5 rounded-full shadow-sm border border-slate-200 dark:border-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {selectedCourse?.chapters && selectedCourse.chapters.length > 0 && (
              <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex items-center space-x-2 overflow-x-auto text-sm shrink-0 hide-scrollbar scroll-smooth">
                <span className="text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap text-xs uppercase tracking-wider">{selectedCourse?.title}</span>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                <div className="flex space-x-1 shrink-0">
                   {selectedCourse.chapters.map((chapter) => (
                     <button
                       key={chapter.id}
                       onClick={() => setSelectedChapter(chapter)}
                       className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                         selectedChapter.id === chapter.id
                           ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                           : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                       }`}
                     >
                       {chapter.title}
                     </button>
                   ))}
                </div>
              </div>
            )}
            <div className="p-8 bg-white dark:bg-slate-950 flex-1 overflow-y-auto">
              <div className="prose prose-slate dark:prose-invert max-w-3xl mx-auto prose-p:leading-loose text-slate-700 dark:text-slate-300">
                {selectedChapter.content ? (
                  <div className="whitespace-pre-wrap">{selectedChapter.content}</div>
                ) : (
                  <div className="text-center py-20 text-slate-500">
                    <p className="italic">No detailed content available for this chapter.</p>
                    <p className="text-sm mt-2">Upload a course PDF to extract detailed chapter contents.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
