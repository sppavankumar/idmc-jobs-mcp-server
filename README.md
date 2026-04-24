# IDMC Jobs MCP Server

> MCP server that exposes Informatica IDMC job management — authentication, start/stop, status monitoring, and activity log querying — as AI-callable tools via the Model Context Protocol.

**Author:** Pavan Kumar SP

A Model Context Protocol (MCP) server for monitoring and managing jobs on the **Informatica Intelligent Data Management Cloud (IDMC)** platform.

## Features

| Tool | Description |
|------|-------------|
| `idmc_login` | Authenticate and obtain an IDMC session |
| `idmc_set_session` | Restore a previously obtained session token |
| `idmc_logout` | Invalidate the current session |
| `idmc_start_job` | Start any IDMC task type (MTT, DSS, DRS, DMASK, PCS, WORKFLOW) |
| `idmc_stop_job` | Stop a running job (immediate or graceful clean-stop) |
| `idmc_get_job_status` | Get real-time status and row counts for a run ID |
| `idmc_get_activity_log` | Query the activity log with rich filters |
| `idmc_get_active_jobs` | List all currently running jobs |
| `idmc_get_job_history` | Retrieve historical execution records |
| `idmc_get_session_info` | Inspect current authentication state |

## Supported Task Types

| Code | Type |
|------|------|
| `MTT` | Mapping Task |
| `DSS` | Synchronization Task |
| `DRS` | Replication Task |
| `DMASK` | Masking Task |
| `PCS` | PowerCenter Task |
| `WORKFLOW` | Linear Taskflow |

---

## Quick Start

### 1. Install & Build

```bash
npm install
npm run build
```

### 2. Configure Credentials

Copy `.env.example` to `.env` and fill in your IDMC credentials:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `IDMC_USERNAME` | Your IDMC login email |
| `IDMC_PASSWORD` | Your IDMC password |
| `IDMC_BASE_URL` | Login URL for your pod (e.g. `https://dm-us.informaticacloud.com`) |
| `IDMC_SERVER_URL` | *(Optional)* Pre-existing serverUrl from a prior login |
| `IDMC_SESSION_ID` | *(Optional)* Pre-existing icSessionId from a prior login |

### 3. Add to Claude Desktop

Merge the contents of `claude_desktop_config.json` into your Claude Desktop config file:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "idmc-jobs": {
      "command": "node",
      "args": ["/path/to/idmc-jobs/dist/index.js"],
      "env": {
        "IDMC_USERNAME": "your-email@example.com",
        "IDMC_PASSWORD": "your-password",
        "IDMC_BASE_URL": "https://dm-us.informaticacloud.com"
      }
    }
  }
}
```

---

## API Reference

### Authentication

The server auto-authenticates on startup when `IDMC_USERNAME` and `IDMC_PASSWORD` env vars are set. You can also call `idmc_login` manually at any time.

**Login flow:**
1. POST to `<IDMC_BASE_URL>/ma/api/v2/user/login`
2. Response contains `serverUrl` (used as base for all v2 API calls) and `icSessionId` (session token sent in every request header)

### Starting a Job

```
idmc_start_job({
  taskType: "MTT",
  taskName: "MyMappingTask",
  callbackURL: "https://my-app.com/webhook"
})
```

Returns `runId` — use it to track progress with `idmc_get_job_status`.

### Monitoring

```
idmc_get_job_status({ runId: 123456 })

idmc_get_activity_log({
  taskType: "MTT",
  startTime: "2024-01-01T00:00:00Z",
  limit: 50
})

idmc_get_active_jobs()
```

### Stopping a Job

```
# Immediate stop
idmc_stop_job({ taskType: "MTT", taskName: "MyMappingTask" })

# Graceful clean stop (finishes in-flight rows)
idmc_stop_job({ taskType: "MTT", taskName: "MyMappingTask", cleanStop: true })
```

---

## IDMC Base URLs by Region

| Region | URL |
|--------|-----|
| United States | `https://dm-us.informaticacloud.com` |
| Europe | `https://dm-eu.informaticacloud.com` |
| Asia Pacific | `https://dm-ap.informaticacloud.com` |
| APAC Pod 1 | `https://dm1-ap.informaticacloud.com` |

---

## Project Structure

```
idmc-jobs/
├── src/
│   ├── index.ts          # MCP server — tools, handlers, startup
│   └── idmc-client.ts    # IDMC REST API client (login, jobs, activity log)
├── dist/                 # Compiled output (after npm run build)
├── .env.example          # Environment variable template
├── claude_desktop_config.json
├── tsconfig.json
└── package.json
```

## Development

```bash
npm run dev   # Run with ts-node (no build needed)
npm run build # Compile to dist/
npm start     # Run compiled dist/index.js
```
