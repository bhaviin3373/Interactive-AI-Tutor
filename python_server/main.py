import os
import base64
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv
import google.genai as genai
from google.genai import types

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY or GOOGLE_API_KEY must be set in the environment.")

app = FastAPI()

# Initialize Gemini Client
client = genai.Client(api_key=api_key)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Gemini Client
client = genai.Client(api_key=api_key)

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

class AuthRequest(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    token: str

# Simple in-memory user storage (replace with database in production)
users_db = {}
import uuid

@app.post("/api/register", response_model=UserResponse)
async def register(req: AuthRequest):
    if req.email in users_db:
        return {"error": "User already exists"}, 400
    
    user_id = str(uuid.uuid4())
    token = str(uuid.uuid4())
    users_db[req.email] = {
        "id": user_id,
        "email": req.email,
        "password": req.password,
        "name": req.email.split("@")[0],
        "token": token
    }
    
    return UserResponse(
        id=user_id,
        email=req.email,
        name=req.email.split("@")[0],
        token=token
    )

@app.post("/api/login", response_model=UserResponse)
async def login(req: AuthRequest):
    if req.email not in users_db:
        return {"error": "User not found"}, 404
    
    user = users_db[req.email]
    if user["password"] != req.password:
        return {"error": "Invalid password"}, 401
    
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        token=user["token"]
    )

@app.post("/api/parse-pdf")
async def parse_pdf(req: PdfParseRequest):
    try:
        pdf_bytes = base64.b64decode(req.pdfData)
        
        response = client.models.generate_content(
            model='gemini-2.0-flash',
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
        import traceback
        traceback.print_exc()
        
        # Fallback to mock data if API quota exceeded or other errors
        if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e) or "quota" in str(e).lower():
            print("API quota exceeded. Using mock data for development/testing.")
            import json
            mock_data = {
                "chapters": [
                    {
                        "id": "ch1",
                        "title": "Chapter 1: Introduction",
                        "content": "This chapter introduces the fundamental concepts and provides an overview of the main topics. It covers the basic principles and establishes the foundation for deeper learning. You'll learn essential terminology and core concepts that will be referenced throughout the course."
                    },
                    {
                        "id": "ch2",
                        "title": "Chapter 2: Core Concepts",
                        "content": "This chapter dives deeper into the core concepts and principles. It explains how different elements interact and work together. Key theories and frameworks are presented with practical examples to enhance understanding."
                    },
                    {
                        "id": "ch3",
                        "title": "Chapter 3: Advanced Topics",
                        "content": "This chapter covers advanced topics and complex applications. It builds on the foundation established in previous chapters. You'll explore cutting-edge developments and sophisticated techniques in the field."
                    },
                    {
                        "id": "ch4",
                        "title": "Chapter 4: Practical Applications",
                        "content": "This chapter focuses on real-world applications and case studies. It demonstrates how theoretical knowledge translates into practice. Practical examples and implementations are provided throughout."
                    }
                ],
                "progress": {
                    "overallScore": 0,
                    "weakAreas": ["Advanced Concepts", "Practical Implementation"],
                    "strongAreas": ["Fundamentals", "Basic Terminology"],
                    "recentQuizScores": {},
                    "performanceHistory": []
                }
            }
            return mock_data
        return {"error": str(e)}

@app.post("/api/generate-flashcards")
async def generate_flashcards(req: PdfParseRequest):
    try:
        pdf_bytes = base64.b64decode(req.pdfData)
        
        response = client.models.generate_content(
            model='gemini-2.0-flash',
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
        import traceback
        traceback.print_exc()
        
        # Fallback to mock data if API quota exceeded or other errors
        if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e) or "quota" in str(e).lower():
            print("API quota exceeded. Using mock flashcards for development/testing.")
            mock_flashcards = [
                {"id": "fc1", "front": "What is the main concept?", "back": "The main concept is the fundamental principle discussed in the first chapter."},
                {"id": "fc2", "front": "Define the key term", "back": "The key term refers to the central vocabulary used throughout this material."},
                {"id": "fc3", "front": "How do these elements relate?", "back": "These elements are interconnected and work together to form the complete system."},
                {"id": "fc4", "front": "What is the application?", "back": "Applications include practical implementations in real-world scenarios."},
                {"id": "fc5", "front": "Name three important principles", "back": "1) Foundational principle 2) Progressive learning 3) Practical application"},
                {"id": "fc6", "front": "What are the challenges?", "back": "Common challenges include complexity, integration, and continuous adaptation."},
                {"id": "fc7", "front": "How to approach this topic?", "back": "Start with fundamentals, practice with examples, then advance to complex scenarios."},
                {"id": "fc8", "front": "What is the outcome?", "back": "Mastery of concepts leads to improved problem-solving and critical thinking skills."},
                {"id": "fc9", "front": "Explain the advanced concept", "back": "Advanced concepts build on basic knowledge and introduce sophisticated frameworks."},
                {"id": "fc10", "front": "How to measure progress?", "back": "Progress can be measured through quizzes, practice problems, and real-world applications."}
            ]
            return {"flashcards": mock_flashcards}
        return {"error": str(e)}

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
            model='gemini-2.0-flash',
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7,
            )
        )
        return {"text": response.text}
    except Exception as e:
        print(f"Chat API Error: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback to mock response if API quota exceeded or other errors
        if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e) or "quota" in str(e).lower():
            print("API quota exceeded. Using mock response for development/testing.")
            mock_response = "Thank you for your question! Based on the material covered, here are some key points to consider: First, let's break down the concept into simpler components. The fundamental principle here is that understanding the basics is essential before moving to advanced topics. I recommend reviewing the foundational chapters first, then practice with the provided examples. If you need clarification on any specific part, feel free to ask follow-up questions. Keep practicing, and your understanding will continue to improve!"
            return {"text": mock_response}
        return {"error": str(e)}

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
