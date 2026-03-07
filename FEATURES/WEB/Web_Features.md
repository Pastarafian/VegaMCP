# 🌐 Web & Browser Tools

The WEB Omni-Cluster connects the agent swarm to the live internet with tools designed for intelligent research, automated UI testing, and deep web searching.

## 1. Quality-Driven Web Search (`web_search`)
A multi-engine web crawler powered primarily by Tavily (AI Search) with SearXNG fallback capabilities to prevent tracking.

### New v7.2 Features
- **Search Modes**:
  - `speed`: Rapid 3-result search for quick fact-checking.
  - `balanced`: The standard 5-result comprehensive search.
  - `quality`: Fetches 10 deep results, then automatically extracts the raw HTML from the top 3 hits and auto-summarizes them using NLP before returning the payload.
- **Domain Scoping**: Use `domain_filter` to force the search engine to look *only* at specific sites (e.g., `domain_filter: "docs.python.org"`). 
- **Data Provenance**: All scraped snippets are tagged with `[UNVERIFIED_EXTERNAL_DATA]` to prevent implicit prompt injections (IPI) from hijacking the agent.

### Tutorial: Deep Research
1. To research an unfamiliar library, call `web_search` with the action `search`, mode `quality`, and target the specific library domain. 
2. The AI will receive the search snippets *plus* actual paragraphs directly scraped from the top 3 documentation pages.

## 2. Browser Automation (`browser`)
A full-headless Playwright instance that allows the agent to visually and functionally interact with any website.

### How It Works
The browser tool spins up an incognito Chromium instance. It operates by maintaining state across tool calls—meaning you can navigate to a page, wait, then click an element in subsequent tool calls. 

### Tool Actions
- `navigate`: Go to a URL.
- `screenshot`: Capture a Base64 image of the current page.
- `click`: Click an element via CSS selector or text matching.
- `type`: Input text into forms.
- `extract`: Pull structured data (tables, lists) directly from the DOM.
- `execute_js`: Run arbitrary JavaScript in the browser console.

### Tutorial: Automating Logins
1. Call `navigate` to the login URL.
2. Call `type` to fill in the `#username` and `#password` fields.
3. Call `click` on the `"Submit"` button. 
4. Finally, call `screenshot` to visually confirm to yourself that the login was successful.
