#!/usr/bin/env python3
"""
VegaClaw VPS Swarm Orchestrator
===============================
This script coordinates agentic coding tasks across an entire fleet of VPS nodes.
It uses `agentic_pilot.py` to drive the Antigravity IDE on each node remotely.

Prerequisites:
  - Each VPS must have `vegaclaw.pyw` running.
  - Port 4242 must be accessible (via reverse proxy, SSH tunnel, or VPN).

Usage:
  python vps_swarm_coding.py --task update_db.txt --nodes 192.168.1.10,192.168.1.11
"""

import sys
import os
import argparse
import json
import concurrent.futures
import subprocess
from datetime import datetime

# Assume agentic_pilot.py is in the same directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PILOT_SCRIPT = os.path.join(SCRIPT_DIR, "agentic_pilot.py")

def run_on_node(node_ip, port, prompt_file, max_rounds):
    """Run the agentic pilot on a single node."""
    log_prefix = f"[{node_ip}:{port}]"
    print(f"{log_prefix} Starting agentic task...")
    
    cmd = [
        sys.executable, PILOT_SCRIPT,
        "--file", prompt_file,
        "--host", node_ip,
        "--port", str(port),
        "--autonomous",
        "--max-rounds", str(max_rounds),
        "--quiet"  # Keep standard output clean, it logs to file anyway
    ]
    
    try:
        # Run subprocess and capture output
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        
        if result.returncode == 0:
            return f"{log_prefix} SUCCESS"
        else:
            return f"{log_prefix} FAILED: {result.stderr.strip()}"
    except subprocess.TimeoutExpired:
        return f"{log_prefix} TIMEOUT waiting for task to complete"
    except Exception as e:
        return f"{log_prefix} ERROR: {str(e)}"

def main():
    parser = argparse.ArgumentParser(description="VPS Swarm Coding Orchestrator")
    parser.add_argument("--task", required=True, help="Text file containing sequence of prompts")
    parser.add_argument("--nodes", required=True, help="Comma-separated list of VPS IPs")
    parser.add_argument("--port", type=int, default=4242, help="VegaClaw Bridge port (default 4242)")
    parser.add_argument("--parallel", action="store_true", help="Run on all nodes simultaneously")
    parser.add_argument("--max-rounds", type=int, default=30, help="Max auto-continue rounds")
    args = parser.parse_args()

    if not os.path.exists(args.task):
        print(f"Error: Task file {args.task} not found.")
        sys.exit(1)

    nodes = [n.strip() for n in args.nodes.split(",") if n.strip()]
    
    print(f"\n=======================================================")
    print(f" VEGACLAW VPS SWARM ORCHESTRATOR")
    print(f"=======================================================")
    print(f" Task File : {args.task}")
    print(f" Nodes     : {len(nodes)} {nodes}")
    print(f" Mode      : {'Parallel' if args.parallel else 'Sequential'}")
    print(f"=======================================================\n")

    start_time = datetime.now()
    results = []

    if args.parallel:
        print("Deploying tasks to swarm concurrently...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(nodes)) as executor:
            future_to_node = {executor.submit(run_on_node, n, args.port, args.task, args.max_rounds): n for n in nodes}
            for future in concurrent.futures.as_completed(future_to_node):
                node = future_to_node[future]
                try:
                    res = future.result()
                    results.append(res)
                    print(res)
                except Exception as exc:
                    print(f"[{node}] generated an exception: {exc}")
    else:
        print("Deploying tasks to swarm sequentially...")
        for node in nodes:
            res = run_on_node(node, args.port, args.task, args.max_rounds)
            results.append(res)
            print(res)

    duration = datetime.now() - start_time
    print(f"\n=======================================================")
    print(f" SWARM OPERATION COMPLETE")
    print(f" Total Time: {duration}")
    print(f" Logs saved to: %TEMP%\\vegaclaw_pilot\\")
    print(f"=======================================================\n")

if __name__ == "__main__":
    main()
