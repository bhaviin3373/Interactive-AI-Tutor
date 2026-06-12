# Full-Stack AI Learning Companion & Organizer

A sleek, fully featured, and highly customizable interactive syllabus manager, study timer, and AI-powered active learning companion. It integrates PDF course guides/materials, extracts dynamic glossary entries, generates contextual flashcard decks, and offers an interactive study-focused chatbot.

This application is built with a highly secure full-stack architecture using **React 19 + TypeScript + Vite 6** in the frontend, backed by a **Node.js + Express** server. It leverages the official modern `@google/genai` SDK for server-side AI interactions, ensuring your API credentials remain private and never exposed to the client browser.

---

## 🚀 Cross-Platform System Requirements

To run this project locally inside **VS Code** on **Windows**, **macOS**, or **Linux**, ensure you have installed:

1. **Node.js** (v18.0.0 or higher is recommended)
2. **npm** (v9.0.0 or higher, usually bundled with Node.js)
3. **Visual Studio Code (VS Code)**

---

## 🛠️ Step-by-Step Local Setup

Follow these simple steps to move this project to your local VS Code workspace and start running:

### 1. Download and Extract
* Zip/export the project from your workspace resource exporter, or clone it into a local directory.
* Open **VS Code**.
* Go to `File` -> `Open Folder...` (or `Open...` on macOS) and choose the root directory containing this project (the folder containing `package.json` and this `README.md`).

### 2. Configure Environment Variables
To use the AI-assisted chapters, dynamic flashcards, and smart interactive tutoring chat, you need a **Gemini API Key**.
* In the root folder of the project, duplicate the `.env.example` file and rename it to `.env`.
* Open your new `.env` file in VS Code and insert your real Gemini API key:
  ```env
  GEMINI_API_KEY="your_actual_gemini_api_key_here"
  PORT=3000
  ```
  *(Note: You can obtain a free API key at [Google AI Studio](https://aistudio.google.com/)).*

### 3. Install NPM Dependencies
Open the built-in VS Code Terminal (`Ctrl + `` ` or `Cmd + `` ` on Mac, or go to `Terminal -> New Terminal`) and run:
```bash
npm install
```
This will automatically install all production and development dependencies, including Express, React, TypeScript, Vite, Recharts, and the `@google/genai` SDK.

---

## ⚡ Cross-Platform Run Commands

All npm scripts inside `package.json` have been optimized to be **100% platform-independent**, meaning they work perfectly inside standard CMD/PowerShell on Windows, Git Bash, macOS Terminals (`Terminal.app`/`iterm2`), and Linux shells out-of-the-box.

### Development Mode (Recommended)
This starts the Node.js Express server (`server.ts`) in development mode with active TypeScript type stripping (`tsx`), which mounts and serves the Vite frontend. Any adjustments to either client or server code are hot-swapped dynamically:
```bash
npm run dev
```
* **Local Address:** Open your browser and navigate to **`http://localhost:3000`**

### Production Build & Run
To compile and test the production-ready optimized version of the app:

1. **Build the assets:**
   ```bash
   npm run build
   ```
   *This compiles the React SPA via Vite into static files inside `dist/`, and bundles the Node backend `server.ts` into a fast CJS standalone script `/dist/server.js` using `esbuild`.*

2. **Start the production server:**
   ```bash
   npm run start
   ```

### Code Verification (Type Checking)
Runs the TypeScript compiler to check for type issues and configuration errors across the codebase without outputting files:
```bash
npm run lint
```

### Clean Workspace Utilities
Cleans up build artifacts safely. This script runs via inline Node.js commands, completely bypassing the OS-specific differences between Unix commands (`rm -rf`) and Windows CMD (`rmdir /s /q`):
```bash
npm run clean
```

---

## 🛡️ Full-Stack Security Architecture

The application implements strict server-client routing to keep your sensitive parameters secure:
* **The Problem:** Direct API requests to Gemini from a frontend browser expose your API private key (`GEMINI_API_KEY`) inside the browser’s developer tools, allowing third parties to extract and abuse it.
* **The Solution (Our Architecture):**
  1. No API keys are present in the React SPA. All user queries, uploads, and flashcard requests are routed to specific server endpoints on port 3000 (e.g., `/api/chat`, `/api/parse-pdf`, `/api/generate-flashcards`).
  2. The **Express server** reads the key securely from local process environment configuration (`process.env.GEMINI_API_KEY`).
  3. The server communicates securely with the Google Gemini API, parses the response, and sends the structured data back to your local dashboard.
  4. If no `GEMINI_API_KEY` is provided during local startup, the application seamlessly activates an **offline simulator fallback mode**, allowing full evaluation of chapters, flashcards, word tracking, and progress metrics with a local dictionary base.

---

## 📂 Project Anatomy

* `/src/App.tsx` - Main layout & state hub of the interactive learning companion. Houses the navigation rails, progress trackers, global session control widget, and interactive quiz interface.
* `/src/components/*` - Visual modular components (Auth flows, flashcard study cards, user profile widgets).
* `/server.ts` - Node.js production server, routes static file compilers, extracts PDF vocabulary, analyzes learning indicators, and communicates with Gemini using the `@google/genai` SDK.
* `/package.json` - Platform-agnostic script declarations and library requirements file.
* `/.env.example` - Template file indicating needed configuration keys.
