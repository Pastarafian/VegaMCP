"""
VegaMCP FastAPI Bridge — Swarm Endpoints
Exposes VegaMCP swarm operations as REST API endpoints.

Integration: Add these routes to your existing `server.py` via `include_router`.
    from vegamcp_bridge import router as vegamcp_router
    app.include_router(vegamcp_router, prefix="/api/v1/swarm", tags=["VegaMCP Swarm"])
"""

import asyncio
import json
import subprocess
import os
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field

router = APIRouter()

# ═══════════════════════════════════════════════
# MCP CLIENT BRIDGE
# ═══════════════════════════════════════════════

# Path to the VegaMCP server
VEGAMCP_PATH = os.environ.get("VEGAMCP_PATH", os.path.join(os.path.dirname(__file__), "..", "VegaMCP"))
VEGAMCP_SERVER = os.path.join(VEGAMCP_PATH, "build", "index.js")


async def call_mcp_tool(tool_name: str, arguments: dict) -> dict:
    """Call a VegaMCP tool via subprocess (stdio transport)."""
    try:
        # Build MCP JSON-RPC request
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments}
        }

        proc = await asyncio.create_subprocess_exec(
            "node", VEGAMCP_SERVER,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=VEGAMCP_PATH,
        )

        # Send request + EOF
        request_bytes = json.dumps(request).encode()
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(request_bytes),
            timeout=30.0
        )

        if proc.returncode != 0:
            raise HTTPException(500, detail=f"VegaMCP error: {stderr.decode()[:500]}")

        # Parse response
        response = json.loads(stdout.decode().strip().split("\n")[-1])
        if "error" in response:
            raise HTTPException(500, detail=response["error"])

        result = response.get("result", {})
        content = result.get("content", [{}])
        return json.loads(content[0].get("text", "{}")) if content else {}

    except asyncio.TimeoutError:
        raise HTTPException(504, detail="VegaMCP request timed out")
    except json.JSONDecodeError as e:
        raise HTTPException(500, detail=f"Invalid response from VegaMCP: {str(e)}")
    except Exception as e:
        raise HTTPException(500, detail=str(e))


# ═══════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════

class CreateTaskRequest(BaseModel):
    task_type: str = Field(..., description="Task type (research, code_generation, data_analysis, etc.)")
    priority: int = Field(2, ge=0, le=3, description="0=emergency, 1=high, 2=normal, 3=background")
    input_data: Dict[str, Any] = Field(default_factory=dict)
    target_agent: Optional[str] = None
    timeout: int = Field(300, ge=10, le=3600)

class AgentControlRequest(BaseModel):
    action: str = Field(..., description="start, stop, pause, or restart")

class BroadcastRequest(BaseModel):
    message: str
    coordinator: Optional[str] = None
    status: Optional[str] = None

class TriggerRequest(BaseModel):
    trigger_type: str = Field(..., description="schedule, webhook, threshold, manual, event")
    condition: Dict[str, Any]
    action: Dict[str, Any]
    cooldown: int = Field(60, ge=1)
    enabled: bool = True

class PipelineStep(BaseModel):
    step_id: str
    task_type: str
    input: Dict[str, Any] = Field(default_factory=dict)
    on_success: Optional[str] = None
    on_failure: Optional[str] = None

class PipelineRequest(BaseModel):
    name: str
    steps: List[PipelineStep]
    initial_step: str
    priority: int = 2
    timeout: int = 300000

class WorkflowRequest(BaseModel):
    template: Optional[str] = None
    custom_workflow: Optional[Dict[str, Any]] = None
    input: Dict[str, Any] = Field(default_factory=dict)
    priority: int = 2

class ScheduleTaskRequest(BaseModel):
    cron: Optional[str] = Field(None, description="Cron expression (e.g. '*/5 * * * *')")
    interval_ms: Optional[int] = Field(None, description="Interval in milliseconds")
    task_type: str = Field(..., description="Task type to execute")
    input_data: Dict[str, Any] = Field(default_factory=dict)
    priority: int = 2
    enabled: bool = True

class MemorySearchRequest(BaseModel):
    query: str
    domain: Optional[str] = None
    type: Optional[str] = None
    limit: int = Field(10, ge=1, le=100)


# ═══════════════════════════════════════════════
# SWARM MANAGEMENT ENDPOINTS
# ═══════════════════════════════════════════════

@router.get("/status")
async def get_swarm_status():
    """Get comprehensive swarm status: agents, tasks, coordinators."""
    agents = await call_mcp_tool("swarm_list_agents", {})
    metrics = await call_mcp_tool("swarm_get_metrics", {"summary": True})
    return {
        "agents": agents.get("agents", []),
        "totalAgents": agents.get("totalAgents", 0),
        "stats": metrics.get("swarmStats", {}),
        "metricsSummary": metrics.get("metricsSummary", {}),
    }


@router.get("/agents")
async def list_agents(
    coordinator: Optional[str] = Query(None, description="Filter by coordinator (research, quality, operations)"),
    status: Optional[str] = Query(None, description="Filter by status"),
):
    """List all swarm agents with live status."""
    args = {}
    if coordinator:
        args["coordinator"] = coordinator
    if status:
        args["status"] = status
    return await call_mcp_tool("swarm_list_agents", args)


@router.post("/agents/{agent_id}/control")
async def control_agent(agent_id: str, request: AgentControlRequest):
    """Start, stop, pause, or restart an agent."""
    return await call_mcp_tool("swarm_agent_control", {
        "agent_id": agent_id,
        "action": request.action,
    })


@router.post("/broadcast")
async def broadcast_message(request: BroadcastRequest):
    """Broadcast a message to agents."""
    args = {"message": request.message}
    if request.coordinator:
        args["coordinator"] = request.coordinator
    if request.status:
        args["status"] = request.status
    return await call_mcp_tool("swarm_broadcast", args)


# ═══════════════════════════════════════════════
# TASK ENDPOINTS
# ═══════════════════════════════════════════════

@router.post("/tasks")
async def create_task(request: CreateTaskRequest):
    """Create a new swarm task."""
    args = {
        "task_type": request.task_type,
        "priority": request.priority,
        "input_data": request.input_data,
        "timeout": request.timeout,
    }
    if request.target_agent:
        args["target_agent"] = request.target_agent
    return await call_mcp_tool("swarm_create_task", args)


@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """Get task status and output."""
    return await call_mcp_tool("swarm_get_task_status", {"task_id": task_id})


@router.delete("/tasks/{task_id}")
async def cancel_task(task_id: str, reason: str = Query("API request")):
    """Cancel a queued or running task."""
    return await call_mcp_tool("swarm_cancel_task", {"task_id": task_id, "reason": reason})


# ═══════════════════════════════════════════════
# PIPELINE & WORKFLOW ENDPOINTS
# ═══════════════════════════════════════════════

@router.post("/pipelines")
async def run_pipeline(request: PipelineRequest):
    """Execute a multi-step pipeline."""
    return await call_mcp_tool("swarm_run_pipeline", {
        "name": request.name,
        "steps": [s.dict() for s in request.steps],
        "initial_step": request.initial_step,
        "priority": request.priority,
        "timeout": request.timeout,
    })


@router.post("/workflows")
async def execute_workflow(request: WorkflowRequest):
    """Execute a workflow (built-in template or custom)."""
    args = {"input": request.input, "priority": request.priority}
    if request.template:
        args["template"] = request.template
    if request.custom_workflow:
        args["custom_workflow"] = request.custom_workflow
    return await call_mcp_tool("workflow_execute", args)


# ═══════════════════════════════════════════════
# TRIGGER ENDPOINTS
# ═══════════════════════════════════════════════

@router.post("/triggers")
async def register_trigger(request: TriggerRequest):
    """Register an event trigger."""
    return await call_mcp_tool("swarm_register_trigger", {
        "trigger_type": request.trigger_type,
        "condition": request.condition,
        "action": request.action,
        "cooldown": request.cooldown,
        "enabled": request.enabled,
    })


# ═══════════════════════════════════════════════
# METRICS ENDPOINTS
# ═══════════════════════════════════════════════

@router.get("/metrics")
async def get_metrics(
    agent_id: Optional[str] = Query(None),
    metric_name: Optional[str] = Query(None),
    summary: bool = Query(False),
    limit: int = Query(50, ge=1, le=500),
):
    """Get swarm performance metrics."""
    args = {"summary": summary, "limit": limit}
    if agent_id:
        args["agent_id"] = agent_id
    if metric_name:
        args["metric_name"] = metric_name
    return await call_mcp_tool("swarm_get_metrics", args)


# ═══════════════════════════════════════════════
# MEMORY GRAPH ENDPOINTS
# ═══════════════════════════════════════════════

@router.post("/memory/search")
async def search_memory(request: MemorySearchRequest):
    """Search the memory graph for entities."""
    args = {"query": request.query, "limit": request.limit}
    if request.domain:
        args["domain"] = request.domain
    if request.type:
        args["type"] = request.type
    return await call_mcp_tool("search_graph", args)


@router.post("/memory/entities")
async def create_entities(entities: List[Dict[str, Any]] = Body(...)):
    """Create entities in the memory graph."""
    return await call_mcp_tool("create_entities", {"entities": entities})


@router.get("/memory/nodes")
async def open_nodes(names: str = Query(..., description="Comma-separated entity names")):
    """Retrieve full entities by name."""
    name_list = [n.strip() for n in names.split(",")]
    return await call_mcp_tool("open_nodes", {"names": name_list})


# ═══════════════════════════════════════════════
# SANDBOX ENDPOINTS
# ═══════════════════════════════════════════════

@router.post("/sandbox/execute")
async def sandbox_execute(
    code: str = Body(...),
    environment: str = Body("javascript"),
    timeout: int = Body(30),
):
    """Execute code in the sandbox."""
    return await call_mcp_tool("sandbox_execute", {
        "code": code,
        "environment": environment,
        "timeout": timeout,
    })
