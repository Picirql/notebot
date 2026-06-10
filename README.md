# NoteBot AI

AI-powered note generator that transforms online class recordings and transcripts into structured, beautifully formatted study notes.

---

## Screenshot

> _(Add a screenshot of the app here)_

---

## Features

- **Upload class resources** — drag & drop JSON transcripts, plain text, or Markdown files
- **Six note presets** — Detailed Notes, Summary, Key Concepts, Flashcards, Study Guide, Formula Sheet
- **Custom prompts** — override or extend any preset with your own instructions
- **Streaming generation** — see notes appear in real time as Gemini writes them
- **LaTeX math rendering** — inline `$...$` and display `$$...$$` math via KaTeX
- **Syntax-highlighted code** — powered by highlight.js (github-dark theme)
- **Persistent storage** — all notes saved to a local SQLite database
- **Sidebar with search** — instantly filter saved notes by title or content
- **Export** — download notes as `.md` or `.txt`, or copy to clipboard
- **Dark glassmorphism UI** — premium design system with smooth animations

---

## Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd ai-notebot

# 2. Install dependencies
npm install

# 3. Add your Gemini API key to .env
#    Get a free key at: https://aistudio.google.com/apikey
echo "GEMINI_API_KEY=your-actual-key-here" >> .env

# 4. Start the development server
npm run dev
```

The frontend runs at **http://localhost:5173** and the API at **http://localhost:3001**.

---

## How to Use

1. **Upload** — Drag & drop a class resource file (JSON transcript, `.txt`, or `.md`) into the upload zone
2. **Choose a preset** — Click one of the six preset pills (Notes, Summary, Flashcards, etc.)
3. **Customise** _(optional)_ — Edit the prompt textarea with additional instructions
4. **Generate** — Click **✨ Generate Notes** and watch the notes stream in
5. **Save / Export** — Notes are auto-saved; use the action bar to copy, export as MD/TXT, or view from the sidebar

### JSON Transcript Format

```json
[
  {
    "noteTitle": "Property 1: Determinants",
    "timeStamp": "0:12:22",
    "endTimeStamp": "0:14:23",
    "sectionTitle": "Introduction to Determinants",
    "type": "Academic",
    "markdown": "#### Property 1\n\n* If two rows are swapped..."
  }
]
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES Modules), Vite 5 |
| Styling | CSS custom properties, glassmorphism |
| Markdown | marked 12, highlight.js, KaTeX |
| Backend | Node.js, Express 4 |
| Database | SQLite via better-sqlite3 |
| AI | Google Gemini 2.0 Flash (`@google/genai`) |
| Dev tooling | concurrently, dotenv |

---

## Project Structure

```
ai-notebot/
├── server/
│   ├── index.js              # Express entry point
│   ├── routes/
│   │   ├── generate.js       # POST /api/generate (SSE streaming)
│   │   └── notes.js          # CRUD /api/notes
│   ├── services/
│   │   ├── llm.js            # Gemini streaming wrapper
│   │   ├── parser.js         # JSON transcript preprocessor
│   │   └── prompts.js        # System prompt builder
│   └── db/
│       └── database.js       # SQLite helpers (better-sqlite3)
└── src/
    ├── index.html
    ├── css/index.css          # Full design system
    └── js/
        ├── main.js            # App entry point & wiring
        ├── components/
        │   ├── fileUpload.js
        │   ├── promptInput.js
        │   ├── noteViewer.js
        │   ├── sidebar.js
        │   └── toast.js
        └── services/
            ├── api.js         # Fetch wrappers
            └── markdown.js    # marked + KaTeX + hljs renderer
```
