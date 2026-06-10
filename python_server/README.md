# Python Backend Integration for VS Code

This folder contains a complete Python backend built with **FastAPI** that exactly mirrors the Node.js Express server used in the AI Studio preview. It serves the AI Tutor Chat API (with Gemini Vision support) and serves the React frontend build.

## How to run this project in VS Code

1. **Export the source code**
   - Click the **Settings (gear icon)** in the top right corner of the AI Studio window.
   - Select **Export as ZIP** or **Export to GitHub**.
   - Extract the ZIP file and open the folder in VS Code.

2. **Build the React Frontend**
   - Open your VS Code terminal and make sure you are in the root directory of the project.
   - Install the Node dependencies:
     ```bash
     npm install
     ```
   - Build the frontend project (this compiles the React code into the `dist/` directory):
     ```bash
     npm run build
     ```

3. **Set up the Python Backend**
   - Navigate to the `python_server` directory:
     ```bash
     cd python_server
     ```
   - Create a Python virtual environment to keep dependencies clean:
     ```bash
     python -m venv venv
     ```
   - Activate the virtual environment:
     - On Windows: `venv\Scripts\activate`
     - On macOS/Linux: `source venv/bin/activate`
   - Install the required Python packages:
     ```bash
     pip install -r requirements.txt
     ```

4. **Configure your API Key**
   - In your terminal (with the virtual environment activated), set your Gemini API key as an environment variable:
     - On Windows (PowerShell): `$env:GEMINI_API_KEY="your_actual_api_key_here"`
     - On Windows (CMD): `set GEMINI_API_KEY=your_actual_api_key_here`
     - On macOS/Linux: `export GEMINI_API_KEY="your_actual_api_key_here"`
   
   *(Alternatively, you can create a `.env` file in the python_server folder and use the `python-dotenv` package to load it in `main.py`)*.

5. **Run the FastAPI Server**
   - Start the server using Uvicorn:
     ```bash
     python main.py
     ```
   - The terminal should display: `Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)`

6. **Open the Application**
   - Open your web browser and navigate to: [http://localhost:8000](http://localhost:8000)
   - You will see the React frontend, and it will communicate perfectly with your new Python backend!

## Python vs Node.js Notes
- The AI Studio web preview uses Node.js, so any code running directly in the browser preview here uses the Node.js `server.ts`. 
- When you export the project, you can safely delete `server.ts` and rely entirely on `python_server/main.py`. Change `package.json` scripts if you no longer want the Node backend.
