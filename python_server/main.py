import os
import base64
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from google import genai
from google.genai import types

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Gemini Client
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

class ImagePayload(BaseModel):
    data: str
    mimeType: str
    url: Optional[str] = None

class Message(BaseModel):
    role: str
    text: Optional[str] = None
    image: Optional[ImagePayload] = None

class ChatRequest(BaseModel):
    courseId: str
    chapterId: str
    messages: List[Message]
    progress: Dict[str, Any]
    pdfData: Optional[str] = None

class PdfParseRequest(BaseModel):
    pdfData: str
    title: str

@app.post("/api/parse-pdf")
async def parse_pdf(req: PdfParseRequest):
    try:
        pdf_bytes = base64.b64decode(req.pdfData)
        
        response = client.models.generate_content(
            model='gemini-3.5-flash',
            contents=[types.Content(
                role="user",
                parts=[
                    types.Part.from_bytes(data=pdf_bytes, mime_type='application/pdf'),
                    types.Part.from_text(text=f"Analyze this PDF document ({req.title}) and extract its main chapters or sections. Return a JSON object with 'chapters' (an array of objects, where each object has 'id', 'title', and 'content' (a 2-3 paragraph summary)) and 'progress' (an object representing estimated initial progress with 'overallScore' (number like 0), 'weakAreas' (array of 2 strings based on advanced topics), 'strongAreas' (array of 2 strings based on basic topics), 'recentQuizScores' (empty object), and 'performanceHistory' (empty array)). You MUST format the output as pure JSON, DO NOT include any markdown formatting or comments.")
                ]
            )]
        )
        
        json_text = response.text or "[]"
        if "```json" in json_text:
            json_text = json_text.replace("```json", "").replace("```", "").strip()
        elif "```" in json_text:
            json_text = json_text.replace("```", "").strip()
            
        import json
        result = json.loads(json_text)
        return result
    except Exception as e:
        print(f"PDF Parse Error: {e}")
        return {"error": "Failed to parse PDF"}, 500

@app.post("/api/generate-flashcards")
async def generate_flashcards(req: PdfParseRequest):
    try:
        pdf_bytes = base64.b64decode(req.pdfData)
        
        response = client.models.generate_content(
            model='gemini-3.5-flash',
            contents=[types.Content(
                role="user",
                parts=[
                    types.Part.from_bytes(data=pdf_bytes, mime_type='application/pdf'),
                    types.Part.from_text(text=f"Analyze this PDF document ({req.title}) and generate 10 interactive flashcards covering the most important concepts. Return a JSON array of objects, where each object has 'id' (a short unique string like 'fc1'), 'front' (the question or term), and 'back' (the answer or definition). You MUST format the output as pure JSON, starting with [ and ending with ]. DO NOT include any markdown formatting or comments.")
                ]
            )]
        )
        
        json_text = response.text or "[]"
        if "```json" in json_text:
            json_text = json_text.replace("```json", "").replace("```", "").strip()
        elif "```" in json_text:
            json_text = json_text.replace("```", "").strip()
            
        import json
        flashcards = json.loads(json_text)
        return {"flashcards": flashcards}
    except Exception as e:
        print(f"Flashcard Generation Error: {e}")
        return {"error": "Failed to generate flashcards"}, 500

@app.post("/api/chat")
async def chat(req: ChatRequest):
    system_instruction = f"""You are an AI Tutor embedded within a Learning Management System (LMS). 
The student is currently asking questions related to Course: {req.courseId}, Chapter: {req.chapterId}.
Student Progress Data: {req.progress}
Use the student's progress to inform your responses, adapt learning paths, and recommend specific modules or practice exercises to reinforce weak areas and challenge strengths if applicable.
Be helpful, encouraging, and clear. Guide the student understanding rather than just giving direct answers.
If the student provides an image or context highlight, analyze it carefully to explain the specific doubt.
Use markdown for formatting."""

    contents = []
    for m in req.messages:
        parts = []
        if m.text:
            parts.append(types.Part.from_text(text=m.text))
        if m.image and m.image.data:
            image_data = base64.b64decode(m.image.data)
            parts.append(
                types.Part.from_bytes(
                    data=image_data,
                    mime_type=m.image.mimeType,
                )
            )
        
        role = "user" if m.role == 'user' else "model"
        contents.append(types.Content(role=role, parts=parts))

    if req.pdfData and len(contents) > 0:
        pdf_bytes = base64.b64decode(req.pdfData)
        contents[0].parts.insert(0, types.Part.from_bytes(data=pdf_bytes, mime_type='application/pdf'))
        contents[0].parts.append(types.Part.from_text(text=f"\n[System Note: Above is the reference PDF for Course {req.courseId}]"))

    try:
        response = client.models.generate_content(
            model='gemini-3.5-flash',
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7,
            )
        )
        return {"text": response.text}
    except Exception as e:
        print(f"Chat API Error: {e}")
        return {"error": "Failed to generate response"}, 500

# Serve static files from the React build if 'dist' exists
dist_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dist")
if os.path.isdir(dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_path, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        index_file = os.path.join(dist_path, "index.html")
        if os.path.exists(index_file):
            with open(index_file, "r") as f:
                return HTMLResponse(content=f.read(), status_code=200)
        return {"message": "React build not found. Please run 'npm run build' first."}
else:
    @app.get("/")
    def no_frontend():
        return {"message": "API is running. React build not found in the ../dist/ directory."}

if __name__ == "__main__":
    import uvicorn
    # Run the server on port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
