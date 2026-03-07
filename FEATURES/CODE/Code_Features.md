# 💻 Code Execution & File Orchestration

The CODE Omni-Cluster provides agents with safe, monitored capabilities to manipulate the local filesystem, execute code in isolated sandboxes, and manage version control.

## 1. Docker Sandbox v5.0 (`sandbox_testing`)
A highly mature, isolated environment for arbitrary code execution. Never run untrusted code on the host machine—use the sandbox.

### Features
- **Profiles**: Pre-configured environments for different tasks (`webdev`, `python-data`, `rust-sys`, `go-api`).
- **Security Tiers**: Run at `paranoid` level (drops all capabilities, read-only filesystem) or `standard`.
- **Package Management**: Install pip/npm/apt packages inside the container on the fly, guarded by a security blocklist (prevents mal-installations).
- **GPU Passthrough**: Automatically detects Nvidia drivers and mounts GPU capabilities for AI/CUDA testing.

### Tutorial: Testing AI Generated Code
Instead of writing a Python script and hoping it works:
1. Call the `execute` action in the sandbox tool with the Python code in the payload.
2. The sandbox will spin up a transient container, execute the script, capture `stdout` and `stderr`, and destroy the container.
3. If the script throws a traceback, the agent can read it, fix the bug, and try again without ever touching the host OS.

## 2. Advanced Filesystem (`REDACTED_filesystem`)
A granular set of tools for safe file I/O operations beyond the standard MCP implementations. Includes features like regex-based search-and-replace, multi-block patching, and directory tree visualization.

## 3. Terminal Automation (`shell` & `git_tools`)
- **Shell**: Run terminal commands. Monitored for long-running processes via an async polling mechanism (SEP-1686 standard).
- **Git**: Fully automated git orchestration (`commit`, `status`, `log`, `branch`, `push`). Allows agents to work on isolated feature branches and submit code autonomously.
