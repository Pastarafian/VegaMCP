# Memory Module — Persistent Knowledge Graph

> **Module:** Memory Graph  
> **Backend:** SQLite + FTS5 (Full-Text Search)  
> **Storage:** `data/memory.db`  
> **Tools Exposed:** 6  
> **Resources Exposed:** 3

---

## 1. Purpose

The Memory Module gives the AI a **persistent, structured memory** that survives across sessions.  
Instead of forgetting architectural decisions, coding style preferences, and bug fix history,  
the AI queries this graph before writing code — eliminating the "amnesia" problem.

---

## 2. Data Model

### 2.1 Entities (Nodes)

```typescript
interface Entity {
  name: string;           // Unique identifier (e.g., "Authentication Service")
  type: string;           // Category (e.g., "service", "convention", "bug-fix")
  domain: string;         // Isolation context (e.g., "project-arch", "coding-style")
  observations: string[]; // Timestamped facts about this entity
  metadata: {
    created_at: string;   // ISO timestamp
    updated_at: string;   // ISO timestamp
    source: string;       // What triggered creation (e.g., "user-request", "auto-detected")
  };
}
```

### 2.2 Relations (Edges)

```typescript
interface Relation {
  from: string;       // Source entity name
  to: string;         // Target entity name
  type: string;       // Relationship type (e.g., "depends_on", "implements", "fixed_by")
  strength: number;   // 0.0 - 1.0 confidence weight
  metadata: {
    created_at: string;
    context: string;  // Why this relationship exists
  };
}
```

### 2.3 Observations

```typescript
interface Observation {
  entity: string;     // Entity this observation belongs to
  content: string;    // The fact (e.g., "Uses JWT tokens for auth")
  timestamp: string;  // When this was observed
}
```

---

## 3. SQLite Schema

```sql
-- Core entities table
CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'concept',
  domain TEXT NOT NULL DEFAULT 'general',
  source TEXT DEFAULT 'user-request',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Full-text search virtual table for entities
CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
  name, type, domain,
  content='entities',
  content_rowid='id'
);

-- Observations table (append-only changelog)
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- Full-text search for observations
CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
  content,
  content='observations',
  content_rowid='id'
);

-- Relations table
CREATE TABLE IF NOT EXISTS relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_entity_id INTEGER NOT NULL,
  to_entity_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'related_to',
  strength REAL NOT NULL DEFAULT 1.0,
  context TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (from_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  FOREIGN KEY (to_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
  UNIQUE(from_entity_id, to_entity_id, type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_entities_domain ON entities(domain);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_observations_entity ON observations(entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(type);
```

---

## 4. Tool Specifications

### 4.1 `create_entities`

Creates one or more knowledge graph entities.

```json
{
  "name": "create_entities",
  "description": "Create new entities (knowledge nodes) in the persistent memory graph. Use this to record architectural decisions, coding conventions, service definitions, bug patterns, and any other structured knowledge worth remembering across sessions.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "entities": {
        "type": "array",
        "description": "Array of entities to create",
        "items": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "Unique name for the entity (e.g., 'Authentication Service', 'camelCase Convention')"
            },
            "type": {
              "type": "string",
              "description": "Entity category: 'service', 'convention', 'pattern', 'bug-fix', 'dependency', 'config', 'concept'",
              "enum": ["service", "convention", "pattern", "bug-fix", "dependency", "config", "concept"]
            },
            "domain": {
              "type": "string",
              "description": "Isolation domain: 'project-arch', 'coding-style', 'bug-history', 'dependencies', 'general'",
              "default": "general"
            },
            "observations": {
              "type": "array",
              "items": { "type": "string" },
              "description": "Initial facts about this entity"
            }
          },
          "required": ["name", "type"]
        }
      }
    },
    "required": ["entities"]
  }
}
```

### 4.2 `create_relations`

Links entities with typed, weighted relationships.

```json
{
  "name": "create_relations",
  "description": "Create relationships between existing entities in the memory graph. Use this to map dependencies, ownership, inheritance, and causal links between knowledge nodes.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "relations": {
        "type": "array",
        "description": "Array of relations to create",
        "items": {
          "type": "object",
          "properties": {
            "from": {
              "type": "string",
              "description": "Source entity name"
            },
            "to": {
              "type": "string",
              "description": "Target entity name"
            },
            "type": {
              "type": "string",
              "description": "Relationship type: 'depends_on', 'implements', 'uses', 'fixed_by', 'related_to', 'contains', 'overrides'",
              "enum": ["depends_on", "implements", "uses", "fixed_by", "related_to", "contains", "overrides"]
            },
            "strength": {
              "type": "number",
              "description": "Confidence weight from 0.0 to 1.0",
              "minimum": 0,
              "maximum": 1,
              "default": 1.0
            },
            "context": {
              "type": "string",
              "description": "Why this relationship exists"
            }
          },
          "required": ["from", "to", "type"]
        }
      }
    },
    "required": ["relations"]
  }
}
```

### 4.3 `add_observations`

Appends timestamped facts to an existing entity without overwriting.

```json
{
  "name": "add_observations",
  "description": "Add new observations (facts) to an existing entity. Observations are append-only — they never overwrite previous facts, creating a changelog of knowledge over time.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "entity": {
        "type": "string",
        "description": "Name of the entity to add observations to"
      },
      "observations": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Array of fact strings to append"
      }
    },
    "required": ["entity", "observations"]
  }
}
```

### 4.4 `search_graph`

Full-text + fuzzy search across the entire graph.

```json
{
  "name": "search_graph",
  "description": "Search the memory graph using full-text search. Searches entity names, types, domains, and observation content. Returns matching entities with their observations and relations. Use this to recall past decisions, find related concepts, or check if something has been recorded before.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Search query (supports FTS5 syntax: AND, OR, NOT, phrase matching with quotes)"
      },
      "domain": {
        "type": "string",
        "description": "Optional domain filter to narrow results"
      },
      "type": {
        "type": "string",
        "description": "Optional entity type filter"
      },
      "limit": {
        "type": "number",
        "description": "Maximum number of results to return",
        "default": 10,
        "maximum": 50
      }
    },
    "required": ["query"]
  }
}
```

### 4.5 `open_nodes`

Retrieve specific entities by exact name.

```json
{
  "name": "open_nodes",
  "description": "Retrieve one or more specific entities by their exact names, including all their observations and relationships. Use this when you know the exact entity name and need its full context.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "names": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Array of entity names to retrieve"
      }
    },
    "required": ["names"]
  }
}
```

### 4.6 `delete_entities`

Removes entities and cascades relation deletion.

```json
{
  "name": "delete_entities",
  "description": "Delete entities from the memory graph. This also removes all relationships and observations associated with the deleted entities. Use sparingly — only when information is confirmed wrong or obsolete.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "names": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Array of entity names to delete"
      }
    },
    "required": ["names"]
  }
}
```

---

## 5. Resource Specifications

### 5.1 `memory://entities`

Returns a JSON array of all entities with observation counts.

### 5.2 `memory://entities/{domain}`

Returns entities filtered by domain (e.g., `memory://entities/coding-style`).

### 5.3 `memory://relations`

Returns all relationships as a flat list of `{ from, to, type, strength }` objects.

---

## 6. Search Strategy

The search pipeline operates in three stages:

1. **FTS5 Search**: SQLite full-text search on entity names and observation content  
2. **Domain Filter**: Optional narrowing by domain  
3. **Relation Expansion**: For each matching entity, fetch its direct relations (1-hop)

This provides fast, relevant results without the complexity of embedding-based search  
while still supporting fuzzy matching via FTS5's built-in tokenizer.

---

## 7. Automatic Memory Triggers

The AI should autonomously call memory tools when:

- ✅ A significant architectural decision is made
- ✅ A complex bug is fixed (record the cause and fix)
- ✅ The user states a preference or convention
- ✅ A new service or dependency is introduced
- ✅ A relationship between components is discovered
- ❌ Routine code edits (too noisy)
- ❌ Temporary debugging steps (not worth recording)
