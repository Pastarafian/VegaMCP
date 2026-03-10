#!/usr/bin/env python3
"""
VegaClaw FORGE — 24/7 Autonomous Agentic Pipeline
=================================================
Inspired by the MQClaw Autonomous Coding Pipeline.
This engine turns your VPS nodes into an infinite software factory.
It autonomously ideates novel applications, assigns the ideas to the Antigravity IDEs 
across the VPS swarm, and guides them through completion using the VegaClaw Agentic Bridge.
"""

import sys
import os
import argparse
import json
import time
import subprocess
import concurrent.futures
from datetime import datetime
import textwrap

# Ensure agentic_pilot.py can be found
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PILOT_SCRIPT = os.path.join(SCRIPT_DIR, "agentic_pilot.py")
DB_PATH = os.path.join(os.environ.get("TEMP", "/tmp"), "vegaclaw_forge_db.json")

class VegaForgePipeline:
    def __init__(self, nodes, port=4242, max_rounds=20):
        self.nodes = nodes
        self.port = port
        self.max_rounds = max_rounds
        self.history = self._load_db()

    def _load_db(self):
        if os.path.exists(DB_PATH):
            try:
                with open(DB_PATH, "r") as f:
                    return json.load(f)
            except:
                return {"completed_projects": []}
        return {"completed_projects": []}

    def _save_db(self):
        with open(DB_PATH, "w") as f:
            json.dump(self.history, f, indent=2)

    def log(self, msg):
        ts = datetime.now().strftime("%H:%M:%S")
        print(f"[{ts}] [FORGE] {msg}")

    def generate_ideation_prompt(self, iteration):
        """Generates the prompt that forces Antigravity to invent and build from scratch."""
        # By telling Antigravity to invent something it hasn't before, we achieve the Forge loop.
        prompt = textwrap.dedent(f"""\
            [SYSTEM: VegaClaw FORGE Autonomous Pipeline - Iteration {iteration}]
            You are now operating in 24/7 fully autonomous "Software Factory" mode.
            
            1. Ideate a completely NOVEL, highly creative web application, game, or utility.
            2. Do NOT build a generic to-do list or calculator. Think of something visually stunning and mechanically complex (e.g., a WebGL fluid simulator, a decentralized P2P chat interface, an AI arbitrage dashboard mockup).
            3. Briefly describe your idea and its core technical stack (use Vite/React/Tailwind if appropriate).
            4. Proceed to autonomously BUILD the entire project end-to-end.
            5. Do NOT stop or wait for explicit permission for each file. Use your tools to create the workspace, write the code, and spin up a dev server preview.
            
            Begin your ideation phase now, and transition immediately into implementation. 
            Remember: You are the autonomous architect. I will automatically approve your tool executions in the background via VegaClaw.
        """)
        return prompt

    def run_on_node(self, node_ip, prompt_text):
        """Executes the agentic pilot on a specific node with the generated prompt."""
        self.log(f"Assigning new FORGE task to Node {node_ip}:{self.port}...")
        
        # Write the prompt to a temporary file for the pilot to consume
        task_file = os.path.join(os.environ.get("TEMP", "/tmp"), f"forge_task_{node_ip}_{int(time.time())}.txt")
        with open(task_file, "w") as f:
            f.write(prompt_text)

        cmd = [
            sys.executable, PILOT_SCRIPT,
            "--file", task_file,
            "--host", node_ip,
            "--port", str(self.port),
            "--autonomous",
            "--max-rounds", str(self.max_rounds),
            "--quiet" 
        ]
        
        try:
            # We allow longer timeout for complex FORGE builds (e.g., 2 hours).
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
            
            os.remove(task_file) # Cleanup
            
            if result.returncode == 0:
                self.history["completed_projects"].append({
                    "node": node_ip,
                    "timestamp": datetime.now().isoformat(),
                    "status": "success",
                    "output_tail": result.stdout[-500:] if result.stdout else "No output"
                })
                self._save_db()
                return f"[Node {node_ip}] Build Success!"
            else:
                return f"[Node {node_ip}] Build Failed: {result.stderr.strip()}"
        except subprocess.TimeoutExpired:
            return f"[Node {node_ip}] ERROR: Project build timed out after 2 hours."
        except Exception as e:
            return f"[Node {node_ip}] ERROR: {str(e)}"

    def start_infinite_loop(self):
        self.log(f"Starting 24/7 Autonomous FORGE across {len(self.nodes)} nodes.")
        self.log("Press Ctrl+C to stop the pipeline.")

        iteration = len(self.history["completed_projects"]) + 1

        try:
            while True:
                self.log(f"--- Starting FORGE Epoch {iteration} ---")
                
                # Generate a unique ideation prompt for this distributed epoch
                prompt = self.generate_ideation_prompt(iteration)
                
                # Deploy to swarm in parallel
                with concurrent.futures.ThreadPoolExecutor(max_workers=len(self.nodes)) as executor:
                    futures = {executor.submit(self.run_on_node, n, prompt): n for n in self.nodes}
                    for future in concurrent.futures.as_completed(futures):
                        node = futures[future]
                        try:
                            res = future.result()
                            self.log(f"Result for {node}: {res}")
                        except Exception as exc:
                            self.log(f"Exception on {node}: {exc}")

                self.log("Epoch complete. Nodes are cooling down before the next ideation cycle...")
                iteration += 1
                time.sleep(60) # Rest before hammering the nodes with a new epoch

        except KeyboardInterrupt:
            self.log("FORGE Pipeline interrupted by user. Shutting down gracefully.")

def main():
    parser = argparse.ArgumentParser(description="VegaClaw FORGE Autonomous Fleet Coding Pipeline")
    parser.add_argument("--nodes", required=True, help="Comma-separated list of VPS IPs (e.g., 192.168.1.10)")
    parser.add_argument("--port", type=int, default=4242, help="VegaClaw Bridge port (default 4242)")
    parser.add_argument("--max-rounds", type=int, default=50, help="Max auto-continue rounds per project (default 50)")
    args = parser.parse_args()

    nodes = [n.strip() for n in args.nodes.split(",") if n.strip()]

    print(f"\n=======================================================")
    print(f" 🚀 VEGACLAW FORGE PIPELINE ACTIVATED")
    print(f"=======================================================")
    print(f" Target Nodes : {len(nodes)} {nodes}")
    print(f" Auto-Rounds  : {args.max_rounds} max steps per project")
    print(f" Persistence  : {DB_PATH}")
    print(f"=======================================================\n")

    pipeline = VegaForgePipeline(nodes=nodes, port=args.port, max_rounds=args.max_rounds)
    pipeline.start_infinite_loop()

if __name__ == "__main__":
    main()
