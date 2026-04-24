# IDMC Jobs Skill

> Agent skill that routes natural language job management requests to the correct `idmc-jobs` MCP tool, covering authentication, job start/stop, status checks, and activity log queries for Informatica IDMC.

**Author:** Pavan Kumar SP (psomaprabhu@salesforce.com)

Use this skill to monitor and manage Informatica IDMC jobs via the `idmc-jobs` MCP server.

## How to use

The user will invoke this skill with `/idmc` followed by a natural language request. Parse the intent and call the appropriate MCP tool(s). Always present results in a clean, readable format.

---

## Authentication

Before calling any job tool, verify the session with `idmc_get_session_info`.

- If `authenticated: false` → call `idmc_login` using the user's credentials or ask them to provide credentials.
- If `authenticated: true` → proceed directly.

Never expose the raw `icSessionId` value in your response.

---

## Intent → Tool mapping

| User says | Tool to call |
|-----------|-------------|
| "login", "connect", "authenticate" | `idmc_login` |
| "logout", "disconnect" | `idmc_logout` |
| "start job", "run task", "trigger" | `idmc_start_job` |
| "stop job", "cancel job", "kill job" | `idmc_stop_job` |
| "status of run", "check run", "is job done" | `idmc_get_job_status` |
| "activity log", "recent jobs", "job history" | `idmc_get_activity_log` |
| "active jobs", "running jobs", "what's running" | `idmc_get_active_jobs` |
| "history for task", "past runs" | `idmc_get_job_history` |
| "session info", "am I logged in" | `idmc_get_session_info` |

---

## Task type reference

When the user mentions a task but not its type, infer from context or ask:

| Type | When to use |
|------|-------------|
| `MTT` | "mapping task", "mapping" |
| `DSS` | "sync task", "synchronization" |
| `DRS` | "replication task", "replication" |
| `DMASK` | "masking task", "masking" |
| `PCS` | "PowerCenter task", "PowerCenter" |
| `WORKFLOW` | "taskflow", "workflow", "linear taskflow" |

---

## Output format

### Job started
```
Job started successfully.
  Run ID   : 987654
  Task     : MyMappingTask (MTT)
  Task ID  : 0100000Z000009

Use /idmc status 987654 to monitor progress.
```

### Job status
```
Run ID    : 987654
Task      : MyMappingTask (MTT)
State     : COMPLETED
Started   : 2024-04-23 10:00:00 UTC
Ended     : 2024-04-23 10:04:32 UTC

Rows
  Source success : 150,000
  Source failed  : 0
  Target success : 150,000
  Target failed  : 0

Errors: none
```

### Active jobs
```
2 job(s) currently running:

1. MyMappingTask    (MTT)  · Run 987654 · started 10:00 UTC
2. SyncTask_Orders  (DSS)  · Run 987655 · started 10:02 UTC
```

### Activity log
```
Showing 5 most recent runs:

Run      Task                  Type  State      Started              Rows ✓
──────── ────────────────────  ────  ─────────  ───────────────────  ──────────
987654   MyMappingTask         MTT   COMPLETED  2024-04-23 10:00     150,000
987653   SyncTask_Orders       DSS   FAILED     2024-04-23 09:45     0
987652   ReplicationTask_HR    DRS   COMPLETED  2024-04-23 09:00     45,200
```

For failed runs, always show `errorMsg` prominently.

---

## Example interactions

**User:** `/idmc what jobs are running right now?`
→ Call `idmc_get_active_jobs`, format results as the Active jobs table above.

**User:** `/idmc start MyMappingTask`
→ Infer `taskType: MTT` from name if possible, otherwise ask. Call `idmc_start_job`. Return Run ID.

**User:** `/idmc status 987654`
→ Call `idmc_get_job_status({ runId: 987654 })`. Format as Job status block above.

**User:** `/idmc stop MyMappingTask gracefully`
→ Call `idmc_stop_job({ taskType: "MTT", taskName: "MyMappingTask", cleanStop: true })`.

**User:** `/idmc show me failed jobs from today`
→ Call `idmc_get_activity_log({ startTime: "<today 00:00 UTC>" })`, filter where `state === "FAILED"`, display as activity log table.

**User:** `/idmc history for SyncTask_Orders`
→ Call `idmc_get_job_history({ taskName: "SyncTask_Orders", limit: 10 })`.

---

## Error handling

| Error | Response |
|-------|----------|
| `Not authenticated` | Prompt user to run `/idmc login` |
| `HTTP 401` | Session expired — call `idmc_login` again |
| `HTTP 404` | Task not found — confirm task name/ID with user |
| `HTTP 403` | Insufficient permissions — inform user |
| Any other error | Show the error message clearly, suggest checking task name and type |
