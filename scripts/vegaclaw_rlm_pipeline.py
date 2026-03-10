#!/usr/bin/env python3
"""
VegaClaw RLM Pipeline — 24/7 Autonomous Self-Improving Software Factory
========================================================================
Adapted from the MQClaw FORGE RLM Engine.

This pipeline runs continuously on a VPS, using a LOCAL Ollama model to:
  1. IDEATE — Invent novel project ideas aligned to a configurable GOAL
  2. GENERATE — Write full project specs + multi-step implementation prompts
  3. EXECUTE — Drive the Antigravity IDE via the VegaClaw Agentic Bridge
  4. EVALUATE — Score the project outcome (did it build? did it run? quality?)
  5. LEARN — RLM records what worked vs failed, feeding learnings back into future ideation

The system is goal-directed. Example goals:
  - "Create websites that generate ad revenue"
  - "Build SaaS tools that solve real problems"
  - "Develop trading bots and financial dashboards"
  - "Create viral web games and interactive experiences"

Usage:
  python vegaclaw_rlm_pipeline.py --goal "Create beautiful websites that make money with ad revenue" --ollama http://localhost:11434
  python vegaclaw_rlm_pipeline.py --goal "Build utility tools and SaaS products" --bridge 10.0.0.5:4242
"""

from __future__ import annotations
import os, sys, json, time, re, hashlib, argparse
from datetime import datetime
from collections import Counter
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field, asdict

# ═══════════════════════════════════════════════════════════════
# RLM ENGINE — Reinforcement Learning from Memory
# ═══════════════════════════════════════════════════════════════

@dataclass
class ProjectFeatures:
    """Extracted features from a generated project for pattern learning."""
    project_id: str = ""
    project_type: str = ""             # webapp, game, tool, saas, dashboard, api
    tech_stack: List[str] = field(default_factory=list)
    monetization: str = ""             # ads, subscription, freemium, none
    complexity: str = ""               # simple, medium, complex
    has_backend: bool = False
    has_database: bool = False
    has_auth: bool = False
    has_api: bool = False
    has_responsive: bool = False
    uses_ai: bool = False
    uses_realtime: bool = False
    framework: str = ""
    css_approach: str = ""             # tailwind, vanilla, bootstrap, styled
    prompt_tokens: int = 0
    generation: int = 0
    goal_alignment_score: float = 0.0  # How well it matched the stated goal

class RLMEngine:
    """
    Reinforcement Learning from Memory.
    Learns what project types, tech stacks, and approaches succeed vs fail.
    """

    def __init__(self, db_path: str = None):
        self.db_path = db_path or os.path.join(
            os.environ.get("TEMP", "/tmp"), "vegaclaw_rlm.json"
        )
        self._data = self._load()

    def _load(self) -> Dict:
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {
            "winners": [],
            "losers": [],
            "patterns": {"winning": {}, "losing": {}},
            "generation_count": 0,
            "goal_history": [],
            "stats": {"total_evaluated": 0, "total_winners": 0, "total_losers": 0}
        }

    def _save(self):
        os.makedirs(os.path.dirname(self.db_path) or ".", exist_ok=True)
        with open(self.db_path, 'w') as f:
            json.dump(self._data, f, indent=2, default=str)

    def extract_features(self, spec: Dict, project_id: str = None) -> ProjectFeatures:
        """Extract features from a project specification."""
        f = ProjectFeatures()
        f.project_id = project_id or hashlib.md5(json.dumps(spec).encode()).hexdigest()[:12]

        desc = json.dumps(spec).lower()

        # Project type
        for ptype, keywords in {
            "webapp": ["website", "web app", "landing page", "portfolio"],
            "game": ["game", "arcade", "puzzle", "rpg", "platformer"],
            "tool": ["tool", "utility", "calculator", "converter", "generator"],
            "saas": ["saas", "subscription", "dashboard", "analytics"],
            "api": ["api", "backend", "server", "microservice"],
            "ecommerce": ["store", "shop", "ecommerce", "marketplace"],
        }.items():
            if any(k in desc for k in keywords):
                f.project_type = ptype
                break
        if not f.project_type:
            f.project_type = "webapp"

        # Tech stack detection
        for tech, keywords in {
            "React": ["react"], "Vue": ["vue"], "Svelte": ["svelte"],
            "Next.js": ["next.js", "nextjs"], "Vite": ["vite"],
            "Express": ["express"], "FastAPI": ["fastapi"], "Flask": ["flask"],
            "Node.js": ["node"], "Python": ["python"],
            "TypeScript": ["typescript", "tsx"], "MongoDB": ["mongodb", "mongo"],
            "PostgreSQL": ["postgres", "postgresql"], "SQLite": ["sqlite"],
            "Tailwind": ["tailwind"], "Three.js": ["three.js", "threejs", "webgl"],
            "Socket.io": ["socket.io", "websocket"], "Stripe": ["stripe"],
        }.items():
            if any(k in desc for k in keywords):
                f.tech_stack.append(tech)

        # Monetization
        for strategy, keywords in {
            "ads": ["ad revenue", "adsense", "advertising", "display ads", "monetize with ads"],
            "subscription": ["subscription", "recurring", "monthly plan", "premium tier"],
            "freemium": ["freemium", "free tier", "upgrade", "pro plan"],
            "one-time": ["one-time", "purchase", "buy"],
        }.items():
            if any(k in desc for k in keywords):
                f.monetization = strategy
                break
        if not f.monetization:
            f.monetization = "none"

        # Complexity
        tech_count = len(f.tech_stack)
        if tech_count >= 5:
            f.complexity = "complex"
        elif tech_count >= 3:
            f.complexity = "medium"
        else:
            f.complexity = "simple"

        # Boolean features
        f.has_backend = any(k in desc for k in ["backend", "server", "api", "express", "fastapi", "flask"])
        f.has_database = any(k in desc for k in ["database", "mongo", "postgres", "sqlite", "supabase"])
        f.has_auth = any(k in desc for k in ["auth", "login", "signup", "user account"])
        f.has_api = any(k in desc for k in ["api", "endpoint", "rest", "graphql"])
        f.has_responsive = any(k in desc for k in ["responsive", "mobile", "adaptive"])
        f.uses_ai = any(k in desc for k in ["ai", "machine learning", "gpt", "ollama", "llm"])
        f.uses_realtime = any(k in desc for k in ["realtime", "real-time", "websocket", "live"])

        # Framework / CSS
        f.framework = f.tech_stack[0] if f.tech_stack else "vanilla"
        if "Tailwind" in f.tech_stack:
            f.css_approach = "tailwind"
        elif "styled" in desc:
            f.css_approach = "styled-components"
        else:
            f.css_approach = "vanilla"

        return f

    def record_result(self, spec: Dict, features: ProjectFeatures,
                      build_result: Dict, success: bool, fitness: float):
        """Record a project outcome for RLM learning."""
        entry = {
            "id": features.project_id,
            "features": asdict(features),
            "spec": spec,
            "result": build_result,
            "fitness": fitness,
            "success": success,
            "timestamp": time.time(),
        }

        if success:
            self._data["winners"].append(entry)
            self._data["stats"]["total_winners"] += 1
        else:
            self._data["losers"].append(entry)
            self._data["stats"]["total_losers"] += 1

        self._data["stats"]["total_evaluated"] += 1
        self._data["generation_count"] += 1
        self._update_patterns()
        self._save()

    def _update_patterns(self):
        """Analyze winners vs losers to extract meta-patterns."""
        win_features = [w["features"] for w in self._data["winners"]]
        lose_features = [l["features"] for l in self._data["losers"]]

        if not win_features and not lose_features:
            return

        win_types = Counter(f.get("project_type", "") for f in win_features)
        lose_types = Counter(f.get("project_type", "") for f in lose_features)

        win_tech = Counter()
        for f in win_features:
            for t in f.get("tech_stack", []):
                win_tech[t] += 1

        lose_tech = Counter()
        for f in lose_features:
            for t in f.get("tech_stack", []):
                lose_tech[t] += 1

        win_monetization = Counter(f.get("monetization", "") for f in win_features)
        lose_monetization = Counter(f.get("monetization", "") for f in lose_features)

        self._data["patterns"] = {
            "winning": {
                "project_types": dict(win_types.most_common(5)),
                "top_tech": dict(win_tech.most_common(10)),
                "monetization": dict(win_monetization.most_common(5)),
                "backend_rate": sum(1 for f in win_features if f.get("has_backend")) / max(len(win_features), 1),
                "auth_rate": sum(1 for f in win_features if f.get("has_auth")) / max(len(win_features), 1),
                "ai_rate": sum(1 for f in win_features if f.get("uses_ai")) / max(len(win_features), 1),
                "avg_tech_count": sum(len(f.get("tech_stack", [])) for f in win_features) / max(len(win_features), 1),
            },
            "losing": {
                "project_types": dict(lose_types.most_common(5)),
                "top_tech": dict(lose_tech.most_common(10)),
                "monetization": dict(lose_monetization.most_common(5)),
                "backend_rate": sum(1 for f in lose_features if f.get("has_backend")) / max(len(lose_features), 1),
                "auth_rate": sum(1 for f in lose_features if f.get("has_auth")) / max(len(lose_features), 1),
                "ai_rate": sum(1 for f in lose_features if f.get("uses_ai")) / max(len(lose_features), 1),
                "avg_tech_count": sum(len(f.get("tech_stack", [])) for f in lose_features) / max(len(lose_features), 1),
            }
        }

    def get_rlm_context(self) -> str:
        """Generate a human-readable RLM context block for prompt injection."""
        patterns = self._data.get("patterns", {})
        win = patterns.get("winning", {})
        lose = patterns.get("losing", {})
        stats = self._data.get("stats", {})

        lines = []
        lines.append(f"=== RLM LEARNINGS ({stats.get('total_evaluated', 0)} projects evaluated, "
                      f"{stats.get('total_winners', 0)} successes, {stats.get('total_losers', 0)} failures) ===")

        if win.get("project_types"):
            lines.append("\n[WINNING PATTERNS — Do more of this:]")
            for ptype, count in win["project_types"].items():
                lines.append(f"  ✅ Project type '{ptype}' succeeded {count} time(s)")
            for tech, count in win.get("top_tech", {}).items():
                lines.append(f"  ✅ Technology '{tech}' used in {count} winning project(s)")
            if win.get("backend_rate", 0) > 0.6:
                lines.append("  ✅ Having a backend increases success rate")
            if win.get("ai_rate", 0) > 0.4:
                lines.append("  ✅ AI integration correlates with success")

        if lose.get("project_types"):
            lines.append("\n[LOSING PATTERNS — Avoid this:]")
            for ptype, count in lose["project_types"].items():
                lines.append(f"  ❌ Project type '{ptype}' failed {count} time(s)")
            for tech, count in lose.get("top_tech", {}).items():
                lines.append(f"  ❌ Technology '{tech}' appeared in {count} failing project(s)")
            avg_tc = lose.get("avg_tech_count", 0)
            if avg_tc > 5:
                lines.append(f"  ❌ Over-engineering with too many techs (avg {avg_tc:.1f}) leads to failure")

        if not win.get("project_types") and not lose.get("project_types"):
            lines.append("\n[No historical data yet — exploring freely]")

        return "\n".join(lines)

    def stats(self) -> Dict:
        return {
            **self._data["stats"],
            "generation_count": self._data["generation_count"],
            "win_rate": round(self._data["stats"]["total_winners"] /
                              max(self._data["stats"]["total_evaluated"], 1), 3),
        }


# ═══════════════════════════════════════════════════════════════
# OLLAMA LOCAL MODEL INTERFACE
# ═══════════════════════════════════════════════════════════════

class OllamaClient:
    """Interfaces with a local Ollama LLM for code/idea generation."""

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "llama3"):
        self.base_url = base_url.rstrip("/")
        self.model = model

    def generate(self, prompt: str, system: str = "", temperature: float = 0.8) -> str:
        """Generate text from the local model."""
        import requests
        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": system,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": 4096}
        }
        try:
            r = requests.post(f"{self.base_url}/api/generate", json=payload, timeout=120)
            if r.ok:
                return r.json().get("response", "")
            else:
                return f"[OLLAMA ERROR: {r.status_code}]"
        except Exception as e:
            return f"[OLLAMA UNREACHABLE: {e}]"

    def is_alive(self) -> bool:
        import requests
        try:
            r = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return r.ok
        except:
            return False

    def list_models(self) -> List[str]:
        import requests
        try:
            r = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if r.ok:
                return [m["name"] for m in r.json().get("models", [])]
        except:
            pass
        return []


# ═══════════════════════════════════════════════════════════════
# AGENTIC BRIDGE CLIENT
# ═══════════════════════════════════════════════════════════════

class BridgeClient:
    """Communicates with vegaclaw.pyw HTTP bridge to drive Antigravity."""

    def __init__(self, host: str = "127.0.0.1", port: int = 4242):
        self.url = f"http://{host}:{port}"

    def health(self) -> bool:
        import requests
        try:
            return requests.get(f"{self.url}/api/health", timeout=3).ok
        except:
            return False

    def inject(self, prompt: str) -> bool:
        import requests
        try:
            r = requests.post(f"{self.url}/api/inject",
                              json={"prompt": prompt}, timeout=5)
            return r.ok
        except:
            return False

    def status(self) -> Dict:
        import requests
        try:
            return requests.get(f"{self.url}/api/status", timeout=5).json()
        except:
            return {"busy": False, "connected": False}

    def read_last(self) -> str:
        import requests
        try:
            r = requests.get(f"{self.url}/api/read", timeout=5)
            return r.json().get("text", "")
        except:
            return ""

    def wait_for_idle(self, timeout: int = 600, poll: float = 3.0) -> str:
        """Wait until the AI finishes generating."""
        start = time.time()
        last_text = ""
        stable_since = None

        while time.time() - start < timeout:
            s = self.status()
            if s.get("busy", False):
                stable_since = None
                time.sleep(poll)
                continue

            current = self.read_last()
            if current and current != last_text:
                last_text = current
                stable_since = time.time()
                time.sleep(poll)
                continue

            if stable_since and (time.time() - stable_since) > 15:
                return last_text

            if not stable_since:
                stable_since = time.time()

            time.sleep(poll)

        return last_text


# ═══════════════════════════════════════════════════════════════
# THE PIPELINE ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════

class VegaRLMPipeline:
    """
    The main 24/7 autonomous software factory.
    
    Loop:
    1. IDEATE  — Local LLM invents a project idea aligned to the GOAL
    2. PLAN    — LLM writes the step-by-step Antigravity prompts
    3. EXECUTE — Inject prompts into Antigravity IDE via bridge
    4. EVALUATE — Score outcome (build success, complexity, goal alignment)
    5. LEARN   — RLM records results, patterns feed into next ideation
    6. REPEAT  — Forever
    """

    def __init__(self, goal: str, ollama_url: str = "http://localhost:11434",
                 model: str = "llama3", bridge_host: str = "127.0.0.1",
                 bridge_port: int = 4242, max_steps: int = 30):
        self.goal = goal
        self.llm = OllamaClient(base_url=ollama_url, model=model)
        self.bridge = BridgeClient(host=bridge_host, port=bridge_port)
        self.rlm = RLMEngine()
        self.max_steps = max_steps
        self.running = False
        self.epoch = 0

    def log(self, msg: str, level: str = "INFO"):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] [{level}] {msg}")

    # ─── Phase 1: IDEATION ──────────────────────────────────────

    def ideate(self) -> Optional[Dict]:
        """Use the local LLM to invent a project idea."""
        rlm_context = self.rlm.get_rlm_context()

        prompt = f"""You are an autonomous software ideation engine. Your permanent goal is:

"{self.goal}"

{rlm_context}

Based on the goal and learnings above, invent ONE novel, creative, and PRACTICAL software project.
It MUST be buildable as a single-page or multi-page web application within a code editor.
It MUST align with the stated goal.
Make it unique — do NOT repeat generic ideas like plain calculators or to-do lists.

Respond with ONLY a JSON object:
{{
  "name": "Creative project name",
  "description": "2-3 sentence summary of what it does and why it's valuable",
  "tech_stack": ["React", "Tailwind", "Vite"],
  "monetization": "How it could make money (ads, subscriptions, etc.)",
  "key_features": ["feature1", "feature2", "feature3"],
  "pages": ["Home", "Dashboard", "Settings"],
  "complexity": "medium",
  "estimated_files": 8
}}"""

        system = ("You are a world-class software architect who specializes in building "
                  "profitable, beautiful web applications. Always respond with valid JSON only.")

        self.log("🧠 Ideating novel project concept...")
        raw = self.llm.generate(prompt, system=system, temperature=0.9)

        # Parse JSON from response
        try:
            match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', raw, re.DOTALL)
            if match:
                spec = json.loads(match.group(0))
                self.log(f"💡 Invented: {spec.get('name', '?')} — {spec.get('description', '?')[:80]}...")
                return spec
        except (json.JSONDecodeError, AttributeError):
            pass

        self.log("Failed to parse ideation response, using fallback", "WARN")
        return {
            "name": "Dynamic Portfolio Generator",
            "description": "A stunning one-page portfolio website with animated sections and dark mode",
            "tech_stack": ["React", "Tailwind", "Vite"],
            "monetization": "ads",
            "key_features": ["animated hero", "project cards", "contact form"],
            "pages": ["Home"],
            "complexity": "medium",
            "estimated_files": 5
        }

    # ─── Phase 2: PLANNING ──────────────────────────────────────

    def plan(self, spec: Dict) -> List[str]:
        """Use the local LLM to generate step-by-step implementation prompts."""
        prompt = f"""You are writing instructions for an AI coding assistant (Antigravity IDE) that will build this project:

Project: {spec.get('name', 'Unknown')}
Description: {spec.get('description', '')}
Tech Stack: {', '.join(spec.get('tech_stack', ['HTML', 'CSS', 'JS']))}
Key Features: {', '.join(spec.get('key_features', []))}
Pages: {', '.join(spec.get('pages', ['Home']))}

Write a series of 3-6 SEQUENTIAL prompts that the coding AI should receive to build this project from scratch.
Each prompt should be a self-contained instruction that builds on the previous step.

Rules:
- First prompt should set up the project (e.g., "Create a new Vite+React project")
- Middle prompts should build core features one at a time
- Last prompt should polish the UI and ensure everything works
- Each prompt should be 1-3 sentences, direct and actionable
- Do NOT include numbered lists inside the prompts — just natural instructions

Respond with a JSON array of strings:
["First prompt here", "Second prompt here", "Third prompt here"]"""

        system = "You are an expert at breaking down software projects into clear, sequential build steps. Always respond with a valid JSON array of strings."

        self.log("📋 Planning implementation steps...")
        raw = self.llm.generate(prompt, system=system, temperature=0.5)

        try:
            match = re.search(r'\[.*\]', raw, re.DOTALL)
            if match:
                steps = json.loads(match.group(0))
                if isinstance(steps, list) and all(isinstance(s, str) for s in steps):
                    self.log(f"📋 Generated {len(steps)} implementation steps")
                    return steps[:8]  # Cap at 8 steps
        except:
            pass

        # Fallback
        self.log("Could not parse LLM plan, using generic steps", "WARN")
        return [
            f"Create a new Vite+React+Tailwind project called '{spec.get('name', 'my-app').lower().replace(' ', '-')}'. Set it up with a modern dark-theme design system.",
            f"Build the main page with these features: {', '.join(spec.get('key_features', ['hero section', 'content area']))}. Make it visually stunning with gradients and animations.",
            f"Add ad placeholder sections and a footer with revenue integration points. Polish all responsive layouts and micro-animations. Ensure the dev server runs correctly."
        ]

    # ─── Phase 3: EXECUTION ─────────────────────────────────────

    def execute(self, steps: List[str]) -> Dict:
        """Drive the Antigravity IDE through each step via the bridge."""
        results = {"steps_completed": 0, "steps_total": len(steps), "responses": []}

        for i, step in enumerate(steps):
            self.log(f"⚡ Injecting Step {i+1}/{len(steps)}: {step[:80]}...")

            if not self.bridge.inject(step):
                self.log(f"Bridge injection failed for step {i+1}", "ERROR")
                break

            # Wait small beat for the prompt to register
            time.sleep(2.0)

            # Wait for AI to finish
            response = self.bridge.wait_for_idle(timeout=300)
            results["responses"].append(response[:500] if response else "")
            results["steps_completed"] = i + 1

            if response:
                self.log(f"✅ Step {i+1} complete ({len(response)} chars)")

                # Check if AI asked a question, auto-continue
                lower = (response[-500:] if response else "").lower()
                needs_continue = any(p in lower for p in [
                    "would you like", "shall i", "do you want",
                    "let me know", "should i", "ready to", "want me to"
                ])
                if needs_continue:
                    self.log("  ↳ AI asked a question, auto-replying 'Yes, continue'")
                    self.bridge.inject("Yes, continue building. Do not stop.")
                    time.sleep(1)
                    self.bridge.wait_for_idle(timeout=300)
            else:
                self.log(f"⚠️ Step {i+1} got no response", "WARN")

            # Brief pause between steps
            time.sleep(3)

        return results

    # ─── Phase 4: EVALUATION ────────────────────────────────────

    def evaluate(self, spec: Dict, exec_result: Dict) -> tuple:
        """Score the project outcome. Returns (success: bool, fitness: float)."""
        steps_done = exec_result.get("steps_completed", 0)
        steps_total = exec_result.get("steps_total", 1)
        responses = exec_result.get("responses", [])

        completion_rate = steps_done / max(steps_total, 1)

        # Heuristic scoring
        fitness = 0.0

        # Completion bonus (max 40 pts)
        fitness += completion_rate * 40

        # Response quality (max 30 pts)
        total_response_chars = sum(len(r) for r in responses)
        if total_response_chars > 5000:
            fitness += 30
        elif total_response_chars > 2000:
            fitness += 20
        elif total_response_chars > 500:
            fitness += 10

        # Check for error signals (deductions)
        error_keywords = ["error", "failed", "cannot", "not found", "exception"]
        error_count = sum(1 for r in responses for k in error_keywords if k in r.lower())
        fitness -= min(error_count * 3, 15)

        # Success keywords (bonus max 20 pts)
        success_keywords = ["successfully", "created", "running", "localhost", "ready", "deployed"]
        success_count = sum(1 for r in responses for k in success_keywords if k in r.lower())
        fitness += min(success_count * 4, 20)

        # Goal alignment bonus (max 10 pts)
        goal_lower = self.goal.lower()
        spec_lower = json.dumps(spec).lower()
        alignment_words = [w for w in goal_lower.split() if len(w) > 3 and w in spec_lower]
        fitness += min(len(alignment_words) * 2, 10)

        fitness = max(0, min(100, fitness))
        success = fitness >= 50 and completion_rate >= 0.5

        return success, round(fitness, 1)

    # ─── Phase 5: LEARNING ──────────────────────────────────────

    def learn(self, spec: Dict, exec_result: Dict, success: bool, fitness: float):
        """Record the result in the RLM database."""
        features = self.rlm.extract_features(spec, f"epoch{self.epoch}_{int(time.time())}")
        features.generation = self.epoch
        features.goal_alignment_score = fitness

        self.rlm.record_result(spec, features, exec_result, success, fitness)

        stats = self.rlm.stats()
        self.log(f"📊 RLM Stats: {stats['total_evaluated']} evaluated, "
                 f"{stats['total_winners']} wins, {stats['win_rate']*100:.0f}% win rate")

    # ─── THE INFINITE LOOP ──────────────────────────────────────

    def run_forever(self):
        """Start the 24/7 autonomous pipeline."""
        self.running = True
        self.log("=" * 60)
        self.log("🚀 VEGACLAW RLM PIPELINE — ACTIVATED")
        self.log(f"   Goal: {self.goal}")
        self.log(f"   LLM:  {self.llm.model} @ {self.llm.base_url}")
        self.log(f"   Bridge: {self.bridge.url}")
        self.log(f"   RLM DB: {self.rlm.db_path}")
        self.log("=" * 60)

        # Preflight checks
        if not self.llm.is_alive():
            self.log("❌ Ollama is not reachable! Start it first.", "FATAL")
            self.log(f"   Expected at: {self.llm.base_url}", "FATAL")
            models = []
        else:
            models = self.llm.list_models()
            self.log(f"✅ Ollama online. Available models: {models}")

        if not self.bridge.health():
            self.log("⚠️ VegaClaw bridge is not reachable. Will retry each epoch.", "WARN")
        else:
            self.log("✅ VegaClaw bridge online.")

        try:
            while self.running:
                self.epoch += 1
                self.log(f"\n{'━' * 50}")
                self.log(f"🧬 EPOCH {self.epoch}")
                self.log(f"{'━' * 50}")

                # Check bridge health
                if not self.bridge.health():
                    self.log("Bridge offline. Sleeping 30s before retry...", "WARN")
                    time.sleep(30)
                    continue

                # 1. IDEATE
                spec = self.ideate()
                if not spec:
                    self.log("Ideation failed. Retrying in 30s...", "WARN")
                    time.sleep(30)
                    continue

                # 2. PLAN
                steps = self.plan(spec)

                # 3. EXECUTE
                exec_result = self.execute(steps)

                # 4. EVALUATE
                success, fitness = self.evaluate(spec, exec_result)
                verdict = "✅ SUCCESS" if success else "❌ FAILED"
                self.log(f"\n📈 Epoch {self.epoch} Result: {verdict} (Fitness: {fitness}/100)")

                # 5. LEARN
                self.learn(spec, exec_result, success, fitness)

                # Cool down
                cooldown = 30 if success else 15
                self.log(f"💤 Cooling down {cooldown}s before next epoch...")
                time.sleep(cooldown)

        except KeyboardInterrupt:
            self.log("\n⛔ Pipeline interrupted by operator. Saving state...")
            self.rlm._save()
            self.log("State saved. Goodbye!")

    def run_single(self):
        """Run a single epoch (useful for testing)."""
        self.epoch = 1
        spec = self.ideate()
        if spec:
            steps = self.plan(spec)
            result = self.execute(steps)
            success, fitness = self.evaluate(spec, result)
            self.learn(spec, result, success, fitness)
            return {"spec": spec, "success": success, "fitness": fitness}
        return None


# ═══════════════════════════════════════════════════════════════
# CLI ENTRYPOINT
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="VegaClaw RLM Pipeline — 24/7 Autonomous Self-Improving Software Factory",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Revenue-focused website factory
  python vegaclaw_rlm_pipeline.py --goal "Create beautiful websites that generate ad revenue"

  # SaaS tool builder
  python vegaclaw_rlm_pipeline.py --goal "Build SaaS tools that solve real productivity problems"

  # Game factory
  python vegaclaw_rlm_pipeline.py --goal "Create viral browser games and interactive experiences"

  # Connect to remote VPS
  python vegaclaw_rlm_pipeline.py --goal "Build web apps" --bridge 10.0.0.5:4242 --model codellama
        """
    )
    parser.add_argument("--goal", required=True,
                        help="The high-level directive (e.g., 'Create websites that make money with ads')")
    parser.add_argument("--ollama", default="http://localhost:11434",
                        help="Ollama API URL (default: http://localhost:11434)")
    parser.add_argument("--model", default="llama3",
                        help="Ollama model to use (default: llama3)")
    parser.add_argument("--bridge", default="127.0.0.1:4242",
                        help="VegaClaw bridge host:port (default: 127.0.0.1:4242)")
    parser.add_argument("--max-steps", type=int, default=30,
                        help="Max autonomous steps per project (default: 30)")
    parser.add_argument("--single", action="store_true",
                        help="Run a single epoch instead of infinite loop")
    parser.add_argument("--stats", action="store_true",
                        help="Print RLM stats and exit")

    args = parser.parse_args()

    # Parse bridge address
    bridge_parts = args.bridge.split(":")
    bridge_host = bridge_parts[0]
    bridge_port = int(bridge_parts[1]) if len(bridge_parts) > 1 else 4242

    pipeline = VegaRLMPipeline(
        goal=args.goal,
        ollama_url=args.ollama,
        model=args.model,
        bridge_host=bridge_host,
        bridge_port=bridge_port,
        max_steps=args.max_steps,
    )

    if args.stats:
        stats = pipeline.rlm.stats()
        print(json.dumps(stats, indent=2))
        return

    print(f"\n{'═' * 60}")
    print(f" 🔥 VEGACLAW RLM PIPELINE")
    print(f"{'═' * 60}")
    print(f" Goal      : {args.goal}")
    print(f" Model     : {args.model} @ {args.ollama}")
    print(f" Bridge    : {bridge_host}:{bridge_port}")
    print(f" Max Steps : {args.max_steps}")
    print(f" RLM DB    : {pipeline.rlm.db_path}")
    print(f" Mode      : {'Single Epoch' if args.single else '24/7 Infinite Loop'}")
    print(f"{'═' * 60}\n")

    if args.single:
        result = pipeline.run_single()
        if result:
            print(f"\nResult: {'SUCCESS' if result['success'] else 'FAILED'} — Fitness: {result['fitness']}/100")
    else:
        pipeline.run_forever()


if __name__ == "__main__":
    main()
