import express from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import fs from 'fs/promises';

async function parsePdfSafe(pdfBuffer: Buffer) {
  const parser = typeof pdf === 'function' ? pdf : (pdf && (pdf as any).default);
  if (typeof parser !== 'function') {
    throw new Error('pdf-parse module is not a function/callable. Received: ' + typeof parser);
  }
  return await parser(pdfBuffer);
}

const DB_FILE = path.join(process.cwd(), 'users.json');

async function initDb() {
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify([]));
  }
}

async function startServer() {
  await initDb();
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 images
  app.use(express.json({ limit: '50mb' }));

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

  async function handlePdfParsingFallback(title: string, pdfData: string | undefined, res: any) {
    console.log("Using PDF parsing fallback (with raw PDF text extraction)");
    const cleanTitle = title ? title.replace(/\.pdf$/gi, "") : "Uploaded Document";
    
    let chapters: any[] = [];
    let numPages = 0;
    let author = "";
    let wordCount = 0;
    let keyTerms: { word: string; definition: string }[] = [];
    
    if (pdfData) {
      try {
        const pdfBuffer = Buffer.from(pdfData, 'base64');
        const data = await parsePdfSafe(pdfBuffer);
        const fullText = data.text || "";
        numPages = data.numpages || 0;
        wordCount = fullText.split(/\s+/).filter(Boolean).length;
        
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
          })).filter(ch => ch.content.length > 10);
          
          // If the headings check failed to split into logical segments, or we had only 1 combined chapter,
          // let's divide the text into modular paragraph chapters!
          if (chapters.length <= 1) {
            chapters = [];
            const paragraphs = fullText.split(/\n\s*\n/);
            let currentChunk = "";
            let chunkIndex = 1;
            
            for (let para of paragraphs) {
              if ((currentChunk + para).length > 2500) {
                if (currentChunk.trim().length > 0) {
                  let firstLine = currentChunk.trim().split('\n')[0].trim();
                  if (firstLine.length < 5 || firstLine.length > 50) {
                    firstLine = currentChunk.trim().split(/\s+/).slice(0, 5).join(' ');
                  }
                  if (firstLine.length < 5 || firstLine.length > 50) {
                    firstLine = `Module ${chunkIndex}`;
                  }
                  chapters.push({
                    id: `ch${chunkIndex}`,
                    title: `Chapter ${chunkIndex}: ${firstLine}`,
                    content: currentChunk.trim()
                  });
                  chunkIndex++;
                  currentChunk = para;
                } else {
                  currentChunk = para;
                }
              } else {
                currentChunk += (currentChunk ? "\n\n" : "") + para;
              }
            }
            if (currentChunk.trim().length > 0) {
              let firstLine = currentChunk.trim().split('\n')[0].trim();
              if (firstLine.length < 5 || firstLine.length > 50) {
                firstLine = currentChunk.trim().split(/\s+/).slice(0, 5).join(' ');
              }
              if (firstLine.length < 5 || firstLine.length > 50) {
                firstLine = `Module ${chunkIndex}`;
              }
              chapters.push({
                id: `ch${chunkIndex}`,
                title: `Chapter ${chunkIndex}: ${firstLine}`,
                content: currentChunk.trim()
              });
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
          title: `Chapter 1: Foundations of ${cleanTitle}`,
          content: `This section provides a foundational overview of ${cleanTitle}. It covers the primary goals, key context, and the fundamental principles of the topic.\n\nKey Concepts include basic variables, standard setups, and how elements interact dynamically. Developing a sound understanding of these items establishes a baseline for study before digging into complex exercises or active question reviews.`
        },
        {
          id: "ch2",
          title: `Chapter 2: Essential Conceptual Frameworks`,
          content: `Following the foundational context, Chapter 2 explores the core conceptual frameworks and structural mechanics of ${cleanTitle}.\n\nWe examine key methodologies, workflows, and terminology. Pay close attention to how various components connect synchronously to produce stable outcomes, as these connections frequently appear on quizzes and flashcards.`
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

        if (extractedText.trim().length > 100) {
          // Send raw text to Gemini: extremely fast, high fidelity, 100% reliable compared to vision/binary parsing
          contentsParts = [
            {
              text: `Analyze the following text extracted from a PDF document titled "${title}".
Your absolute main task is to extract its full list of chapters or main sections. You MUST find and list ALL chapters, sections, parts, or main topics present in the text – do not omit or skip any of them. If the document has many chapters, you MUST generate a complete list. Do not consolidate them into a few mock items.

For each chapter or section, retrieve:
- 'id': (a short unique string like 'ch1', 'ch2')
- 'title': (the actual concise title/header of the chapter or section)
- 'content': (the full, comprehensive text content for that chapter/section extracted from the original document, ensuring all equations, explanations, data, and details are preserved)

Document Text:
${extractedText.slice(0, 100000)}` // Slice to a very safe text limit that fits easily in Gemini 3.5 Flash context
            }
          ];
        } else {
          // Fallback to inline PDF if text extraction was empty or scanned pdf images
          contentsParts = [
            { inlineData: { data: pdfData, mimeType: 'application/pdf' } },
            { text: `Analyze this PDF document (${title}) and extract ALL of its chapters or sections. You MUST list ALL chapters, units, or headings without omission. Return a JSON array of objects, where each object has 'id' (a short unique string like 'ch1'), 'title' (a short, concise title for the chapter), and 'content' (the full, comprehensive text extracted exactly from that PDF section with no limits).` }
          ];
        }

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
            responseSchema: {
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
          }
        });

        const jsonText = response.text || "[]";
        let chapters = [];
        try {
           chapters = JSON.parse(jsonText);
        } catch (e) {
           chapters = [{ id: 'error', title: 'Parse Error', content: 'Could not extract chapters.'}];
        }
        res.json({ 
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
