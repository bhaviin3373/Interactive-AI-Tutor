# server.py
"""
AI Tutor LMS & Study Assistant - Python AI/ML Backend Server
Built with FastAPI, PyPDF, and google-genai SDK 
"""

import os
import io
import base64
import json
import logging
from typing import List, Optional, Dict, Any
import uvicorn
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pypdf import PdfReader

# Try to import Google GenAI library
try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Tutor & Study LMS Backend",
    description="Python FastAPI implementation matching the TypeScript AI/ML logic, optimized for student projects.",
    version="1.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple Mock In-Memory User Store
USERS_DB: Dict[str, Dict[str, str]] = {}

# --- Pydantic Schemas for Requests and Responses ---

class RegisterRequest(BaseModel):
    email: str = Field(..., example="student@university.edu")
    password: str = Field(..., example="securepwd123")
    name: str = Field(..., example="Alex Mercer")

class LoginRequest(BaseModel):
    email: str = Field(..., example="student@university.edu")
    password: str = Field(..., example="securepwd123")

class ParsePdfRequest(BaseModel):
    pdfData: Optional[str] = None  # Base64 encoded pdf
    title: str = Field(..., example="Physics_101.pdf")

class GenerateFlashcardsRequest(BaseModel):
    pdfData: Optional[str] = None
    title: str = Field(..., example="Physics_101.pdf")

class ImageContext(BaseModel):
    data: str  # Base64 string of image
    mimeType: str  # e.g., "image/png"

class MessageItem(BaseModel):
    id: str
    role: str  # "user" or "assistant"
    text: Optional[str] = None
    image: Optional[ImageContext] = None
    timestamp: float

class StudentProgress(BaseModel):
    completedRatio: float
    studyTimeMinutes: int
    quizScoreAverage: float
    streakDays: int

class ChatRequest(BaseModel):
    courseId: str
    chapterId: Optional[str] = None
    messages: List[MessageItem]
    progress: Optional[StudentProgress] = None
    pdfData: Optional[str] = None


# --- Helper Utilities ---

def get_gemini_client() -> Optional[genai.Client]:
    """Retrieves standard Gemini API client using modern Google GenAI library."""
    if not genai:
        logger.warning("google-genai package is not installed.")
        return None
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY environment variable is not defined.")
        return None
    try:
        return genai.Client(api_key=api_key)
    except Exception as e:
        logger.error(f"Failed to initialize GenAI Client: {e}")
        return None


def extract_text_from_pdf(pdf_base64: str) -> tuple[str, int, str]:
    """Helper method to decode base64 file and parse text using PyPDF"""
    try:
        pdf_bytes = base64.b64decode(pdf_base64)
        pdf_file = io.BytesIO(pdf_bytes)
        reader = PdfReader(pdf_file)
        
        extracted_text = ""
        for page in reader.pages:
            text = page.extract_text()
            if text:
                extracted_text += text + "\n"
        
        num_pages = len(reader.pages)
        author = "Unknown Author"
        if reader.metadata and reader.metadata.author:
            author = reader.metadata.author
            
        return extracted_text.strip(), num_pages, author
    except Exception as e:
        logger.error(f"Error parsing PDF with PyPDF: {e}")
        return "", 0, "Unknown Author"


def get_parsing_fallback(title: str) -> List[Dict[str, Any]]:
    """Safe fallback chapters index if API is unavailable or PDF fails"""
    clean_title = title.replace(".pdf", "").replace("_", " ")
    return [
        {
            "id": "ch1",
            "title": "Chapter 1: Principles and Foundations of " + clean_title,
            "content": "This introductory reading covers primary definitions, structural schemas, objectives, and baseline terminology required for " + clean_title + ". Ensure you memorize key definitions and use adaptive recall drills regularly."
        },
        {
            "id": "ch2",
            "title": "Chapter 2: Core Practical Frameworks",
            "content": "This core chapter provides step-by-step methodologies to analyze system patterns, optimize learning structures, and execute model actions under simulated environments. Pay close attention to workflow diagrams."
        },
        {
            "id": "ch3",
            "title": "Chapter 3: Advanced Applications and Case Reviews",
            "content": "Our final segment explores integration pathways, error verification states, fallback mechanisms, and diagnostic evaluation patterns based on authentic historical case reviews."
        }
    ]


# --- Endpoints ---

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "AI Tutor LMS Python API",
        "engine": "FastAPI",
        "gemini_sdk_detected": genai is not None
    }


@app.post("/api/register")
def register(req: RegisterRequest):
    if req.email in USERS_DB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
    USERS_DB[req.email] = {
        "name": req.name,
        "password": req.password  # In actual projects, hash passwords with pwd_context
    }
    return {"success": True, "token": f"mock-token-for-{req.email}", "user": {"email": req.email, "name": req.name}}


@app.post("/api/login")
def login(req: LoginRequest):
    user = USERS_DB.get(req.email)
    if not user or user["password"] != req.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password combination"
        )
    return {"success": True, "token": f"mock-token-for-{req.email}", "user": {"email": req.email, "name": user["name"]}}


@app.post("/api/parse-pdf")
def parse_pdf(req: ParsePdfRequest):
    try:
        extracted_text = ""
        num_pages = 0
        author = "Unknown Author"

        if req.pdfData:
            extracted_text, num_pages, author = extract_text_from_pdf(req.pdfData)

        client = get_gemini_client()
        if not client:
            logger.info("Using simulated chapter extraction fallback")
            return {
                "chapters": get_parsing_fallback(req.title),
                "metadata": {"author": author or "Unknown Author", "numPages": num_pages or 3}
            }

        # Build Gemini instructions with parsed text
        if len(extracted_text) > 100:
            prompt = (
                f"Analyze the following text extracted from a PDF document titled '{req.title}'.\n"
                "Your absolute main task is to extract its full list of chapters or main sections. "
                "You MUST find and list ALL chapters, sections, parts, or main topics present in the text – "
                "do not omit or skip any of them. If the document has many chapters, you MUST generate a complete list. "
                "Do not consolidate them into a few mock items.\n\n"
                "For each chapter or section, retrieve:\n"
                "- 'id': (a short unique string like 'ch1', 'ch2')\n"
                "- 'title': (the actual concise title/header of the chapter or section)\n"
                "- 'content': (the full, comprehensive text content for that chapter/section extracted from "
                "the original document, ensuring all equations, explanations, data, and details are preserved)\n\n"
                f"Document Text:\n{extracted_text[:100000]}"
            )
            contents_parts = [types.Part.from_text(text=prompt)]
        else:
            # Vision fallback if text parsing was empty
            pdf_bytes = base64.b64decode(req.pdfData) if req.pdfData else b""
            contents_parts = [
                types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                types.Part.from_text(
                    text=f"Analyze this PDF document ({req.title}) and extract ALL of its chapters or sections. "
                         "You MUST list ALL chapters, units, or headings without omission. Return a JSON array of "
                         "objects with keys 'id', 'title', and 'content' (the full extracted text)."
                )
            ]

        # Call live Gemini Model using modern Python SDK structure
        response = client.models.generate_content(
            model='gemini-3.5-flash',
            contents=contents_parts,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "id": types.Schema(type=types.Type.STRING),
                            "title": types.Schema(type=types.Type.STRING),
                            "content": types.Schema(type=types.Type.STRING)
                        },
                        required=["id", "title", "content"]
                    )
                )
            )
        )

        try:
            chapters = json.loads(response.text)
        except Exception:
            chapters = get_parsing_fallback(req.title)

        return {
            "chapters": chapters,
            "metadata": {
                "author": author,
                "numPages": num_pages or 1
            }
        }

    except Exception as e:
        logger.error(f"Error in PDF parsing route: {e}")
        return {
            "chapters": get_parsing_fallback(req.title),
            "metadata": {"author": "Unknown Author", "numPages": 1}
        }


@app.post("/api/generate-flashcards")
def generate_flashcards(req: GenerateFlashcardsRequest):
    try:
        clean_title = req.title.replace(".pdf", "").replace("_", " ") if req.title else "Material"
        fallback_flashcards = [
            {
                "id": "fc1",
                "front": f"What is the primary target of evaluating {clean_title}?",
                "back": "To build a balanced study schema integrating conceptual models, vocabulary practice, and adaptive tutoring feedback."
            },
            {
                "id": "fc2",
                "front": f"State the three main study modules defined for {clean_title}.",
                "back": "Module 1: Foundations & Prerequisites. Module 2: Core Mechanics & Frameworks. Module 3: Case Reviews."
            },
            {
                "id": "fc3",
                "front": "How does our system optimize learning paths?",
                "back": "By tracking active study engagement, tracking chapter reader highlights, and identifying knowledge caps through self-assessment."
            }
        ]

        client = get_gemini_client()
        if not client:
            return {"flashcards": fallback_flashcards}

        # Extracted text helper
        extracted_text = ""
        if req.pdfData:
            extracted_text, _, _ = extract_text_from_pdf(req.pdfData)

        prompt_str = (
            f"Generate a customized list of 5-8 smart study flashcards based on the material '{req.title}'.\n"
            "Each flashcard must contain an active recall query on the front, and a comprehensive explanation on the back.\n"
        )
        if len(extracted_text) > 100:
            prompt_str += f"\nReference Material Content:\n{extracted_text[:40000]}"

        response = client.models.generate_content(
            model='gemini-3.5-flash',
            contents=prompt_str,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=types.Schema(
                    type=types.Type.ARRAY,
                    items=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "id": types.Schema(type=types.Type.STRING),
                            "front": types.Schema(type=types.Type.STRING),
                            "back": types.Schema(type=types.Type.STRING)
                        },
                        required=["id", "front", "back"]
                    )
                )
            )
        )

        try:
            flashcards = json.loads(response.text)
        except Exception:
            flashcards = fallback_flashcards

        return {"flashcards": flashcards}

    except Exception as e:
        logger.error(f"Error generating flashcards: {e}")
        return {"flashcards": fallback_flashcards}


@app.post("/api/chat")
def chat_tutor(req: ChatRequest):
    try:
        client = get_gemini_client()
        if not client:
            # Simulate high-fidelity AI feedback when API is offline
            last_message = req.messages[-1].text if req.messages else ""
            last_text = last_message.lower() if last_message else ""
            
            reply = (
                f"That is an insightful query! Since the system is configured in Python Local Dev Mode, "
                f"I am answering with offline simulated guidelines.\n\n"
                f"To configure live Gemini AI, run: `export GEMINI_API_KEY=your_key` in your terminal.\n\n"
                f"Based on your course **{req.courseId}** and active chapter **{req.chapterId or 'Intro'}**:\n"
                f"1. **Core Terminology**: Ensure you define principles cleanly.\n"
                f"2. **Concept Mapping**: Contrast current reading layout against prior segments.\n"
                f"3. **Highlights**: You can highlight sections directly in the study room to save custom notes!"
            )
            return {"text": reply, "isSimulated": True}

        # Live Gemini Tutoring Implementation
        system_instruction = (
            f"You are an AI Tutor embedded within a Learning Management System (LMS).\n"
            f"The student is currently asking questions related to Course: {req.courseId}, "
            f"Chapter: {req.chapterId or 'General studies'}.\n"
            f"Student Progress Data: {json.dumps(req.progress.model_dump() if req.progress else {})}\n"
            "Use the student's progress to inform your responses, adapt learning paths, and recommend "
            "specific modules or practice exercises to reinforce weak areas and challenge strengths if applicable.\n"
            "Be helpful, encouraging, and clear. Guide the student understanding rather than just giving direct answers.\n"
            "Use markdown for formatting."
        )

        # Map frontend chats message history structure to Gemini compatible multi-role parts structure
        contents_parts = []
        for m in req.messages:
            parts = []
            if m.text:
                parts.append(types.Part.from_text(text=m.text))
            if m.image:
                try:
                    img_bytes = base64.b64decode(m.image.data)
                    parts.append(types.Part.from_bytes(data=img_bytes, mime_type=m.image.mimeType))
                except Exception as img_err:
                    logger.error(f"Failed decoding image part: {img_err}")
            
            role_type = "user" if m.role == "user" else "model"
            contents_parts.append(
                types.Content(role=role_type, parts=parts)
            )

        # If student provided general reference PDF data, attach it to the first message block dynamically
        if req.pdfData and len(contents_parts) > 0:
            try:
                pdf_bytes_data = base64.b64decode(req.pdfData)
                contents_parts[0].parts.insert(
                    0, 
                    types.Part.from_bytes(data=pdf_bytes_data, mime_type="application/pdf")
                )
                contents_parts[0].parts.append(
                    types.Part.from_text(text=f"\n[System Note: Above is reference PDF for course {req.courseId}]")
                )
            except Exception as pdf_attach_err:
                logger.error(f"Could not attach PDF to chat: {pdf_attach_err}")

        # Send to Gemini
        response = client.models.generate_content(
            model='gemini-3.5-flash',
            contents=contents_parts,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7,
            )
        )

        return {"text": response.text}

    except Exception as e:
        logger.error(f"Error in chat tutor: {e}")
        return {
            "text": "An error occurred while generating the AI response. Please make sure your GEMINI_API_KEY is configured."
        }


if __name__ == "__main__":
    logger.info("Launching FastAPI server on port 8000...")
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
