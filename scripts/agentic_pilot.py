#!/usr/bin/env python3
"""
VegaClaw Agentic Pilot — Fully Automated Coding Orchestrator
=============================================================
Drives Antigravity IDE headlessly via the VegaClaw HTTP Bridge.

Usage:
    python agentic_pilot.py "Build a REST API with Express and MongoDB"
    python agentic_pilot.py --file tasks.txt
    python agentic_pilot.py --interactive

The pilot will:
1. Inject prompts into Antigravity's chat
2. Wait for AI to finish responding
3. VegaClaw autoclicker handles Run/Accept/Allow buttons automatically
4. Wait for next AI response after tool execution
5. Repeat until AI completes or no more actions needed
6. Log the full transcript
"""

import requests
import time
import sys
import json
import os
import argparse
from datetime import datetime

DEFAULT_PORT = 4242
POLL_INTERVAL = 2.0        # Seconds between status checks
MAX_WAIT = 600             # Max seconds to wait for AI response (10 min)
IDLE_THRESHOLD = 15        # Seconds of no change = AI is done
LOG_DIR = os.path.join(os.environ.get("TEMP", "/tmp"), "vegaclaw_pilot")


class AgenticPilot:
    def __init__(self, host="127.0.0.1", port=4242, verbose=True):
        self.host = host
        self.port = port
        self.bridge_url = f"http://{host}:{port}"
        self.verbose = verbose
        self.transcript = []
        self.session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        os.makedirs(LOG_DIR, exist_ok=True)
        self.log_file = os.path.join(LOG_DIR, f"session_{self.host.replace('.','_')}_{self.session_id}.log")

    def log(self, msg, level="INFO"):
        ts = datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] [{level}] {msg}"
        if self.verbose:
            print(line)
        with open(self.log_file, "a", encoding="utf-8") as f:
            f.write(line + "\n")

    def health_check(self):
        """Verify VegaClaw bridge is running."""
        try:
            r = requests.get(f"{self.bridge_url}/api/health", timeout=2)
            return r.status_code == 200
        except:
            return False

    def get_status(self):
        """Check if AI is currently busy."""
        try:
            r = requests.get(f"{self.bridge_url}/api/status", timeout=5)
            return r.json()
        except:
            return {"busy": False, "connected": False}

    def read_last_response(self):
        """Get the last assistant message."""
        try:
            r = requests.get(f"{self.bridge_url}/api/read", timeout=5)
            return r.json()
        except:
            return {"ok": False}

    def read_chat(self):
        """Get full chat history."""
        try:
            r = requests.get(f"{self.bridge_url}/api/chat", timeout=5)
            return r.json()
        except:
            return {"ok": False}

    def list_pages(self):
        """List connected Antigravity windows."""
        try:
            r = requests.get(f"{self.bridge_url}/api/pages", timeout=5)
            return r.json()
        except:
            return {"pages": []}

    def inject_prompt(self, prompt):
        """Send a prompt to Antigravity's chat."""
        try:
            r = requests.post(f"{self.bridge_url}/api/inject",
                            json={"prompt": prompt}, timeout=5)
            return r.json()
        except Exception as e:
            return {"error": str(e)}

    def wait_for_idle(self, timeout=None):
        """
        Wait until AI finishes generating.
        Returns the final response text.
        """
        timeout = timeout or MAX_WAIT
        start = time.time()
        last_text = ""
        stable_since = None

        self.log("Waiting for AI to finish...")

        while time.time() - start < timeout:
            status = self.get_status()

            if not status.get("connected", False):
                self.log("Not connected to Antigravity", "WARN")
                time.sleep(POLL_INTERVAL)
                continue

            # Check if actively generating
            if status.get("busy", False):
                stable_since = None
                elapsed = int(time.time() - start)
                if elapsed % 10 == 0:
                    self.log(f"AI generating... ({elapsed}s)")
                time.sleep(POLL_INTERVAL)
                continue

            # Not busy — check if response has stabilized
            resp = self.read_last_response()
            current_text = resp.get("text", "")

            if current_text and current_text != last_text:
                last_text = current_text
                stable_since = time.time()
                time.sleep(POLL_INTERVAL)
                continue

            # Text hasn't changed — check if stable long enough
            if stable_since and (time.time() - stable_since) > IDLE_THRESHOLD:
                self.log(f"AI idle for {IDLE_THRESHOLD}s — response complete.")
                return last_text

            if not stable_since:
                stable_since = time.time()

            time.sleep(POLL_INTERVAL)

        self.log("Timeout waiting for AI response", "WARN")
        return last_text

    def execute_prompt(self, prompt):
        """
        Full lifecycle: inject prompt → wait for completion → return response.
        """
        self.log(f">>> PROMPT: {prompt[:100]}{'...' if len(prompt) > 100 else ''}")
        self.transcript.append({"role": "user", "text": prompt, "time": datetime.now().isoformat()})

        # Inject
        result = self.inject_prompt(prompt)
        if "error" in result:
            self.log(f"Injection failed: {result['error']}", "ERROR")
            return None

        # Small delay for prompt to register
        time.sleep(1.5)

        # Wait for AI to finish
        response = self.wait_for_idle()

        if response:
            self.log(f"<<< RESPONSE: {response[:200]}{'...' if len(response) > 200 else ''}")
            self.transcript.append({"role": "assistant", "text": response, "time": datetime.now().isoformat()})
        else:
            self.log("No response received", "WARN")

        return response

    def run_task(self, prompts):
        """
        Execute a sequence of prompts, waiting for each to complete.
        """
        self.log(f"═══ Starting task with {len(prompts)} prompt(s) ═══")

        for i, prompt in enumerate(prompts):
            self.log(f"─── Step {i+1}/{len(prompts)} ───")
            response = self.execute_prompt(prompt)

            if not response:
                self.log(f"Step {i+1} got no response, continuing...", "WARN")

            # Brief pause between steps
            if i < len(prompts) - 1:
                time.sleep(2)

        self.save_transcript()
        self.log(f"═══ Task complete! {len(self.transcript)} messages logged ═══")

    def run_autonomous(self, initial_prompt, max_rounds=20):
        """
        Autonomous mode: keep going until the AI seems done.
        If the AI asks a question, auto-respond with "Continue" or "Yes".
        """
        self.log(f"═══ Autonomous mode: max {max_rounds} rounds ═══")

        response = self.execute_prompt(initial_prompt)
        rounds = 1

        while rounds < max_rounds:
            if not response:
                break

            # Check if AI is asking a question or waiting for input
            lower = response.lower()[-500:] if response else ""

            # If the response ends with a question or suggestion, auto-continue
            needs_continue = any(phrase in lower for phrase in [
                "would you like", "shall i", "do you want",
                "let me know", "what do you think", "should i",
                "ready to", "want me to"
            ])

            if needs_continue:
                self.log("AI asked a question — auto-responding with 'Yes, continue'")
                response = self.execute_prompt("Yes, continue")
                rounds += 1
                continue

            # Check if there are pending approvals that autoclicker will handle
            status = self.get_status()
            if status.get("pendingApprovals", 0) > 0:
                self.log(f"Waiting for autoclicker to handle {status['pendingApprovals']} approval(s)...")
                time.sleep(5)
                response = self.wait_for_idle()
                continue

            # AI seems done
            self.log("AI appears to have completed the task.")
            break

        self.save_transcript()
        self.log(f"═══ Autonomous run complete: {rounds} rounds, {len(self.transcript)} messages ═══")

    def save_transcript(self):
        """Save the session transcript to disk."""
        path = os.path.join(LOG_DIR, f"transcript_{self.session_id}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.transcript, f, indent=2, ensure_ascii=False)
        self.log(f"Transcript saved: {path}")


def main():
    parser = argparse.ArgumentParser(description="VegaClaw Agentic Pilot — Automated Coding Orchestrator")
    parser.add_argument("prompt", nargs="?", help="Single prompt to execute")
    parser.add_argument("--file", "-f", help="File containing prompts (one per line)")
    parser.add_argument("--interactive", "-i", action="store_true", help="Interactive REPL mode")
    parser.add_argument("--autonomous", "-a", action="store_true", help="Autonomous mode (auto-continue)")
    parser.add_argument("--max-rounds", type=int, default=20, help="Max rounds in autonomous mode")
    parser.add_argument("--quiet", "-q", action="store_true", help="Suppress console output")
    parser.add_argument("--host", default="127.0.0.1", help="Target host/VPS IP (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"Target port (default: {DEFAULT_PORT})")
    args = parser.parse_args()

    pilot = AgenticPilot(host=args.host, port=args.port, verbose=not args.quiet)

    # Health check
    if not pilot.health_check():
        print(f"ERROR: VegaClaw bridge not reachable at {pilot.bridge_url}/api/health")
        print("       Ensure vegaclaw.pyw is running and port is exposed.")
        sys.exit(1)

    pilot.log(f"Connected to VegaClaw bridge at {pilot.bridge_url}")

    # List connected pages
    pages = pilot.list_pages()
    for p in pages.get("pages", []):
        pilot.log(f"  Page: {p.get('title', 'Unknown')}")

    if args.interactive:
        # REPL mode
        pilot.log("Interactive mode — type prompts, 'quit' to exit")
        while True:
            try:
                prompt = input("\n🤖 > ").strip()
                if prompt.lower() in ("quit", "exit", "q"):
                    break
                if not prompt:
                    continue
                pilot.execute_prompt(prompt)
            except (KeyboardInterrupt, EOFError):
                break

    elif args.file:
        # Multi-prompt from file
        with open(args.file, "r", encoding="utf-8") as f:
            prompts = [line.strip() for line in f if line.strip() and not line.startswith("#")]
        pilot.run_task(prompts)

    elif args.prompt:
        if args.autonomous:
            pilot.run_autonomous(args.prompt, max_rounds=args.max_rounds)
        else:
            pilot.execute_prompt(args.prompt)
            pilot.save_transcript()

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
