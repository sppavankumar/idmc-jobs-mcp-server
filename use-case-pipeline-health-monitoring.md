# Use Case Requirements Document
## Proactive Pipeline Health Monitoring & Managed Data Operations
### Informatica IDMC × Salesforce Service Cloud

---

**Document Version:** 1.0  
**Date:** 2026-04-23  
**Prepared By:** Pavan Kumar SP  
**Status:** Draft — For Internal Review  
**Intended Audience:** Product, Engineering, Pre-Sales, Customer Success

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Context & Problem Statement](#2-business-context--problem-statement)
3. [Objectives & Success Criteria](#3-objectives--success-criteria)
4. [Stakeholders & Personas](#4-stakeholders--personas)
5. [Functional Requirements](#5-functional-requirements)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [Technical Architecture](#7-technical-architecture)
8. [Integration Design](#8-integration-design)
9. [Data Model & Case Schema](#9-data-model--case-schema)
10. [User Stories & Acceptance Criteria](#10-user-stories--acceptance-criteria)
11. [Priority Classification Matrix](#11-priority-classification-matrix)
12. [Implementation Roadmap](#12-implementation-roadmap)
13. [Revenue & Licensing Summary](#13-revenue--licensing-summary)
14. [Risks & Mitigations](#14-risks--mitigations)
15. [Appendix — Live Evidence from Org](#15-appendix--live-evidence-from-org)

---

## 1. Executive Summary

This document defines the requirements for a **Proactive Pipeline Health Monitoring** solution that integrates **Informatica Intelligent Data Management Cloud (IDMC)** with **Salesforce Service Cloud** to automate the detection, ticketing, routing, and resolution tracking of data pipeline failures.

### The Problem in One Paragraph

As of 2026-04-23, the customer's IDMC org has executed **200 job runs**, of which **37 (18.5%) have failed**. These failures are undetected in real time — no automated alert, no ticket, no SLA clock. The most recent failure (Run ID 8, today at 19:18 UTC) remains unresolved: the Secure Agent servicing `POSTGRE_SQL_LAPTOP_infinityDB` is offline. Every minute this goes undetected is time that downstream business processes are operating on stale or missing data.

### The Solution in One Paragraph

This solution uses the **IDMC Activity Log API** as the monitoring heartbeat. Failed or degraded jobs trigger automated **Salesforce Platform Events**, which create **Service Cloud cases** with full diagnostic context, assign them by priority, and track them to SLA resolution. Leadership sees live operational health in a **Tableau dashboard**. The result is a fully managed, auditable data operations model — the foundation of an **Informatica Managed Services** engagement and a **Salesforce Service Cloud** expansion.

---

## 2. Business Context & Problem Statement

### 2.1 Current State

The customer's IDMC org operates data integration pipelines across the following source systems:

| Source | Description | Observed Failures |
|--------|-------------|-------------------|
| PostgreSQL (`infinityDB`) | Primary operational database | Secure Agent offline (active today) |
| PostgreSQL (`infinityStgDB`) | Staging database | Agent connectivity failures |
| File system (CSV) | AmEx Gold, Capital One financial files | File-lock errors (recurring) |
| Google BigQuery | Google Analytics datasets | Configuration errors (recurring) |

**Observed failure patterns (from live activity log — 200 runs):**

| Failure Category | Count | Example Error |
|-----------------|-------|---------------|
| Secure Agent offline | 3 | `No running Data_Integration_Server 76.*` |
| File locked by another process | 8 | `FR_3000 Error opening file... being used by another process` |
| File not found / bad path | 6 | `File [...] does not exist`, bad filename syntax |
| BigQuery config errors | 9 | Invalid URI, dataset not found in region, unsupported mode |
| CCI Metadata errors | 4 | `Invalid operation field name in CCI Metadata Client` |
| DTM process crash | 5 | `DTM process terminated unexpectedly` |
| User-stopped jobs | 3 | `Stopped by user using the UI/API` |
| Other / schema errors | 3 | Invalid schema, missing field mappings |
| **Total failures** | **37** | — |

### 2.2 The Gap

- There is **no real-time alerting** when a job fails
- There is **no automated ticketing** system — failures are discovered manually, if at all
- There is **no SLA tracking** for time-to-resolution
- There is **no trend analysis** to identify recurring failure patterns
- There is **no escalation path** when a P1 failure goes unacknowledged

### 2.3 Business Impact

| Impact Area | Description |
|-------------|-------------|
| Data freshness | Downstream reports and dashboards receive stale or missing data |
| Decision quality | Business decisions made on incomplete information |
| Operational cost | Engineers spend reactive time hunting failures instead of building |
| Compliance risk | Financial data pipelines (AmEx, CapOne) failing without audit trail |
| Customer trust | SLA breaches go untracked and unacknowledged |

---

## 3. Objectives & Success Criteria

### 3.1 Primary Objectives

1. **Detect** every IDMC job failure within 5 minutes of occurrence
2. **Create** a Salesforce Service Cloud case automatically for every failed or degraded job
3. **Route** cases to the correct team based on priority and failure type
4. **Track** resolution against defined SLAs
5. **Report** operational health to leadership in a live Tableau dashboard
6. **Reduce** mean time to resolution (MTTR) by ≥ 50% within 90 days

### 3.2 Success Criteria

| Criterion | Target |
|-----------|--------|
| Time from job failure to case creation | ≤ 5 minutes |
| Auto-case creation accuracy (no false positives) | ≥ 98% |
| P1 case SLA compliance rate | ≥ 95% |
| Reduction in MTTR (vs. baseline) | ≥ 50% in 90 days |
| Engineer time saved per week (reactive firefighting) | ≥ 4 hours |
| Dashboard adoption by leadership | ≥ 80% of stakeholders weekly |

---

## 4. Stakeholders & Personas

### 4.1 Primary Stakeholders

| Role | Responsibility | Interest in This Solution |
|------|---------------|--------------------------|
| **Data Engineering Lead** | Owns IDMC pipelines | Wants immediate failure alerts, clear error context, reduced on-call burden |
| **IT Operations Manager** | Owns SLA performance | Needs SLA tracking, escalation paths, MTTR reporting |
| **Data Governance Officer** | Owns data quality & compliance | Needs audit trail for financial pipeline failures |
| **Business Intelligence Lead** | Consumes pipeline output | Wants confidence that data in dashboards is fresh and complete |
| **CIO / VP of Data** | Executive sponsor | Wants operational health KPIs and business risk visibility |

### 4.2 Support Team Personas

| Persona | Description |
|---------|-------------|
| **L1 Support Agent** | Monitors the Service Cloud queue; acknowledges cases, performs initial triage, restarts agents if within scope |
| **L2 Data Engineer** | Resolves complex failures; fixes configuration, patches pipelines, updates file paths |
| **L3 Informatica Specialist** | Handles DTM crashes, Secure Agent issues, connector bugs; may engage Informatica Support |
| **Escalation Manager** | Notified when P1 SLA is at risk; has authority to mobilize resources |

---

## 5. Functional Requirements

### 5.1 IDMC Monitoring & Event Detection

#### FR-01 — Activity Log Polling
- The system **SHALL** poll the IDMC Activity Log API at a configurable interval (default: every 5 minutes)
- The system **SHALL** retrieve all job runs with `state = 3` (FAILED) and `state = 2` (WARNING) since the last successful poll
- The system **SHALL** maintain a persistent cursor (last processed timestamp) to prevent duplicate case creation
- The system **SHALL** support configurable polling intervals: 1 min, 5 min, 15 min, 30 min

#### FR-02 — Failure Classification
- The system **SHALL** classify each failed job into one of the following failure categories based on error message pattern matching:

| Category ID | Category Name | Error Pattern |
|-------------|--------------|---------------|
| CAT-01 | Secure Agent Offline | `No running.*Data_Integration_Server` |
| CAT-02 | File Locked | `being used by another process` |
| CAT-03 | File Not Found | `does not exist`, `filename.*syntax is incorrect` |
| CAT-04 | Cloud Config Error | `Invalid extract destination URI`, `not found in location` |
| CAT-05 | Connection Failure | `test connection.*failed` |
| CAT-06 | DTM Crash | `DTM process terminated unexpectedly` |
| CAT-07 | Metadata Error | `Invalid operation field name in CCI Metadata Client` |
| CAT-08 | User Stopped | `stopped by user` |
| CAT-09 | Schema Error | `Invalid Schema`, `No fields were available` |
| CAT-10 | Unknown | Any error not matching above patterns |

#### FR-03 — Priority Assignment
- The system **SHALL** assign a priority level to each case based on the following matrix:

| Priority | Label | Failure Category | Business Impact | SLA |
|----------|-------|-----------------|-----------------|-----|
| P1 | Critical | CAT-01 (Agent Offline), CAT-06 (DTM Crash) | Complete data blackout | 4 hours |
| P2 | High | CAT-05 (Connection Failure), CAT-04 (Cloud Config) | Partial data loss | 8 hours |
| P3 | Medium | CAT-02 (File Locked), CAT-03 (File Not Found) | Delayed data delivery | 24 hours |
| P4 | Low | CAT-07, CAT-08, CAT-09 | Minor/informational | 48 hours |

#### FR-04 — Recurring Failure Detection
- The system **SHALL** detect when the same failure category occurs ≥ 3 times within a 24-hour window for the same task
- When a recurring pattern is detected, the system **SHALL** escalate the case priority by one level (e.g., P3 → P2)
- The system **SHALL** add a "Recurring Failure" flag and pattern summary to the case

#### FR-05 — Deduplication
- The system **SHALL NOT** create duplicate cases for the same run ID
- The system **SHALL** link subsequent failures of the same task to the parent case if the parent case is still open
- The system **SHALL** increment a "Recurrence Count" field on the parent case for linked failures

---

### 5.2 Salesforce Service Cloud — Case Management

#### FR-06 — Automated Case Creation
- The system **SHALL** create a Salesforce Service Cloud case for every detected failure within 5 minutes of the job end time
- Each case **SHALL** be pre-populated with all fields defined in the Data Model (Section 9)
- Cases **SHALL** be created via Platform Event (asynchronous) to avoid blocking the polling process

#### FR-07 — Case Routing
- Cases **SHALL** be routed to the appropriate queue based on failure category:

| Failure Category | Assigned Queue |
|-----------------|---------------|
| CAT-01, CAT-06 | Infrastructure — P1 Response |
| CAT-04, CAT-05 | Cloud Connectors — Data Engineering |
| CAT-02, CAT-03 | File Operations — Data Engineering |
| CAT-07, CAT-09 | Pipeline Config — Data Engineering |
| CAT-08 | Manual Review — Operations |
| CAT-10 | Triage — L1 Support |

#### FR-08 — Escalation Rules
- If a P1 case is not acknowledged within **1 hour**, the system **SHALL** send an email/Slack notification to the Escalation Manager
- If a P1 case is not resolved within **3 hours** (1 hour before SLA breach), the system **SHALL** escalate the case to the IT Operations Manager
- If any case breaches its SLA, the system **SHALL** flag it as "SLA Violated" and notify the Data Engineering Lead

#### FR-09 — Case Resolution Workflow
- Cases **SHALL** support the following status lifecycle:

```
New → Acknowledged → In Progress → Pending Verification → Resolved → Closed
                          ↓
                     Escalated (if SLA at risk)
```

- Resolution **SHALL** require: root cause entry, resolution steps taken, and confirmation of successful re-run (optional: linked to a subsequent successful Run ID)
- Closed cases **SHALL** be retained for 12 months for audit and trend analysis

#### FR-10 — Knowledge Article Linking
- The system **SHALL** suggest relevant Knowledge Base articles based on failure category at case creation
- L1 agents **SHALL** be able to attach resolution articles to cases for future reference
- After 3 resolved cases with the same root cause, the system **SHALL** prompt creation of a runbook article

---

### 5.3 Notification & Alerting

#### FR-11 — Real-Time Notifications
- On P1 case creation, the system **SHALL** send notifications via:
  - Email to the assigned queue members
  - Slack message to `#data-pipeline-incidents` channel (configurable)
  - Salesforce mobile push notification to the on-call engineer
- On P2 case creation, the system **SHALL** send email to assigned queue only
- P3/P4 cases: queue notification only (no push/Slack)

#### FR-12 — Daily Digest
- The system **SHALL** send a daily digest email to the Data Engineering Lead and IT Operations Manager at 08:00 (configurable timezone) containing:
  - Open cases by priority
  - Cases opened in the last 24 hours
  - Cases at SLA risk
  - MTTR for cases closed in the last 24 hours

---

### 5.4 Reporting & Dashboard

#### FR-13 — Operational Health Dashboard (Tableau / Salesforce Reports)
The dashboard **SHALL** contain the following views:

**View 1 — Live Pipeline Status**
- Total jobs run (last 24h, 7d, 30d)
- Success rate % (last 24h, 7d, 30d)
- Open cases by priority (real-time)
- Most recent failure (task name, time, error category)

**View 2 — Failure Trend Analysis**
- Failure rate over time (line chart, daily/weekly)
- Failures by category (bar chart)
- Top 5 most-failed tasks (last 30 days)
- Recurring failure patterns (heatmap by task × category)

**View 3 — SLA Performance**
- SLA compliance rate by priority (P1/P2/P3/P4)
- MTTR trend (rolling 30-day average)
- SLA violations — count and list
- Cases breached vs. resolved within SLA (stacked bar)

**View 4 — Resolution Efficiency**
- Cases by status (funnel)
- Average time in each status stage
- Cases resolved by assignee / queue
- Escalation rate (% of cases escalated)

#### FR-14 — Executive Summary Report
- A weekly PDF/email report **SHALL** be auto-generated every Monday at 07:00 containing:
  - Overall pipeline health score (0–100, composite metric)
  - Week-over-week failure rate change
  - Top 3 recurring issues with recommended actions
  - SLA compliance summary

---

## 6. Non-Functional Requirements

### 6.1 Performance

| Requirement | Target |
|-------------|--------|
| API polling latency (IDMC → event fired) | < 30 seconds |
| End-to-end case creation time (event → case visible) | < 5 minutes |
| Dashboard refresh rate | Real-time (streaming) or ≤ 5 min refresh |
| System support for concurrent pipeline monitoring | ≥ 500 active tasks |
| Activity log query response time | < 10 seconds per poll |

### 6.2 Reliability & Availability

| Requirement | Target |
|-------------|--------|
| Monitoring system uptime | 99.5% |
| Maximum allowable polling gap (no missed failures) | 15 minutes |
| Failover behavior if Salesforce is unreachable | Queue events locally, replay on reconnect |
| Data retention for closed cases | 12 months minimum |

### 6.3 Security

- All API calls to IDMC **SHALL** use OAuth 2.0 or session-based authentication; credentials stored in Salesforce Named Credentials
- IDMC session token **SHALL NOT** be logged or exposed in case descriptions
- Case data containing error messages with file paths **SHALL** be treated as internal-only (not shared with external contacts)
- Role-based access in Salesforce: L1 agents see queue only; L2/L3 engineers see full diagnostic detail; executives see dashboard only

### 6.4 Scalability

- The architecture **SHALL** support monitoring of ≥ 10 IDMC orgs simultaneously (multi-tenant managed services model)
- Adding a new IDMC org **SHALL** require only configuration (no code changes)
- The system **SHALL** handle burst polling scenarios (e.g., 50+ failures in a single poll window) without dropping events

### 6.5 Maintainability

- Failure classification rules (Section 5.1 FR-02) **SHALL** be configurable via a metadata table (no code deployment required to add new patterns)
- Priority assignment rules (FR-03) **SHALL** be configurable via Salesforce Flow or custom metadata
- All integration components **SHALL** include structured logging for debugging

---

## 7. Technical Architecture

### 7.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INFORMATICA IDMC                             │
│                                                                     │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐ │
│   │  Mapping     │    │  Sync Tasks  │    │  Activity Log API    │ │
│   │  Tasks (MTT) │    │  (DSS/DRS)   │    │  /api/v2/activity/   │ │
│   └──────────────┘    └──────────────┘    └──────────┬───────────┘ │
│                                                       │ REST/JSON   │
└───────────────────────────────────────────────────────┼─────────────┘
                                                        │
                              ┌─────────────────────────▼──────────────┐
                              │         INTEGRATION LAYER               │
                              │                                         │
                              │  ┌─────────────────────────────────┐   │
                              │  │   MuleSoft Anypoint / Flow       │   │
                              │  │                                  │   │
                              │  │  1. Poll Activity Log (5 min)    │   │
                              │  │  2. Filter: state=3 or state=2   │   │
                              │  │  3. Classify failure category    │   │
                              │  │  4. Assign priority              │   │
                              │  │  5. Check deduplication          │   │
                              │  │  6. Fire Platform Event          │   │
                              │  └─────────────────────────────────┘   │
                              └─────────────────────────┬──────────────┘
                                                        │ Platform Event
                              ┌─────────────────────────▼──────────────┐
                              │         SALESFORCE SERVICE CLOUD        │
                              │                                         │
                              │  ┌──────────────┐  ┌────────────────┐  │
                              │  │   Case       │  │  Queue Routing │  │
                              │  │   Creation   │  │  & Assignment  │  │
                              │  └──────────────┘  └────────────────┘  │
                              │  ┌──────────────┐  ┌────────────────┐  │
                              │  │  SLA Engine  │  │  Escalation    │  │
                              │  │  & Tracking  │  │  Rules         │  │
                              │  └──────────────┘  └────────────────┘  │
                              │  ┌──────────────┐  ┌────────────────┐  │
                              │  │  Notification│  │  Knowledge     │  │
                              │  │  (Email/     │  │  Base          │  │
                              │  │   Slack)     │  │                │  │
                              │  └──────────────┘  └────────────────┘  │
                              └─────────────────────────┬──────────────┘
                                                        │
                              ┌─────────────────────────▼──────────────┐
                              │            REPORTING LAYER              │
                              │                                         │
                              │   Tableau CRM / Einstein Analytics      │
                              │   ┌─────────────┐  ┌───────────────┐   │
                              │   │ Live Status │  │ Trend/SLA     │   │
                              │   │ Dashboard   │  │ Dashboard     │   │
                              │   └─────────────┘  └───────────────┘   │
                              └─────────────────────────────────────────┘
```

### 7.2 Integration Approach Options

Two integration approaches are available. The recommended approach depends on the customer's existing tooling:

| Approach | Description | When to Use |
|----------|-------------|-------------|
| **Option A — MuleSoft Anypoint** | Anypoint Platform scheduled flow polls IDMC API, transforms payload, fires Salesforce Platform Event via REST | Customer has MuleSoft license; preferred for multi-org managed services model |
| **Option B — Salesforce Flow + Named Credential** | Salesforce Scheduled Flow calls IDMC API directly via Named Credential; processes inline | Customer does not have MuleSoft; simpler but less scalable |

**Recommended:** Option A (MuleSoft) for production managed services. Option B acceptable for POC/pilot phase.

---

## 8. Integration Design

### 8.1 IDMC Activity Log API — Poll Specification

**Endpoint:**
```
GET /api/v2/activity/activityLog
Host: {IDMC_SERVER_URL}
```

**Headers:**
```
INFA-SESSION-ID: {session_token}   ← stored in Named Credential / Secure Config
Content-Type: application/json
```

**Query Parameters:**
```
startTime   : {last_poll_timestamp}    (ISO-8601, e.g. 2026-04-23T19:00:00Z)
limit       : 200
offset      : 0
```

**Response fields consumed:**

| Field | Type | Usage |
|-------|------|-------|
| `runId` | integer | Case deduplication key |
| `state` | integer | 1=Success, 2=Warning, 3=Failed — filter on 2 and 3 |
| `startTime` | datetime | Case "Job Started" field |
| `endTime` | datetime | Case "Job Ended" field; SLA clock start |
| `errorMsg` | string | Case description; used for failure classification |
| `successSourceRows` | integer | Diagnostic context |
| `successTargetRows` | integer | Diagnostic context |
| `failedTargetRows` | integer | Diagnostic context |
| `startedBy` | string | Case "Triggered By" field |

### 8.2 Platform Event Schema

**Event Name:** `IDMC_Pipeline_Failure__e`

| Field | Type | Description |
|-------|------|-------------|
| `Run_ID__c` | Text(20) | IDMC run identifier |
| `State__c` | Number | 2 (Warning) or 3 (Failed) |
| `Failure_Category__c` | Picklist | CAT-01 through CAT-10 |
| `Priority__c` | Picklist | P1 / P2 / P3 / P4 |
| `Error_Message__c` | LongText(5000) | Full error from IDMC |
| `Job_Start_Time__c` | DateTime | IDMC job start |
| `Job_End_Time__c` | DateTime | IDMC job end (SLA start) |
| `Source_System__c` | Text(100) | Inferred from error (e.g., PostgreSQL, BigQuery) |
| `Task_Name__c` | Text(255) | Task identifier if available |
| `Success_Source_Rows__c` | Number | Rows processed successfully |
| `Failed_Target_Rows__c` | Number | Rows that failed |
| `Triggered_By__c` | Text(100) | `startedBy` from IDMC |
| `Is_Recurring__c` | Checkbox | Set by deduplication logic |
| `Recurrence_Count__c` | Number | How many times this pattern has recurred |

### 8.3 MuleSoft Flow — Pseudocode Logic

```
SCHEDULER: every 5 minutes

1. READ last_poll_cursor from persistent store (Object Store / DB)

2. CALL IDMC Activity Log API
   - startTime = last_poll_cursor
   - limit = 200

3. FOR EACH entry in response:
   a. IF entry.state NOT IN [2, 3] → SKIP
   b. CHECK deduplication: query SF for existing case with Run_ID = entry.runId
      - IF case exists AND case is open → increment Recurrence_Count, update case → SKIP new case
      - IF case exists AND case is closed → create new case with "Recurrence" flag
      - IF no case exists → proceed
   c. CLASSIFY failure category: match entry.errorMsg against pattern table
   d. ASSIGN priority: lookup category → priority matrix
   e. CHECK recurring pattern:
      - Query last 24h failures for same category
      - IF count >= 3 → elevate priority by one level, set Is_Recurring = true
   f. BUILD Platform Event payload
   g. FIRE Platform Event to Salesforce

4. UPDATE last_poll_cursor = max(entry.endTime) from this batch

5. LOG: poll timestamp, records processed, events fired, errors
```

---

## 9. Data Model & Case Schema

### 9.1 Salesforce Case — Standard Fields

| Field | Value / Source |
|-------|---------------|
| `Subject` | `IDMC Job FAILED — Run ID {runId} ({failureCategory})` |
| `Status` | `New` (on creation) |
| `Priority` | P1 / P2 / P3 / P4 (mapped from failure matrix) |
| `Origin` | `IDMC Monitoring` |
| `Description` | Full error message from IDMC |
| `Account` | Linked to customer account (if multi-tenant) |
| `Contact` | On-call engineer contact record |

### 9.2 Custom Fields on Case Object

| Field API Name | Type | Description |
|----------------|------|-------------|
| `IDMC_Run_ID__c` | Text(20), Unique | IDMC run identifier — deduplication key |
| `IDMC_State__c` | Picklist | Failed / Warning |
| `Failure_Category__c` | Picklist | CAT-01 through CAT-10 |
| `Source_System__c` | Text(100) | PostgreSQL / BigQuery / File System / etc. |
| `Job_Start_Time__c` | DateTime | When IDMC job started |
| `Job_End_Time__c` | DateTime | When IDMC job ended (SLA clock start) |
| `SLA_Due_Time__c` | DateTime | Calculated: Job_End_Time + SLA hours by priority |
| `SLA_Breached__c` | Checkbox | Auto-set when resolution time > SLA_Due_Time |
| `MTTR_Minutes__c` | Number | Calculated: (Resolved_Time - Job_End_Time) in minutes |
| `Success_Source_Rows__c` | Number | Rows successfully read |
| `Success_Target_Rows__c` | Number | Rows successfully written |
| `Failed_Target_Rows__c` | Number | Rows that failed to write |
| `Triggered_By__c` | Text(100) | User who triggered the IDMC job |
| `Is_Recurring__c` | Checkbox | True if same failure seen ≥ 3 times in 24h |
| `Recurrence_Count__c` | Number | How many times this failure has recurred |
| `Parent_Case__c` | Lookup(Case) | Links to parent if this is a recurring occurrence |
| `Root_Cause__c` | Picklist | Populated on resolution (agent offline / config / path / etc.) |
| `Resolution_Steps__c` | LongTextArea | Free text — what was done to resolve |
| `Verified_Run_ID__c` | Text(20) | IDMC run ID that confirmed successful re-run |
| `IDMC_Org_ID__c` | Text(50) | For multi-tenant managed services (which org) |

### 9.3 Sample Case Record — Based on Today's Failure

```
Subject           : IDMC Job FAILED — Run ID 8 (CAT-01: Secure Agent Offline)
Status            : New
Priority          : P1 — Critical
Origin            : IDMC Monitoring
SLA Due           : 2026-04-23 23:18 UTC  (4 hours from detection)

IDMC Run ID       : 8
IDMC State        : Failed
Failure Category  : CAT-01 — Secure Agent Offline
Source System     : PostgreSQL (POSTGRE_SQL_LAPTOP_infinityDB)
Job Start Time    : 2026-04-23 19:18:36 UTC
Job End Time      : 2026-04-23 19:18:37 UTC
Triggered By      : pavankumarsp

Success Source Rows : 0
Success Target Rows : 0
Failed Target Rows  : 0

Is Recurring      : No
Recurrence Count  : 1

Description:
  The test connection for POSTGRE_SQL_LAPTOP_infinityDB failed.
  Unable to resolve channel service. - No running service found
  of type Data_Integration_Server 76.* service for
  AgentGroup: 012BO72500000000000L

Assigned Queue    : Infrastructure — P1 Response
```

---

## 10. User Stories & Acceptance Criteria

### Epic 1 — Automated Failure Detection & Case Creation

---

**US-01 — L1 Support Agent: Auto-Case for Failed Job**

> *As an L1 support agent, I want a Service Cloud case to be automatically created whenever an IDMC job fails, so that I am immediately aware without manually checking IDMC.*

**Acceptance Criteria:**
- [ ] Given an IDMC job fails (state=3), when the next polling cycle completes, then a Service Cloud case is created within 5 minutes
- [ ] The case subject includes the Run ID and failure category
- [ ] The case description contains the full error message from IDMC
- [ ] The case priority is set according to the priority matrix (FR-03)
- [ ] The case is assigned to the correct queue based on the routing table (FR-07)
- [ ] A duplicate case is NOT created if a case for the same Run ID already exists

---

**US-02 — Data Engineering Lead: P1 Alert for Agent Offline**

> *As a data engineering lead, I want to receive an immediate Slack and email alert when a Secure Agent goes offline (P1 failure), so I can mobilize the team before a full data blackout occurs.*

**Acceptance Criteria:**
- [ ] Given a CAT-01 failure is detected, when the case is created, then a Slack message is posted to `#data-pipeline-incidents` within 5 minutes
- [ ] The Slack message includes: Run ID, error summary, SLA deadline, link to the Service Cloud case
- [ ] An email is sent to all members of the "Infrastructure — P1 Response" queue
- [ ] A Salesforce mobile push notification is sent to the designated on-call engineer

---

**US-03 — L1 Agent: Recurring Failure Identification**

> *As an L1 agent, I want to know when I'm looking at a recurring failure pattern, so I can escalate faster instead of solving the same problem repeatedly.*

**Acceptance Criteria:**
- [ ] Given the same failure category occurs ≥ 3 times for the same task within 24 hours, when the 3rd failure is detected, then the case priority is escalated by one level and "Is Recurring" is set to true
- [ ] The case description includes: "Recurring Pattern Detected — 3 occurrences in last 24 hours"
- [ ] Subsequent failures link to the parent case and increment the Recurrence Count field
- [ ] The daily digest email highlights recurring patterns with a count

---

### Epic 2 — SLA Management & Escalation

---

**US-04 — IT Operations Manager: SLA Tracking**

> *As an IT operations manager, I want SLA deadlines to be automatically calculated and tracked on every case, so I can ensure the team meets response commitments.*

**Acceptance Criteria:**
- [ ] Given a case is created with a priority level, then the SLA Due Time field is automatically populated (P1: +4h, P2: +8h, P3: +24h, P4: +48h from Job End Time)
- [ ] When the current time passes the SLA Due Time and the case is not resolved, then SLA Breached is set to true
- [ ] The SLA compliance dashboard reflects the breach within the next dashboard refresh cycle (≤ 5 min)

---

**US-05 — Escalation Manager: Proactive SLA Escalation**

> *As an escalation manager, I want to be notified 1 hour before a P1 case breaches its SLA, so I can intervene before the commitment is missed.*

**Acceptance Criteria:**
- [ ] Given a P1 case is open and the SLA Due Time is 1 hour away, then an email and Slack notification is sent to the Escalation Manager
- [ ] The notification includes: case number, current status, assignee, error summary, time remaining
- [ ] If the case is not acknowledged within 1 hour of creation, an additional escalation is triggered
- [ ] If the SLA is breached, the case owner is changed to the Escalation Manager automatically

---

### Epic 3 — Reporting & Visibility

---

**US-06 — CIO: Executive Health Dashboard**

> *As a CIO, I want a live dashboard showing overall pipeline health, so I can understand data operations risk at a glance without needing technical knowledge.*

**Acceptance Criteria:**
- [ ] The dashboard displays a "Pipeline Health Score" (0–100) calculated from: success rate × SLA compliance rate × (1 - recurring failure rate)
- [ ] The score is color-coded: green ≥ 85, amber 70–84, red < 70
- [ ] The dashboard shows week-over-week trend (improving / stable / degrading)
- [ ] A drill-down shows which tasks are driving the score down
- [ ] The dashboard is accessible from Salesforce Home and Tableau without additional login

---

**US-07 — Data Engineering Lead: Weekly Trend Report**

> *As a data engineering lead, I want an automated weekly report summarizing failure trends and top recurring issues, so I can prioritize preventive fixes.*

**Acceptance Criteria:**
- [ ] A PDF/email report is generated every Monday at 07:00 (configured timezone)
- [ ] The report includes: total runs, success rate, top 3 failure categories, top 3 most-failed tasks, MTTR vs. prior week
- [ ] Each top issue includes a recommended action (from knowledge base or rule-based suggestion)
- [ ] The report is delivered to: Data Engineering Lead, IT Operations Manager, and any configured distribution list

---

### Epic 4 — Resolution & Knowledge Management

---

**US-08 — L2 Engineer: Structured Resolution Capture**

> *As an L2 data engineer, I want to capture root cause and resolution steps on every case I close, so that the team builds institutional knowledge over time.*

**Acceptance Criteria:**
- [ ] A case cannot be moved to "Resolved" status without: Root Cause (picklist), Resolution Steps (text, min 20 characters)
- [ ] Optionally: a verified Run ID can be linked to confirm the pipeline ran successfully after the fix
- [ ] If the same Root Cause is selected on 3 closed cases, the system prompts: "Consider creating a Knowledge Article for this resolution"

---

**US-09 — L1 Agent: Knowledge Base Suggestions at Case Open**

> *As an L1 agent, I want to see suggested Knowledge Base articles when I open a case, so I can attempt self-resolution before escalating.*

**Acceptance Criteria:**
- [ ] When a case is opened (status changes from New to Acknowledged), the related Knowledge panel displays articles matching the Failure Category
- [ ] At least 1 article exists for each CAT-01 through CAT-07 failure category (pre-populated at launch)
- [ ] Clicking an article from the case does not navigate away from the case record

---

## 11. Priority Classification Matrix

### 11.1 Failure → Priority Quick Reference

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PRIORITY CLASSIFICATION MATRIX                   │
├──────────┬────────────────────────────┬──────────┬──────────────────┤
│ Priority │ Failure Type               │ SLA      │ Notification     │
├──────────┼────────────────────────────┼──────────┼──────────────────┤
│ P1       │ Secure Agent Offline       │ 4 hours  │ Slack + Email +  │
│ CRITICAL │ DTM Process Crash          │          │ Mobile Push      │
├──────────┼────────────────────────────┼──────────┼──────────────────┤
│ P2       │ Connection Failure         │ 8 hours  │ Email to queue   │
│ HIGH     │ Cloud Config Error         │          │                  │
├──────────┼────────────────────────────┼──────────┼──────────────────┤
│ P3       │ File Locked                │ 24 hours │ Queue only       │
│ MEDIUM   │ File Not Found / Bad Path  │          │                  │
├──────────┼────────────────────────────┼──────────┼──────────────────┤
│ P4       │ Metadata Error             │ 48 hours │ Queue only       │
│ LOW      │ User Stopped               │          │                  │
│          │ Schema Error               │          │                  │
│          │ Unknown                    │          │                  │
└──────────┴────────────────────────────┴──────────┴──────────────────┘

RECURRING RULE: If same category fails ≥ 3 times in 24h → escalate priority by 1 level
```

---

## 12. Implementation Roadmap

### Phase 1 — Foundation (Weeks 1–2) · MVP

**Goal:** Get the core auto-ticketing loop working end-to-end. Prove value with live failures.

| Task | Owner | Effort | Dependency |
|------|-------|--------|------------|
| IDMC API authentication setup (Named Credential / OAuth) | Integration Engineer | 0.5 days | IDMC admin access |
| MuleSoft scheduled flow — poll IDMC Activity Log | Integration Engineer | 2 days | Above |
| Failure classification logic (pattern matching, CAT-01 to CAT-10) | Integration Engineer | 1 day | Above |
| Priority assignment logic | Integration Engineer | 0.5 days | Above |
| Salesforce Platform Event schema creation | Salesforce Admin | 0.5 days | — |
| Service Cloud Case custom fields (Section 9.2) | Salesforce Admin | 1 day | — |
| Case creation Flow (Platform Event → Case) | Salesforce Admin | 1 day | Above |
| Queue setup + basic routing rules | Salesforce Admin | 0.5 days | — |
| Email notification for P1/P2 | Salesforce Admin | 0.5 days | — |
| End-to-end testing (simulate failure, verify case) | QA | 2 days | All above |
| **Phase 1 total** | | **~9 days** | |

**Phase 1 exit criteria:** Today's Run ID 8 failure type (CAT-01) automatically creates a P1 Service Cloud case within 5 minutes of job failure.

---

### Phase 2 — Intelligence (Weeks 3–5) · Production-Ready

**Goal:** Add deduplication, escalation, SLA tracking, Slack integration, and recurring failure detection.

| Task | Owner | Effort |
|------|-------|--------|
| Deduplication logic (Run ID check before case creation) | Integration Engineer | 1 day |
| Recurring failure detection (24h window, 3x threshold) | Integration Engineer | 1.5 days |
| SLA Due Time calculation (auto-populate on case) | Salesforce Admin | 1 day |
| Escalation rules (1hr unacknowledged P1, SLA-1hr warning) | Salesforce Admin | 1.5 days |
| Slack integration (MuleSoft → Slack webhook) | Integration Engineer | 1 day |
| Mobile push notification configuration | Salesforce Admin | 0.5 days |
| Knowledge Base — seed articles for CAT-01 to CAT-07 | Data Engineering Lead | 2 days |
| Knowledge suggestion panel on case layout | Salesforce Admin | 0.5 days |
| Resolution workflow (required fields before Resolved) | Salesforce Admin | 0.5 days |
| End-to-end testing & UAT | QA + Stakeholders | 3 days |
| **Phase 2 total** | | **~13 days** |

---

### Phase 3 — Visibility (Weeks 6–8) · Full Operational

**Goal:** Build the leadership dashboard, weekly digest, and executive health score.

| Task | Owner | Effort |
|------|-------|--------|
| Tableau CRM dataset setup (Cases + IDMC metadata) | BI Engineer | 2 days |
| Live Pipeline Status dashboard (View 1) | BI Engineer | 1.5 days |
| Failure Trend Analysis dashboard (View 2) | BI Engineer | 1.5 days |
| SLA Performance dashboard (View 3) | BI Engineer | 1 day |
| Pipeline Health Score formula + color-coding | BI Engineer | 1 day |
| Daily digest email automation | Salesforce Admin | 1 day |
| Weekly executive PDF report | BI Engineer | 2 days |
| Dashboard rollout, training, sign-off | PM + Stakeholders | 2 days |
| **Phase 3 total** | | **~13 days** |

---

### Phase 4 — Managed Services Expansion (Month 3+) · Upsell

**Goal:** Extend the solution to a multi-tenant Managed Data Operations service offering.

| Task | Description |
|------|-------------|
| Multi-org support | Parameterize IDMC org ID in all flows; single Salesforce instance monitors N customer orgs |
| Customer-facing portal | Salesforce Experience Cloud portal where customers see their own pipeline health (self-service) |
| Automated runbook execution | For CAT-02 (file lock) and CAT-03 (file not found): auto-remediation scripts triggered from case |
| Proactive capacity reporting | Monthly report showing pipeline growth, volume trends, scale recommendations |
| IDMC Business 360 integration | Feed case resolution data back into Informatica for closed-loop pipeline health scoring |

---

### Summary Timeline

```
Week 1–2    ████████████ Phase 1: MVP (core auto-ticketing)
Week 3–5    ████████████████████ Phase 2: Intelligence (SLA, escalation, dedup)
Week 6–8    ████████████████████ Phase 3: Visibility (dashboards, reports)
Month 3+    ░░░░░░░░░░░░ Phase 4: Managed Services expansion
```

---

## 13. Revenue & Licensing Summary

### 13.1 Salesforce Components

| Product | Use in This Solution | Licensing Model |
|---------|---------------------|-----------------|
| **Service Cloud** | Case management, SLA engine, escalation rules, queues | Per-seat (support agents + engineers) |
| **MuleSoft Anypoint Platform** | Integration layer — polls IDMC, fires Platform Events | Anypoint Platform subscription (capacity-based) |
| **Tableau CRM / Einstein Analytics** | Operational health dashboards | Per-seat or platform license |
| **Salesforce Flow** | Automation — case creation, escalation, SLA | Included with Service Cloud |
| **Platform Events** | Async event bus between MuleSoft and Service Cloud | Included with Salesforce platform |
| **Experience Cloud** (Phase 4) | Customer-facing pipeline health portal | Per-login or member license |

### 13.2 Informatica Components

| Product | Use in This Solution | Licensing Model |
|---------|---------------------|-----------------|
| **IDMC Advanced / Business 360** | Operational Health monitoring SKU; Activity Log API access | Subscription (per org / IPU-based) |
| **Informatica Professional Services** | Phase 1–2 implementation; connector fix engagements | T&M or fixed-fee SOW |
| **Informatica Managed Services** | Phase 4 multi-tenant managed operations | Monthly managed services contract |
| **Support Contract (SLA-backed)** | Guaranteed response SLA for P1 issues (e.g., DTM crashes) | Annual contract (Platinum/Premier tier) |

### 13.3 Estimated ARR Opportunity

| Component | Estimated ARR Range |
|-----------|-------------------|
| Salesforce Service Cloud (10 seats) | $15,000 – $30,000 |
| MuleSoft Anypoint (integration) | $40,000 – $80,000 |
| Tableau CRM (5 seats) | $10,000 – $20,000 |
| Informatica IDMC Advanced | $30,000 – $60,000 |
| Informatica Managed Services | $50,000 – $120,000 |
| Informatica Support Contract (Premier) | $20,000 – $40,000 |
| **Total Estimated ARR** | **$165,000 – $350,000** |

*Note: Ranges reflect SMB to enterprise scale. Actual pricing subject to negotiation and org size.*

### 13.4 Professional Services One-Time Fees

| Engagement | Scope | Estimated Effort |
|-----------|-------|-----------------|
| Phase 1 implementation | Core auto-ticketing MVP | 9 days (~$18,000–$27,000) |
| Phase 2 implementation | Intelligence + escalation | 13 days (~$26,000–$39,000) |
| Phase 3 implementation | Dashboards + reporting | 13 days (~$26,000–$39,000) |
| **Total PS** | Phases 1–3 | **~$70,000–$105,000** |

---

## 14. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| IDMC API rate limits throttle polling | Medium | Medium | Implement exponential backoff; batch requests; use max `limit=200` per call |
| False positive cases (e.g., user-stopped jobs treated as failures) | Medium | Low | Exclude CAT-08 from alerting or route to low-priority queue with auto-close |
| Secure Agent intermittently offline → case storm | High | Medium | Deduplication logic (FR-05) prevents duplicate cases; recurring flag groups them |
| MuleSoft flow downtime causes missed failure detection | Low | High | Implement heartbeat monitoring on the MuleSoft flow itself; alert if no poll in >15 min |
| IDMC session token expiry during long-running windows | Medium | Medium | Implement token refresh logic; store refresh token in Named Credential |
| Team adoption resistance | Medium | Medium | Phase 1 demo with today's real failure (Run ID 8) as proof of value |
| Scope creep into full AIOps platform | Low | High | Fix scope at Phase 3; Phase 4 is a separate SOW |

---

## 15. Appendix — Live Evidence from Org

The following data was pulled live from the customer's IDMC org on **2026-04-23** using the Activity Log API. This data directly informed this requirements document.

### 15.1 Overall Statistics

| Metric | Value |
|--------|-------|
| Total job runs retrieved | 200 |
| Successful runs (state=1) | ~155 (77.5%) |
| Warning runs (state=2) | ~8 (4.0%) |
| Failed runs (state=3) | ~37 (18.5%) |
| Date range | 2024-06-30 to 2026-04-23 |
| Primary user | pavankumarsp |

### 15.2 Most Recent Failure (P1 Active Today)

```json
{
  "runId": 8,
  "state": 3,
  "startTime": "2026-04-23T19:18:36.000Z",
  "endTime": "2026-04-23T19:18:37.000Z",
  "successSourceRows": 0,
  "failedSourceRows": 0,
  "successTargetRows": 0,
  "failedTargetRows": 0,
  "errorMsg": "The test connection for POSTGRE_SQL_LAPTOP_infinityDB failed.
               Unable to resolve channel service. - No running service found
               of type Data_Integration_Server 76.* service for
               AgentGroup: 012BO72500000000000L",
  "startedBy": "pavankumarsp"
}
```

**Classification:** CAT-01 — Secure Agent Offline  
**Priority:** P1 — Critical  
**SLA Deadline:** 2026-04-23 23:18:37 UTC (4 hours)  
**Current Status:** No case exists — **this failure is untracked as of document creation**

### 15.3 Top Recurring Failure Patterns (Last 12 Months)

| Pattern | Occurrences | Example Task/Source |
|---------|-------------|---------------------|
| File locked by another process | 8 | AmEx Gold, Capital One, All_Customers CSV |
| BigQuery configuration errors | 9 | analytics_481943019, GA_US dataset |
| File not found / bad path | 6 | AmExGold_FileList.txt, CapOne files |
| Secure Agent / connection offline | 3 | infinityDB, infinityStgDB |
| DTM process crash | 5 | Multiple tasks (Oct 2024) |
| CCI Metadata errors | 4 | Multiple tasks (Mar 2025) |

### 15.4 Recurring File-Lock Pattern (P3 → P2 Escalation Candidate)

The following runs all failed with an identical file-lock error on Capital One CSV files:

| Run ID | Date | Error |
|--------|------|-------|
| 5 | 2025-08-02 | CapOne.csv locked |
| 3 | 2025-08-02 | CapOne.csv locked |
| 1 | 2025-08-02 | CapOne.csv locked |
| 7 | 2025-09-14 | CapOne-History1.csv locked |

**Under this system:** The 3rd occurrence on 2025-08-02 would have triggered the recurring escalation rule, elevating from P3 → P2 and alerting the data engineering queue — ensuring the pattern was addressed, not ignored.

---

*End of Document*

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-23 | Pavan Kumar SP | Initial draft |

**Next Steps:**
1. Share with Data Engineering Lead for technical review
2. Share with Salesforce Admin for effort re-estimation
3. Schedule stakeholder walkthrough (recommend: 60-minute session)
4. Obtain sign-off before Phase 1 kickoff
