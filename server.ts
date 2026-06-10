import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs/promises';

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

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  app.post('/api/parse-pdf', async (req, res) => {
    try {
      const { pdfData, title } = req.body;
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: pdfData, mimeType: 'application/pdf' } },
              { text: `Analyze this PDF document (${title}) and extract its main chapters or sections. Return a JSON array of objects, where each object has 'id' (a short unique string like 'ch1'), 'title' (a short, concise title for the chapter), and 'content' (a 2-3 paragraph summary/extracted text of that chapter to read). You MUST format the output as pure JSON, starting with [ and ending with ]. DO NOT include any markdown formatting or comments.` }
            ]
          }
        ]
      });

      let jsonText = response.text || "[]";
      if (jsonText.includes("```json")) {
         jsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();
      } else if (jsonText.includes("```")) {
         jsonText = jsonText.replace(/```/g, "").trim();
      }
      const chapters = JSON.parse(jsonText);
      res.json({ chapters });
    } catch (error: any) {
      console.error('PDF Parse Error:', error);
      res.status(500).json({ error: 'Failed to parse PDF' });
    }
  });

  app.post('/api/generate-flashcards', async (req, res) => {
    try {
      const { pdfData, title } = req.body;
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: pdfData, mimeType: 'application/pdf' } },
              { text: `Analyze this PDF document (${title}) and generate 10 interactive flashcards covering the most important concepts. Return a JSON array of objects, where each object has 'id' (a short unique string like 'fc1'), 'front' (the question or term), and 'back' (the answer or definition). You MUST format the output as pure JSON, starting with [ and ending with ]. DO NOT include any markdown formatting or comments.` }
            ]
          }
        ]
      });

      let jsonText = response.text || "[]";
      if (jsonText.includes("```json")) {
         jsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();
      } else if (jsonText.includes("```")) {
         jsonText = jsonText.replace(/```/g, "").trim();
      }
      const flashcards = JSON.parse(jsonText);
      res.json({ flashcards });
    } catch (error: any) {
      console.error('Flashcard Generation Error:', error);
      res.status(500).json({ error: 'Failed to generate flashcards' });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { courseId, chapterId, messages, progress, pdfData } = req.body;
      
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
      console.error('Chat API Error:', error);
      res.status(500).json({ error: 'Failed to generate response' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
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
