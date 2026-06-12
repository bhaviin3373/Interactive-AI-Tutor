# main.py
"""
AI Tutor LMS & Study Assistant - Local VS Code Entrypoint
Run this file in your favorite IDE or via command line:
    python main.py

Make sure to install dependencies first:
    pip install -r requirements.txt
"""

import sys
import logging

# Configure terminal logging
logging.basicConfig(
    level=logging.INFO, 
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger("LMS-Launcher")

try:
    import uvicorn
    from server import app
except ImportError as e:
    logger.error(f"Dependency import failed: {e}")
    logger.error("Make sure to install required libraries in your local virtual environment:")
    logger.error("    pip install -r requirements.txt")
    sys.exit(1)

if __name__ == "__main__":
    logger.info("VS Code local launcher target detected. Booting FastAPI backend...")
    logger.info("API Documentation will be available at: http://localhost:8000/docs")
    logger.info("Alternative Redoc interface: http://localhost:8000/redoc")
    
    # Run uvicorn server targeting local host for loopback integration
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
