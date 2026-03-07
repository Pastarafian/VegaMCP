# 🧠 Memory Tools & Features

VegaMCP provides a dual-layer memory system to ensure autonomous agents can perfectly recall long-term context, understand project structure, and access semantic embeddings over time. 

## 1. Semantic Memory Engine (`semantic_memory`)
The Semantic Memory Engine uses vector embeddings (generated locally via Ollama) to store and retrieve chunks of knowledge based on *meaning* rather than exact keywords.

### How It Works
When you store a memory, the content is piped through `nomic-embed-text` to generate a high-dimensional vector. When you search, the engine calculates the **cosine similarity** between your query and stored memories, returning the most semantically relevant results. If Ollama is unavailable, the tool automatically falls back to a fast TF-IDF keyword algorithm.

### Tool Actions
- `store`: Saves content with optional tags and projects.
- `recall`: Vector-based semantic search with time-decay weighting (recent memories score slightly higher).
- `search`: Pure keyword fallback search.
- `context_build`: Provide a task description, and it will format the top matching memories into a prompt-ready context block.
- `forget`: Soft-delete/archiving.
- `list` / `tag` / `stats`.

### Tutorial: Building Context for a New Task
1. Use the `store` action to save important API keys, design decisions, and architectural notes into memory. Be sure to tag them (e.g., `["project:vega", "type:architecture"]`).
2. When starting a complex task, call the `context_build` action using your current prompt as the `task_description`. 
3. The engine will automatically fetch the 5-10 most relevant historical memories and format them into a string. Inject this string into your agent's system prompt to give it instant situational awareness.

## 2. Knowledge Graph (`memory` / `knowledge_engine`)
While Semantic Memory handles fuzzy concepts, the Knowledge Graph handles strict entities and relationships (`Node A -> [RELATES_TO] -> Node B`).

### How It Works
It maintains a JSON-backed directed graph. Agents can define entities (e.g., `Class: DatabaseController`) and link them to others (e.g., `depends_on -> Service: Postgres`). 

### Tool Actions
- `create_entity`: Add a new node.
- `create_relation`: Link two nodes.
- `search_nodes`: Find nodes by property.
- `graph_rag`: Combine graph traversal with vector similarity for advanced retrieval.

### Tutorial: Project Mapping
1. As your agent reads code, have it define entities for every major class or file.
2. Link them using relations (e.g., `imports`, `extends`, `implements`).
3. Later, when an agent needs to refactor a class, it can query the graph to immediately find all dependent entities without having to parse the codebase again.
