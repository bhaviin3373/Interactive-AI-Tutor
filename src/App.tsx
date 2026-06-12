/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { Image as ImageIcon, X, Paperclip, Mic, MicOff, Moon, Sun, Bell, Volume2, Square, BookOpen, Search, ChevronRight, ChevronLeft, Eye, MessageSquare, Check, Trash2, Edit, Play, Pause, RotateCcw, Timer } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Course, Chapter, Message, UserProfile, Annotation } from './types';
import { COURSES, STUDENT_PROGRESS } from './data';
import { Auth } from './components/Auth';
import { Profile } from './components/Profile';
import { FlashcardsView } from './components/FlashcardsView';

const formatTimeSpent = (seconds?: number): string => {
  if (seconds === undefined || seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 65); // or 60
  const s = seconds % 60;
  
  const hDisplay = h > 0 ? `${h}h ` : "";
  const mDisplay = Math.floor((seconds % 3600) / 60) > 0 ? `${Math.floor((seconds % 3600) / 60)}m ` : "";
  const sDisplay = s > 0 || (h === 0 && Math.floor((seconds % 3600) / 60) === 0) ? `${s}s` : "";
  
  return `${hDisplay}${mDisplay}${sDisplay}`.trim();
};

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
  const [middleTab, setMiddleTab] = useState<'chat' | 'view'>('chat');
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);
  const [speakingChapterId, setSpeakingChapterId] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [speakingRate, setSpeakingRate] = useState<number>(1);
  
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      if (availableVoices.length > 0 && !selectedVoiceURI) {
        const defaultVoice = availableVoices.find(v => v.lang.includes('en-') && (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Neural'))) || availableVoices[0];
        setSelectedVoiceURI(defaultVoice.voiceURI);
      }
    };
    
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [selectedVoiceURI]);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isReadModalOpen, setIsReadModalOpen] = useState(false);
  const [activeStudySidebarTab, setActiveStudySidebarTab] = useState<'annotations' | 'terms'>('annotations');
  const [chapterSearchQuery, setChapterSearchQuery] = useState('');
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [immersiveSearchQuery, setImmersiveSearchQuery] = useState('');
  const [immersiveSearchIndex, setImmersiveSearchIndex] = useState(-1);

  const [dailyReadingGoal, setDailyReadingGoal] = useState<number>(() => {
    const saved = localStorage.getItem('daily_reading_goal');
    return saved ? parseInt(saved, 10) : 15; // default 15 minutes
  });

  useEffect(() => {
    localStorage.setItem('daily_reading_goal', dailyReadingGoal.toString());
  }, [dailyReadingGoal]);

  // Global Session Timer States
  const [sessionSeconds, setSessionSeconds] = useState<number>(() => {
    const saved = localStorage.getItem('study_session_seconds');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [isSessionRunning, setIsSessionRunning] = useState<boolean>(() => {
    const saved = localStorage.getItem('study_session_running');
    return saved === 'true';
  });
  const [isSessionTimerEnabled, setIsSessionTimerEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('study_session_enabled');
    return saved === 'true';
  });

  useEffect(() => {
    localStorage.setItem('study_session_seconds', sessionSeconds.toString());
  }, [sessionSeconds]);

  useEffect(() => {
    localStorage.setItem('study_session_running', isSessionRunning.toString());
  }, [isSessionRunning]);

  useEffect(() => {
    localStorage.setItem('study_session_enabled', isSessionTimerEnabled.toString());
  }, [isSessionTimerEnabled]);

  useEffect(() => {
    let interval: any = null;
    if (isSessionRunning && isSessionTimerEnabled) {
      interval = setInterval(() => {
        setSessionSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSessionRunning, isSessionTimerEnabled]);

  const formatSessionTime = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (num: number) => String(num).padStart(2, '0');
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  useEffect(() => {
    if (immersiveSearchIndex >= 0) {
      const activeEl = document.getElementById(`search-match-${immersiveSearchIndex}`);
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [immersiveSearchIndex]);

  useEffect(() => {
    setImmersiveSearchQuery('');
    setImmersiveSearchIndex(-1);
  }, [selectedChapter, isReadModalOpen]);
  
  // Highlighting & Annotation State Definitions
  const [annotations, setAnnotations] = useState<Record<string, Annotation[]>>({});
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number; text: string } | null>(null);
  const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [selectedAnnotationForEdit, setSelectedAnnotationForEdit] = useState<Annotation | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const readerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('chapter_annotations');
    if (saved) {
      try {
        setAnnotations(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load annotations", e);
      }
    }
  }, []);

  const saveAnnotations = (newAnnots: Record<string, Annotation[]>) => {
    setAnnotations(newAnnots);
    localStorage.setItem('chapter_annotations', JSON.stringify(newAnnots));
  };

  const getSelectionCharacterOffsetWithin = (element: HTMLElement) => {
    let start = 0;
    let end = 0;
    const doc = element.ownerDocument || document;
    const win = doc.defaultView || window;
    const sel = win.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(element);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      start = preSelectionRange.toString().length;
      end = start + range.toString().length;
    }
    return { start, end };
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setSelectionRange(null);
      setToolbarPosition(null);
      return;
    }
    
    const text = selection.toString();
    if (readerContainerRef.current) {
      const { start, end } = getSelectionCharacterOffsetWithin(readerContainerRef.current);
      if (start !== end && text.length > 0) {
        setSelectionRange({ start, end, text });
        
        // Calculate bounds of selected text
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        setToolbarPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + window.scrollY - 15
        });
      }
    }
  };

  const handleAddAnnotation = (color: 'yellow' | 'green' | 'pink' | 'blue') => {
    if (!selectionRange || !selectedChapter) return;
    
    const newAnnot: Annotation = {
      id: `annot_${Date.now()}`,
      chapterId: selectedChapter.id,
      text: selectionRange.text,
      start: selectionRange.start,
      end: selectionRange.end,
      color,
      note: noteInput.trim() || undefined,
      createdAt: Date.now()
    };
    
    const chapterId = selectedChapter.id;
    const currentChapterAnnots = annotations[chapterId] || [];
    const updated = {
      ...annotations,
      [chapterId]: [...currentChapterAnnots, newAnnot]
    };
    
    saveAnnotations(updated);
    setSelectionRange(null);
    setToolbarPosition(null);
    setNoteInput('');
    window.getSelection()?.removeAllRanges();
  };

  const handleDeleteAnnotation = (annotId: string) => {
    if (!selectedChapter) return;
    const chapterId = selectedChapter.id;
    const currentChapterAnnots = annotations[chapterId] || [];
    const filtered = currentChapterAnnots.filter(a => a.id !== annotId);
    
    const updated = {
      ...annotations,
      [chapterId]: filtered
    };
    
    saveAnnotations(updated);
    if (selectedAnnotationForEdit?.id === annotId) {
      setSelectedAnnotationForEdit(null);
    }
  };

  const handleUpdateAnnotationNote = (annotId: string, newNote: string) => {
    if (!selectedChapter) return;
    const chapterId = selectedChapter.id;
    const currentChapterAnnots = annotations[chapterId] || [];
    const updatedAnnots = currentChapterAnnots.map(a => {
      if (a.id === annotId) {
        return {
          ...a,
          note: newNote.trim() ? newNote.trim() : undefined
        };
      }
      return a;
    });
    
    const updated = {
      ...annotations,
      [chapterId]: updatedAnnots
    };
    
    saveAnnotations(updated);
    setSelectedAnnotationForEdit(null);
    setEditingNoteText('');
  };

  const getNonOverlappingAnnotations = (annots: Annotation[]): Annotation[] => {
    if (!annots || annots.length === 0) return [];
    
    const sorted = [...annots].sort((a, b) => a.start - b.start);
    const result: Annotation[] = [];
    let lastEnd = -1;
    
    for (const ann of sorted) {
      if (ann.start >= lastEnd) {
        result.push(ann);
        lastEnd = ann.end;
      }
    }
    return result;
  };

  const colorBgMap = {
    yellow: 'bg-yellow-50 dark:bg-yellow-950/30 border-l-4 border-yellow-400 dark:border-yellow-600',
    green: 'bg-green-50 dark:bg-green-950/20 border-l-4 border-green-400 dark:border-green-600',
    pink: 'bg-pink-50 dark:bg-pink-950/25 border-l-4 border-pink-400 dark:border-pink-600',
    blue: 'bg-blue-50 dark:bg-blue-950/20 border-l-4 border-blue-400 dark:border-blue-600'
  };

  const colorTextHighlightMap = {
    yellow: 'bg-yellow-200/80 hover:bg-yellow-300 dark:bg-yellow-905/85 dark:hover:bg-yellow-900/90 text-slate-900 dark:text-yellow-100 border-b border-yellow-400',
    green: 'bg-green-200/80 hover:bg-green-300 dark:bg-green-905/75 dark:hover:bg-green-900/90 text-slate-900 dark:text-green-100 border-b border-green-400',
    pink: 'bg-pink-200/80 hover:bg-pink-300 dark:bg-pink-905/85 dark:hover:bg-pink-900/90 text-slate-900 dark:text-pink-100 border-b border-pink-400',
    blue: 'bg-blue-200/80 hover:bg-blue-300 dark:bg-blue-905/75 dark:hover:bg-blue-900/90 text-slate-900 dark:text-blue-100 border-b border-blue-400'
  };

  const getSearchMatches = (text: string, query: string) => {
    if (!query || !query.trim()) return [];
    const matches: { start: number; end: number }[] = [];
    const cleanQuery = query.toLowerCase();
    const cleanText = text.toLowerCase();
    let index = cleanText.indexOf(cleanQuery);
    while (index !== -1) {
      matches.push({ start: index, end: index + cleanQuery.length });
      index = cleanText.indexOf(cleanQuery, index + cleanQuery.length);
    }
    return matches;
  };

  const renderTextWithSearch = (
    text: string,
    startOffset: number,
    query: string,
    matches: { start: number; end: number }[],
    activeIndex: number
  ) => {
    if (!query || !query.trim()) {
      return <>{text}</>;
    }

    const elements = [];
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let currentIndex = 0;

    let matchIdx = lowerText.indexOf(lowerQuery);
    while (matchIdx !== -1) {
      if (matchIdx > currentIndex) {
        elements.push(
          <span key={`search-text-${startOffset}-${currentIndex}`}>
            {text.slice(currentIndex, matchIdx)}
          </span>
        );
      }

      const absoluteStart = startOffset + matchIdx;
      const globalIndex = matches.findIndex(m => m.start === absoluteStart);
      const isActive = globalIndex === activeIndex;

      elements.push(
        <mark
          key={`search-match-span-${absoluteStart}`}
          id={`search-match-${globalIndex}`}
          className={`rounded-sm px-0.5 transition-all duration-150 relative inline ${
            isActive
              ? 'bg-amber-400 dark:bg-amber-500 text-slate-950 font-semibold ring-2 ring-indigo-500 dark:ring-indigo-400 scale-105 shadow-md z-10'
              : 'bg-amber-150/90 dark:bg-amber-800/80 text-amber-950 dark:text-amber-100 border border-amber-300 dark:border-amber-700/60'
          }`}
        >
          {text.slice(matchIdx, matchIdx + query.length)}
        </mark>
      );

      currentIndex = matchIdx + query.length;
      matchIdx = lowerText.indexOf(lowerQuery, currentIndex);
    }

    if (currentIndex < text.length) {
      elements.push(
        <span key={`search-text-trail-${startOffset}-${currentIndex}`}>
          {text.slice(currentIndex)}
        </span>
      );
    }

    return <>{elements}</>;
  };

  const renderChapterWithAnnotations = (content: string, chapterId: string) => {
    const chapterAnnots = annotations[chapterId] || [];
    const validAnnots = getNonOverlappingAnnotations(chapterAnnots);
    const matches = getSearchMatches(content, immersiveSearchQuery);
    
    if (validAnnots.length === 0) {
      return (
        <div className="whitespace-pre-wrap leading-relaxed select-text">
          {renderTextWithSearch(content, 0, immersiveSearchQuery, matches, immersiveSearchIndex)}
        </div>
      );
    }
    
    const elements = [];
    let currentIndex = 0;
    
    validAnnots.forEach((ann, idx) => {
      // 1. Text before highlight
      if (ann.start > currentIndex) {
        elements.push(
          <span key={`text-before-${idx}`}>
            {renderTextWithSearch(content.slice(currentIndex, ann.start), currentIndex, immersiveSearchQuery, matches, immersiveSearchIndex)}
          </span>
        );
      }
      
      // 2. Highlight text
      elements.push(
        <span
          key={`highlight-${ann.id}-index-${idx}`}
          className={`relative group inline select-text transition-all rounded px-0.5 ${colorTextHighlightMap[ann.color]}`}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedAnnotationForEdit(ann);
            setEditingNoteText(ann.note || '');
          }}
        >
          {renderTextWithSearch(content.slice(ann.start, ann.end), ann.start, immersiveSearchQuery, matches, immersiveSearchIndex)}
          {ann.note && (
            <span className="inline-flex items-center justify-center ml-1 shrink-0 scale-90">
              <MessageSquare className="w-3 h-3 text-slate-800 dark:text-slate-200 fill-current opacity-70 group-hover:opacity-100" />
            </span>
          )}
        </span>
      );
      
      currentIndex = ann.end;
    });
    
    // 3. Text after all highlights
    if (currentIndex < content.length) {
      elements.push(
        <span key="text-after-all">
          {renderTextWithSearch(content.slice(currentIndex), currentIndex, immersiveSearchQuery, matches, immersiveSearchIndex)}
        </span>
      );
    }
    
    return <div className="whitespace-pre-wrap leading-relaxed select-text">{elements}</div>;
  };

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

  // Keep references to selectedCourse, isReadModalOpen, and speakingChapterId to use in persistent timer
  const isReadModalOpenRef = useRef(isReadModalOpen);
  const speakingChapterIdRef = useRef(speakingChapterId);
  const selectedCourseRef = useRef(selectedCourse);

  useEffect(() => {
    isReadModalOpenRef.current = isReadModalOpen;
  }, [isReadModalOpen]);

  useEffect(() => {
    speakingChapterIdRef.current = speakingChapterId;
  }, [speakingChapterId]);

  useEffect(() => {
    selectedCourseRef.current = selectedCourse;
  }, [selectedCourse]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;

      const sC = selectedCourseRef.current;
      if (!sC) return;

      const isReading = isReadModalOpenRef.current || speakingChapterIdRef.current !== null;
      const isChatting = !isReading;

      setCourses(prevCourses => {
        return prevCourses.map(c => {
          if (c.id === sC.id) {
            const currentProg = c.progress || {
              overallScore: 0,
              weakAreas: [],
              strongAreas: [],
              recentQuizScores: {},
              performanceHistory: []
            };
            return {
              ...c,
              progress: {
                ...currentProg,
                totalActiveTime: (currentProg.totalActiveTime || 0) + 1,
                readingTime: isReading ? (currentProg.readingTime || 0) + 1 : (currentProg.readingTime || 0),
                chattingTime: isChatting ? (currentProg.chattingTime || 0) + 1 : (currentProg.chattingTime || 0)
              }
            };
          }
          return c;
        });
      });

      setSelectedCourse(prevSelected => {
        if (!prevSelected || prevSelected.id !== sC.id) return prevSelected;
        const currentProg = prevSelected.progress || {
          overallScore: 0,
          weakAreas: [],
          strongAreas: [],
          recentQuizScores: {},
          performanceHistory: []
        };
        return {
          ...prevSelected,
          progress: {
            ...currentProg,
            totalActiveTime: (currentProg.totalActiveTime || 0) + 1,
            readingTime: isReading ? (currentProg.readingTime || 0) + 1 : (currentProg.readingTime || 0),
            chattingTime: isChatting ? (currentProg.chattingTime || 0) + 1 : (currentProg.chattingTime || 0)
          }
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

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
        if (!response.ok) {
           const errData = await response.json();
           throw new Error(errData.error || "API Error");
        }
        const data = await response.json();
        
        const newCourse: Course = {
            id: `course_${Date.now()}`,
            title: file.name.replace('.pdf', ''),
            description: 'Custom uploaded course',
            chapters: data.chapters || [],
            pdfData: base64String,
            progress: data.progress,
            metadata: data.metadata
        };
        
        setCourses(prev => [...prev, newCourse]);
        setSelectedCourse(newCourse);
        setSelectedChapter(null);
      } catch (err: any) {
        console.error(err);
        alert(`Failed to parse PDF: ${err.message || 'Unknown error'}`);
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
      if (!response.ok) {
         const errData = await response.json();
         throw new Error(errData.error || "API Error");
      }
      const data = await response.json();
      
      const updatedCourse = { ...selectedCourse, flashcards: data.flashcards || [] };
      setCourses(courses.map(c => c.id === updatedCourse.id ? updatedCourse : c));
      setSelectedCourse(updatedCourse);
      setView('flashcards');
    } catch (err: any) {
      console.error(err);
      alert(`Failed to generate flashcards: ${err.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };

  const speakChapter = (chapter: Chapter, customRate?: number) => {
    const rateToUse = customRate !== undefined ? customRate : speakingRate;
    if (speakingChapterId === chapter.id && customRate === undefined) {
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
    if (selectedVoiceURI) {
      const selectedVoice = voices.find(v => v.voiceURI === selectedVoiceURI);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }
    utterance.rate = rateToUse;
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

      if (!response.ok) {
         const errData = await response.json();
         throw new Error(errData.error || "API Error");
      }
      const data = await response.json();

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: data.text,
        timestamp: Date.now()
      }]);
    } catch (error: any) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `Error: ${error.message || "I'm sorry, I'm having trouble connecting right now. Please try again later."}`,
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
    return <Profile user={user!} onSave={(u) => { setUser(u); setView('main'); }} onCancel={() => setView('main')} onLogout={() => { setUser(null); setView('auth'); }} isDarkMode={isDarkMode} />;
  }

  if (view === 'flashcards' && selectedCourse) {
    return <FlashcardsView course={selectedCourse} onBack={() => setView('main')} isDarkMode={isDarkMode} />;
  }

  return (
    <div className={`h-screen w-full flex flex-col font-sans transition-colors overflow-hidden ${isDarkMode ? 'dark bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Header */}
      {!(isFocusMode && middleTab === 'view') && (
        <header className="h-16 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 shrink-0 transition-colors">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white rounded-sm"></div>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-white leading-tight">Welcome to Interactive AI Tutor</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Elevate.</p>
          </div>
        </div>
        <div className="flex items-center space-x-6">
          {/* Global Session Timer Widget */}
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-800/85 select-none shadow-3xs">
            <div 
              className="flex items-center gap-2 cursor-pointer" 
              onClick={() => {
                const updatedEnabled = !isSessionTimerEnabled;
                setIsSessionTimerEnabled(updatedEnabled);
                if (updatedEnabled) {
                  setIsSessionRunning(true);
                } else {
                  setIsSessionRunning(false);
                }
              }}
              title="Toggle Study Session Timer"
            >
              <div className={`relative inline-flex h-4 w-7.5 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-250 ease-in-out focus:outline-none ${isSessionTimerEnabled ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-xs ring-0 transition duration-250 ease-in-out ${isSessionTimerEnabled ? 'translate-x-[14px]' : 'translate-x-0'} mt-0.5 ml-0.5`} />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 leading-none">Session</span>
                <span className="text-[7.5px] font-extrabold text-slate-400 dark:text-slate-505 leading-none mt-0.5 uppercase tracking-wider">
                  {isSessionTimerEnabled ? (isSessionRunning ? 'RUNNING' : 'PAUSED') : 'OFF'}
                </span>
              </div>
            </div>

            {isSessionTimerEnabled && (
              <div className="flex items-center gap-2 pl-2.5 border-l border-slate-200 dark:border-slate-800 animate-fadeIn duration-250">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono tracking-wider w-12 text-center">
                  {formatSessionTime(sessionSeconds)}
                </span>
                
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setIsSessionRunning(!isSessionRunning)}
                    className={`p-1 rounded-md transition-all duration-150 cursor-pointer ${isSessionRunning ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900/20 dark:hover:bg-amber-900/35 dark:text-amber-400' : 'bg-emerald-150 hover:bg-emerald-250 text-emerald-800 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/35 dark:text-emerald-400'}`}
                    title={isSessionRunning ? 'Pause Session' : 'Resume Session'}
                  >
                    {isSessionRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => {
                      setSessionSeconds(0);
                      setIsSessionRunning(false);
                    }}
                    className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-500 hover:text-red-755 dark:text-slate-400 dark:hover:text-red-400 transition-all duration-150 cursor-pointer"
                    title="Reset Session"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

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
            {voices.length > 0 && (
              <div className="flex items-center space-x-1.5 bg-slate-100 dark:bg-slate-800/80 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700/60 transition-colors mr-1">
                <Volume2 className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                <select
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  className="bg-transparent text-slate-700 dark:text-slate-200 text-xs font-bold focus:outline-none max-w-[100px] md:max-w-[140px] cursor-pointer truncate"
                  title="Select Speaker Persona"
                >
                  {voices.map((voice) => {
                    const cleanName = voice.name
                      .replace(/Google/gi, "")
                      .replace(/Microsoft/gi, "")
                      .replace(/Natural/gi, "")
                      .replace(/Desktop/gi, "")
                      .trim();
                    return (
                      <option key={voice.voiceURI} value={voice.voiceURI} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-xs">
                        {cleanName || voice.name} ({voice.lang})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
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
      )}

      <main className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Course Structure */}
        {!(isFocusMode && middleTab === 'view') && (
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
                   onClick={() => { setSelectedChapter(null); setMiddleTab('view'); }}
                   className={`flex items-center justify-between w-full text-left p-2.5 rounded-lg transition-colors ${
                    selectedChapter === null
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 border-l-4 border-indigo-500 font-bold'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-4 border-transparent'
                   }`}
                >
                  <span className={`text-sm ${selectedChapter === null ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'font-medium text-slate-600 dark:text-slate-400'}`}>00 General Overview</span>
                  {selectedChapter === null && <div className="w-2 h-2 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-pulse"></div>}
                </button>
              )}
              {filteredChapters.map((chapter, index) => (
                <div key={chapter.id} className={`p-2.5 rounded-lg transition-all ${selectedChapter?.id === chapter.id ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-l-4 border-indigo-500' : 'hover:bg-slate-50/50 dark:hover:bg-slate-900/40 border-l-4 border-transparent'}`}>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        setSelectedChapter(chapter);
                        setMiddleTab('view');
                      }}
                      className="flex-1 text-left truncate mr-1"
                      title={chapter.title}
                    >
                      <span className={`text-xs block truncate ${selectedChapter?.id === chapter.id ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'font-medium text-slate-600 dark:text-slate-400'}`}>
                        {String(index + 1).padStart(2, '0')} {chapter.title}
                      </span>
                    </button>
                    {selectedChapter?.id === chapter.id && (
                      <span className="w-1.5 h-1.5 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-pulse shrink-0"></span>
                    )}
                  </div>
                  
                  {/* View and Read Actions always visible for PDF chapters */}
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/40">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedChapter(chapter);
                        setMiddleTab('view');
                      }}
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded flex items-center gap-0.5 transition-all ${
                        selectedChapter?.id === chapter.id && middleTab === 'view'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-indigo-55 dark:bg-indigo-900/45 text-indigo-700 dark:text-indigo-305 hover:bg-indigo-100 dark:hover:bg-indigo-900/60'
                      }`}
                      title="View Chapter details"
                    >
                      <Eye className="w-2.5 h-2.5" />
                      View
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedChapter(chapter);
                        setIsReadModalOpen(true);
                      }}
                      className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center gap-0.5 transition-colors border border-transparent dark:border-slate-700"
                      title="Immersive Read modal"
                    >
                      <BookOpen className="w-2.5 h-2.5 text-slate-500 dark:text-slate-400" />
                      Read
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        speakChapter(chapter);
                      }}
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded flex items-center gap-0.5 transition-colors border border-transparent ${
                        speakingChapterId === chapter.id
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/45 dark:text-amber-300 animate-pulse border-amber-200'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 dark:border-slate-700'
                      }`}
                      title={speakingChapterId === chapter.id ? "Stop Voice Synth" : "Listen Aloud"}
                    >
                      {speakingChapterId === chapter.id ? <Square className="w-2.5 h-2.5 fill-current" /> : <Volume2 className="w-2.5 h-2.5" />}
                      Listen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 flex-1">
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase mb-3">Learning Progress</h3>
            {/* Time Spent Component */}
            <div className="mb-4 p-3 bg-slate-100/50 dark:bg-slate-850/40 rounded-lg border border-slate-200/60 dark:border-slate-800/60">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">
                <span>Time Spent</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-mono text-xs normal-case font-bold">
                  {formatTimeSpent(currentProgress.totalActiveTime || 0)}
                </span>
              </div>
              <div className="space-y-2 mt-1">
                {/* Reading Goal card with dynamic progress ring */}
                {(() => {
                  const readingSecs = currentProgress.readingTime || 0;
                  const readingMins = readingSecs / 60;
                  const matchesGoal = dailyReadingGoal > 0;
                  const pct = matchesGoal ? Math.round((readingMins / dailyReadingGoal) * 100) : 0;
                  const cappedPct = Math.min(100, pct);
                  const radius = 18;
                  const strokeWidth = 3.5;
                  const circumference = 2 * Math.PI * radius;
                  const strokeDashoffset = circumference - (circumference * cappedPct) / 100;
                  const isAchieved = pct >= 100;

                  return (
                    <div className={`relative bg-white dark:bg-slate-900 border rounded-xl p-3 shadow-xs transition-all duration-300 ${isAchieved ? 'border-emerald-500/30 bg-emerald-500/[0.02] dark:bg-emerald-550/[0.01]' : 'border-slate-200/70 dark:border-slate-800/60'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-wider block">Reading Goal</span>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono block mt-0.5">
                            {formatTimeSpent(readingSecs)}
                          </span>
                          
                          {/* Goal Setter Buttons */}
                          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-slate-550 dark:text-slate-400 font-medium">
                              Goal: <span className="font-bold text-indigo-650 dark:text-indigo-400 font-mono">{dailyReadingGoal}m</span>
                            </span>
                            <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 rounded-md p-0.5 border border-slate-200/60 dark:border-slate-700">
                              <button
                                onClick={() => setDailyReadingGoal(g => Math.max(1, g - (g > 5 ? 5 : 1)))}
                                className="px-1 text-[9px] font-extrabold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-750 transition rounded cursor-pointer"
                                title="Subtract minutes"
                              >
                                -
                              </button>
                              <button
                                onClick={() => setDailyReadingGoal(g => Math.min(180, g + 5))}
                                className="px-1 text-[9px] font-extrabold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-750 transition rounded cursor-pointer"
                                title="Add 5 minutes"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Progress ring displaying percentages */}
                        <div className="relative w-11 h-11 flex items-center justify-center shrink-0" title={`${pct}% of your daily goal achieved`}>
                          <svg className="w-full h-full transform -rotate-90">
                            <circle
                              cx="22"
                              cy="22"
                              r={radius}
                              className="stroke-slate-100 dark:stroke-slate-800"
                              strokeWidth={strokeWidth}
                              fill="transparent"
                            />
                            <circle
                              cx="22"
                              cy="22"
                              r={radius}
                              className={`${isAchieved ? 'stroke-emerald-505 dark:stroke-emerald-400' : 'stroke-indigo-600 dark:stroke-indigo-400'} transition-all duration-500 ease-out`}
                              strokeWidth={strokeWidth}
                              fill="transparent"
                              strokeDasharray={circumference}
                              strokeDashoffset={strokeDashoffset}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className={`absolute select-none inset-0 flex flex-col items-center justify-center font-mono text-[9px] font-black ${isAchieved ? 'text-emerald-650 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                            {pct}%
                          </div>
                        </div>
                      </div>

                      {/* Goal Achievement celebration */}
                      {isAchieved && (
                        <div className="mt-2 pt-2 border-t border-emerald-500/10 dark:border-emerald-400/10 flex items-center gap-1 text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold animate-pulse">
                          <span>🎉 Goal Achieved! Great learning today!</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Chatting Time Card */}
                <div className="bg-white/80 dark:bg-slate-900/40 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800/40 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-550 uppercase">Chatting</span>
                    <span className="text-xs font-bold text-slate-750 dark:text-slate-300 font-mono mt-0.5">
                      {formatTimeSpent(currentProgress.chattingTime || 0)}
                    </span>
                  </div>
                  <MessageSquare className="w-3.5 h-3.5 text-slate-300 dark:text-slate-700 shrink-0" />
                </div>
              </div>
            </div>

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
        )}

        {/* Main Chat Content */}
        <section className="flex-1 flex flex-col bg-white dark:bg-slate-950 relative transition-colors">
          {/* Header Tab Switcher (Visible when a Course/PDF is loaded) */}
          {selectedCourse && !(isFocusMode && middleTab === 'view') && (
            <div className="flex border-b border-slate-100 dark:border-slate-800/80 px-6 py-2.5 bg-slate-50/80 dark:bg-slate-900/40 items-center justify-between shrink-0 z-20 backdrop-blur-sm transition-colors">
              <div className="flex space-x-1.5">
                <button
                  onClick={() => setMiddleTab('chat')}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                    middleTab === 'chat'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-150/70 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  AI Chat Tutor
                </button>
                <button
                  onClick={() => {
                    if (!selectedChapter && selectedCourse.chapters?.length > 0) {
                      setSelectedChapter(selectedCourse.chapters[0]);
                    }
                    setMiddleTab('view');
                  }}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                    middleTab === 'view'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-150/70 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Chapter Reader
                </button>
              </div>

              {selectedChapter ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 max-w-[120px] md:max-w-[200px] truncate">
                    Active: {selectedChapter.title}
                  </span>
                  {middleTab === 'view' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => speakChapter(selectedChapter)}
                        className={`p-1.5 rounded transition-colors ${
                          speakingChapterId === selectedChapter.id
                            ? 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/30'
                            : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm'
                        }`}
                        title={speakingChapterId === selectedChapter.id ? "Stop Listening" : "Listen Aloud"}
                      >
                        {speakingChapterId === selectedChapter.id ? <Square className="w-3.5 h-3.5 fill-current" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setIsReadModalOpen(true)}
                        className="p-1.5 rounded bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 shadow-sm"
                        title="Immersive Read Modal"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  General Overview Mode
                </span>
              )}
            </div>
          )}

          {middleTab === 'chat' ? (
            <>
              {/* Chat View */}
              <div className="absolute top-12 left-0 right-0 h-12 bg-gradient-to-b from-white dark:from-slate-950 to-transparent pointer-events-none z-10 transition-colors"></div>
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
            </>
          ) : (
            /* Immersive On-Screen Chapter Viewer (View Option) & Controls (Read Option) */
            <div className="flex-1 p-8 overflow-y-auto bg-white dark:bg-slate-950 transition-colors">
              <div className="max-w-3xl mx-auto py-4">
                {selectedChapter ? (
                  <article className="prose prose-slate dark:prose-invert max-w-none">
                    <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
                      {selectedChapter.title}
                    </h2>
                    
                    {/* Read Option Header controls for immediate on-screen access */}
                    <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/85 dark:border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <Volume2 className="w-4 h-4 text-indigo-500" />
                        <span>Interactive Voice Assistant & Reader</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-700/80 rounded-lg px-2.5 py-1 shadow-sm">
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
                            Speed: {speakingRate.toFixed(1)}x
                          </span>
                          <input
                            type="range"
                            min="0.5"
                            max="2.5"
                            step="0.1"
                            value={speakingRate}
                            onChange={(e) => {
                              const newRate = parseFloat(e.target.value);
                              setSpeakingRate(newRate);
                              if (speakingChapterId === selectedChapter.id) {
                                speakChapter(selectedChapter, newRate);
                              }
                            }}
                            className="w-16 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-450"
                          />
                        </div>
                        <button
                          onClick={() => speakChapter(selectedChapter)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border shadow-sm transition-all ${
                            speakingChapterId === selectedChapter.id
                              ? 'bg-amber-100 border-amber-200 hover:bg-amber-200 text-amber-700 dark:bg-amber-900/30'
                              : 'bg-indigo-600 border-indigo-600 hover:bg-indigo-700 text-white'
                          }`}
                        >
                          {speakingChapterId === selectedChapter.id ? (
                            <>
                              <Square className="w-3.5 h-3.5 fill-current" />
                              Stop Voice
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3.5 h-3.5" />
                              Read Aloud
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => setIsReadModalOpen(true)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border bg-white border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 shadow-sm"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                          Immersive Reader
                        </button>
                        <button
                          onClick={() => setIsFocusMode(!isFocusMode)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all shadow-sm ${
                            isFocusMode
                              ? 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white'
                              : 'bg-white border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                          title="Toggle Focus Mode"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isFocusMode ? 'Exit Focus' : 'Focus Mode'}</span>
                        </button>
                      </div>
                    </div>

                    {isFocusMode && (
                      <div className="flex items-center justify-between bg-amber-500/10 dark:bg-amber-500/5 px-4 py-3 border border-amber-500/25 rounded-xl mb-6 shadow-sm">
                        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 font-semibold">
                          <Eye className="w-4 h-4 text-amber-500 shrink-0 animate-pulse" />
                          <span>Focus Mode Active — Side panels and headers are hidden.</span>
                        </div>
                        <button
                          onClick={() => setIsFocusMode(false)}
                          className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                        >
                          Exit Focus
                        </button>
                      </div>
                    )}

                    {selectedChapter.content ? (
                      <div className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300 text-sm font-normal">
                        {selectedChapter.content}
                      </div>
                    ) : (
                      <div className="text-center py-20 text-slate-400 dark:text-slate-600">
                        <em className="text-sm">No detailed content matches this Chapter segment.</em>
                        <p className="text-xs mt-1">Try to re-upload the original PDF to parse it correctly.</p>
                      </div>
                    )}
                  </article>
                ) : (
                  /* Course Index Overview */
                  <div className="py-4">
                    <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-250 dark:border-slate-800">
                      <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-200/40">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                          {selectedCourse ? selectedCourse.title : "Course Overview"}
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {selectedCourse ? "Syllabus Index and Table of Contents" : "Upload a PDF to fetch and learn chapters"}
                        </p>
                      </div>
                    </div>

                    {selectedCourse?.chapters && selectedCourse.chapters.length > 0 ? (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Total Course Divisions</span>
                            <span className="text-2xl font-bold font-mono text-slate-800 dark:text-slate-250">{selectedCourse.chapters.length} Chapters</span>
                          </div>
                          <div className="p-4 rounded-xl bg-slate-50/50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60">
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">Estimated Study Hours</span>
                            <span className="text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">{(selectedCourse.chapters.length * 1.5).toFixed(1)} Hours</span>
                          </div>
                        </div>

                        <div>
                          <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Chapter Index Directory</h3>
                          <div className="divide-y divide-slate-100 dark:divide-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900/20">
                            {selectedCourse.chapters.map((chapter, idx) => (
                              <div key={chapter.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-900/40 transition">
                                <div className="flex items-start space-x-3 truncate">
                                  <span className="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-400 font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                                    {String(idx + 1).padStart(2, '0')}
                                  </span>
                                  <div className="truncate">
                                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{chapter.title}</h4>
                                    <p className="text-[11px] text-slate-450 dark:text-slate-500 truncate mt-0.5">
                                      {chapter.content ? `${chapter.content.slice(0, 150)}...` : "Empty chapter content"}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    onClick={() => {
                                      setSelectedChapter(chapter);
                                      setMiddleTab('view');
                                    }}
                                    className="px-2.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/35 dark:hover:bg-indigo-900/55 rounded-lg border border-indigo-100 dark:border-indigo-900/50 transition shadow-sm"
                                  >
                                    View Page
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedChapter(chapter);
                                      setIsReadModalOpen(true);
                                    }}
                                    className="px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700/80 transition shadow-sm"
                                  >
                                    Read/Listen
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-24 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                        <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                        <h4 className="font-bold text-slate-700 dark:text-slate-350">No Chapters Loaded</h4>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Please select or upload a course PDF using the left navigation menu layout.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Right Panel: Context & Insights */}
        {!(isFocusMode && middleTab === 'view') && (
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
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate">
                    {selectedCourse ? `${selectedCourse.title}.pdf` : "Course Syllabus.pdf"}
                  </p>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {selectedCourse ? "Custom uploaded syllabus" : "Official course guidelines"}
                </p>
                {selectedCourse?.metadata && (
                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex flex-col space-y-1 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {selectedCourse.metadata.author && (
                      <div className="truncate">
                        Author: <span className="text-slate-700 dark:text-slate-300 font-bold">{selectedCourse.metadata.author}</span>
                      </div>
                    )}
                    {selectedCourse.metadata.numPages !== undefined && selectedCourse.metadata.numPages > 0 && (
                      <div>
                        Total Pages: <span className="text-slate-700 dark:text-slate-300 font-bold">{selectedCourse.metadata.numPages}</span>
                      </div>
                    )}
                    {selectedCourse.metadata.wordCount !== undefined && selectedCourse.metadata.wordCount > 0 && (
                      <div>
                        Total Words: <span className="text-slate-700 dark:text-slate-300 font-bold">{selectedCourse.metadata.wordCount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
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
        )}
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
              <div className="flex items-center space-x-2 flex-wrap sm:flex-nowrap gap-y-2 justify-end">
                {voices.length > 0 && (
                  <select
                    value={selectedVoiceURI}
                    onChange={(e) => setSelectedVoiceURI(e.target.value)}
                    className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[120px] truncate"
                  >
                    {voices.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name} ({voice.lang})
                      </option>
                    ))}
                  </select>
                )}
                {/* Speaking Rate Slider */}
                <div className="flex items-center space-x-2 bg-slate-100/80 dark:bg-slate-800 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700/60 shadow-sm">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono">
                    Speed: {speakingRate.toFixed(1)}x
                  </span>
                  <input
                    type="range"
                    min="0.5"
                    max="2.5"
                    step="0.1"
                    value={speakingRate}
                    onChange={(e) => {
                      const newRate = parseFloat(e.target.value);
                      setSpeakingRate(newRate);
                      if (speakingChapterId === selectedChapter.id) {
                        speakChapter(selectedChapter, newRate);
                      }
                    }}
                    className="w-16 md:w-24 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-400"
                    title="Control reading speed"
                  />
                </div>
                <button 
                  onClick={() => speakChapter(selectedChapter)} 
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded transition-colors ${speakingChapterId === selectedChapter.id ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400' : 'bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 shadow-sm border border-slate-200 dark:border-slate-700'}`}
                >
                  {speakingChapterId === selectedChapter.id ? <><Square className="w-4 h-4 fill-current" /> Stop</> : <><Volume2 className="w-4 h-4" /> Listen</>}
                </button>
                <button
                  onClick={() => setIsFocusMode(!isFocusMode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                    isFocusMode
                      ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 shadow-sm border border-slate-200 dark:border-slate-700'
                  }`}
                  title="Toggle Focus Mode"
                >
                  <Eye className="w-4 h-4" />
                  <span>{isFocusMode ? 'Exit Focus' : 'Focus Mode'}</span>
                </button>
                <button 
                  onClick={() => setIsReadModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors bg-white dark:bg-slate-800 p-1.5 rounded-full shadow-sm border border-slate-200 dark:border-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {selectedCourse?.chapters && selectedCourse.chapters.length > 0 && !isFocusMode && (
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
            {/* Modal Body: Split into Interactive Reader (Left) and Study Annotations Panel (Right) */}
            <div className="flex-1 flex overflow-hidden relative">
              {/* Left Side: Chapter Reader Content */}
              <div 
                className="flex-1 p-8 bg-white dark:bg-slate-950 overflow-y-auto select-text"
                onMouseUp={handleTextSelection}
              >
                {isFocusMode && (
                  <div className="max-w-3xl mx-auto mb-6 flex items-center justify-between bg-amber-500/10 dark:bg-amber-500/5 px-4 py-3 border border-amber-500/20 rounded-xl shadow-sm">
                    <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-semibold font-sans">
                      <Eye className="w-4 h-4 text-amber-500 shrink-0 animate-pulse" />
                      <span>Focus Mode active — All secondary rails and sidebar features are hidden.</span>
                    </div>
                    <button
                      onClick={() => setIsFocusMode(false)}
                      className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                    >
                      Exit Focus
                    </button>
                  </div>
                )}

                {/* Immersive Reader Search Bar */}
                <div className="max-w-3xl mx-auto mb-6 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 p-2.5 rounded-xl flex flex-col sm:flex-row items-center gap-2.5 shadow-sm select-none">
                  <div className="relative flex-1 w-full flex items-center">
                    <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 select-none pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Find words or phrases in this chapter..."
                      value={immersiveSearchQuery}
                      onChange={(e) => {
                        const val = e.target.value;
                        setImmersiveSearchQuery(val);
                        setImmersiveSearchIndex(val.trim() ? 0 : -1);
                      }}
                      className="w-full pl-10 pr-9 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-800 dark:text-slate-200 transition-colors"
                    />
                    {immersiveSearchQuery && (
                      <button
                        onClick={() => {
                          setImmersiveSearchQuery('');
                          setImmersiveSearchIndex(-1);
                        }}
                        className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                        title="Clear search"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  
                  {/* Search navigation */}
                  {immersiveSearchQuery.trim() && (
                    <div className="flex items-center gap-2.5 justify-between w-full sm:w-auto shrink-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-800 pt-2.5 sm:pt-0">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-sans whitespace-nowrap">
                        {getSearchMatches(selectedChapter.content || '', immersiveSearchQuery).length > 0
                          ? `Match ${immersiveSearchIndex + 1} of ${getSearchMatches(selectedChapter.content || '', immersiveSearchQuery).length}`
                          : 'No matches'}
                      </span>
                      
                      {getSearchMatches(selectedChapter.content || '', immersiveSearchQuery).length > 0 && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              const total = getSearchMatches(selectedChapter.content || '', immersiveSearchQuery).length;
                              if (total > 0) {
                                setImmersiveSearchIndex((prev) => (prev - 1 + total) % total);
                              }
                            }}
                            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 shadow-sm cursor-pointer transition-colors"
                            title="Previous match"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              const total = getSearchMatches(selectedChapter.content || '', immersiveSearchQuery).length;
                              if (total > 0) {
                                setImmersiveSearchIndex((prev) => (prev + 1) % total);
                              }
                            }}
                            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 shadow-sm cursor-pointer transition-colors"
                            title="Next match"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div 
                  ref={readerContainerRef}
                  className="prose prose-slate dark:prose-invert max-w-3xl mx-auto prose-p:leading-loose text-slate-700 dark:text-slate-300 select-text"
                >
                  {selectedChapter.content ? (
                    renderChapterWithAnnotations(selectedChapter.content, selectedChapter.id)
                  ) : (
                    <div className="text-center py-20 text-slate-500">
                      <p className="italic">No detailed content available for this chapter.</p>
                      <p className="text-sm mt-2">Upload a course PDF to extract detailed chapter contents.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: Study Sidebar for chapter's annotations or glossary terms */}
              {!isFocusMode && (
              <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-col shrink-0 overflow-y-auto">
                {/* Visual Tab Switcher */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-150/40 dark:bg-slate-900/30 shrink-0 select-none">
                  <button
                    onClick={() => setActiveStudySidebarTab('annotations')}
                    className={`flex-1 py-3 px-1 text-center text-[10px] font-bold uppercase tracking-wider transition border-b-2 flex items-center justify-center gap-1.5 ${
                      activeStudySidebarTab === 'annotations'
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white/40 dark:bg-slate-900/20'
                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-205/50 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Notes</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono font-bold">
                      {(annotations[selectedChapter.id] || []).length}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveStudySidebarTab('terms')}
                    className={`flex-1 py-3 px-1 text-center text-[10px] font-bold uppercase tracking-wider transition border-b-2 flex items-center justify-center gap-1.5 ${
                      activeStudySidebarTab === 'terms'
                        ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white/40 dark:bg-slate-900/20'
                        : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-205/50 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>PDF Words</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono font-bold">
                      {(selectedCourse?.metadata?.keyTerms || []).length}
                    </span>
                  </button>
                </div>

                {activeStudySidebarTab === 'annotations' ? (
                  <div className="flex-1 p-4 space-y-4">
                    {/* Informative notice */}
                    <div className="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 text-[11px] text-slate-500 dark:text-slate-400">
                      <p className="font-semibold text-slate-700 dark:text-slate-350 mb-0.5">How to Annotate:</p>
                      Highlight any text snippet in the reader to spawn highlighters and create study notes.
                    </div>

                    {/* Annotations List */}
                    {(!annotations[selectedChapter.id] || annotations[selectedChapter.id].length === 0) ? (
                      <div className="py-12 text-center text-slate-400 dark:text-slate-500/60">
                        <BookOpen className="w-8 h-8 mx-auto stroke-1 mb-2 opacity-60" />
                        <p className="text-[11px] italic font-medium">No highlights or notes yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {annotations[selectedChapter.id].map((ann) => (
                          <div 
                            key={ann.id} 
                            className={`p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 ${colorBgMap[ann.color]} text-xs shadow-sm hover:shadow transition relative group/card`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-mono">
                                Highlight
                              </span>
                              <div className="flex items-center space-x-1 opacity-80 group-hover/card:opacity-100 transition">
                                <button
                                  onClick={() => {
                                    setSelectedAnnotationForEdit(ann);
                                    setEditingNoteText(ann.note || '');
                                  }}
                                  className="p-1 rounded hover:bg-white dark:hover:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                                  title="Edit note"
                                >
                                  <Edit className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteAnnotation(ann.id)}
                                  className="p-1 rounded hover:bg-white dark:hover:bg-slate-800 text-slate-500 hover:text-red-500"
                                  title="Delete highlight"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                            
                            <blockquote className="italic text-slate-700 dark:text-slate-300 pl-2 border-l-2 border-slate-300 dark:border-slate-600 mb-2 py-0.5 max-h-16 overflow-y-auto line-clamp-2">
                              "{ann.text}"
                            </blockquote>

                            {ann.note ? (
                              <div className="bg-white/80 dark:bg-slate-950/80 p-2 rounded-lg border border-slate-100 dark:border-slate-800/80 mt-1">
                                <span className="text-[9px] font-bold text-indigo-500 block mb-0.5">MY STUDY NOTE:</span>
                                <p className="text-slate-650 dark:text-slate-400 text-xs font-medium whitespace-pre-wrap">{ann.note}</p>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setSelectedAnnotationForEdit(ann);
                                  setEditingNoteText('');
                                }}
                                className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold flex items-center gap-1 mt-1 font-mono"
                              >
                                + Add note
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 p-4 space-y-4">
                    <div className="p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 text-[11px] text-slate-500 dark:text-slate-400">
                      <p className="font-semibold text-slate-700 dark:text-slate-350 mb-0.5">Syllabus Vocabulary:</p>
                      Dynamic keywords, key terms, and glossary formulations extracted directly from your PDF raw text.
                    </div>

                    {(!selectedCourse?.metadata?.keyTerms || selectedCourse.metadata.keyTerms.length === 0) ? (
                      <div className="py-12 text-center text-slate-400 dark:text-slate-500/60">
                        <BookOpen className="w-8 h-8 mx-auto stroke-1 mb-2 opacity-60 animate-pulse" />
                        <p className="text-[11px] italic font-medium">No extracted key words found in this document yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedCourse.metadata.keyTerms.map((term, index) => (
                          <div 
                            key={index} 
                            className="p-3 rounded-xl border border-slate-250/20 dark:border-slate-800 bg-white dark:bg-slate-900/80 text-xs shadow-xs hover:shadow-xs transition"
                          >
                            <div className="flex items-center justify-between mb-1.5 border-b border-slate-100 dark:border-slate-800/50 pb-1">
                              <span className="font-bold text-indigo-600 dark:text-indigo-400 font-sans">
                                {term.word}
                              </span>
                              <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">
                                Term {index + 1}
                              </span>
                            </div>
                            <p className="text-slate-650 dark:text-slate-400 leading-relaxed font-medium">
                              {term.definition}
                            </p>
                            <button 
                              onClick={() => {
                                setImmersiveSearchQuery(term.word);
                                setImmersiveSearchIndex(0);
                              }}
                              className="mt-2 text-[10px] text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1"
                              title="Locate in text"
                            >
                              <Search className="w-3 h-3" />
                              <span>Locate in text</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}
            </div>

            {/* Hover Selection Popover Toolbar */}
            {toolbarPosition && selectionRange && (
              <div 
                className="fixed z-50 transform -translate-x-1/2 -translate-y-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 flex flex-col gap-3 min-w-[280px] animate-in fade-in slide-in-from-bottom-2 duration-120"
                style={{ 
                  top: `${toolbarPosition.y - 12}px`, 
                  left: `${toolbarPosition.x}px` 
                }}
                onMouseUp={(e) => e.stopPropagation()} // Keep selection active
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                    Create Study Annotation
                  </span>
                  <button 
                    onClick={() => {
                      setSelectionRange(null);
                      setToolbarPosition(null);
                      window.getSelection()?.removeAllRanges();
                    }}
                    className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                
                {/* Highlight colors picker */}
                <div>
                  <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Pick Color:</span>
                  <div className="flex gap-3 justify-center py-2 px-3 bg-slate-50 dark:bg-slate-950/80 border border-slate-100 dark:border-slate-800/80 rounded-xl">
                    {(['yellow', 'green', 'pink', 'blue'] as const).map((color) => {
                      const ringColors = {
                        yellow: 'bg-yellow-400 ring-yellow-400 hover:bg-yellow-500',
                        green: 'bg-green-400 ring-green-400 hover:bg-green-500',
                        pink: 'bg-pink-400 ring-pink-400 hover:bg-pink-500',
                        blue: 'bg-blue-400 ring-blue-400 hover:bg-blue-500'
                      };
                      return (
                        <button
                          key={color}
                          onClick={() => handleAddAnnotation(color)}
                          className={`w-6 h-6 rounded-full ${ringColors[color]} hover:scale-110 active:scale-95 transition-all shadow-sm ring-offset-2 hover:ring-2`}
                          title={`Highlight ${color}`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Optional note input */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Attach Note (Optional)</span>
                  </div>
                  <textarea
                    placeholder="Type an important concept or study recap..."
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    className="w-full text-xs p-2 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/25 text-slate-700 dark:text-slate-300 resize-none h-16 transition-all font-medium"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => {
                        setSelectionRange(null);
                        setToolbarPosition(null);
                        setNoteInput('');
                        window.getSelection()?.removeAllRanges();
                      }}
                      className="px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleAddAnnotation('yellow')}
                      className="px-3.5 py-1 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm active:scale-95 transition"
                    >
                      Highlight Text
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Edit Annotation Overlay Dialog */}
            {selectedAnnotationForEdit && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 backdrop-blur-xs p-4">
                <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col p-5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-3 shrink-0">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-1.5">
                      <MessageSquare className="w-4 h-4 text-indigo-500" />
                      Study Annotation Note
                    </h4>
                    <button 
                      onClick={() => setSelectedAnnotationForEdit(null)}
                      className="p-1 rounded-full hover:bg-slate-150 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className={`p-3 rounded-xl ${colorBgMap[selectedAnnotationForEdit.color]} border border-slate-100 dark:border-slate-800/50`}>
                      <span className="text-[9px] font-bold text-slate-405 dark:text-slate-500 uppercase tracking-wider block mb-1">Highlighted Reference Text:</span>
                      <p className="text-xs italic text-slate-700 dark:text-slate-350 leading-relaxed font-medium">
                        "{selectedAnnotationForEdit.text}"
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                        My Study Notes:
                      </label>
                      <textarea
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        placeholder="Write note annotations, definitions, context, standard reviews, etc..."
                        className="w-full text-xs p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/25 text-slate-700 dark:text-slate-300 resize-none h-28 leading-relaxed font-medium"
                      />
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <button
                        onClick={() => handleDeleteAnnotation(selectedAnnotationForEdit.id)}
                        className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete Highlight
                      </button>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedAnnotationForEdit(null)}
                          className="px-3.5 py-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleUpdateAnnotationNote(selectedAnnotationForEdit.id, editingNoteText)}
                          className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
