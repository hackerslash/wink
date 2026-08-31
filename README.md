<h1>wink</h1>

**Bring your models. Keep your data.**

A multi-model AI workspace that runs entirely in your browser. No server, no
account, no telemetry — your conversations, memories and documents live in this
device's IndexedDB, and you decide which model ever sees them.

```bash
npm install
npm run dev
```

## What's inside

- **Any model** — OpenAI, Anthropic, Gemini, anything OpenAI-compatible
  (OpenRouter, Groq, DeepSeek, Mistral, xAI…), plus Ollama and LM Studio on
  localhost. Capabilities are detected per model.
- **Real chat** — streaming, markdown, highlighted code, artifacts with a
  sandboxed preview, reasoning traces, retries, cancel, regenerate, edit,
  branching, and a compare mode that answers with several models at once.
- **Memory** — durable facts are extracted from your chats, stored locally, and
  only the relevant ones get injected. Pin, edit or forget any of them.
- **Knowledge** — drop in PDFs, Markdown, text or code; chunked and embedded in
  a worker, retrieved with cosine + BM25, answered with citations.
- **Tools** — web search, page reading, local document search, calculator,
  sandboxed JavaScript, and any MCP server over HTTP. Every call asks first and
  shows its input, output and duration.
- **Research mode** — plan → search → read → reflect → synthesize, every step
  visible, every claim cited.
- **Yours** — per-provider switches for what may leave the device, API keys
  encrypted with a device key (optionally behind a passphrase vault), full
  backup/restore, Markdown/JSON export, ChatGPT import.

## Good to know

Requests go straight from your browser to the provider, so local servers need
CORS on (`OLLAMA_ORIGINS=*`). Web search and page reading run through an
endpoint you pick — a browser can't crawl. Embeddings default to a built-in
local hashing embedder; point it at a real embedding model for semantic recall.

Design system in [`design.md`](design.md). Stack: React 19, Vite, Tailwind 4,
Base UI, IndexedDB.
