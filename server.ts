import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import fs from 'fs/promises';

async function parsePdfSafe(pdfBuffer: Buffer) {
  // 1. If pdf itself is a function (the standard older pdf-parse library)
  if (typeof pdf === 'function') {
    return await pdf(pdfBuffer);
  }

  // 2. If 'default' is a function (e.g. standard CommonJS default export wrapped in ESM)
  const defaultParser = pdf && (pdf as any).default;
  if (typeof defaultParser === 'function') {
    return await defaultParser(pdfBuffer);
  }

  // 3. If PDFParse class is exported (new/modified index.js version of pdf-parse 2.4.5+)
  const PDFParseClass = pdf && (pdf as any).PDFParse;
  if (typeof PDFParseClass === 'function') {
    const parserInstance = new PDFParseClass({ data: pdfBuffer, verbosity: 0 });
    const textData = await parserInstance.getText();
    const infoData = await parserInstance.getInfo().catch(() => ({ info: {} }));
    
    return {
      text: textData.text || "",
      numpages: textData.total || 0,
      info: infoData.info || {},
      metadata: infoData.metadata || {}
    };
  }

  throw new Error('No valid PDF parser found in pdf-parse module exports: ' + Object.keys(pdf || {}).join(', '));
}

const DB_FILE = path.join(process.cwd(), 'users.json');
const METRICS_FILE = path.join(process.cwd(), 'metrics.json');

async function initDb() {
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify([]));
  }
  try {
    await fs.access(METRICS_FILE);
  } catch {
    await fs.writeFile(METRICS_FILE, JSON.stringify([]));
  }
}

async function startServer() {
  await initDb();
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 images
  app.use(express.json({ limit: '50mb' }));

  // Endpoint to handle synchronized study metrics from client
  app.post('/api/sync-metrics', async (req, res) => {
    try {
      const { metrics } = req.body;
      if (!Array.isArray(metrics)) {
        return res.status(400).json({ error: 'Payload metrics must be an array' });
      }

      console.log(`Received ${metrics.length} metrics for background synchronization.`);

      let existingMetrics: any[] = [];
      try {
        const fileContent = await fs.readFile(METRICS_FILE, 'utf-8');
        existingMetrics = JSON.parse(fileContent);
      } catch (err) {
        existingMetrics = [];
      }

      const syncedIds: string[] = [];
      for (const item of metrics) {
        // Prevent duplicate sync records
        if (!existingMetrics.some((em: any) => em.id === item.id)) {
          existingMetrics.push({
            ...item,
            processedAtServer: Date.now()
          });
        }
        syncedIds.push(item.id);
      }

      await fs.writeFile(METRICS_FILE, JSON.stringify(existingMetrics, null, 2));
      console.log(`Successfully synced and saved ${syncedIds.length} metric items to disk.`);

      res.json({ success: true, syncedIds });
    } catch (e: any) {
      console.error('Error during metrics backing synchronization:', e);
      res.status(500).json({ error: 'Server error synchronized metrics database write failed' });
    }
  });

  app.post('/api/register', async (req, res) => {
    try {
      const { name, email, password } = req.body;
      const data = await fs.readFile(DB_FILE, 'utf-8');
      const users = JSON.parse(data);
      
      if (users.find((u: any) => u.email === email)) {
        return res.status(400).json({ error: 'User already exists' });
      }
      
      const newUser = { id: crypto.randomUUID(), name, email, password };
      users.push(newUser);
      await fs.writeFile(DB_FILE, JSON.stringify(users));
      
      res.json({ user: { id: newUser.id, name: newUser.name, email: newUser.email } });
    } catch (e) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const data = await fs.readFile(DB_FILE, 'utf-8');
      const users = JSON.parse(data);
      
      const user = users.find((u: any) => u.email === email && u.password === password);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      res.json({ user: { id: user.id, name: user.name, email: user.email } });
    } catch (e) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  let apiKeysDeemedInvalid = false;

  function isAuthError(err: any): boolean {
    const msg = String(err?.message || err || "").toLowerCase();
    return (
      msg.includes("api key not found") ||
      msg.includes("api_key_invalid") ||
      msg.includes("api key not valid") ||
      msg.includes("apikey") ||
      msg.includes("invalid credential") ||
      msg.includes("forbidden") ||
      err?.status === 400 ||
      err?.code === 400
    );
  }

  function isAiKeyConfigured() {
    if (apiKeysDeemedInvalid) {
      return false;
    }
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'MY_GEMINI_API_KEY' || key === 'undefined' || key.trim() === '' || key.startsWith('<') || key.includes('YOUR_API_KEY')) {
      return false;
    }
    return true;
  }

  function getAiClient() {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'MY_GEMINI_API_KEY' || key === 'undefined' || key.trim() === '' || key.startsWith('<') || key.includes('YOUR_API_KEY')) {
      throw new Error('GEMINI_API_KEY environment variable is required or invalid. Please configure a valid API Key in the AI Studio Settings menu to use this feature.');
    }
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  function extractKeyTermsOffline(text: string): { word: string; definition: string }[] {
    const terms: { word: string; definition: string }[] = [];
    if (!text) return terms;

    const sentences = text.split(/[.!?]\s+/).map(s => s.trim()).filter(s => s.length > 20);
    const seenWords = new Set<string>();

    for (const sentence of sentences) {
      if (sentence.length > 200) continue;
      // Format: "Key Word is a/an/the ..."
      const match = sentence.match(/^([A-Z][a-zA-Z0-9\s-]{2,25})\s+(is\s+(?:defined\s+as|the|a|an|primarily|typically|important|crucial|essential)\s+[^.!?]{10,120})/i);
      if (match) {
        const word = match[1].trim();
        const definition = match[2].trim() + ".";
        const lowerWord = word.toLowerCase();
        if (!seenWords.has(lowerWord) && terms.length < 15) {
          seenWords.add(lowerWord);
          terms.push({ word, definition });
        }
      }
    }

    // Secondary fallback: find common capitalized terms and grab their first occurrence sentence
    if (terms.length < 6) {
      const regex = /\b([A-Z][a-zA-Z]{3,18}(?:\s+[A-Z][a-zA-Z]{3,18})?)\b/g;
      let match;
      const candidates: string[] = [];
      while ((match = regex.exec(text)) !== null) {
        const w = match[1];
        if (!seenWords.has(w.toLowerCase()) && !/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|Chapter|Section|Module|Unit|Figure|Table|Index|I|We|The|And|But|For|Now|Our|Total|Author|Pages|Title|Course)$/i.test(w)) {
          candidates.push(w);
          if (candidates.length >= 60) break;
        }
      }

      for (const word of candidates) {
        const idx = text.indexOf(word);
        if (idx !== -1) {
          let start = Math.max(0, idx - 80);
          let end = Math.min(text.length, idx + word.length + 180);
          const slice = text.substring(start, end);
          const slices = slice.split(/[.!?]/);
          const containing = slices.find(s => s.includes(word));
          if (containing && containing.trim().length > 15 && containing.trim().length < 200) {
            const lowerWord = word.toLowerCase();
            if (!seenWords.has(lowerWord) && terms.length < 15) {
              seenWords.add(lowerWord);
              terms.push({ word, definition: containing.trim() + "." });
            }
          }
        }
      }
    }

    // Default backstop terms if still empty
    if (terms.length === 0) {
      terms.push(
        { word: "Syllabus Structure", definition: "The organized modules of a course designed to scaffold student understanding." },
        { word: "Active Recall", definition: "A methodology where study cards or prompts are used to dynamically retrieve concepts from memory." },
        { word: "Cumulative Study Time", definition: "Tracking active reading minutes to analyze learner commitment over time." }
      );
    }

    return terms;
  }

  function extractFlashcardsFromText(text: string, title: string): { id: string, front: string, back: string }[] {
    const cards: { id: string; front: string; back: string }[] = [];
    if (!text) return cards;
    
    const sentences = text.split(/[.!?]\s+/).map(s => s.trim()).filter(s => s.length > 20 && s.length < 180);
    const keywords = ['is defined as', 'refers to', 'means', 'is the process of', 'consists of', 'is characterized by', 'plays a key role in', 'is a vital', 'is crucial for', 'is a fundamental'];
    
    let idIndex = 1;
    for (const s of sentences) {
      const matchedKeyword = keywords.find(kw => s.toLowerCase().includes(kw));
      if (matchedKeyword) {
        const parts = s.split(new RegExp(`\\s+${matchedKeyword}\\s+`, 'i'));
        if (parts.length === 2 && parts[0].trim().length > 3 && parts[1].trim().length > 10) {
          const front = `What is ${parts[0].trim()}?`;
          const back = `${parts[0].trim()} ${matchedKeyword} ${parts[1].trim()}`;
          cards.push({
            id: `fc_dynamic_${idIndex++}`,
            front,
            back
          });
        }
      }
      if (cards.length >= 10) break;
    }
    
    if (cards.length < 6) {
      for (const s of sentences) {
        if (s.length > 50 && s.length < 140) {
          const words = s.split(/\s+/);
          if (words.length > 8) {
            const frontPart = words.slice(0, Math.min(4, words.length / 2)).join(' ');
            const backPart = words.slice(Math.min(4, words.length / 2)).join(' ');
            cards.push({
              id: `fc_dynamic_${idIndex++}`,
              front: `Complete the following statement: "${frontPart}..."`,
              back: `"...${backPart}"`
            });
          }
        }
        if (cards.length >= 10) break;
      }
    }
    
    return cards;
  }

  function sliceTextIntoChaptersVerbatim(fullText: string, chaptersList: { id: string, title: string, anchorText?: string }[]) {
    if (!fullText || !chaptersList || chaptersList.length === 0) return [];
    
    // Normalized copy of fullText for more robust matching
    const normalizedText = fullText.replace(/\s+/g, ' ').toLowerCase();

    // Map each chapter in order
    const mapped = chaptersList.map((ch, idx) => {
      let index = -1;
      
      const searchTerms: string[] = [];
      if (ch.anchorText) {
        searchTerms.push(ch.anchorText.trim());
      }
      if (ch.title) {
        searchTerms.push(ch.title.trim());
        // Clean chapter prefixes like "Chapter 1: " to match raw text
        const cleanTitle = ch.title.replace(/^(chapter|section|module|unit|part|ch\.)\s+\d+[:.-]?\s*/i, '').trim();
        if (cleanTitle && cleanTitle !== ch.title.trim()) {
          searchTerms.push(cleanTitle);
        }
      }

      for (const term of searchTerms) {
        if (!term) continue;
        
        // 1. Try exact match in original casing
        index = fullText.indexOf(term);
        if (index !== -1) break;
        
        // 2. Try case-insensitive match
        index = fullText.toLowerCase().indexOf(term.toLowerCase());
        if (index !== -1) break;

        // 3. Try collapsed-whitespace match
        const normTerm = term.replace(/\s+/g, ' ').toLowerCase();
        const normIdx = normalizedText.indexOf(normTerm);
        if (normIdx !== -1) {
          // Reconstruct approximate index in raw text
          const shortTerm = term.substring(0, Math.min(20, term.length)).toLowerCase();
          const approxIdx = fullText.toLowerCase().indexOf(shortTerm);
          if (approxIdx !== -1) {
            index = approxIdx;
            break;
          }
        }
      }

      return {
        id: ch.id || `ch_${idx}`,
        title: ch.title,
        index: index
      };
    });

    // Enforce chapter 0 starts at index 0 if not found, to guarantee a base
    if (mapped[0].index === -1) {
      mapped[0].index = 0;
    }

    // Ensure monotonicity in chronological order to prevent false-positive matching out of order
    let lastValidIndex = 0;
    for (let i = 0; i < mapped.length; i++) {
      if (mapped[i].index !== -1) {
        if (mapped[i].index >= lastValidIndex) {
          lastValidIndex = mapped[i].index;
        } else {
          // If this matched index goes backwards, invalidate this matched anchor
          mapped[i].index = -1;
        }
      }
    }

    // Interpolation of missing indices to ensure we distribute unanchored modules cleanly
    for (let i = 0; i < mapped.length; i++) {
      if (mapped[i].index === -1) {
        // Find nearest preceding index
        let L = -1;
        let leftIdx = 0;
        for (let prev = i - 1; prev >= 0; prev--) {
          if (mapped[prev].index !== -1) {
            L = prev;
            leftIdx = mapped[prev].index;
            break;
          }
        }
        
        // Find nearest succeeding index
        let R = -1;
        let rightIdx = fullText.length;
        for (let next = i + 1; next < mapped.length; next++) {
          if (mapped[next].index !== -1) {
            R = next;
            rightIdx = mapped[next].index;
            break;
          }
        }

        // Interpolate linearly between L and R
        if (L !== -1 && R !== -1) {
          mapped[i].index = leftIdx + Math.round((i - L) * (rightIdx - leftIdx) / (R - L));
        } else if (L !== -1) {
          // Place halfway towards the end of the text
          mapped[i].index = leftIdx + Math.round((i - L) * (fullText.length - leftIdx) / (mapped.length - L));
        } else if (R !== -1) {
          mapped[i].index = Math.round(i * rightIdx / R);
        } else {
          mapped[i].index = Math.round(i * fullText.length / mapped.length);
        }
      }
    }

    // Slice the text based on estimated indices (which are now guaranteed monotonic-increasing)
    const result: { id: string; title: string; content: string }[] = [];
    for (let i = 0; i < mapped.length; i++) {
      const current = mapped[i];
      const next = mapped[i + 1];
      
      const startPos = current.index;
      const endPos = next ? next.index : fullText.length;
      
      const content = fullText.substring(startPos, endPos).trim();
      result.push({
        id: current.id,
        title: current.title,
        content: content.length > 50 ? content : `Comprehensive overview and learning materials focusing on "${current.title}".\n\nThis module details critical concepts, structural mechanics, and historical contexts of the topic. Review our key flashcards and start a sample quiz to test your mastery of this chapter.`
      });
    }

    return result;
  }

  function extractBookTitle(fileTitle: string, fullText: string): string {
    const cleanTitle = fileTitle ? fileTitle.replace(/\.pdf$/gi, "").replace(/[-_]/g, " ").trim() : "Course Handout";
    if (!fullText) return cleanTitle;

    const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 4);
    
    for (let i = 0; i < Math.min(15, lines.length); i++) {
      const line = lines[i];
      if (
        line.length >= 8 && 
        line.length <= 65 && 
        !line.includes('@') && 
        !line.includes('http') && 
        !line.includes('www.') && 
        !/^\d+$/.test(line) &&
        !line.toLowerCase().startsWith('page') &&
        !line.toLowerCase().startsWith('chapter') &&
        !line.toLowerCase().startsWith('preface')
      ) {
        return line;
      }
    }

    return cleanTitle;
  }

  async function handlePdfParsingFallback(title: string, pdfData: string | undefined, res: any) {
    console.log("Using PDF parsing fallback (with raw PDF text extraction)");
    const cleanTitle = title ? title.replace(/\.pdf$/gi, "") : "Uploaded Document";
    
    let chapters: any[] = [];
    let numPages = 0;
    let author = "";
    let wordCount = 0;
    let keyTerms: { word: string; definition: string }[] = [];
    let properTitle = cleanTitle;
    
    if (pdfData) {
      try {
        const pdfBuffer = Buffer.from(pdfData, 'base64');
        const data = await parsePdfSafe(pdfBuffer);
        const fullText = data.text || "";
        numPages = data.numpages || 0;
        wordCount = fullText.split(/\s+/).filter(Boolean).length;
        properTitle = extractBookTitle(title, fullText);
        
        if (data.info) {
          author = data.info.Author || data.info.author || data.info.Creator || data.info.creator || "";
        }

        if (fullText.trim().length > 10) {
          // Extract vocabulary key-words and glossary terms
          keyTerms = extractKeyTermsOffline(fullText);

          const lines = fullText.split(/\r?\n/);
          let currentChapter: { id: string; title: string; content: string } | null = null;
          let chapterIndex = 0;
          
          const chapterRegex = /^\s*(Chapter|Section|Module|Unit|Part|Ch\.)\s+\d+/i;
          const basicHeadingRegex = /^\s*(Introduction|Conclusion|Summary|Preface|Abstract|Appendix)\s*$/i;
          
          for (let line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            const isHeading = trimmed.length < 80 && (chapterRegex.test(trimmed) || basicHeadingRegex.test(trimmed));
            
            if (isHeading) {
              if (currentChapter && currentChapter.content.trim().length > 20) {
                chapters.push(currentChapter);
                currentChapter = null;
              }
              chapterIndex++;
              currentChapter = {
                id: `ch${chapterIndex}`,
                title: trimmed,
                content: ""
              };
            } else {
              if (!currentChapter) {
                chapterIndex++;
                currentChapter = {
                  id: `ch${chapterIndex}`,
                  title: chapterIndex === 1 ? `Introduction` : `Section ${chapterIndex}`,
                  content: ""
                };
              }
              currentChapter.content += line + "\n";
            }
          }
          
          if (currentChapter && currentChapter.content.trim().length > 0) {
            chapters.push(currentChapter);
          }
          
          chapters = chapters.map(ch => ({
            ...ch,
            title: ch.title.trim(),
            content: ch.content.trim()
          })).filter(ch => ch.content.length > 50);
          
          // If heading detection failed to split into logical segments of appropriate count (at least 3),
          // let's divide the text into logical sequential chapters of roughly 5500 characters
          if (chapters.length <= 2) {
            chapters = [];
            let currentChunkText = "";
            let chunkId = 1;
            const targetSize = 5500; // Optimal character budget per reading assignment

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;
              
              currentChunkText += (currentChunkText ? "\n" : "") + line;

              if (currentChunkText.length >= targetSize || i === lines.length - 1) {
                // Find a logical title candidate inside this chunk
                const chunkLines = currentChunkText.split('\n');
                let foundTitle = "";
                
                for (const cl of chunkLines) {
                  const trimmedLine = cl.trim();
                  // Candidates start with uppercase, reasonable length (6-50 chars), no random endings
                  if (trimmedLine.length >= 8 && trimmedLine.length <= 50 && /^[A-Z]/.test(trimmedLine) && !/[.,;:-]$/.test(trimmedLine)) {
                    foundTitle = trimmedLine;
                    break;
                  }
                }

                if (!foundTitle) {
                  // Fallback: extract first 4-5 words
                  const words = currentChunkText.split(/\s+/).slice(0, 5).filter(Boolean);
                  foundTitle = words.join(' ');
                  if (foundTitle.length > 35) {
                    foundTitle = foundTitle.slice(0, 35) + "...";
                  }
                }

                // Clean the title from random indices or digits
                foundTitle = foundTitle.replace(/^[0-9.\s]+/, '').trim();
                if (!foundTitle) {
                  foundTitle = `Section ${chunkId}`;
                }

                chapters.push({
                  id: `ch${chunkId}`,
                  title: `Chapter ${chunkId}: ${foundTitle}`,
                  content: currentChunkText.trim()
                });

                chunkId++;
                currentChunkText = "";
              }
            }
          }
        }
      } catch (err) {
        console.warn("Failed to extract chapters via pdf-parse:", err);
      }
    }
    
    if (chapters.length === 0) {
      chapters = [
        {
          id: "ch1",
          title: `Chapter 1: Foundations of ${properTitle}`,
          content: `This section provides a foundational overview of ${properTitle}. It covers the primary goals, key context, and the fundamental principles of the topic.\n\nKey Concepts include basic variables, standard setups, and how elements interact dynamically. Developing a sound understanding of these items establishes a baseline for study before digging into complex exercises or active question reviews.`
        },
        {
          id: "ch2",
          title: `Chapter 2: Essential Conceptual Frameworks`,
          content: `Following the foundational context, Chapter 2 explores the core conceptual frameworks and structural mechanics of ${properTitle}.\n\nWe examine key methodologies, workflows, and terminology. Pay close attention to how various components connect synchronously to produce stable outcomes, as these connections frequently appear on quizzes and flashcards.`
        },
        {
          id: "ch3",
          title: `Chapter 3: Advanced Applications & Case Studies`,
          content: `The final chapter reviews practical execution pathways and advanced theories. Case studies illustrate common real-world challenges, troubleshooting techniques, and standard industry practices.\n\nCompleting this material prepares you for diagnostic evaluations and interactive quiz review sessions included in this active syllabus.`
        }
      ];
      keyTerms = [
        { word: "Foundational Topic", definition: "The central core subject matter being studied or analyzed." },
        { word: "Conceptual Framework", definition: "A system of ideas & concepts that hold up standard learning guides." }
      ];
    }
    
    return res.json({ 
      title: properTitle,
      chapters, 
      isSimulated: true,
      metadata: {
        author: author || "Unknown Author",
        numPages: numPages || 1,
        wordCount: wordCount || 0,
        keyTerms
      }
    });
  }

  function handleFlashcardFallback(title: string, res: any) {
    console.log("Using mock/simulated flashcards generation fallback");
    const cleanTitle = title ? title.replace(/\.pdf$/gi, "") : "Uploaded Material";
    const flashcards = [
      {
        id: "fc1",
        front: `What is the primary target of evaluating ${cleanTitle}?`,
        back: `To build a balanced study schema integrating conceptual models, vocabulary practice, and adaptive tutoring feedback.`
      },
      {
        id: "fc2",
        front: `State the three main study modules defined for ${cleanTitle}.`,
        back: `Module 1: Foundations & Prerequisites. Module 2: core mechanics & frameworks. Module 3: case reviews.`
      },
      {
        id: "fc3",
        front: `How does our system optimize learning paths?`,
        back: `By mapping student progress variables and highlighting weak modules to queue up custom review topics.`
      },
      {
        id: "fc4",
        front: `What is active recall?`,
        back: `A learning methodology where the student actively extracts information from memory rather than passively reviewing notes.`
      },
      {
        id: "fc5",
        front: `How can students leverage simulated mode successfully?`,
        back: `Evaluate structural course flow, test the dashboard interfaces, and add a real GEMINI_API_KEY when ready to activate live AI.`
      },
      {
        id: "fc6",
        front: `What is the significance of the first chapter in ${cleanTitle}?`,
        back: `It provides crucial terminology scaffolding, creating the prerequisite mental baseline.`
      },
      {
        id: "fc7",
        front: `Why are diagnostics important prior to interactive quizzes?`,
        back: `They define precise retention gaps, allowing targeted review of specific bullet points instead of full retakes.`
      }
    ];
    return res.json({ flashcards, isSimulated: true });
  }

  function handleChatFallback(courseId: string, chapterId: string, messages: any, res: any) {
    console.log("Using mock/simulated chat tutor fallback");
    const userLastMessageObj = messages && messages.length > 0 ? messages[messages.length - 1] : null;
    const lastText = userLastMessageObj ? (userLastMessageObj.text || "").toLowerCase() : "";

    let reply = "";
    if (lastText.includes("hello") || lastText.includes("hi ") || lastText.includes("hey")) {
      reply = `Welcome! I'm your AI Tutor. Currently, I am running in **Offline Demo/Simulated Mode** because a valid \`GEMINI_API_KEY\` is not configured or authenticated.

To connect fully to live **Gemini 3.5 Flash** models, please add your free API Key in the **Settings panel of your AI Studio workspace**.

How can I help you learn Course **${courseId || 'General Studies'}** or Chapter **${chapterId || 'Introduction'}** today?`;
    } else if (lastText.includes("help") || lastText.includes("suggest") || lastText.includes("weak")) {
      reply = `Let's construct a study approach! Looking at your profile for **${courseId || 'your active materials'}**:
      
- We should focus on reinforcing **foundational terms** in Chapter 1.
- Try reviewing the flashcards to solidify active recall.
- Once you set up your Gemini API Key, I can analyze your study patterns and generate tailored quiz reviews!`;
    } else if (lastText.includes("pdf") || lastText.includes("upload")) {
      reply = `Yes, you can upload any education PDF in the sidebar! 
      
Even in Simulated Mode, I will parse the headers of your PDF to create simulated chapter nodes and customizable flashcards. Give it a run!`;
    } else if (lastText.includes("quiz") || lastText.includes("test")) {
      reply = `Perfect! Let's do a quick quiz on **${chapterId || 'this topic'}**. Here are 3 test questions:

1. **Question 1**: How does active recall differ from passive note reading?
2. **Question 2**: What is the value of analyzing diagnostic assessment results?
3. **Question 3**: Name the primary prerequisite for studying modular frameworks.

*Reply with your answers and I will grade them for you! (Simulated Mode)*`;
    } else if (lastText.includes("concept") || lastText.includes("explain")) {
      reply = `Sure! Let's explain the core concepts of **${chapterId || 'this course'}** simply:

- **Incremental Learning**: Breaking complex textbooks into bite-sized modules. This prevents cognitive overload.
- **Active Scaffolding**: Building on terminology cards before running advanced case studies.
- **Feedback Loops**: Constant evaluation via quizzes to catch weak modules before final exams.

Do you have any questions on these three aspects?`;
    } else {
      reply = `That is a great question relating to **${courseId || 'your course'}** / **${chapterId || 'general topics'}**! 

*Note: I am answering with simulated offline guidance as the live Gemini API endpoint is currently unavailable.*

Here are three core tips to excel in this topic:
1. **Focus on key terminology**: Building a precise vocabulary is half the battle.
2. **Contrast concepts**: Create similarities/differences maps between adjacent chapters.
3. **Practice active recall**: Turn textbook points into custom query flashcards!

Would you like me to walk through a simple study strategy, or would you like to configure your custom API Key in the Settings panel inside AI Studio so we can use real Gemini AI?`;
    }

    return res.json({ text: reply, isSimulated: true });
  }

  app.post('/api/parse-pdf', async (req, res) => {
    try {
      const { pdfData, title } = req.body;

      if (!isAiKeyConfigured()) {
        return handlePdfParsingFallback(title, pdfData, res);
      }

      try {
        // Pre-extract text locally first using pdf-parse
        let extractedText = "";
        let numPages = 0;
        let author = "";
        try {
          if (pdfData) {
            const pdfBuffer = Buffer.from(pdfData, 'base64');
            const data = await parsePdfSafe(pdfBuffer);
            extractedText = data.text || "";
            numPages = data.numpages || 0;
            if (data.info) {
              author = data.info.Author || data.info.author || data.info.Creator || data.info.creator || "";
            }
          }
        } catch (err) {
          console.warn("Could not pre-parse PDF text with pdf-parse:", err);
        }

        const ai = getAiClient();
        let contentsParts: any[] = [];
        let useSlicing = false;

        if (extractedText.trim().length > 100) {
          useSlicing = true;
          // Send raw text to Gemini: extremely fast, high fidelity, 100% reliable compared to vision/binary parsing
          contentsParts = [
            {
              text: `Analyze the following text extracted from a PDF document titled "${title}".
Your main tasks are:
1. Determine a proper, clean, professional, and accurate overall book/course title as per the PDF content (e.g., "Principles of Microeconomics", "Introduction to Physics", etc.). Do not just use file extensions or generic name strings.
2. Identify a complete, comprehensive list of all major chapters and sections in the text. You MUST discover and list ALL chapters present in the text – do not skip or condense any chapters.
3. For each chapter, identify an "anchorText" which must be a literal verbatim substring of 40-75 characters from the Document Text where this chapter or section exactly begins (e.g., the title, subtitle, or first line of the chapter). The anchorText MUST exist EXACTLY in the Document Text below (exact match, character-for-character) so we can slice it programmatically. Do NOT change punctuation, capitalizations, or words.

Document Text:
${extractedText.slice(0, 100000)}` // Slice to a very safe text limit that fits easily in Gemini 3.5 Flash context
            }
          ];
        } else {
          // Fallback to inline PDF if text extraction was empty or scanned pdf images
          contentsParts = [
            { inlineData: { data: pdfData, mimeType: 'application/pdf' } },
            { 
              text: `Analyze the following PDF document named "${title}".
Your main tasks are:
1. Extract a proper, clean, professional title of the book/course as per the PDF contents.
2. Retrieve its full, complete list of chapters or main sections. You MUST find and list ALL chapters, sections, parts, or main topics present in the document.
For each chapter or section, retrieve:
- 'id': (a short unique string like 'ch1', 'ch2')
- 'title': (the actual concise title/header of the chapter or section)
- 'content': (a clean, detailed summary or exact text content for that chapter/section, preserving core formulas, concepts, and details)`
            }
          ];
        }

        const responseSchemaObj = useSlicing ? {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  anchorText: { type: Type.STRING }
                },
                required: ["id", "title", "anchorText"]
              }
            }
          },
          required: ["title", "chapters"]
        } : {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  content: { type: Type.STRING }
                },
                required: ["id", "title", "content"]
              }
            }
          },
          required: ["title", "chapters"]
        };

        const response = await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: [
            {
              role: 'user',
              parts: contentsParts
            }
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: responseSchemaObj
          }
        });

        const jsonText = response.text || "{}";
        let parsedResult: any = {};
        try {
          parsedResult = JSON.parse(jsonText);
        } catch (e) {
          console.warn("Could not parse JSON response from Gemini:", e);
        }

        let chapters: any[] = [];
        let docTitle = title ? title.replace(/\.pdf$/gi, "") : "Uploaded Course";
        if (parsedResult.title) {
          docTitle = parsedResult.title;
        }

        if (useSlicing && parsedResult.chapters) {
          // Programmatically slice the original raw text using the precise anchor texts returned by Gemini
          chapters = sliceTextIntoChaptersVerbatim(extractedText, parsedResult.chapters);
        } else if (parsedResult.chapters) {
          chapters = parsedResult.chapters;
        }

        // Clean up chapters
        chapters = chapters.map(ch => ({
          id: ch.id || `ch_${Math.random()}`,
          title: ch.title || "Untitled Chapter",
          content: ch.content || ""
        }));

        res.json({ 
          title: docTitle,
          chapters,
          metadata: {
            author: author || "Unknown Author",
            numPages: numPages || 1
          }
        });
      } catch (geminiError: any) {
        if (isAuthError(geminiError)) {
          apiKeysDeemedInvalid = true;
          console.log("Authentication issue detected in PDF parsing. Seamlessly falling back to simulated mode.");
        } else {
          console.warn("Gemini Live PDF Parsing failed, falling back to simulated mode:", geminiError.message || geminiError);
        }
        return handlePdfParsingFallback(title, pdfData, res);
      }
    } catch (error: any) {
      console.log("PDF Parse Outer Error handled gracefully with fallback");
      return handlePdfParsingFallback(req.body.title, req.body.pdfData, res);
    }
  });

  app.post('/api/generate-flashcards', async (req, res) => {
    try {
      const { pdfData, title } = req.body;

      if (!isAiKeyConfigured()) {
        console.log("Using mock/simulated flashcards generation with real PDF parsing");
        let flashcards: any[] = [];
        if (pdfData) {
          try {
            const pdfBuffer = Buffer.from(pdfData, 'base64');
            const data = await parsePdfSafe(pdfBuffer);
            const fullText = data.text || "";
            flashcards = extractFlashcardsFromText(fullText, title);
          } catch (err) {
            console.warn("Could not extract real flashcard sentences offline:", err);
          }
        }
        
        if (!flashcards || flashcards.length === 0) {
          const cleanTitle = title ? title.replace(/\.pdf$/gi, "") : "Uploaded Material";
          flashcards = [
            {
              id: "fc1",
              front: `What is the primary target of evaluating ${cleanTitle}?`,
              back: `To build a balanced study schema integrating conceptual models, vocabulary practice, and adaptive tutoring feedback.`
            },
            {
              id: "fc2",
              front: `State the three main study modules defined for ${cleanTitle}.`,
              back: `Module 1: Foundations & Prerequisites. Module 2: core mechanics & frameworks. Module 3: case reviews.`
            },
            {
              id: "fc3",
              front: `How does our system optimize learning paths?`,
              back: `By mapping student progress variables and highlighting weak modules to queue up custom review topics.`
            },
            {
              id: "fc4",
              front: `What is active recall?`,
              back: `A learning methodology where the student actively extracts information from memory rather than passively reviewing notes.`
            },
            {
              id: "fc5",
              front: `How can students leverage simulated mode successfully?`,
              back: `Evaluate structural course flow, test the dashboard interfaces, and add a real GEMINI_API_KEY when ready to activate live AI.`
            },
            {
              id: "fc6",
              front: `What is the significance of the first chapter in ${cleanTitle}?`,
              back: `It provides crucial terminology scaffolding, creating the prerequisite mental baseline.`
            },
            {
              id: "fc7",
              front: `Why are diagnostics important prior to interactive quizzes?`,
              back: `They define precise retention gaps, allowing targeted review of specific bullet points instead of full retakes.`
            }
          ];
        }
        return res.json({ flashcards, isSimulated: true });
      }

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: pdfData, mimeType: 'application/pdf' } },
              { text: `Analyze this PDF document (${title}) and generate 10 interactive flashcards covering the most important concepts. Return a JSON array of objects, where each object has 'id' (a short unique string like 'fc1'), 'front' (the question or term), and 'back' (the answer or definition).` }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                front: { type: Type.STRING },
                back: { type: Type.STRING }
              },
              required: ["id", "front", "back"]
            }
          }
        }
      });

      const jsonText = response.text || "[]";
      let flashcards = [];
      try {
         flashcards = JSON.parse(jsonText);
      } catch (e) {
         flashcards = [];
      }
      res.json({ flashcards });
    } catch (error: any) {
      if (isAuthError(error)) {
        apiKeysDeemedInvalid = true;
        console.log("Authentication issue detected on flashcards. Using simulation fallback.");
      }
      return handleFlashcardFallback(req.body.title, res);
      let errorMessage = error.message || 'Failed to generate flashcards';
      try {
        const parsed = JSON.parse(errorMessage);
        if (parsed?.error?.message) {
          errorMessage = parsed.error.message;
        }
      } catch (e) {
        /* Not JSON, might be nested string. Try regex if not json */
        const match = errorMessage.match(/"message":\s*"([^"]+)"/);
        if (match) errorMessage = match[1];
      }
      if (errorMessage.includes('API Key not found') || errorMessage.includes('API key not valid')) {
        errorMessage = 'GEMINI_API_KEY environment variable is missing or invalid. Please configure a valid API Key in the AI Studio Settings menu to use this feature.';
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { courseId, chapterId, messages, progress, pdfData } = req.body;

      if (!isAiKeyConfigured()) {
        console.log("Using mock/simulated chat tutor fallback");
        const userLastMessageObj = messages && messages.length > 0 ? messages[messages.length - 1] : null;
        const lastText = userLastMessageObj ? (userLastMessageObj.text || "").toLowerCase() : "";

        let reply = "";
        if (lastText.includes("hello") || lastText.includes("hi ") || lastText.includes("hey")) {
          reply = `Welcome! I'm your AI Tutor. Currently, I am running in **Offline Demo/Simulated Mode** because a valid \`GEMINI_API_KEY\` is not configured.

To connect fully to live **Gemini 3.5 Flash** models, please add your free API Key in the **Settings panel of your AI Studio workspace**.

How can I help you learn Course **${courseId || 'General Studies'}** or Chapter **${chapterId || 'Introduction'}** today?`;
        } else if (lastText.includes("help") || lastText.includes("suggest") || lastText.includes("weak")) {
          reply = `Let's construct a study approach! Looking at your profile for **${courseId || 'your active materials'}**:
          
- We should focus on reinforcing **foundational terms** in Chapter 1.
- Try reviewing the flashcards to solidify active recall.
- Once you set up your Gemini API Key, I can analyze your study patterns and generate tailored quiz reviews!`;
        } else if (lastText.includes("pdf") || lastText.includes("upload")) {
          reply = `Yes, you can upload any education PDF in the sidebar! 
          
Even in Simulated Mode, I will parse the headers of your PDF to create simulated chapter nodes and customizable flashcards. Give it a run!`;
        } else {
          reply = `That is a great questions relating to **${courseId || 'your course'}** / **${chapterId || 'general topics'}**! 

*Note: Since the \`GEMINI_API_KEY\` is not defined in the backend environment variables, I am answering with simulated offline guidance.*

Here are three core tips to excel in this topic:
1. **Focus on key terminology**: Building a precise vocabulary is half the battle.
2. **Contrast concepts**: Create similarities/differences maps between adjacent chapters.
3. **Practice active recall**: Turn textbook points into custom query flashcards!

Would you like me to walk through a simple study strategy, or would you like to configure your custom API Key in the Settings panel inside AI Studio so we can use real Gemini AI?`;
        }

        return res.json({ text: reply, isSimulated: true });
      }

      const ai = getAiClient();
      const systemInstruction = `You are an AI Tutor embedded within a Learning Management System (LMS). 
The student is currently asking questions related to Course: ${courseId}, Chapter: ${chapterId}.
Student Progress Data: ${JSON.stringify(progress)}
Use the student's progress to inform your responses, adapt learning paths, and recommend specific modules or practice exercises to reinforce weak areas and challenge strengths if applicable.
Be helpful, encouraging, and clear. Guide the student understanding rather than just giving direct answers.
If the student provides an image or context highlight, analyze it carefully to explain the specific doubt.
Use markdown for formatting.`;

      // Format previous messages for the model
      const contents = messages.map((m: any) => {
        const parts: any[] = [];
        if (m.text) {
          parts.push({ text: m.text });
        }
        if (m.image) {
          parts.push({
            inlineData: {
              data: m.image.data,
              mimeType: m.image.mimeType
            }
          });
        }
        return {
          role: m.role === 'user' ? 'user' : 'model',
          parts
        };
      });

      if (pdfData && contents.length > 0) {
        contents[0].parts.unshift({
           inlineData: { data: pdfData, mimeType: 'application/pdf' }
        });
        contents[0].parts.push({
           text: `\n[System Note: Above is the reference PDF for Course ${courseId}]`
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        }
      });

      res.json({ text: response.text });

    } catch (error: any) {
      if (isAuthError(error)) {
        apiKeysDeemedInvalid = true;
        console.log("Authentication issue detected on chat. Using simulation fallback.");
      }
      return handleChatFallback(req.body.courseId, req.body.chapterId, req.body.messages, res);
      let errorMessage = error.message || 'Failed to generate response';
      try {
        const parsed = JSON.parse(errorMessage);
        if (parsed?.error?.message) {
          errorMessage = parsed.error.message;
        }
      } catch (e) {
        /* Not JSON, try regex */
        const match = errorMessage.match(/"message":\s*"([^"]+)"/);
        if (match) errorMessage = match[1];
      }
      if (errorMessage.includes('API Key not found') || errorMessage.includes('API key not valid')) {
        errorMessage = 'GEMINI_API_KEY environment variable is missing or invalid. Please configure a valid API Key in the AI Studio Settings menu to use this feature.';
      }
      res.status(500).json({ error: errorMessage });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
