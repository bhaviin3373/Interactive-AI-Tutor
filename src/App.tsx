/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { Image as ImageIcon, X, Paperclip, Mic, MicOff, Moon, Sun, Bell, Volume2, Square, BookOpen, Search, ChevronRight, ChevronLeft, Eye, MessageSquare, Check, Trash2, Edit, Play, Pause, RotateCcw, Timer, Copy, Settings, Columns, LayoutDashboard } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Course, Chapter, Message, UserProfile, Annotation } from './types';
import { COURSES, STUDENT_PROGRESS } from './data';
import { Auth } from './components/Auth';
import { Profile } from './components/Profile';
import { FlashcardsView } from './components/FlashcardsView';
import { syncManager } from './syncManager';
import { SyncMetric } from './types';

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

export interface GlobalSearchResult {
  courseId: string;
  courseTitle: string;
  chapterId?: string;
  chapterTitle?: string;
  type: 'chapter_content' | 'chapter_title' | 'key_term' | 'course_meta';
  matchedField: string;
  snippet: string;
  matchIndexStart: number;
  matchIndexEnd: number;
  score: number;
  uploadedAt?: number;
  term?: { word: string; definition: string };
}

export const HighlightText = ({ text, highlight }: { text: string; highlight: string }) => {
  if (!highlight.trim()) {
    return <span>{text}</span>;
  }
  const regex = new RegExp(`(${highlight.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) => 
        regex.test(part) ? (
          <mark key={i} className="bg-amber-100 dark:bg-indigo-950 text-amber-800 dark:text-indigo-300 font-bold px-0.5 rounded shadow-3xs">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
};

export default function App() {
  const [courses, setCourses] = useState<Course[]>(COURSES);
  const [syncQueue, setSyncQueue] = useState<SyncMetric[]>([]);
  const [isOnlineState, setIsOnlineState] = useState<boolean>(true);
  const [showSyncLogPanel, setShowSyncLogPanel] = useState<boolean>(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState<boolean>(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');
  const [globalSearchSortBy, setGlobalSearchSortBy] = useState<'relevance' | 'newest'>('relevance');
  const [selectedSearchResultIndex, setSelectedSearchResultIndex] = useState<number>(0);

  // Sync selectedSearchResultIndex resets
  useEffect(() => {
    setSelectedSearchResultIndex(0);
  }, [globalSearchQuery, globalSearchSortBy, isGlobalSearchOpen]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(COURSES.length > 0 ? COURSES[0] : null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      text: "Hello! I'm EduAI, your personal AI study companion. How can I help you with your studies today?",
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

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Subscribe to study metrics offline synchronization queue
  useEffect(() => {
    const unsubscribe = syncManager.subscribe((queue, isOnline) => {
      setSyncQueue(queue);
      setIsOnlineState(isOnline);
    });
    return unsubscribe;
  }, []);

  // Listen for global CMD+K or Ctrl+K to toggle global search, and Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsGlobalSearchOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsGlobalSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<'catherine' | 'marcus' | 'elena'>('catherine');
  const [isPlayingLecture, setIsPlayingLecture] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isGeneratingLecture, setIsGeneratingLecture] = useState(false);
  const [lectureSlides, setLectureSlides] = useState<{ title: string; bulletPoints: string[]; speakerText: string }[]>([]);
  const [subtitleText, setSubtitleText] = useState('');
  const [isAvatarSpeaking, setIsAvatarSpeaking] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
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

  const goalFirstIgnoredRef = useRef(false);
  useEffect(() => {
    localStorage.setItem('daily_reading_goal', dailyReadingGoal.toString());
    if (goalFirstIgnoredRef.current) {
      syncManager.queueMetric({
        userId: user?.id || 'guest',
        email: user?.email || 'guest@eduai_learner.org',
        courseId: selectedCourse?.id || 'general',
        courseTitle: selectedCourse?.title || 'General Overview',
        metricType: 'reading_goal',
        value: { minutes: dailyReadingGoal }
      });
    } else {
      goalFirstIgnoredRef.current = true;
    }
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

  // Focus sounds state
  const [isPlayingFocusSound, setIsPlayingFocusSound] = useState(false);
  const [activeFocusSoundType, setActiveFocusSoundType] = useState<'binaural' | 'rain' | 'brownian'>('binaural');
  const [focusSoundVolume, setFocusSoundVolume] = useState(0.2);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceNodeRef = useRef<AudioNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const startFocusSound = (type: 'binaural' | 'rain' | 'brownian', volumeVal: number) => {
    stopFocusSound();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(volumeVal, ctx.currentTime);
      gainNode.connect(ctx.destination);
      gainNodeRef.current = gainNode;

      if (type === 'binaural') {
        const oscLeft = ctx.createOscillator();
        const oscRight = ctx.createOscillator();
        const pannerLeft = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        const pannerRight = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

        oscLeft.type = 'sine';
        oscLeft.frequency.setValueAtTime(120, ctx.currentTime);
        oscRight.type = 'sine';
        oscRight.frequency.setValueAtTime(130, ctx.currentTime); // 10Hz alpha beat difference

        if (pannerLeft && pannerRight) {
          pannerLeft.pan.setValueAtTime(-1, ctx.currentTime);
          pannerRight.pan.setValueAtTime(1, ctx.currentTime);
          oscLeft.connect(pannerLeft).connect(gainNode);
          oscRight.connect(pannerRight).connect(gainNode);
        } else {
          oscLeft.connect(gainNode);
          oscRight.connect(gainNode);
        }

        oscLeft.start();
        oscRight.start();
        audioSourceNodeRef.current = gainNode;
      } else if (type === 'brownian') {
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          output[i] = (lastOut + (0.02 * white)) / 1.02;
          lastOut = output[i];
          output[i] *= 3.5;
        }

        const noiseNode = ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;
        noiseNode.loop = true;
        noiseNode.connect(gainNode);
        noiseNode.start();
        audioSourceNodeRef.current = noiseNode;
      } else if (type === 'rain') {
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          output[i] = (lastOut + (0.02 * white)) / 1.02;
          lastOut = output[i];
          output[i] *= 3.5;
          if (Math.random() > 0.9992) {
            output[i] += (Math.random() * 0.4 - 0.2);
          }
        }

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(550, ctx.currentTime);
        filter.Q.setValueAtTime(0.7, ctx.currentTime);

        const noiseNode = ctx.createBufferSource();
        noiseNode.buffer = noiseBuffer;
        noiseNode.loop = true;
        noiseNode.connect(filter).connect(gainNode);
        noiseNode.start();
        audioSourceNodeRef.current = noiseNode;
      }
    } catch (e) {
      console.error("Audio Synthesis Error: ", e);
    }
  };

  const stopFocusSound = () => {
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch (err) {}
      audioContextRef.current = null;
    }
    audioSourceNodeRef.current = null;
    gainNodeRef.current = null;
  };

  useEffect(() => {
    if (isPlayingFocusSound) {
      startFocusSound(activeFocusSoundType, focusSoundVolume);
    } else {
      stopFocusSound();
    }
    return () => {
      stopFocusSound();
    };
  }, [isPlayingFocusSound, activeFocusSoundType]);

  useEffect(() => {
    if (gainNodeRef.current && audioContextRef.current) {
      try {
        gainNodeRef.current.gain.setValueAtTime(focusSoundVolume, audioContextRef.current.currentTime);
      } catch (e) {}
    }
  }, [focusSoundVolume]);

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
  const [copiedState, setCopiedState] = useState(false);
  const [showCourseSettings, setShowCourseSettings] = useState(false);
  const [isResetConfirming, setIsResetConfirming] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const readerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsLeftSidebarOpen(false);
        setIsRightSidebarOpen(false);
      } else {
        setIsLeftSidebarOpen(true);
        setIsRightSidebarOpen(true);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const globalSearchResults = (() => {
    const query = globalSearchQuery.trim();
    if (!query || query.length < 2) return [];
    
    const lowercaseQuery = query.toLowerCase();
    const results: GlobalSearchResult[] = [];

    courses.forEach(course => {
      const uploadTime = course.uploadedAt || (() => {
        if (course.id && course.id.startsWith('course_')) {
          const num = parseInt(course.id.replace('course_', ''), 10);
          return isNaN(num) ? 0 : num;
        }
        return 0; // fallback for pre-loaded base courses
      })();

      // 1. Search course title/description
      if (course.title.toLowerCase().includes(lowercaseQuery)) {
        results.push({
          courseId: course.id,
          courseTitle: course.title,
          type: 'course_meta',
          matchedField: 'Course Title',
          snippet: course.description || 'Entire Course Overview',
          score: 100,
          uploadedAt: uploadTime,
          matchIndexStart: course.title.toLowerCase().indexOf(lowercaseQuery),
          matchIndexEnd: course.title.toLowerCase().indexOf(lowercaseQuery) + lowercaseQuery.length
        });
      }

      // 2. Search chapters (titles and contents)
      course.chapters.forEach(chapter => {
        // Search chapter title
        if (chapter.title.toLowerCase().includes(lowercaseQuery)) {
          results.push({
            courseId: course.id,
            courseTitle: course.title,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            type: 'chapter_title',
            matchedField: 'Chapter Title',
            snippet: chapter.content ? (chapter.content.length > 120 ? chapter.content.slice(0, 120) + '...' : chapter.content) : 'Empty chapter content',
            score: 80,
            uploadedAt: uploadTime,
            matchIndexStart: chapter.title.toLowerCase().indexOf(lowercaseQuery),
            matchIndexEnd: chapter.title.toLowerCase().indexOf(lowercaseQuery) + lowercaseQuery.length
          });
        }

        // Search full chapter content
        if (chapter.content) {
          const text = chapter.content;
          const lowerText = text.toLowerCase();
          let index = lowerText.indexOf(lowercaseQuery);
          
          let count = 0;
          while (index !== -1 && count < 5) {
            const start = Math.max(0, index - 60);
            const end = Math.min(text.length, index + lowercaseQuery.length + 60);
            let snippetText = text.slice(start, end);
            if (start > 0) snippetText = '...' + snippetText;
            if (end < text.length) snippetText = snippetText + '...';

            results.push({
              courseId: course.id,
              courseTitle: course.title,
              chapterId: chapter.id,
              chapterTitle: chapter.title,
              type: 'chapter_content',
              matchedField: 'Chapter Content',
              snippet: snippetText,
              score: 50,
              uploadedAt: uploadTime,
              matchIndexStart: index,
              matchIndexEnd: index + lowercaseQuery.length
            });

            count++;
            index = lowerText.indexOf(lowercaseQuery, index + 1);
          }
        }
      });

      // 3. Search key terms
      if (course.metadata?.keyTerms) {
        course.metadata.keyTerms.forEach(term => {
          const matchesWord = term.word.toLowerCase().includes(lowercaseQuery);
          const matchesDef = term.definition.toLowerCase().includes(lowercaseQuery);

          if (matchesWord || matchesDef) {
            results.push({
              courseId: course.id,
              courseTitle: course.title,
              type: 'key_term',
              matchedField: matchesWord ? 'Key Term Word' : 'Key Term Definition',
              snippet: `${term.word}: ${term.definition}`,
              score: matchesWord ? 90 : 70,
              uploadedAt: uploadTime,
              matchIndexStart: matchesWord 
                ? term.word.toLowerCase().indexOf(lowercaseQuery) 
                : term.definition.toLowerCase().indexOf(lowercaseQuery),
              matchIndexEnd: (matchesWord 
                ? term.word.toLowerCase().indexOf(lowercaseQuery) 
                : term.definition.toLowerCase().indexOf(lowercaseQuery)) + lowercaseQuery.length,
              term: term
            });
          }
        });
      }
    });

    if (globalSearchSortBy === 'newest') {
      return results.sort((a, b) => {
        const timeA = a.uploadedAt || 0;
        const timeB = b.uploadedAt || 0;
        if (timeA !== timeB) return timeB - timeA;
        return b.score - a.score;
      });
    }

    return results.sort((a, b) => b.score - a.score);
  })();

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
  const userRef = useRef(user);
  const activeStudyTimerAccumulatorRef = useRef(0);

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
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;

      const sC = selectedCourseRef.current;
      if (!sC) return;

      // Accumulate 30 seconds of active study before queuing a metric to avoid over-syncing
      activeStudyTimerAccumulatorRef.current += 1;
      if (activeStudyTimerAccumulatorRef.current >= 30) {
        activeStudyTimerAccumulatorRef.current = 0;
        syncManager.queueMetric({
          userId: userRef.current?.id || 'guest',
          email: userRef.current?.email || 'guest@eduai_learner.org',
          courseId: sC.id,
          courseTitle: sC.title,
          metricType: 'study_time',
          value: { seconds: 30 }
        });
      }

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
            title: data.title || file.name.replace('.pdf', ''),
            description: 'Custom uploaded course',
            chapters: data.chapters || [],
            pdfData: base64String,
            progress: data.progress,
            uploadedAt: Date.now(),
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

  const handleResetCourseProgress = () => {
    if (!selectedCourse) return;
    
    const resetProgress = {
      overallScore: 0,
      weakAreas: [],
      strongAreas: [],
      recentQuizScores: {},
      performanceHistory: [],
      totalActiveTime: 0,
      readingTime: 0,
      chattingTime: 0
    };

    const updatedCourse = {
      ...selectedCourse,
      progress: resetProgress
    };

    // Queue synchronization metric
    syncManager.queueMetric({
      userId: user?.id || 'guest',
      email: user?.email || 'guest@eduai_learner.org',
      courseId: selectedCourse.id,
      courseTitle: selectedCourse.title,
      metricType: 'progress_update',
      value: resetProgress
    });

    setCourses(prev => prev.map(c => c.id === selectedCourse.id ? updatedCourse : c));
    setSelectedCourse(updatedCourse);
    setSessionSeconds(0);
    setIsResetConfirming(false);
    setResetSuccess(true);
    setTimeout(() => {
      setResetSuccess(false);
    }, 3000);
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

  const generateLectureSlidesForActiveChapter = async () => {
    setIsGeneratingLecture(true);
    setCurrentSlideIndex(0);
    setIsPlayingLecture(false);
    setIsAvatarSpeaking(false);
    setSubtitleText('');
    window.speechSynthesis.cancel();

    const title = selectedChapter ? selectedChapter.title : (selectedCourse?.title || "Course Overview");
    const textContent = selectedChapter ? selectedChapter.content : "Welcome to this interactive learning material guide.";

    // Local heuristic parser
    const slides = [];
    const cleanParagraphs = textContent
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 20);

    // Slide 1: Welcome Intro
    slides.push({
      title: `Welcome & Lesson Objectives`,
      bulletPoints: [
        `Main Topic: ${title}`,
        `Goal: Simplify complex subject matter`,
        `Method: Interactive voice & slide alignment`
      ],
      speakerText: `Hi! I am your AI video avatar guide. Welcome to today's lesson on ${title}. In this video tutorial, we will break down the key concepts step-by-step so you can easily understand and apply them. Pay close attention to the visual guides on the right as we go. Let us get started!`
    });

    // Slide 2: Core Concept discussion
    if (cleanParagraphs.length >= 1) {
      const p1 = cleanParagraphs[0];
      const summaryBullet1 = p1.length > 90 ? p1.substring(0, 90) + "..." : p1;
      const summaryBullet2 = cleanParagraphs[1] && cleanParagraphs[1].length > 90 
        ? cleanParagraphs[1].substring(0, 90) + "..." 
        : "Analyze structural attributes and core frameworks.";
      
      slides.push({
        title: `Core Conceptual Framework`,
        bulletPoints: [
          summaryBullet1,
          summaryBullet2,
          `Essential context for mock assessments`
        ],
        speakerText: `Let us examine the core ideas of this section. As explained: ${p1.substring(0, Math.min(220, p1.length))}. This forms our conceptual boundary. Additionally, observe how these elements interact to govern the active syllabus modules.`
      });
    } else {
      slides.push({
        title: `Core Conceptual Framework`,
        bulletPoints: [
          `Establishes strong vocabulary definitions`,
          `Saves progress as you read & test`,
          `Connects key themes across chapter modules`
        ],
        speakerText: `Let us examine the core system. Having a robust conceptual foundation establishes critical vocabulary boundaries and helps you save active learning progress as you study and take diagnostic reviews. It links your key course modules together into one fluent master plan.`
      });
    }

    // Slide 3: Practical applications
    const diagnosticPt = "Track retention rates on weak topics";
    slides.push({
      title: `Real-World Application & Skills`,
      bulletPoints: [
        `Translate theoretical formula into practice`,
        diagnosticPt,
        `Build key connections for memory retrieval`
      ],
      speakerText: `Moving onto practical application. Learning is far more powerful when we translate abstract formula into real-world setups. I recommend running focus flashcards and tracking your retention rates to continuously monitor your understanding of these specific details.`
    });

    // Slide 4: Summary Quiz / Wrap-up
    slides.push({
      title: `Recap & Practice Strategy`,
      bulletPoints: [
        `Completed curriculum slide overview`,
        `Ready for active recall vocabulary reviews`,
        `Next: Launch the practice quiz dashboard`
      ],
      speakerText: `Excellent work! We have finished this video chapter lecture. You are now fully prepared to review vocabulary terms on the right or starting your automated quiz challenges. Keep learning, and I will see you in the next module!`
    });

    setLectureSlides(slides);
    setIsGeneratingLecture(false);
  };

  const playSlideVoice = (index: number) => {
    window.speechSynthesis.cancel();
    if (!lectureSlides[index]) return;

    const slideObj = lectureSlides[index];
    const utterance = new SpeechSynthesisUtterance(slideObj.speakerText);
    
    let matchedVoice: SpeechSynthesisVoice | null = null;
    if (selectedAvatar === 'marcus') {
      matchedVoice = voices.find(v => v.name.toLowerCase().includes('google us english') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('microsoft david') || v.lang.startsWith('en-US')) || null;
    } else if (selectedAvatar === 'elena') {
      matchedVoice = voices.find(v => v.name.toLowerCase().includes('zira') || v.name.toLowerCase().includes('google uk english female') || v.name.toLowerCase().includes('hazel')) || null;
    } else {
      matchedVoice = voices.find(v => v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('microsoft zira') || v.lang.startsWith('en-GB')) || null;
    }

    if (matchedVoice) {
      utterance.voice = matchedVoice;
    } else if (voices.length > 0) {
      utterance.voice = voices[0];
    }

    utterance.rate = speakingRate;

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        const charIndex = event.charIndex;
        const sub = slideObj.speakerText.substring(charIndex, charIndex + 50);
        setSubtitleText(sub.split('.')[0] + (sub.includes('.') ? '.' : '...'));
      }
    };

    utterance.onstart = () => {
      setIsAvatarSpeaking(true);
      if (!subtitleText) {
        setSubtitleText(slideObj.speakerText.substring(0, 55) + "...");
      }
    };

    utterance.onend = () => {
      setIsAvatarSpeaking(false);
      setSubtitleText('');
      if (isPlayingLecture && index < lectureSlides.length - 1) {
        setCurrentSlideIndex(prev => prev + 1);
      } else if (index === lectureSlides.length - 1) {
        setIsPlayingLecture(false);
      }
    };

    utterance.onerror = () => {
      setIsAvatarSpeaking(false);
      setSubtitleText('');
    };

    window.speechSynthesis.speak(utterance);
  };

  // Synchronize playing states with synthesized voice
  useEffect(() => {
    if (isPlayingLecture && lectureSlides.length > 0) {
      playSlideVoice(currentSlideIndex);
    } else {
      window.speechSynthesis.cancel();
      setIsAvatarSpeaking(false);
    }
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [isPlayingLecture, currentSlideIndex, selectedAvatar, lectureSlides]);

  // Handle auto slide generation on modal launch
  useEffect(() => {
    if (isVideoModalOpen) {
      generateLectureSlidesForActiveChapter();
    } else {
      setIsPlayingLecture(false);
      setIsAvatarSpeaking(false);
      setSubtitleText('');
      window.speechSynthesis.cancel();
    }
  }, [isVideoModalOpen, selectedChapter]);

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

  const handleAddNewFlashcard = (front: string, back: string) => {
    if (!selectedCourse) return;
    const newCard = {
      id: `custom_${Date.now()}`,
      front,
      back
    };
    const updatedFlashcards = [...(selectedCourse.flashcards || []), newCard];
    const updatedCourse = { ...selectedCourse, flashcards: updatedFlashcards };
    setCourses(courses.map(c => c.id === updatedCourse.id ? updatedCourse : c));
    setSelectedCourse(updatedCourse);
  };

  const handleDeleteFlashcard = (id: string) => {
    if (!selectedCourse) return;
    const updatedFlashcards = (selectedCourse.flashcards || []).filter(fc => fc.id !== id);
    const updatedCourse = { ...selectedCourse, flashcards: updatedFlashcards };
    setCourses(courses.map(c => c.id === updatedCourse.id ? updatedCourse : c));
    setSelectedCourse(updatedCourse);
  };

  const handleExportStudyGuide = () => {
    if (!selectedCourse) return;
    
    let md = `# Study Compendium Guide: ${selectedCourse.title}\n`;
    md += `**Study Guide generated dynamically on ${new Date().toLocaleDateString()}**\n\n`;
    md += `## Course Metrics\n`;
    if (selectedCourse.metadata) {
      if (selectedCourse.metadata.numPages) md += `- **Raw Document Page Count:** ${selectedCourse.metadata.numPages}\n`;
      if (selectedCourse.metadata.wordCount) md += `- **Word Count:** ${selectedCourse.metadata.wordCount.toLocaleString()}\n`;
    }
    md += `\n---\n\n`;

    md += `## 📚 Extracted Syllabus & Chapter Progress\n`;
    selectedCourse.chapters.forEach((ch, idx) => {
      md += `### Chapter ${idx + 1}: ${ch.title}\n`;
      md += `${ch.content ? ch.content.substring(0, 300) + '...' : 'No content summary provided.'}\n\n`;
      
      const chAnns = annotations[ch.id] || [];
      if (chAnns.length > 0) {
        md += `#### Highlighted Passages & Notes:\n`;
        chAnns.forEach((ann, aIdx) => {
          md += `* ${aIdx + 1}. **"${ann.text}"**\n`;
          if (ann.note) md += `  - *My Custom Study Note:* ${ann.note}\n`;
        });
        md += `\n`;
      }
    });

    md += `\n---\n\n`;

    md += `## 💡 Active Vocabulary Glossary\n`;
    const terms = selectedCourse.metadata?.keyTerms || [];
    if (terms.length > 0) {
      terms.forEach((t, i) => {
        md += `${i + 1}. **${t.word}**: ${t.definition}\n`;
      });
      md += `\n`;
    } else {
      md += `No glossary words extracted yet.\n\n`;
    }

    md += `\n---\n\n`;

    md += `## 🧠 Generated Flashcard Decks\n`;
    const fcards = selectedCourse.flashcards || [];
    if (fcards.length > 0) {
      fcards.forEach((fc, i) => {
        md += `### Card ${i + 1}\n`;
        md += `**Question:** ${fc.front}\n`;
        md += `**Answer:** ${fc.back}\n\n`;
      });
    } else {
      md += `Generate your revision decks to export custom card logs!\n\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${selectedCourse.title.replace(/\s+/g, "_")}_StudyGuide.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (view === 'flashcards' && selectedCourse) {
    return (
      <FlashcardsView 
        course={selectedCourse} 
        onBack={() => setView('main')} 
        isDarkMode={isDarkMode} 
        onAddFlashcard={handleAddNewFlashcard}
        onDeleteFlashcard={handleDeleteFlashcard}
      />
    );
  }

  return (
    <div className={`h-screen w-full flex flex-col font-sans transition-colors overflow-hidden ${isDarkMode ? 'dark bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Header */}
      {!(isFocusMode && middleTab === 'view') && (
        <header className="min-h-16 py-3 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex flex-row flex-wrap items-center justify-between px-4 sm:px-6 shrink-0 transition-colors gap-3 z-40">
        <div className="flex items-center justify-between w-full lg:w-auto min-w-0 gap-2">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <div className="w-8 h-8 bg-indigo-600 rounded flex items-center justify-center shrink-0">
              <div className="w-4 h-4 border-2 border-white rounded-sm"></div>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xs sm:text-sm md:text-base font-bold text-slate-800 dark:text-white leading-tight tracking-tight truncate" title="EduAI Study Companion">EduAI Study Companion</h1>
              <p className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold mt-0.5 leading-none truncate" title="Elevate your study experience.">Elevate your study experience.</p>
            </div>
          </div>
          
          {/* Mobile & Desk sidebar togglers directly in header */}
          <div className="flex items-center gap-1.5 ml-2 border-l border-slate-200 dark:border-slate-800 pl-3 shrink-0">
            <button
              onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
              className={`p-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                isLeftSidebarOpen 
                  ? 'bg-indigo-50 border-indigo-205 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-400' 
                  : 'bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-755'
              }`}
              title={isLeftSidebarOpen ? "Hide Syllabus Sidebar" : "Show Syllabus Sidebar"}
            >
              <Columns className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
              className={`p-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                isRightSidebarOpen 
                  ? 'bg-indigo-50 border-indigo-205 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-400' 
                  : 'bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-755'
              }`}
              title={isRightSidebarOpen ? "Hide Insights Panel" : "Show Insights Panel"}
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-center lg:justify-end gap-3 lg:gap-6 flex-wrap w-full lg:w-auto">
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
                    className="p-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-755 text-slate-500 hover:text-red-755 dark:text-slate-400 dark:hover:text-red-400 transition-all duration-150 cursor-pointer"
                    title="Reset Session"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sound Therapy (Active Focus Sound Player) */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-800/85 select-none shadow-3xs">
            <button
              onClick={() => setIsPlayingFocusSound(!isPlayingFocusSound)}
              className={`p-1.5 rounded-lg transition duration-150 cursor-pointer ${isPlayingFocusSound ? 'bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 animate-pulse' : 'bg-slate-100 hover:bg-slate-200 text-slate-500 dark:bg-slate-800 dark:hover:bg-slate-750'}`}
              title={isPlayingFocusSound ? 'Mute Focus Sound' : 'Play Focus Sound Therapy (Increases concentration)'}
            >
              {isPlayingFocusSound ? (
                <span className="flex items-end gap-0.5 h-3.5 w-3.5">
                  <span className="w-0.5 bg-red-500 animate-[bounce_0.6s_infinite] rounded-xs h-2.5"></span>
                  <span className="w-0.5 bg-indigo-500 animate-[bounce_0.8s_infinite] rounded-xs h-3.5"></span>
                  <span className="w-0.5 bg-purple-500 animate-[bounce_0.5s_infinite] rounded-xs h-1.5"></span>
                </span>
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            <div className="flex flex-col text-left">
              <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 leading-none">Focus Audio</span>
              <select
                value={activeFocusSoundType}
                onChange={(e) => {
                  setActiveFocusSoundType(e.target.value as any);
                  setIsPlayingFocusSound(true); // Auto-start if selected
                }}
                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-transparent border-none outline-none cursor-pointer focus:ring-0 p-0 hover:underline"
              >
                <option value="binaural">Alpha Wave</option>
                <option value="rain">Pure Rain</option>
                <option value="brownian">Brown noise</option>
              </select>
            </div>
            {isPlayingFocusSound && (
              <div className="flex items-center gap-1 pl-1.5 border-l border-slate-200 dark:border-slate-850">
                <input
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.05"
                  value={focusSoundVolume}
                  onChange={(e) => setFocusSoundVolume(parseFloat(e.target.value))}
                  className="w-10 h-1 bg-slate-200 dark:bg-slate-850 rounded appearance-none cursor-pointer accent-indigo-500"
                  title="Adjust concentration sound level"
                />
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

            {/* Offline-First Study Metrics Sync Controller */}
            <div className="relative">
              <button
                onClick={() => setShowSyncLogPanel(!showSyncLogPanel)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all relative cursor-pointer select-none ${
                  isOnlineState
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-205 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400'
                    : 'bg-amber-50 dark:bg-amber-955/20 border-amber-205 dark:border-amber-900 text-amber-700 dark:text-amber-400 animate-pulse'
                }`}
                title={isOnlineState ? "Online: Study metrics synced" : "Offline: Metrics stored in offline queue"}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isOnlineState ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'}`} />
                <span>{isOnlineState ? 'Synced' : 'Offline'}</span>
                {syncQueue.length > 0 && (
                  <span className="ml-1 bg-amber-500 text-white dark:bg-amber-600 font-mono text-[9px] px-1.5 py-0.5 rounded-full">
                    {syncQueue.length}
                  </span>
                )}
              </button>

              {showSyncLogPanel && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-205 dark:border-slate-800 rounded-xl shadow-xl z-[60] overflow-hidden text-left animate-in fade-in slide-in-from-top-1">
                  <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Study Sync Metrics</span>
                      <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 font-sans">Local-first queue manager</span>
                    </div>
                    <button onClick={() => setShowSyncLogPanel(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  
                  <div className="p-4 max-h-72 overflow-y-auto space-y-3">
                    <div className="flex items-center justify-between text-xs pb-2 border-b border-dashed border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Status</span>
                      <span className={`font-bold uppercase tracking-wide text-[10px] ${isOnlineState ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {isOnlineState ? '● Connected' : '● Off-Network'}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Buffered Queue ({syncQueue.length})</span>
                      {syncQueue.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic py-1 leading-relaxed">
                          No unsynced metrics. All your local study progress has been correctly pushed to the servers!
                        </p>
                      ) : (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {syncQueue.map(m => (
                            <div key={m.id} className="flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/20 p-2 rounded border border-slate-100 dark:border-slate-800 text-[10px]">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-700 dark:text-slate-300 capitalize">{m.metricType.replace('_', ' ')}</span>
                                <span className="text-[8px] text-slate-400 font-mono">{new Date(m.timestamp).toLocaleTimeString()}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-indigo-650 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/40 px-1 py-0.5 rounded text-[9px]">
                                  {m.metricType === 'study_time' ? `${m.value.seconds}s` : m.metricType === 'reading_goal' ? `${m.value.minutes}m` : 'Update'}
                                </span>
                                <span className={`w-1.5 h-1.5 rounded-full ${m.status === 'syncing' ? 'bg-indigo-500 animate-pulse' : m.status === 'failed' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between gap-2">
                      <button
                        onClick={async () => {
                          if (syncQueue.length > 0) {
                            await syncManager.syncAllPending();
                          }
                        }}
                        disabled={syncQueue.length === 0}
                        className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-center"
                      >
                        Force Sync
                      </button>
                      <button
                        onClick={() => {
                          // Simulate offline status toggles
                          const simulatedState = !isOnlineState;
                          setIsOnlineState(simulatedState);
                          // Overwrite service state
                          (syncManager as any).isOnlineStatus = simulatedState;
                          // Trigger callbacks
                          (syncManager as any).notifyListeners();
                        }}
                        className="py-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-650 dark:text-slate-300 text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                        title="Simulate network switch to test background syncing"
                      >
                        {isOnlineState ? "Simulate Offline" : "Go Online"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

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

      <main className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar Backdrop */}
        {isLeftSidebarOpen && !(isFocusMode && middleTab === 'view') && (
          <div 
            className="lg:hidden absolute inset-0 bg-slate-950/40 z-25 backdrop-blur-[1px] transition-opacity cursor-pointer" 
            onClick={() => setIsLeftSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar: Course Structure */}
        {isLeftSidebarOpen && !(isFocusMode && middleTab === 'view') && (
        <aside className="absolute lg:relative left-0 top-0 bottom-0 w-72 max-w-[85vw] lg:w-64 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col shrink-0 overflow-y-auto transition-all z-30 shadow-2xl lg:shadow-none h-full">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-900/20">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase">Active Course</h3>
              {selectedCourse && (
                <button 
                  onClick={() => {
                    setShowCourseSettings(!showCourseSettings);
                    setIsResetConfirming(false);
                  }}
                  className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors ${showCourseSettings ? 'text-indigo-600 dark:text-indigo-400 bg-slate-100 dark:bg-slate-850' : 'text-slate-400'}`}
                  title="Course Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
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

            {/* Global Search Button */}
            <div className="mt-2 text-left">
              <button
                onClick={() => setIsGlobalSearchOpen(true)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-900/40 dark:hover:bg-slate-800 border border-slate-200/55 dark:border-slate-800 rounded-lg text-[11px] font-bold text-slate-650 dark:text-slate-400 transition-all cursor-pointer shadow-3xs hover:border-indigo-300 dark:hover:border-indigo-950"
                title="Search matching terms and concepts across all course materials"
              >
                <div className="flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-indigo-505 dark:text-indigo-400" />
                  <span>Scan All Course PDFs...</span>
                </div>
                <span className="text-[9px] font-medium bg-white dark:bg-slate-950 px-1.5 py-0.5 rounded border border-slate-205 dark:border-slate-800 font-mono scale-90 text-slate-405">⌘K</span>
              </button>
            </div>

            {showCourseSettings && selectedCourse && (
              <div className="mt-3 p-2.5 bg-slate-100/90 dark:bg-slate-900/50 rounded-md border border-slate-200/50 dark:border-slate-800/80 text-xs">
                <div className="font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                  <Settings className="w-3 h-3 text-indigo-500" />
                  <span>Course Options</span>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2.5">
                  Configure learning preferences and tracking metrics for <strong className="text-slate-600 dark:text-slate-400 leading-tight block truncate text-[11px] mt-0.5">{selectedCourse.title}</strong>.
                </p>
                
                {resetSuccess ? (
                  <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/30 p-2 rounded text-center animate-pulse">
                    Progress successfully reset!
                  </div>
                ) : isResetConfirming ? (
                  <div className="space-y-1.5 p-1.5 border border-red-105 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/10 rounded">
                    <p className="text-[9px] font-semibold text-red-600 dark:text-red-400 leading-tight">
                      Are you sure? This action is permanent. All historical metrics & active timers will be wiped.
                    </p>
                    <div className="flex gap-1.5 mt-1">
                      <button 
                        onClick={handleResetCourseProgress}
                        className="flex-1 py-1 px-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded text-[9px] transition-colors cursor-pointer"
                      >
                        Yes, Reset
                      </button>
                      <button 
                        onClick={() => setIsResetConfirming(false)}
                        className="flex-1 py-1 px-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-705 dark:text-slate-300 font-bold rounded text-[9px] transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsResetConfirming(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-red-50 hover:bg-red-100/80 dark:bg-red-900/20 dark:hover:bg-red-900/30 border border-red-200/40 dark:border-red-900/40 text-red-600 dark:text-red-400 font-bold rounded transition-colors cursor-pointer text-center"
                  >
                    <RotateCcw className="w-3 h-3 text-red-500" />
                    <span>Reset Course Progress</span>
                  </button>
                )}
              </div>
            )}
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

        {/* Right Sidebar Backdrop */}
        {isRightSidebarOpen && !(isFocusMode && middleTab === 'view') && (
          <div 
            className="lg:hidden absolute inset-0 bg-slate-950/40 z-15 backdrop-blur-[1px] transition-opacity cursor-pointer" 
            onClick={() => setIsRightSidebarOpen(false)}
          />
        )}

        {/* Right Panel: Context & Insights */}
        {isRightSidebarOpen && !(isFocusMode && middleTab === 'view') && (
        <aside className="absolute lg:relative right-0 top-0 bottom-0 w-80 max-w-[85vw] lg:w-72 bg-slate-50 dark:bg-slate-900/50 border-l border-slate-200 dark:border-slate-800 flex flex-col shrink-0 overflow-y-auto transition-all z-20 shadow-2xl lg:shadow-none h-full">
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

      {/* Global PDF Processing Overlay */}
      {isUploadingPdf && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-[2px] p-4 transition-all duration-300">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 sm:p-8 max-w-sm w-full border border-slate-100 dark:border-slate-800 text-center flex flex-col items-center">
            <div className="relative mb-4">
              <div className="w-16 h-16 border-4 border-indigo-100 dark:border-indigo-950 rounded-full"></div>
              <div className="w-16 h-16 border-4 border-t-indigo-600 dark:border-t-indigo-550 rounded-full animate-spin absolute inset-0"></div>
              <BookOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <h3 className="font-bold text-slate-850 dark:text-slate-100 text-sm sm:text-base">Parsing Course Syllabus</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-medium">
              EduAI is reading your document text, structuring chapters, and compiling customized flashcard lists. This can take several seconds.
            </p>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-5 overflow-hidden">
              <div className="h-full bg-indigo-650 dark:bg-indigo-400 rounded-full animate-pulse w-full"></div>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-3">Extracting Syllabus Data...</span>
          </div>
        </div>
      )}

      {/* Video Modal */}
      {isVideoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-md p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-white dark:bg-slate-950 w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-800/80 overflow-hidden flex flex-col transition-all duration-300 max-h-[90vh]">
            
            {/* Header: Title and Avatar Selector */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 rounded-xl">
                  <Play className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm sm:text-base leading-snug">
                    AI Avatar Video Lecture
                  </h3>
                  <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider mt-0.5">
                    Taught by: {selectedAvatar === 'catherine' ? 'Dr. Catherine' : selectedAvatar === 'marcus' ? 'Prof. Marcus' : 'Elena Coach'}
                  </p>
                </div>
              </div>

              {/* Avatar Selector and Speed Pillar */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex bg-slate-150 dark:bg-slate-900 p-1 rounded-xl border border-slate-200/40 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                  {([
                    { id: 'catherine', label: 'Dr. Catherine' },
                    { id: 'marcus', label: 'Prof. Marcus' },
                    { id: 'elena', label: 'Elena (AI Coach)' }
                  ] as const).map((av) => (
                    <button
                      key={av.id}
                      onClick={() => {
                        setSelectedAvatar(av.id);
                        setCurrentSlideIndex(0);
                        setIsPlayingLecture(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all whitespace-nowrap ${
                        selectedAvatar === av.id
                          ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border-b border-indigo-100 dark:border-slate-700'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {av.label}
                    </button>
                  ))}
                </div>

                <button 
                  onClick={() => {
                    setIsVideoModalOpen(false);
                    window.speechSynthesis.cancel();
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors bg-white dark:bg-slate-800 p-2 rounded-full shadow-xs border border-slate-200/50 dark:border-slate-800 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Video Lecture Stages */}
            {isGeneratingLecture ? (
              <div className="p-16 text-center flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/20">
                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="font-bold text-slate-700 dark:text-slate-300">Formulating custom Avatar lecture script...</p>
                <p className="text-xs text-slate-500 mt-1">Analyzing chapter syntax to segment educational summaries</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto flex flex-col lg:flex-row">
                
                {/* Left Side: Avatar Stage Screen */}
                <div className="flex-1 bg-slate-950 p-6 flex flex-col items-center justify-between relative min-h-[340px] lg:border-r lg:border-slate-200/30 dark:lg:border-slate-800/30">
                  <div className="absolute top-4 left-4 z-10 flex items-center space-x-2">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${isAvatarSpeaking ? 'bg-red-500 animate-pulse' : 'bg-slate-500'}`}></span>
                    <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold">
                      {isAvatarSpeaking ? 'AVATAR BROADCASTING' : 'READY TO TEACH'}
                    </span>
                  </div>

                  {/* Stage Lighting Light effects */}
                  <div className="absolute inset-x-0 top-10 flex justify-center opacity-40">
                    <div className="w-64 h-64 bg-indigo-500/15 blur-3xl rounded-full"></div>
                  </div>

                  {/* SVG Avatars */}
                  <div className="my-auto relative z-10 w-full flex justify-center">
                    {selectedAvatar === 'catherine' && (
                      <svg viewBox="0 0 120 120" className="w-36 h-36 md:w-44 md:h-44 drop-shadow-[0_10px_15px_rgba(99,102,241,0.2)] mx-auto transition-transform duration-300">
                        <defs>
                          <linearGradient id="cathGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#818cf8" />
                            <stop offset="100%" stopColor="#4f46e5" />
                          </linearGradient>
                        </defs>
                        <circle cx="60" cy="115" r="35" fill="url(#cathGrad)" />
                        <path d="M45,115 L50,90 L70,90 L75,115" fill="#312e81" />
                        <circle cx="60" cy="72" r="10" fill="#fbcfe8" />
                        <circle cx="60" cy="55" r="23" fill="#ffd1dc" />
                        <path d="M37,55 C35,32 50,22 60,22 C70,22 85,32 83,55 C83,55 78,35 60,35 C42,35 37,55 37,55 Z" fill="#475569" />
                        <path d="M37,55 L42,65 M83,55 L78,65" stroke="#475569" strokeWidth="4" strokeLinecap="round" />
                        <circle cx="51" cy="50" r="3" fill="#1e293b" />
                        <circle cx="69" cy="50" r="3" fill="#1e293b" />
                        <rect x="44" y="47" width="14" height="7" rx="2" fill="none" stroke="#6366f1" strokeWidth="1.5" />
                        <rect x="62" y="47" width="14" height="7" rx="2" fill="none" stroke="#6366f1" strokeWidth="1.5" />
                        <line x1="58" y1="51" x2="62" y2="51" stroke="#6366f1" strokeWidth="1.5" />
                        {isAvatarSpeaking ? (
                          <ellipse cx="60" cy="65" rx="5" ry="4" fill="#be185d" className="animate-[pulse_0.15s_infinite]" />
                        ) : (
                          <path d="M55,64 Q60,67 65,64" stroke="#be185d" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                        )}
                      </svg>
                    )}

                    {selectedAvatar === 'marcus' && (
                      <svg viewBox="0 0 120 120" className="w-36 h-36 md:w-44 md:h-44 drop-shadow-[0_10px_15px_rgba(20,184,166,0.2)] mx-auto">
                        <defs>
                          <linearGradient id="marcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#14b8a6" />
                            <stop offset="100%" stopColor="#0d9488" />
                          </linearGradient>
                        </defs>
                        <circle cx="60" cy="115" r="35" fill="url(#marcGrad)" />
                        <path d="M42,115 L50,92 L70,92 L78,115" fill="#0f172a" />
                        <circle cx="60" cy="74" r="8" fill="#ffedd5" />
                        <circle cx="60" cy="56" r="22" fill="#fed7aa" />
                        <path d="M38,50 C38,30 45,24 60,24 C75,24 82,30 82,50" fill="#334155" strokeWidth="1" />
                        <path d="M48,68 Q60,78 72,68" stroke="#334155" strokeWidth="3" fill="none" strokeLinecap="round" />
                        <rect x="49" y="49" width="4" height="4" rx="1" fill="#0f172a" />
                        <rect x="67" y="49" width="4" height="4" rx="1" fill="#0f172a" />
                        <path d="M37,56 C37,35 83,35 83,56" fill="none" stroke="#2563eb" strokeWidth="2" />
                        <circle cx="37" cy="56" r="3" fill="#2563eb" />
                        <circle cx="83" cy="56" r="3" fill="#2563eb" />
                        <line x1="37" y1="56" x2="48" y2="65" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" />
                        <circle cx="48" cy="65" r="1.5" fill="#38bdf8" />
                        {isAvatarSpeaking ? (
                          <ellipse cx="60" cy="61" rx="4" ry="3" fill="#991b1b" className="animate-[pulse_0.15s_infinite]" />
                        ) : (
                          <line x1="56" y1="62" x2="64" y2="62" stroke="#991b1b" strokeWidth="1.5" strokeLinecap="round" />
                        )}
                      </svg>
                    )}

                    {selectedAvatar === 'elena' && (
                      <svg viewBox="0 0 120 120" className="w-36 h-36 md:w-44 md:h-44 drop-shadow-[0_10px_15px_rgba(244,63,94,0.2)] mx-auto">
                        <defs>
                          <linearGradient id="elenaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#fb7185" />
                            <stop offset="100%" stopColor="#f43f5e" />
                          </linearGradient>
                        </defs>
                        <circle cx="60" cy="115" r="35" fill="url(#elenaGrad)" />
                        <path d="M44,115 L48,93 L72,93 L76,115" fill="#881337" />
                        <circle cx="60" cy="74" r="9" fill="#ffedd5" />
                        <circle cx="60" cy="56" r="22" fill="#ffebd8" />
                        <path d="M38,50 C35,22 55,16 60,16 C65,16 85,22 82,50 C82,60 78,55 78,55 C78,55 60,32 42,55 C42,55 38,60 38,50 Z" fill="#b45309" />
                        <circle cx="51" cy="51" r="2.5" fill="#0f172a" />
                        <circle cx="69" cy="51" r="2.5" fill="#0f172a" />
                        <circle cx="45" cy="57" r="2" fill="#f43f5e" opacity="0.6" />
                        <circle cx="75" cy="57" r="2" fill="#f43f5e" opacity="0.6" />
                        {isAvatarSpeaking ? (
                          <ellipse cx="60" cy="63" rx="6" ry="5" fill="#9f1239" className="animate-[pulse_0.15s_infinite]" />
                        ) : (
                          <path d="M54,61 Q60,67 66,61" stroke="#9f1239" strokeWidth="2" strokeLinecap="round" fill="none" />
                        )}
                      </svg>
                    )}
                  </div>

                  {/* Equalizer Visualizer */}
                  <div className="flex flex-col items-center gap-2 z-10 w-full mb-1">
                    <div className="flex items-end gap-1.5 h-10 px-4 py-2 bg-slate-950/40 rounded-full border border-slate-800/80 backdrop-blur-md">
                      <div className={`w-1 bg-indigo-500 rounded-full transition-all duration-300 ${isAvatarSpeaking ? 'animate-[bounce_0.8s_infinite_100ms] h-6' : 'h-2.5'}`}></div>
                      <div className={`w-1 bg-purple-500 rounded-full transition-all duration-300 ${isAvatarSpeaking ? 'animate-[bounce_0.5s_infinite_300ms] h-8' : 'h-2.5'}`}></div>
                      <div className={`w-1 bg-rose-500 rounded-full transition-all duration-300 ${isAvatarSpeaking ? 'animate-[bounce_0.7s_infinite_200ms] h-7' : 'h-2.5'}`}></div>
                      <div className={`w-1 bg-sky-500 rounded-full transition-all duration-300 ${isAvatarSpeaking ? 'animate-[bounce_0.6s_infinite_400ms] h-5' : 'h-2.5'}`}></div>
                      <div className={`w-1 bg-emerald-500 rounded-full transition-all duration-300 ${isAvatarSpeaking ? 'animate-[bounce_0.8s_infinite_150ms] h-6' : 'h-2.5'}`}></div>
                    </div>
                  </div>

                  {/* Glass Subtitles / Captions Panel */}
                  {showCaptions && (
                    <div className="w-full bg-slate-900/85 backdrop-blur border border-slate-800/60 rounded-2xl p-3 min-h-[64px] flex items-center justify-center text-center mt-3 z-10 select-none">
                      <p className="text-[11px] text-zinc-200 font-medium leading-relaxed font-mono max-w-xl">
                        {subtitleText || (isPlayingLecture ? "Initializing narration audio..." : "Press Play below to hear the teacher speak this slide.")}
                      </p>
                    </div>
                  )}
                </div>

                {/* Right Side: Customized Slides Overview */}
                <div className="w-full lg:w-[380px] p-5 sm:p-6 bg-slate-50 dark:bg-slate-900/60 flex flex-col justify-between shrink-0">
                  <div className="space-y-4">
                    {/* Header Slide Indicator */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 font-mono tracking-wider uppercase bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-lg">
                        Slide {currentSlideIndex + 1} of {lectureSlides.length}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                        Virtual Syllabus Deck
                      </span>
                    </div>

                    {/* Highly polished presentation view card */}
                    {lectureSlides[currentSlideIndex] && (
                      <div className="bg-white dark:bg-slate-950 p-5 rounded-2xl border border-slate-150 dark:border-slate-800/80 shadow-xs transition-all duration-300 hover:shadow-xs animate-[fadeIn_0.3s_ease]">
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm border-b border-slate-100 dark:border-slate-800 pb-2 mb-3 tracking-tight">
                          {lectureSlides[currentSlideIndex].title}
                        </h4>
                        <ul className="space-y-3">
                          {lectureSlides[currentSlideIndex].bulletPoints.map((bullet, idx) => (
                            <li key={idx} className="flex gap-2.5 text-xs text-slate-650 dark:text-slate-350 leading-relaxed font-medium">
                              <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Learning goal notice */}
                    <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-150/10 dark:border-indigo-900/40 rounded-xl text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      <p className="font-bold text-slate-700 dark:text-slate-300 mb-0.5 uppercase tracking-wide">AVATAR LECTURE TIP:</p>
                      The AI reads the structured lecture script sync'd to standard vocal speeds. Review term databases or highlight paragraphs in the reader to generate additional custom cards!
                    </div>
                  </div>

                  {/* Playback & Seek Console */}
                  <div className="border-t border-slate-200 dark:border-slate-800 mt-5 pt-4">
                    {/* Dots indicator */}
                    <div className="flex justify-center items-center gap-2 mb-3 select-none">
                      {lectureSlides.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setCurrentSlideIndex(index);
                          }}
                          className={`h-2.5 rounded-full transition-all duration-300 ${
                            index === currentSlideIndex 
                              ? 'w-7 bg-indigo-600 dark:bg-indigo-500' 
                              : 'w-2.5 bg-slate-300 dark:bg-slate-850 hover:bg-slate-450'
                          }`}
                          title={`Go to Slide ${index + 1}`}
                        />
                      ))}
                    </div>

                    {/* Speed Controls bar */}
                    <div className="flex items-center justify-between text-[11px] mb-3 select-none px-1">
                      <span className="text-slate-400 dark:text-slate-500 font-semibold font-mono">Speed: {speakingRate.toFixed(1)}x</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="range"
                          min="0.5"
                          max="2"
                          step="0.1"
                          value={speakingRate}
                          onChange={(e) => setSpeakingRate(parseFloat(e.target.value))}
                          className="w-20 md:w-24 h-1 bg-slate-200 dark:bg-slate-850 rounded-lg appearance-none cursor-pointer accent-indigo-600 dark:accent-indigo-400"
                        />
                      </div>
                    </div>

                    {/* Next/Prev controls button bar */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => setCurrentSlideIndex(prev => Math.max(0, prev - 1))}
                        disabled={currentSlideIndex === 0}
                        className={`p-2.5 rounded-xl border border-slate-250/20 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 transition shrink-0 ${
                          currentSlideIndex === 0 && 'opacity-40 cursor-not-allowed'
                        }`}
                        title="Previous Slide"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setIsPlayingLecture(!isPlayingLecture)}
                        className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
                          isPlayingLecture 
                            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-md' 
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/10'
                        }`}
                      >
                        {isPlayingLecture ? (
                          <>
                            <Pause className="w-4 h-4 fill-current" />
                            <span>Pause Lecture</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 fill-current" />
                            <span>Start Lecture</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setCurrentSlideIndex(prev => Math.min(lectureSlides.length - 1, prev + 1))}
                        disabled={currentSlideIndex === lectureSlides.length - 1}
                        className={`p-2.5 rounded-xl border border-slate-250/20 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 transition shrink-0 ${
                          currentSlideIndex === lectureSlides.length - 1 && 'opacity-40 cursor-not-allowed'
                        }`}
                        title="Next Slide"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Captions Visibility and Restart */}
                    <div className="flex items-center justify-between mt-3 text-[10px] text-slate-400 dark:text-slate-500 font-bold select-none px-1">
                      <button 
                        onClick={() => setShowCaptions(!showCaptions)}
                        className="hover:underline hover:text-indigo-500"
                      >
                        {showCaptions ? "Hide Captions [-]" : "Show Captions [+]"}
                      </button>
                      <button 
                        onClick={() => generateLectureSlidesForActiveChapter()}
                        className="hover:underline flex items-center gap-0.5 hover:text-indigo-500"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset Session</span>
                      </button>
                    </div>

                  </div>
                </div>

              </div>
            )}
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
              <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-col shrink-0">
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

                <div className="flex-1 overflow-y-auto">
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
                </div> {/* End flex-1 overflow-y-auto */}

                {/* Sticky Study Guide Export Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-950/20 shrink-0 select-none">
                  <button
                    onClick={handleExportStudyGuide}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/10 flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                    </svg>
                    <span>Export Study Guide (.MD)</span>
                  </button>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 text-center mt-1.5 font-medium leading-normal">
                    Includes definitions, active flashcard deck, annotations & outlines.
                  </p>
                </div>
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
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                          My Study Notes:
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(editingNoteText || "");
                            setCopiedState(true);
                            setTimeout(() => setCopiedState(false), 2000);
                          }}
                          disabled={!editingNoteText}
                          className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 flex items-center gap-1.5 px-2 py-1 rounded bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed leading-none transition"
                          title="Copy study notes to clipboard"
                        >
                          {copiedState ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-emerald-500 dark:text-emerald-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy Note</span>
                            </>
                          )}
                        </button>
                      </div>
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

      {/* Global Search Modal overlay */}
      {isGlobalSearchOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-[4px] z-[100] flex items-start justify-center p-4 sm:p-10 pt-[10vh]">
          <div 
            className={`w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col h-[80vh] md:h-[75vh] overflow-hidden animate-in fade-in zoom-in-95 duration-205 transition-all ${
              globalSearchQuery.trim().length >= 2 && globalSearchResults.length > 0
                ? 'max-w-5xl lg:max-w-6xl'
                : 'max-w-3xl'
            }`}
            id="global-search-container"
          >
            {/* Search Input Box */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center gap-3 shrink-0">
              <Search className="w-5 h-5 text-indigo-505 dark:text-indigo-400 shrink-0" />
              <input
                id="global-search-input-field"
                type="text"
                autoFocus
                placeholder="Search definitions, concepts, or keywords across all PDFs..."
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-slate-850 dark:text-slate-100 placeholder-slate-400 font-sans text-sm sm:text-base border-none outline-none focus:ring-0 focus:outline-none text-left"
              />
              <div className="flex items-center gap-2">
                {globalSearchQuery && (
                  <button
                    onClick={() => setGlobalSearchQuery('')}
                    className="p-1 text-slate-450 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 cursor-pointer text-xs font-semibold"
                  >
                    Clear
                  </button>
                )}
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold bg-slate-100 dark:bg-slate-800/80 px-2 py-1 rounded border border-slate-200/50 dark:border-slate-800/50 font-mono select-none">
                  ESC
                </span>
                <button
                  onClick={() => {
                    setIsGlobalSearchOpen(false);
                    setGlobalSearchQuery('');
                  }}
                  className="p-1 rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/85 hover:text-slate-650 dark:hover:text-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content Body Section */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {globalSearchQuery.trim().length < 2 ? (
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-center select-none">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-500 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
                    <Search className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-750 dark:text-slate-200">Scan All PDF Materials</h3>
                  <p className="text-xs text-slate-450 dark:text-slate-400 max-w-sm mx-auto leading-relaxed text-center">
                    Type at least 2 characters to perform a deep-text scan of definitions, concepts, and chapter records across your loaded courses.
                  </p>
                </div>
              ) : globalSearchResults.length === 0 ? (
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-center select-none">
                  <p className="text-3xl mb-1">🔍</p>
                  <h3 className="text-sm font-bold text-slate-750 dark:text-slate-200">No matches discovered</h3>
                  <p className="text-xs text-slate-455 dark:text-slate-405 leading-relaxed text-center">
                    Could not find <strong className="text-slate-600 dark:text-slate-300">"{globalSearchQuery}"</strong> in any Course chapters or Term indices. Try another word or upload more PDFs.
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800/80">
                  {/* Left Column: Results List */}
                  <div className="flex-[4] overflow-y-auto p-4 sm:p-5 flex flex-col min-w-0">
                    <div className="space-y-3.5 flex-1">
                      {/* Search Header */}
                      <div className="flex items-center justify-between gap-4 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pb-1.5 border-b border-slate-100 dark:border-slate-800/85">
                        <span>Search Results ({globalSearchResults.length})</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 lowercase">sort:</span>
                          <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-0.5 rounded-lg border border-slate-205 dark:border-slate-800">
                            <button
                              onClick={() => setGlobalSearchSortBy('relevance')}
                              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all select-none cursor-pointer ${
                                globalSearchSortBy === 'relevance' 
                                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-3xs' 
                                  : 'text-slate-400 hover:text-slate-600 dark:text-slate-550 dark:hover:text-slate-350'
                              }`}
                            >
                              Relevance
                            </button>
                            <button
                              onClick={() => setGlobalSearchSortBy('newest')}
                              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all select-none cursor-pointer ${
                                globalSearchSortBy === 'newest' 
                                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-3xs' 
                                  : 'text-slate-400 hover:text-slate-600 dark:text-slate-550 dark:hover:text-slate-350'
                              }`}
                            >
                              Newest
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Stack of results */}
                      <div className="space-y-2 pb-4">
                        {globalSearchResults.map((result, idx) => {
                          const isSelected = selectedSearchResultIndex === idx;
                          return (
                            <div
                              key={idx}
                              onClick={() => setSelectedSearchResultIndex(idx)}
                              className={`group w-full text-left p-3.5 bg-slate-50/50 hover:bg-slate-100/60 dark:bg-slate-950/10 dark:hover:bg-slate-900/60 border rounded-xl transition-all duration-150 cursor-pointer flex flex-col gap-1.5 shadow-3xs relative ${
                                isSelected 
                                  ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20 ring-1 ring-indigo-500/20' 
                                  : 'border-slate-200/60 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 w-full">
                                <div className="flex items-center gap-2 flex-wrap text-[10px] font-bold">
                                  <span className="font-sans text-indigo-650 dark:text-indigo-400 uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded">
                                    {result.courseTitle}
                                  </span>
                                  {result.chapterTitle && (
                                    <span className="text-slate-400 dark:text-slate-500 flex items-center gap-1 font-sans">
                                      <span>/</span>
                                      <span className="truncate max-w-[120px]">{result.chapterTitle}</span>
                                    </span>
                                  )}
                                </div>
                                <span className="text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-200/50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-450 group-hover:bg-indigo-100 group-hover:text-indigo-700 dark:group-hover:bg-indigo-950 dark:group-hover:text-indigo-400 transition-colors shrink-0">
                                  {result.matchedField}
                                </span>
                              </div>

                              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-relaxed font-sans w-full text-left">
                                {result.type === 'key_term' && result.term ? (
                                  <div className="flex flex-col gap-0.5 text-left w-full">
                                    <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                      Glossary Word
                                    </span>
                                    <p className="text-xs truncate">
                                      <HighlightText text={result.term.word} highlight={globalSearchQuery} /> – <span className="font-normal text-slate-500 dark:text-slate-400">{result.term.definition}</span>
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-slate-650 dark:text-slate-350 font-normal text-xs leading-normal line-clamp-2">
                                    <HighlightText text={result.snippet} highlight={globalSearchQuery} />
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center justify-between gap-1 text-[10px] text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 font-bold transition-all pt-1">
                                <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500">
                                  {isSelected ? "✨ Currently showing preview" : "Click card to preview"}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation(); // prevent select trigger since we are jumping directly
                                    const targetCourse = courses.find(c => c.id === result.courseId);
                                    if (targetCourse) {
                                      setSelectedCourse(targetCourse);
                                      if (result.chapterId) {
                                        const targetChapter = targetCourse.chapters.find(ch => ch.id === result.chapterId);
                                        if (targetChapter) {
                                          setSelectedChapter(targetChapter);
                                          setMiddleTab('view');
                                          setIsReadModalOpen(true);
                                        }
                                      } else {
                                        setSelectedChapter(null);
                                        setMiddleTab('view');
                                      }
                                    }
                                    setIsGlobalSearchOpen(false);
                                    setGlobalSearchQuery('');
                                  }}
                                  className="flex items-center gap-0.5 px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-600 dark:bg-slate-800 hover:text-white dark:hover:bg-indigo-600 text-slate-500 dark:text-slate-450 hover:shadow-3xs transition duration-150"
                                  title="Jump directly to study deck"
                                >
                                  <span>Jump to Reader</span>
                                  <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Complete Context Preview Pane */}
                  <div className="flex-[5] flex flex-col overflow-hidden bg-slate-50/40 dark:bg-slate-900/10 p-4 sm:p-5">
                    {(() => {
                      const activeIndex = selectedSearchResultIndex >= globalSearchResults.length ? 0 : selectedSearchResultIndex;
                      const activeResult = globalSearchResults[activeIndex];
                      
                      if (!activeResult) {
                        return (
                          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none">
                            <span className="text-3xl mb-2">👁️</span>
                            <h4 className="text-sm font-bold text-slate-450 dark:text-slate-550">Select a matched record</h4>
                            <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs mt-1">
                              View full contexts and complete reading materials instantaneously on the right panel.
                            </p>
                          </div>
                        );
                      }

                      const targetCourse = courses.find(c => c.id === activeResult.courseId);
                      const targetChapter = targetCourse?.chapters.find(ch => ch.id === activeResult.chapterId);
                      const fullContentText = targetChapter?.content || "";

                      return (
                        <div className="flex-1 flex flex-col overflow-hidden">
                          {/* Preview Header */}
                          <div className="pb-3 border-b border-slate-200/60 dark:border-slate-800/80 mb-3 flex flex-col gap-1 shrink-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-100 dark:border-indigo-950 px-2 py-0.5 rounded uppercase tracking-wider">
                                {activeResult.matchedField} Preview
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                Context View
                              </span>
                            </div>
                            
                            <h3 className="text-sm font-bold text-slate-850 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                              <span className="text-indigo-650 dark:text-indigo-400">{activeResult.courseTitle}</span>
                              {activeResult.chapterTitle && (
                                <>
                                  <span className="text-slate-300 dark:text-slate-700 font-normal">/</span>
                                  <span className="text-slate-600 dark:text-slate-400 font-semibold">{activeResult.chapterTitle}</span>
                                </>
                              )}
                            </h3>
                          </div>

                          {/* Preview Content Body */}
                          <div className="flex-1 overflow-y-auto pr-1">
                            {activeResult.type === 'key_term' && activeResult.term ? (
                              <div className="py-4 px-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/50 dark:border-slate-800 shadow-3xs space-y-4">
                                <div className="space-y-1">
                                  <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest flex items-center gap-1">
                                    <BookOpen className="w-3.5 h-3.5 text-amber-550" />
                                    Active Glossary Phrase
                                  </div>
                                  <h2 className="text-base sm:text-lg font-bold text-slate-850 dark:text-slate-100 text-left">
                                    <HighlightText text={activeResult.term.word} highlight={globalSearchQuery} />
                                  </h2>
                                </div>
                                
                                <div className="border-l-4 border-amber-400 dark:border-amber-550 pl-4 py-1 italic text-xs sm:text-sm text-slate-650 dark:text-slate-300 leading-relaxed bg-amber-50/30 dark:bg-amber-950/20 pr-3 rounded-r-lg text-left">
                                  <HighlightText text={activeResult.term.definition} highlight={globalSearchQuery} />
                                </div>

                                {targetCourse?.metadata?.keyTerms && targetCourse.metadata.keyTerms.length > 1 && (
                                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                                    <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-left">Other Glossaries in {activeResult.courseTitle}:</h4>
                                    <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto">
                                      {targetCourse.metadata.keyTerms
                                        .filter(t => t.word !== activeResult.term?.word)
                                        .slice(0, 8)
                                        .map((t, tid) => (
                                          <button
                                            key={tid}
                                            onClick={() => {
                                              setGlobalSearchQuery(t.word);
                                            }}
                                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200/75 dark:bg-slate-800 dark:hover:bg-slate-750 text-[10px] text-slate-600 dark:text-slate-400 rounded-md border border-slate-200/40 dark:border-slate-800 hover:border-slate-300 transition cursor-pointer select-none"
                                            title="Click to search this glossary term"
                                          >
                                            {t.word}
                                          </button>
                                        ))
                                      }
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : activeResult.type === 'course_meta' ? (
                              <div className="space-y-4">
                                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200/55 dark:border-slate-800 rounded-2xl shadow-3xs">
                                  <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block mb-1">Course Introduction</span>
                                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal text-left">
                                    <HighlightText text={targetCourse?.description || "No description provided."} highlight={globalSearchQuery} />
                                  </p>
                                </div>

                                {targetCourse?.chapters && targetCourse.chapters.length > 0 && (
                                  <div className="space-y-2">
                                    <h4 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-left">
                                      Course Syllabus Index ({targetCourse.chapters.length} Chapters)
                                    </h4>
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800/50 border border-slate-200/55 dark:border-slate-800 rounded-xl overflow-hidden bg-white/70 dark:bg-slate-900/30">
                                      {targetCourse.chapters.map((ch, idx) => (
                                        <div 
                                          key={ch.id} 
                                          onClick={() => {
                                            const foundIdx = globalSearchResults.findIndex(r => r.chapterId === ch.id);
                                            if (foundIdx !== -1) {
                                              setSelectedSearchResultIndex(foundIdx);
                                            }
                                          }}
                                          className="p-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900/60 transition cursor-pointer"
                                        >
                                          <div className="flex items-center gap-2 truncate">
                                            <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                                              {idx + 1}
                                            </span>
                                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                                              {ch.title}
                                            </span>
                                          </div>
                                          <ChevronRight className="w-3.5 h-3.5 text-slate-350 shrink-0" />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {fullContentText ? (
                                  <div className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-850 rounded-2xl shadow-3xs text-left">
                                    <div className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-widest pb-2 mb-2 border-b border-dashed border-slate-100 dark:border-slate-800">
                                      CHAPTER AT-A-GLANCE
                                    </div>
                                    <p className="text-xs sm:text-sm text-slate-650 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-normal">
                                      <HighlightText text={fullContentText} highlight={globalSearchQuery} />
                                    </p>
                                  </div>
                                ) : (
                                  <div className="p-8 text-center text-slate-450 dark:text-slate-500 italic text-xs bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                                    Reading material is empty or has not been loaded for this chapter.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Preview Footer Actions */}
                          <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800/80 mt-3 flex items-center justify-between gap-3 shrink-0">
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium font-sans text-left">
                              {activeResult.type === 'key_term' ? "Gloss glossary registry" : "Real-time key highlights"}
                            </span>
                            
                            <button
                              onClick={() => {
                                const targetCourse = courses.find(c => c.id === activeResult.courseId);
                                if (targetCourse) {
                                  setSelectedCourse(targetCourse);
                                  if (activeResult.chapterId) {
                                    const targetChapter = targetCourse.chapters.find(ch => ch.id === activeResult.chapterId);
                                    if (targetChapter) {
                                      setSelectedChapter(targetChapter);
                                      setMiddleTab('view');
                                      setIsReadModalOpen(true);
                                    }
                                  } else {
                                    setSelectedChapter(null);
                                    setMiddleTab('view');
                                  }
                                }
                                setIsGlobalSearchOpen(false);
                                setGlobalSearchQuery('');
                              }}
                              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-650 hover:bg-indigo-700 dark:bg-indigo-600 dark:hover:bg-indigo-550 shadow-sm cursor-pointer hover:shadow hover:scale-[1.01] transition-all flex items-center gap-1.5"
                            >
                              <span>Open in Interactive Reader</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex justify-between items-center text-[10px] text-slate-400 font-medium select-none shrink-0">
              <span className="font-sans">Loaded: <strong className="text-slate-600 dark:text-slate-400">{courses.length} courses</strong>, with complete full-text indexing</span>
              <span className="font-sans">Press <kbd className="font-mono bg-white dark:bg-slate-950 px-1 py-0.5 border border-slate-200 dark:border-slate-805 rounded mx-0.5">ESC</kbd> to close</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
