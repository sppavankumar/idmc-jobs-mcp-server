/**
 * @file idmc-client.ts
 * @description HTTP client for the Informatica IDMC REST API that handles session
 *              authentication, job lifecycle operations (start/stop), and activity
 *              log queries with typed request/response interfaces.
 * @author Pavan Kumar SP
 */
import axios, { AxiosInstance, AxiosError } from "axios";

// ─── Auth ──────────────────────────────────────────────────────────────────

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  id: string;
  name: string;
  orgId: string;
  orgName?: string;
  serverUrl: string;
  icSessionId: string;
  timezone?: string;
  forceChangePassword?: boolean;
  roles?: Array<{ name: string }>;
}

// ─── Jobs ──────────────────────────────────────────────────────────────────

export type TaskType = "DMASK" | "DRS" | "DSS" | "MTT" | "PCS" | "WORKFLOW";

export interface JobRuntime {
  "@type": string;
  parameterFileName?: string;
  parameterFileDir?: string;
  [key: string]: unknown;
}

export interface StartJobRequest {
  taskId?: string;
  taskFederatedId?: string;
  taskName?: string;
  taskType: TaskType;
  callbackURL?: string;
  runtime?: JobRuntime;
  parameterFileName?: string;
  parameterFileDir?: string;
}

export interface StartJobResponse {
  taskId: string;
  taskFederatedId?: string;
  taskName: string;
  taskType: TaskType;
  runId: number;
  callbackURL?: string;
}

export interface StopJobRequest {
  taskId?: string;
  taskFederatedId?: string;
  taskName?: string;
  taskType: TaskType;
}

// ─── Activity Log ──────────────────────────────────────────────────────────

export interface ActivityLogEntry {
  id: string;
  orgId?: string;
  runId: number;
  runContextType?: string;
  agentId?: string;
  runtimeEnvironmentId?: string;
  runtimeEnvironmentName?: string;
  startTime: string;
  endTime?: string;
  taskId: string;
  taskFederatedId?: string;
  taskName: string;
  taskType: TaskType;
  objectId?: string;
  objectName?: string;
  objectType?: string;
  state?: string;
  executionState?: string;
  failedSourceRows?: number;
  successSourceRows?: number;
  failedTargetRows?: number;
  successTargetRows?: number;
  errorMsg?: string;
  startedBy?: string;
  entries?: ActivityLogEntry[];
}

export interface ActivityLogParams {
  taskId?: string;
  taskType?: TaskType;
  runId?: number;
  limit?: number;
  offset?: number;
  startTime?: string;
  endTime?: string;
  orderBy?: string;
}

// ─── Client ────────────────────────────────────────────────────────────────

export class IDMCClient {
  private http: AxiosInstance;
  private sessionId: string | null = null;
  private serverUrl: string | null = null;
  loginUrl: string;

  constructor(baseLoginUrl: string = "https://dm-us.informaticacloud.com") {
    this.loginUrl = baseLoginUrl;
    // http instance is recreated after login with the serverUrl
    this.http = axios.create({ timeout: 30_000 });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────

  async login(username: string, password: string): Promise<LoginResponse> {
    const resp = await axios.post<LoginResponse>(
      `${this.loginUrl}/ma/api/v2/user/login`,
      { "@type": "login", username, password },
      { headers: { "Content-Type": "application/json", Accept: "application/json" } }
    );

    this.sessionId = resp.data.icSessionId;
    this.serverUrl = resp.data.serverUrl;

    this.http = axios.create({
      baseURL: this.serverUrl,
      timeout: 30_000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        icSessionId: this.sessionId,
      },
    });

    return resp.data;
  }

  async logout(): Promise<void> {
    if (!this.sessionId) return;
    try {
      await this.http.post("/api/v2/user/logout");
    } catch {
      // best-effort
    } finally {
      this.sessionId = null;
      this.serverUrl = null;
    }
  }

  // ── Session helpers ───────────────────────────────────────────────────────

  setSession(serverUrl: string, icSessionId: string): void {
    this.serverUrl = serverUrl;
    this.sessionId = icSessionId;
    this.http = axios.create({
      baseURL: serverUrl,
      timeout: 30_000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        icSessionId,
      },
    });
  }

  isAuthenticated(): boolean {
    return !!this.sessionId && !!this.serverUrl;
  }

  getSessionInfo(): { serverUrl: string | null; icSessionId: string | null } {
    return { serverUrl: this.serverUrl, icSessionId: this.sessionId };
  }

  // ── Jobs ─────────────────────────────────────────────────────────────────

  async startJob(req: StartJobRequest): Promise<StartJobResponse> {
    this.assertAuth();
    const body = { "@type": "job", ...req };
    const resp = await this.http.post<StartJobResponse>("/api/v2/job", body);
    return resp.data;
  }

  async stopJob(req: StopJobRequest): Promise<{ success: boolean; message: string }> {
    this.assertAuth();
    const body = { "@type": "job", ...req };
    await this.http.post("/api/v2/job/stop", body);
    return { success: true, message: "Stop signal sent successfully." };
  }

  async cleanStopJob(req: StopJobRequest): Promise<{ success: boolean; message: string }> {
    this.assertAuth();
    const body = { "@type": "job", ...req };
    await this.http.post("/api/v2/job/stop?cleanStop=true", body);
    return { success: true, message: "Clean stop signal sent successfully." };
  }

  // ── Activity Log ─────────────────────────────────────────────────────────

  async getActivityLog(params: ActivityLogParams = {}): Promise<ActivityLogEntry[]> {
    this.assertAuth();
    const query: Record<string, string | number> = {};
    if (params.taskId) query["taskId"] = params.taskId;
    if (params.taskType) query["taskType"] = params.taskType;
    if (params.runId !== undefined) query["runId"] = params.runId;
    if (params.limit !== undefined) query["limit"] = params.limit;
    if (params.offset !== undefined) query["offset"] = params.offset;
    if (params.startTime) query["startTime"] = params.startTime;
    if (params.endTime) query["endTime"] = params.endTime;
    if (params.orderBy) query["orderBy"] = params.orderBy;

    const resp = await this.http.get<ActivityLogEntry[]>("/api/v2/activity/activityLog", {
      params: query,
    });
    return resp.data;
  }

  async getActivityLogByRunId(runId: number): Promise<ActivityLogEntry> {
    this.assertAuth();
    const resp = await this.http.get<ActivityLogEntry>(
      `/api/v2/activity/activityLog?runId=${runId}`
    );
    // Response may be array; return first item
    const data = resp.data as unknown;
    if (Array.isArray(data)) return data[0] as ActivityLogEntry;
    return data as ActivityLogEntry;
  }

  // ── Monitor ───────────────────────────────────────────────────────────────

  async getJobStatus(runId: number): Promise<ActivityLogEntry> {
    return this.getActivityLogByRunId(runId);
  }

  async getActiveJobs(): Promise<ActivityLogEntry[]> {
    this.assertAuth();
    // Filter to running jobs (state = RUNNING) via activity log
    const logs = await this.getActivityLog({ limit: 100 });
    return logs.filter(
      (e) =>
        e.executionState === "RUNNING" ||
        e.state === "RUNNING" ||
        e.state === "INPROGRESS"
    );
  }

  async getJobHistory(params: {
    taskId?: string;
    taskType?: TaskType;
    limit?: number;
    offset?: number;
    startTime?: string;
    endTime?: string;
  }): Promise<ActivityLogEntry[]> {
    return this.getActivityLog(params);
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  private assertAuth(): void {
    if (!this.isAuthenticated()) {
      throw new Error(
        "Not authenticated. Call login() or setSession() first."
      );
    }
  }

  static formatApiError(err: unknown): string {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const data = err.response?.data as Record<string, unknown> | undefined;
      const msg =
        (data?.["message"] as string) ||
        (data?.["error"] as string) ||
        err.message;
      return `HTTP ${status ?? "?"}: ${msg}`;
    }
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
