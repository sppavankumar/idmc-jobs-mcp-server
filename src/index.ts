#!/usr/bin/env node
/**
 * @file index.ts
 * @description MCP server entry point that exposes Informatica IDMC job management
 *              capabilities (start, stop, monitor, and query job history) as callable
 *              tools via the Model Context Protocol over stdio transport.
 * @author Pavan Kumar SP <psomaprabhu@salesforce.com>
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { IDMCClient, TaskType } from "./idmc-client.js";

// ─── Singleton client ────────────────────────────────────────────────────────

const client = new IDMCClient(
  process.env.IDMC_BASE_URL ?? "https://dm-us.informaticacloud.com"
);

// Auto-login from env if credentials supplied
if (process.env.IDMC_USERNAME && process.env.IDMC_PASSWORD) {
  client
    .login(process.env.IDMC_USERNAME, process.env.IDMC_PASSWORD)
    .catch(() => {
      // Warn but don't crash – tools will surface the error on first use
    });
} else if (process.env.IDMC_SERVER_URL && process.env.IDMC_SESSION_ID) {
  client.setSession(process.env.IDMC_SERVER_URL, process.env.IDMC_SESSION_ID);
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const TaskTypeEnum = z.enum(["DMASK", "DRS", "DSS", "MTT", "PCS", "WORKFLOW"]);

const LoginSchema = z.object({
  username: z.string().describe("IDMC username / email"),
  password: z.string().describe("IDMC password"),
  baseUrl: z
    .string()
    .optional()
    .describe(
      "Login base URL, e.g. https://dm-us.informaticacloud.com (default used if omitted)"
    ),
});

const SetSessionSchema = z.object({
  serverUrl: z
    .string()
    .describe("serverUrl returned by the login API, e.g. https://usw3.dm-us.informaticacloud.com/saas"),
  icSessionId: z.string().describe("icSessionId returned by the login API"),
});

const StartJobSchema = z.object({
  taskType: TaskTypeEnum.describe(
    "Task type: DMASK | DRS | DSS | MTT | PCS | WORKFLOW"
  ),
  taskId: z
    .string()
    .optional()
    .describe("Task ID (8-char object ID). One of taskId, taskFederatedId, or taskName is required."),
  taskFederatedId: z
    .string()
    .optional()
    .describe("Federated task ID including folder path (for tasks outside Default folder)"),
  taskName: z
    .string()
    .optional()
    .describe("Task name"),
  callbackURL: z
    .string()
    .optional()
    .describe("Public URL to receive job status callbacks"),
  parameterFileName: z
    .string()
    .optional()
    .describe("Parameter file name on the Secure Agent"),
  parameterFileDir: z
    .string()
    .optional()
    .describe("Directory of the parameter file on the Secure Agent"),
});

const StopJobSchema = z.object({
  taskType: TaskTypeEnum.describe("Task type"),
  taskId: z.string().optional().describe("Task ID"),
  taskFederatedId: z.string().optional().describe("Federated task ID"),
  taskName: z.string().optional().describe("Task name"),
  cleanStop: z
    .boolean()
    .optional()
    .describe("If true, performs a clean/graceful stop instead of an immediate stop"),
});

const GetJobStatusSchema = z.object({
  runId: z.number().int().describe("Run ID returned by startJob"),
});

const GetActivityLogSchema = z.object({
  taskId: z.string().optional().describe("Filter by task ID"),
  taskType: TaskTypeEnum.optional().describe("Filter by task type"),
  runId: z.number().int().optional().describe("Filter by specific run ID"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Max records to return (default 200)"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Pagination offset"),
  startTime: z
    .string()
    .optional()
    .describe("ISO-8601 or IDMC date string to filter logs after this time"),
  endTime: z
    .string()
    .optional()
    .describe("ISO-8601 or IDMC date string to filter logs before this time"),
});

const GetJobHistorySchema = z.object({
  taskId: z.string().optional().describe("Filter by task ID"),
  taskType: TaskTypeEnum.optional().describe("Filter by task type"),
  limit: z.number().int().min(1).max(1000).optional().describe("Max records (default 50)"),
  offset: z.number().int().min(0).optional().describe("Pagination offset"),
  startTime: z.string().optional().describe("Start time filter (ISO-8601)"),
  endTime: z.string().optional().describe("End time filter (ISO-8601)"),
});

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  {
    name: "idmc_login",
    description:
      "Authenticate to Informatica IDMC and obtain a session. Returns serverUrl and icSessionId for use in subsequent calls. Call this once before using any other tool (unless credentials are pre-configured via environment variables).",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "IDMC username / email" },
        password: { type: "string", description: "IDMC password" },
        baseUrl: {
          type: "string",
          description:
            "Optional login base URL, e.g. https://dm-us.informaticacloud.com",
        },
      },
      required: ["username", "password"],
    },
  },
  {
    name: "idmc_set_session",
    description:
      "Restore a previously obtained IDMC session (serverUrl + icSessionId) without logging in again. Useful when you already have a valid session token.",
    inputSchema: {
      type: "object",
      properties: {
        serverUrl: {
          type: "string",
          description: "serverUrl from the IDMC login response",
        },
        icSessionId: {
          type: "string",
          description: "icSessionId from the IDMC login response",
        },
      },
      required: ["serverUrl", "icSessionId"],
    },
  },
  {
    name: "idmc_logout",
    description: "Log out and invalidate the current IDMC session.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "idmc_start_job",
    description:
      "Start an IDMC job (mapping task, synchronization task, masking task, replication task, PowerCenter task, or linear taskflow). Returns the runId which you can use to monitor progress.",
    inputSchema: {
      type: "object",
      properties: {
        taskType: {
          type: "string",
          enum: ["DMASK", "DRS", "DSS", "MTT", "PCS", "WORKFLOW"],
          description:
            "Task type: DMASK=Masking, DRS=Replication, DSS=Synchronization, MTT=Mapping, PCS=PowerCenter, WORKFLOW=Linear Taskflow",
        },
        taskId: {
          type: "string",
          description: "Task ID (8-char object ID). Provide one of taskId, taskFederatedId, or taskName.",
        },
        taskFederatedId: {
          type: "string",
          description: "Globally unique federated task ID (for tasks outside the Default folder).",
        },
        taskName: { type: "string", description: "Task name" },
        callbackURL: {
          type: "string",
          description: "URL to receive async job completion callbacks",
        },
        parameterFileName: {
          type: "string",
          description: "Parameter file name on the Secure Agent",
        },
        parameterFileDir: {
          type: "string",
          description: "Full directory path of the parameter file on the Secure Agent",
        },
      },
      required: ["taskType"],
    },
  },
  {
    name: "idmc_stop_job",
    description:
      "Stop a running IDMC job immediately or gracefully. Use cleanStop=true for a graceful shutdown that completes in-flight rows before stopping.",
    inputSchema: {
      type: "object",
      properties: {
        taskType: {
          type: "string",
          enum: ["DMASK", "DRS", "DSS", "MTT", "PCS", "WORKFLOW"],
          description: "Task type",
        },
        taskId: { type: "string", description: "Task ID" },
        taskFederatedId: { type: "string", description: "Federated task ID" },
        taskName: { type: "string", description: "Task name" },
        cleanStop: {
          type: "boolean",
          description: "true = graceful clean stop; false (default) = immediate stop",
        },
      },
      required: ["taskType"],
    },
  },
  {
    name: "idmc_get_job_status",
    description:
      "Get the current status and statistics for a specific job run using its runId. Returns state, row counts, error messages, start/end times, and more.",
    inputSchema: {
      type: "object",
      properties: {
        runId: {
          type: "number",
          description: "The runId returned when the job was started",
        },
      },
      required: ["runId"],
    },
  },
  {
    name: "idmc_get_activity_log",
    description:
      "Query the IDMC activity log to monitor jobs. Supports filtering by task ID, task type, run ID, and time range. Returns job execution history with status, row counts, and errors.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Filter by task ID" },
        taskType: {
          type: "string",
          enum: ["DMASK", "DRS", "DSS", "MTT", "PCS", "WORKFLOW"],
          description: "Filter by task type",
        },
        runId: {
          type: "number",
          description: "Filter by a specific run ID",
        },
        limit: {
          type: "number",
          description: "Maximum records to return (1-1000, default 200)",
        },
        offset: {
          type: "number",
          description: "Pagination offset",
        },
        startTime: {
          type: "string",
          description: "Filter logs after this time (ISO-8601, e.g. 2024-01-15T00:00:00Z)",
        },
        endTime: {
          type: "string",
          description: "Filter logs before this time (ISO-8601)",
        },
      },
    },
  },
  {
    name: "idmc_get_active_jobs",
    description:
      "Get all currently running/in-progress IDMC jobs. Returns a list of active job executions with their run IDs, task names, and start times.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "idmc_get_job_history",
    description:
      "Retrieve historical job execution records for a task. Useful for auditing, troubleshooting failures, and reviewing performance trends.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Filter by task ID" },
        taskType: {
          type: "string",
          enum: ["DMASK", "DRS", "DSS", "MTT", "PCS", "WORKFLOW"],
          description: "Filter by task type",
        },
        limit: {
          type: "number",
          description: "Max records (1-1000, default 50)",
        },
        offset: { type: "number", description: "Pagination offset" },
        startTime: {
          type: "string",
          description: "Start of time range (ISO-8601)",
        },
        endTime: {
          type: "string",
          description: "End of time range (ISO-8601)",
        },
      },
    },
  },
  {
    name: "idmc_get_session_info",
    description:
      "Returns the current session details (serverUrl and session status) without exposing the session token. Useful for verifying authentication state.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "idmc-jobs",
    version: "1.0.0",
  },
  {
    capabilities: { tools: {} },
  }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

// Call tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── Auth ──────────────────────────────────────────────────────────────

      case "idmc_login": {
        const { username, password, baseUrl } = LoginSchema.parse(args);
        if (baseUrl) {
          // Re-create client with new base URL via the public method
          (client as unknown as { loginUrl: string }).loginUrl = baseUrl;
        }
        const resp = await client.login(username, password);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Logged in successfully.",
                  orgId: resp.orgId,
                  orgName: resp.orgName,
                  userId: resp.id,
                  userName: resp.name,
                  serverUrl: resp.serverUrl,
                  // Intentionally omit icSessionId from response text for security;
                  // it is stored internally.
                  sessionActive: true,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "idmc_set_session": {
        const { serverUrl, icSessionId } = SetSessionSchema.parse(args);
        client.setSession(serverUrl, icSessionId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { success: true, message: "Session configured.", serverUrl },
                null,
                2
              ),
            },
          ],
        };
      }

      case "idmc_logout": {
        await client.logout();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, message: "Logged out." }, null, 2),
            },
          ],
        };
      }

      case "idmc_get_session_info": {
        const info = client.getSessionInfo();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  authenticated: client.isAuthenticated(),
                  serverUrl: info.serverUrl,
                  sessionPresent: !!info.icSessionId,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // ── Jobs ──────────────────────────────────────────────────────────────

      case "idmc_start_job": {
        const parsed = StartJobSchema.parse(args);
        const jobReq: import("./idmc-client.js").StartJobRequest = {
          taskType: parsed.taskType,
          taskId: parsed.taskId,
          taskFederatedId: parsed.taskFederatedId,
          taskName: parsed.taskName,
          callbackURL: parsed.callbackURL,
        };

        if (parsed.parameterFileName || parsed.parameterFileDir) {
          jobReq.runtime = {
            "@type": "mtTaskRuntime",
            ...(parsed.parameterFileName && { parameterFileName: parsed.parameterFileName }),
            ...(parsed.parameterFileDir && { parameterFileDir: parsed.parameterFileDir }),
          };
        }

        const resp = await client.startJob(jobReq);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Job started. Use runId ${resp.runId} to monitor progress.`,
                  runId: resp.runId,
                  taskId: resp.taskId,
                  taskFederatedId: resp.taskFederatedId,
                  taskName: resp.taskName,
                  taskType: resp.taskType,
                  callbackURL: resp.callbackURL,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "idmc_stop_job": {
        const { cleanStop, ...req } = StopJobSchema.parse(args);
        const resp = cleanStop
          ? await client.cleanStopJob(req as Parameters<typeof client.cleanStopJob>[0])
          : await client.stopJob(req as Parameters<typeof client.stopJob>[0]);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ ...resp, cleanStop: cleanStop ?? false }, null, 2),
            },
          ],
        };
      }

      case "idmc_get_job_status": {
        const { runId } = GetJobStatusSchema.parse(args);
        const entry = await client.getJobStatus(runId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(formatActivityEntry(entry), null, 2),
            },
          ],
        };
      }

      // ── Activity / Monitoring ─────────────────────────────────────────────

      case "idmc_get_activity_log": {
        const params = GetActivityLogSchema.parse(args);
        const entries = await client.getActivityLog({
          ...params,
          limit: params.limit ?? 200,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total: entries.length,
                  entries: entries.map(formatActivityEntry),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "idmc_get_active_jobs": {
        const jobs = await client.getActiveJobs();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  activeCount: jobs.length,
                  jobs: jobs.map(formatActivityEntry),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "idmc_get_job_history": {
        const params = GetJobHistorySchema.parse(args);
        const entries = await client.getJobHistory({
          ...params,
          limit: params.limit ?? 50,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  total: entries.length,
                  entries: entries.map(formatActivityEntry),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { error: true, message: IDMCClient.formatApiError(err) },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatActivityEntry(e: import("./idmc-client.js").ActivityLogEntry) {
  return {
    runId: e.runId,
    taskId: e.taskId,
    taskFederatedId: e.taskFederatedId,
    taskName: e.taskName,
    taskType: e.taskType,
    state: e.state,
    executionState: e.executionState,
    startTime: e.startTime,
    endTime: e.endTime,
    successSourceRows: e.successSourceRows,
    failedSourceRows: e.failedSourceRows,
    successTargetRows: e.successTargetRows,
    failedTargetRows: e.failedTargetRows,
    errorMsg: e.errorMsg,
    runtimeEnvironmentName: e.runtimeEnvironmentName,
    startedBy: e.startedBy,
  };
}

// ─── Start ───────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // MCP servers communicate over stdio; use stderr for logs
  process.stderr.write("IDMC Jobs MCP Server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
