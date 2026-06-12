# Python AI/ML LMS & Study Tutor Backend Support

This directory now includes a full, production-ready **Python FastAPI** backend framework (`server.py`) configured precisely with equivalent endpoints and structure as the React/Node application. 

Since you are doing your project in **AI/ML**, this Python server serves as an ideal framework. You can run, adapt, and expand it with custom machine learning models (e.g., PyTorch, Hugging Face transformers, Scikit-learn, database structures, or local embeddings)!

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
Make sure you have Python 3.9+ installed. Run the following command inside your environment:
```bash
pip install -r requirements.txt
```

### 2. Configure Your Gemini API Key
Export your free Google Gemini API Key into your environment:
```bash
# On Linux/macOS
export GEMINI_API_KEY="your-api-key-here"

# On Windows (PowerShell)
$env:GEMINI_API_KEY="your-api-key-here"

# On Windows (CMD)
set GEMINI_API_KEY="your-api-key-here"
```

### 3. Launch the Server
Start the development server with Hot-Reloading using Uvicorn:
```bash
python server.py
```
The server will boot up instantly on **`http://localhost:8000`** with dynamic auto-documented API routes!
- **Interactive Swagger Docs (Test API instantly!)**: Open `http://localhost:8000/docs` in your browser.
- **Redoc Docs**: Open `http://localhost:8000/redoc`.

---

## 🎨 Supported API Endpoints

The FastAPI server implements 100% matching logic for standard student operations:
- `POST /api/register` & `POST /api/login` - Full mocked auth and registration handlers.
- `POST /api/parse-pdf` - Pre-extracts raw text from files using pure-python `pypdf`, models the syllabus, and structures detailed chapters using Gemini 3.5 Flash JSON Schemas.
- `POST /api/generate-flashcards` - Ingests reference materials to generate high-fidelity, active-recall flashcards.
- `POST /api/chat` - Full AI multi-turn conversational tutor. Supports text messages, student progress context embedding, student highlight references, and multi-modal image files!

---

## 🧠 Enriching Your AI/ML Project

Since this service is written in **Python**, you can easily integrate advanced AI/ML capabilities. Below are direct recipes on how to implement them.

### 🔍 Integrating Semantic Search & RAG (Retrieval-Augmented Generation)
Want to allow students to query details from the textbook and fetch relevant passages instantly? You can use `sentence-transformers` and a lightweight vector store like `chromadb` (or `FAISS`).

1. Install capabilities:
   ```bash
   pip install sentence-transformers chromadb
   ```

2. Add a search endpoint directly to `server.py`:
   ```python
   from sentence_transformers import SentenceTransformer
   import chromadb

   # 1. Initialize embedding model and database
   embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
   chroma_client = chromadb.Client()
   vector_collection = chroma_client.get_or_create_collection("course_chapters")

   # 2. When PDF chapters are parsed, add them to the vector store:
   def index_chapters(chapters: List[Dict[str, Any]]):
       for chapter in chapters:
           # Generate embedding vector
           vector = embedding_model.encode(chapter["content"]).tolist()
           
           vector_collection.add(
               ids=[chapter["id"]],
               embeddings=[vector],
               metadatas=[{"title": chapter["title"]}],
               documents=[chapter["content"]]
           )

   # 3. Create a semantic search endpoint
   @app.post("/api/semantic-search")
   def search_textbook(query: str, n_results: int = 2):
       query_vector = embedding_model.encode(query).tolist()
       results = vector_collection.query(
           query_embeddings=[query_vector],
           n_results=n_results
       )
       return {
           "results": [
               {
                   "id": r_id,
                   "title": r_meta["title"],
                   "excerpt": r_doc[:400] + "..."
               }
               for r_id, r_meta, r_doc in zip(results["ids"][0], results["metadatas"][0], results["documents"][0])
           ]
       }
   ```

### 📈 Predictive Study Analytics
You can plug in standard Scikit-Learn classifiers to predict user exam grades or identify warning flags based on study times (`studyTimeMinutes`), chat interactions, and quiz scores, making your final project immensely rich and complete!
