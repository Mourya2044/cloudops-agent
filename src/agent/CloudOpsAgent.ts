import { createWorkersAI } from "workers-ai-provider";
import { callable } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText
} from "ai";
import type {
  ServiceSummary,
  RemediationResult
} from "../types/infrastructure";
import type {
  IncidentRecord,
  IncidentScenarioId,
  WorkflowStepRecord
} from "../types/incident";
import {
  getInfrastructureProvider,
  CloudflareInfrastructureProvider
} from "../infrastructure";
import { defaultIncidentHistory } from "../incidents/history";
import { createInfrastructureTools } from "../tools/infrastructureTools";
import { createRemediationTools } from "../tools/remediationTools";
import { SCENARIOS } from "../data/scenarios";

export interface CloudOpsAgentState {
  currentService: string;
  activeScenarioId?: IncidentScenarioId;
  activeInvestigation?: {
    incidentId: string;
    serviceName: string;
    status: string;
    rootCause?: string;
    evidence?: string[];
    recommendedAction?: string;
    targetVersion?: string;
    remediationResult?: RemediationResult;
    workflowInstanceId?: string;
  };
  workflowSteps: WorkflowStepRecord[];
  pendingApproval?: {
    approvalId: string;
    action: "rollback" | "restart";
    serviceName: string;
    targetVersion?: string;
    description: string;
    workflowInstanceId?: string;
  };
  lastUpdated: string;
}

interface AgentWorkflowMethods {
  runWorkflow?: (name: string, params: unknown) => Promise<string>;
  approveWorkflow?: (id: string, options: unknown) => Promise<void>;
  rejectWorkflow?: (id: string, options: unknown) => Promise<void>;
}

export class CloudOpsAgent extends AIChatAgent<Env, CloudOpsAgentState> {
  maxPersistedMessages = 100;
  chatRecovery = true;
  waitForMcpConnections = false;

  initialState: CloudOpsAgentState = {
    currentService: "payment-api",
    activeScenarioId: undefined,
    workflowSteps: [],
    lastUpdated: new Date().toISOString()
  };

  private get provider() {
    return getInfrastructureProvider(this.env);
  }

  private get history() {
    return defaultIncidentHistory;
  }

  onStart() {
    // Initialize or restore state
    if (!this.state.workflowSteps) {
      this.setState({
        ...this.state,
        workflowSteps: []
      });
    }
  }

  // ── RPC Callable Methods (Exposed to UI & Workers) ─────────────────────────

  @callable()
  async getAgentState(): Promise<CloudOpsAgentState> {
    return this.state;
  }

  @callable()
  async getInfrastructureOverview(): Promise<{
    providerType: "cloudflare" | "synthetic";
    services: ServiceSummary[];
    activeScenario?: IncidentScenarioId;
    activeInvestigation?: CloudOpsAgentState["activeInvestigation"];
    workflowSteps: WorkflowStepRecord[];
    pendingApproval?: CloudOpsAgentState["pendingApproval"];
    latestTelemetryTimestamp: string;
  }> {
    const services = await this.provider.listServices();
    const providerType =
      this.provider instanceof CloudflareInfrastructureProvider
        ? "cloudflare"
        : "synthetic";

    return {
      providerType,
      services,
      activeScenario: this.state.activeScenarioId,
      activeInvestigation: this.state.activeInvestigation,
      workflowSteps: this.state.workflowSteps || [],
      pendingApproval: this.state.pendingApproval,
      latestTelemetryTimestamp: new Date().toISOString()
    };
  }

  @callable()
  async triggerScenario(scenarioId: IncidentScenarioId): Promise<{
    success: boolean;
    scenarioId: IncidentScenarioId;
    serviceName: string;
    description: string;
  }> {
    const scenario = SCENARIOS[scenarioId];
    if (!scenario) {
      throw new Error(`Scenario '${scenarioId}' not found.`);
    }

    this.provider.resetScenario(scenarioId);

    const steps: WorkflowStepRecord[] = [
      {
        step: "parse_incident",
        displayName: "Parse Incident",
        status: "pending"
      },
      {
        step: "retrieve_service_health",
        displayName: "Retrieve Service Health",
        status: "pending"
      },
      {
        step: "retrieve_metrics",
        displayName: "Retrieve Metrics",
        status: "pending"
      },
      {
        step: "retrieve_logs",
        displayName: "Retrieve Logs",
        status: "pending"
      },
      {
        step: "retrieve_deployment_history",
        displayName: "Retrieve Deployment History",
        status: "pending"
      },
      {
        step: "retrieve_database_health",
        displayName: "Retrieve Database Health",
        status: "pending"
      },
      {
        step: "correlate_evidence",
        displayName: "Correlate Evidence",
        status: "pending"
      },
      {
        step: "generate_diagnosis",
        displayName: "Generate Diagnosis",
        status: "pending"
      },
      {
        step: "recommend_remediation",
        displayName: "Recommend Remediation",
        status: "pending"
      },
      {
        step: "wait_for_human_approval",
        displayName: "Wait for Human Approval",
        status: "pending"
      },
      {
        step: "execute_remediation",
        displayName: "Execute Remediation",
        status: "pending"
      },
      {
        step: "verify_service_health",
        displayName: "Verify Service Health",
        status: "pending"
      },
      {
        step: "generate_final_report",
        displayName: "Generate Final Report",
        status: "pending"
      }
    ];

    this.setState({
      ...this.state,
      currentService: scenario.serviceName,
      activeScenarioId: scenarioId,
      activeInvestigation: {
        incidentId: `INC-${Date.now().toString(36).toUpperCase()}`,
        serviceName: scenario.serviceName,
        status: "investigating"
      },
      workflowSteps: steps,
      pendingApproval: undefined,
      lastUpdated: new Date().toISOString()
    });

    this.broadcast(
      JSON.stringify({
        type: "scenario_triggered",
        scenarioId,
        serviceName: scenario.serviceName,
        description: scenario.description
      })
    );

    return {
      success: true,
      scenarioId,
      serviceName: scenario.serviceName,
      description: scenario.description
    };
  }

  @callable()
  async resetState(): Promise<{ success: boolean; message: string }> {
    this.provider.resetScenario();
    this.history.reset();

    this.setState({
      currentService: "payment-api",
      activeScenarioId: undefined,
      activeInvestigation: undefined,
      workflowSteps: [],
      pendingApproval: undefined,
      lastUpdated: new Date().toISOString()
    });

    this.broadcast(JSON.stringify({ type: "state_reset" }));
    return {
      success: true,
      message: "Infrastructure and agent state reset to clean baseline."
    };
  }

  @callable()
  async startWorkflowInvestigation(serviceName: string): Promise<{
    instanceId: string;
    serviceName: string;
  }> {
    const incidentId = `INC-${Date.now().toString(36).toUpperCase()}`;
    const scenarioId =
      this.provider.getActiveScenarioId(serviceName) || undefined;

    // Trigger Cloudflare Workflow through Agent binding
    let instanceId = `wf-${Date.now()}`;
    const workflowTarget = this as unknown as AgentWorkflowMethods;
    const envTarget = this.env as unknown as { INCIDENT_WORKFLOW?: Workflow };

    try {
      if (envTarget.INCIDENT_WORKFLOW && workflowTarget.runWorkflow) {
        instanceId = await workflowTarget.runWorkflow("INCIDENT_WORKFLOW", {
          incidentId,
          serviceName,
          scenarioId
        });
      }
    } catch (err) {
      console.warn(
        "Could not invoke Cloudflare Workflow directly, using local simulation id:",
        err
      );
    }

    const steps: WorkflowStepRecord[] = [
      {
        step: "parse_incident",
        displayName: "Parse Incident",
        status: "running"
      },
      {
        step: "retrieve_service_health",
        displayName: "Retrieve Service Health",
        status: "pending"
      },
      {
        step: "retrieve_metrics",
        displayName: "Retrieve Metrics",
        status: "pending"
      },
      {
        step: "retrieve_logs",
        displayName: "Retrieve Logs",
        status: "pending"
      },
      {
        step: "retrieve_deployment_history",
        displayName: "Retrieve Deployment History",
        status: "pending"
      },
      {
        step: "retrieve_database_health",
        displayName: "Retrieve Database Health",
        status: "pending"
      },
      {
        step: "correlate_evidence",
        displayName: "Correlate Evidence",
        status: "pending"
      },
      {
        step: "generate_diagnosis",
        displayName: "Generate Diagnosis",
        status: "pending"
      },
      {
        step: "recommend_remediation",
        displayName: "Recommend Remediation",
        status: "pending"
      },
      {
        step: "wait_for_human_approval",
        displayName: "Wait for Human Approval",
        status: "pending"
      },
      {
        step: "execute_remediation",
        displayName: "Execute Remediation",
        status: "pending"
      },
      {
        step: "verify_service_health",
        displayName: "Verify Service Health",
        status: "pending"
      },
      {
        step: "generate_final_report",
        displayName: "Generate Final Report",
        status: "pending"
      }
    ];

    this.setState({
      ...this.state,
      currentService: serviceName,
      activeInvestigation: {
        incidentId,
        serviceName,
        status: "investigating",
        workflowInstanceId: instanceId
      },
      workflowSteps: steps,
      lastUpdated: new Date().toISOString()
    });

    this.broadcast(
      JSON.stringify({
        type: "workflow_started",
        instanceId,
        serviceName,
        incidentId
      })
    );

    return { instanceId, serviceName };
  }

  @callable()
  async submitApproval(
    approvalId: string,
    approved: boolean,
    reason?: string
  ): Promise<{ success: boolean; approved: boolean; message: string }> {
    const pending = this.state.pendingApproval;
    const workflowId =
      pending?.workflowInstanceId ||
      this.state.activeInvestigation?.workflowInstanceId;
    const workflowTarget = this as unknown as AgentWorkflowMethods;

    if (approved) {
      if (workflowId && workflowTarget.approveWorkflow) {
        try {
          await workflowTarget.approveWorkflow(workflowId, {
            reason: reason || "Approved by operator via CloudOps Console",
            metadata: { approved: true }
          });
        } catch (e) {
          console.warn("Workflow approval delivery warning:", e);
        }
      }

      // Execute simulated remediation immediately if direct
      let remediationResult: RemediationResult | undefined;
      if (pending?.action === "rollback" && pending.targetVersion) {
        remediationResult = await this.provider.rollbackDeployment(
          pending.serviceName,
          pending.targetVersion
        );
      } else if (pending?.serviceName) {
        remediationResult = await this.provider.restartService(
          pending.serviceName,
          true
        );
      }

      const verification = pending?.serviceName
        ? await this.provider.verifyServiceHealth(pending.serviceName)
        : undefined;

      this.setState({
        ...this.state,
        pendingApproval: undefined,
        activeInvestigation: this.state.activeInvestigation
          ? {
              ...this.state.activeInvestigation,
              status: "resolved",
              remediationResult
            }
          : undefined,
        lastUpdated: new Date().toISOString()
      });

      this.broadcast(
        JSON.stringify({
          type: "approval_completed",
          approved: true,
          remediationResult,
          verification
        })
      );

      return {
        success: true,
        approved: true,
        message: `Remediation APPROVED. ${remediationResult?.message || "Remediation executed."} ${verification?.message || ""}`
      };
    } else {
      // Rejection
      if (workflowId && workflowTarget.rejectWorkflow) {
        try {
          await workflowTarget.rejectWorkflow(workflowId, {
            reason: reason || "Rejected by operator via CloudOps Console"
          });
        } catch (e) {
          console.warn("Workflow rejection delivery warning:", e);
        }
      }

      this.setState({
        ...this.state,
        pendingApproval: undefined,
        activeInvestigation: this.state.activeInvestigation
          ? {
              ...this.state.activeInvestigation,
              status: "remediation_rejected"
            }
          : undefined,
        lastUpdated: new Date().toISOString()
      });

      this.broadcast(
        JSON.stringify({
          type: "approval_completed",
          approved: false,
          reason: reason || "Rejected by operator"
        })
      );

      return {
        success: true,
        approved: false,
        message:
          "Remediation REJECTED. Investigation preserved. No system changes executed."
      };
    }
  }

  @callable()
  async getIncidentHistory(): Promise<IncidentRecord[]> {
    return this.history.listAll();
  }

  // ── Workflow Lifecycle Callbacks (AgentWorkflow Integration) ───────────────

  async onWorkflowProgress(
    _workflowName: string,
    workflowId: string,
    progress: unknown
  ): Promise<void> {
    const p = progress as {
      step?: string;
      status?: string;
      message?: string;
      details?: {
        recommendation?: {
          action: "rollback" | "restart";
          targetVersion?: string;
          description: string;
        };
      };
    };
    if (!p) return;

    const currentSteps = [...(this.state.workflowSteps || [])];
    const stepIdx = currentSteps.findIndex((s) => s.step === p.step);

    if (stepIdx >= 0) {
      currentSteps[stepIdx] = {
        ...currentSteps[stepIdx],
        status:
          p.status === "running"
            ? "running"
            : p.status === "complete"
              ? "completed"
              : (p.status as WorkflowStepRecord["status"]) || "pending",
        outputSummary: p.message,
        details: p.details,
        completedAt:
          p.status === "complete" ? new Date().toISOString() : undefined
      };
    }

    let pendingApproval = this.state.pendingApproval;
    if (p.status === "waiting_approval" && p.details?.recommendation) {
      const rec = p.details.recommendation;
      pendingApproval = {
        approvalId: `appr-${Date.now().toString(36)}`,
        action: rec.action,
        serviceName: this.state.currentService,
        targetVersion: rec.targetVersion,
        description: rec.description,
        workflowInstanceId: workflowId
      };
    }

    this.setState({
      ...this.state,
      workflowSteps: currentSteps,
      pendingApproval,
      lastUpdated: new Date().toISOString()
    });

    this.broadcast(
      JSON.stringify({
        type: "workflow_progress",
        progress: p,
        steps: currentSteps,
        pendingApproval
      })
    );
  }

  async onWorkflowComplete(
    _workflowName: string,
    _workflowId: string,
    result?: unknown
  ): Promise<void> {
    const res = result as { remediationResult?: RemediationResult } | undefined;
    this.setState({
      ...this.state,
      pendingApproval: undefined,
      activeInvestigation: this.state.activeInvestigation
        ? {
            ...this.state.activeInvestigation,
            status: "resolved",
            remediationResult: res?.remediationResult
          }
        : undefined,
      lastUpdated: new Date().toISOString()
    });

    this.broadcast(
      JSON.stringify({
        type: "workflow_complete",
        result
      })
    );
  }

  async onWorkflowError(
    _workflowName: string,
    _workflowId: string,
    error: string
  ): Promise<void> {
    this.broadcast(
      JSON.stringify({
        type: "workflow_error",
        error
      })
    );
  }

  // ── Interactive Chat Handler ───────────────────────────────────────────────

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const infraTools = createInfrastructureTools(this.provider, this.history);
    const remediationTools = createRemediationTools(this.provider);

    const systemPrompt = `You are CloudOps Agent, a senior Site Reliability Engineering (SRE) and infrastructure operations AI assistant running on Cloudflare.

PRIMARY RESPONSIBILITIES:
1. Methodically investigate microservice and Cloudflare Worker incidents using your infrastructure inspection tools:
   - getServiceHealth: check live status, error rate, p95 latency, and active deployment version.
   - getMetrics: retrieve time-series latency, error rates, CPU/memory, and connection trends.
   - getLogs: analyze application error stack traces, timeouts, and crash signals.
   - getDeploymentHistory: determine recent code releases, changelogs, and rollback versions.
   - getDatabaseHealth: inspect database status, or verify if database telemetry is unavailable.
   - searchIncidentHistory: recall past similar incidents and post-mortems.

2. INVESTIGATION METHODOLOGY & EVIDENCE-BASED DIAGNOSIS:
   - NEVER invent or assume infrastructure state. ALWAYS call tools to gather facts before drawing conclusions.
   - You MUST clearly distinguish between OBSERVED EVIDENCE (facts from tool outputs) and AI INFERENCE (hypotheses and deductions):
     * Format your diagnosis with:
       ### Observed Evidence:
       - [Specific factual metrics, timestamps, logs, or deployment hashes returned by tools]
       ### AI Inference / Root Cause Analysis:
       - [Logical deduction linking the evidence to the root cause]
       ### Recommended Remediation:
       - [Concrete action such as rollbackDeployment with target version]
   - UNAVAILABLE TELEMETRY: If a tool reports that telemetry is not available or unsupported (e.g. database connection pool telemetry for serverless Workers without Hyperdrive), explicitly state that it is not available. NEVER interpret unavailable telemetry as healthy.

3. CLOUDFLARE INFRASTRUCTURE RULES:
   - Cloudflare Workers are serverless stateless edge isolates. They do NOT run on long-lived virtual machines or container pods. Traditional service restarts are unsupported (restartService returns unsupported_operation).
   - The primary mutation for Worker degradation is rollbackDeployment to a prior deployment version.
   - Mutating tools (rollbackDeployment and restartService) require MANDATORY human operator approval before execution. When recommending a rollback, call rollbackDeployment so the UI prompts the human operator with [Approve] and [Reject] buttons.

4. MEMORY & HISTORICAL COMPARISON:
   - If the operator asks follow-up questions such as "Wasn't this the same issue we had last month?", use searchIncidentHistory to locate the past incident (e.g., INC-2026-08-14-PAY) and explain the exact architectural and operational similarities.

Current UTC Time: ${new Date().toISOString()}`;

    // Prefer Llama 3.3 70B Instruct fast model on Cloudflare Workers AI
    const result = streamText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        sessionAffinity: this.sessionAffinity
      }),
      system: systemPrompt,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),
      tools: {
        ...infraTools,
        ...remediationTools
      },
      stopWhen: stepCountIs(20),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}
