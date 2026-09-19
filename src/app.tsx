import { Suspense, useCallback, useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { CloudOpsAgent } from "./server";
import type {
  ServiceSummary,
  ServiceHealthStatus,
  RemediationResult
} from "./types/infrastructure";
import type { IncidentScenarioId, WorkflowStepRecord } from "./types/incident";
import {
  Badge,
  Button,
  InputArea,
  PoweredByCloudflare,
  Surface,
  Text
} from "@cloudflare/kumo";
import { Toasty } from "@cloudflare/kumo/components/toast";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  PaperPlaneRightIcon,
  StopIcon,
  GearIcon,
  MoonIcon,
  SunIcon,
  CheckCircleIcon,
  XCircleIcon,
  BrainIcon,
  CaretDownIcon,
  WarningCircleIcon,
  ArrowsClockwiseIcon,
  ClockIcon,
  LightningIcon,
  CheckIcon,
  XIcon,
  GitBranchIcon
} from "@phosphor-icons/react";

// ── Theme Toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    const mode = next ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem("theme", mode);
  }, [dark]);

  return (
    <Button
      variant="secondary"
      shape="square"
      icon={dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      onClick={toggle}
      aria-label="Toggle theme"
    />
  );
}

// ── Status Badge Helper ───────────────────────────────────────────────────────

function HealthBadge({ status }: { status: ServiceHealthStatus }) {
  if (status === "healthy") {
    return <Badge variant="primary">Healthy</Badge>;
  }
  if (status === "degraded") {
    return <Badge variant="secondary">Degraded</Badge>;
  }
  return <Badge variant="destructive">Critical</Badge>;
}

// ── Tool Parts View ──────────────────────────────────────────────────────────

function ToolIO({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!text) return null;
  return (
    <div className="mt-1">
      <Text size="xs" variant="secondary" bold>
        {label}
      </Text>
      <pre className="mt-0.5 font-mono text-xs text-kumo-subtle whitespace-pre-wrap overflow-auto max-h-48 bg-kumo-control p-2 rounded">
        {text}
      </pre>
    </div>
  );
}

function ToolPartView({
  part,
  addToolApprovalResponse
}: {
  part: UIMessage["parts"][number];
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
  }) => void;
}) {
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);

  if (part.state === "output-available") {
    return (
      <div className="flex justify-start my-2">
        <Surface className="max-w-[95%] w-full px-3 py-2 rounded-xl ring ring-kumo-line bg-kumo-base">
          <div className="flex items-center gap-2 mb-1">
            <GearIcon size={14} className="text-kumo-inactive" />
            <Text size="xs" variant="secondary" bold>
              Tool: {toolName}
            </Text>
            <Badge variant="secondary">Success</Badge>
          </div>
          <ToolIO label="Result" value={part.output} />
        </Surface>
      </div>
    );
  }

  if ("approval" in part && part.state === "approval-requested") {
    const approvalId = (part.approval as { id?: string })?.id;
    return (
      <div className="flex justify-start my-3">
        <Surface className="max-w-[95%] w-full px-4 py-3 rounded-xl ring-2 ring-amber-500 bg-amber-500/10">
          <div className="flex items-center gap-2 mb-2">
            <WarningCircleIcon size={18} className="text-amber-500" />
            <Text size="sm" bold>
              Human Approval Required: {toolName}
            </Text>
          </div>
          <div className="font-mono mb-3">
            <Text size="xs" variant="secondary">
              The agent proposed executing mutating action:
            </Text>
            <pre className="mt-1 text-xs bg-kumo-base p-2 rounded border border-amber-500/30">
              {JSON.stringify(part.input, null, 2)}
            </pre>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircleIcon size={14} />}
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: true });
                }
              }}
            >
              Approve Action
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<XCircleIcon size={14} />}
              onClick={() => {
                if (approvalId) {
                  addToolApprovalResponse({ id: approvalId, approved: false });
                }
              }}
            >
              Reject
            </Button>
          </div>
        </Surface>
      </div>
    );
  }

  if (
    part.state === "output-denied" ||
    ("approval" in part &&
      (part.approval as { approved?: boolean })?.approved === false)
  ) {
    return (
      <div className="flex justify-start my-2">
        <Surface className="max-w-[95%] w-full px-3 py-2 rounded-xl ring ring-red-500/30 bg-red-500/5">
          <div className="flex items-center gap-2">
            <XCircleIcon size={14} className="text-red-500" />
            <Text size="xs" bold>
              Tool Execution Rejected: {toolName}
            </Text>
            <Badge variant="destructive">Denied</Badge>
          </div>
        </Surface>
      </div>
    );
  }

  return null;
}

// ── Main CloudOps Console ────────────────────────────────────────────────────

interface InfrastructureOverviewResponse {
  providerType?: "cloudflare" | "synthetic";
  services: ServiceSummary[];
  activeScenario?: IncidentScenarioId;
  activeInvestigation?: {
    incidentId: string;
    serviceName: string;
    status: string;
    rootCause?: string;
    evidence?: string[];
    recommendedAction?: string;
    targetVersion?: string;
    remediationResult?: RemediationResult;
  };
  workflowSteps: WorkflowStepRecord[];
  pendingApproval?: {
    approvalId: string;
    action: "rollback" | "restart";
    serviceName: string;
    targetVersion?: string;
    description: string;
  };
  latestTelemetryTimestamp?: string;
}

export function CloudOpsConsole() {
  const agent = useAgent<CloudOpsAgent>({
    agent: "CloudOpsAgent",
    name: "ops-session"
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    addToolApprovalResponse,
    status,
    stop
  } = useAgentChat({
    agent
  });

  const isStreaming = status === "streaming";
  const [connected, setConnected] = useState(false);

  // State synchronized with Agent
  const [providerType, setProviderType] = useState<"cloudflare" | "synthetic">(
    "synthetic"
  );
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [activeScenario, setActiveScenario] = useState<
    IncidentScenarioId | undefined
  >("payment-api-leak");
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStepRecord[]>([]);
  const [activeInvestigation, setActiveInvestigation] =
    useState<InfrastructureOverviewResponse["activeInvestigation"]>(undefined);
  const [pendingApproval, setPendingApproval] =
    useState<InfrastructureOverviewResponse["pendingApproval"]>(undefined);
  const [latestTelemetryTimestamp, setLatestTelemetryTimestamp] =
    useState<string>("");
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Poll overview & listen to Agent broadcast events
  const refreshOverview = useCallback(async () => {
    try {
      const overview = await agent.call<InfrastructureOverviewResponse>(
        "getInfrastructureOverview"
      );
      if (overview) {
        if (overview.providerType) {
          setProviderType(overview.providerType);
        }
        setServices(overview.services || []);
        setActiveScenario(overview.activeScenario);
        setActiveInvestigation(overview.activeInvestigation);
        setWorkflowSteps(overview.workflowSteps || []);
        setPendingApproval(overview.pendingApproval);
        if (overview.latestTelemetryTimestamp) {
          setLatestTelemetryTimestamp(overview.latestTelemetryTimestamp);
        }
        setConnected(true);
      }
    } catch {
      // Agent might be waking up or connecting
    }
  }, [agent]);

  useEffect(() => {
    refreshOverview();
    const timer = setInterval(refreshOverview, 3000);
    return () => clearInterval(timer);
  }, [refreshOverview]);

  // Handle agent broadcasts
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "workflow_progress") {
          refreshOverview();
        } else if (data.type === "approval_completed") {
          refreshOverview();
        } else if (data.type === "scenario_triggered") {
          refreshOverview();
        }
      } catch {
        // Non-JSON broadcast
      }
    };

    agent.addEventListener("message", handleMessage as EventListener);
    agent.addEventListener("open", () => setConnected(true));
    agent.addEventListener("close", () => setConnected(false));
    return () => {
      agent.removeEventListener("message", handleMessage as EventListener);
    };
  }, [agent, refreshOverview]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = (textToSend?: string) => {
    const msg = (textToSend || input).trim();
    if (!msg || isStreaming) return;
    sendMessage({ text: msg });
    setInput("");
  };

  const handleScenarioChange = async (scenarioId: IncidentScenarioId) => {
    await agent.call("triggerScenario", [scenarioId]);
    refreshOverview();
  };

  const handleReset = async () => {
    await agent.call("resetState");
    clearHistory();
    refreshOverview();
  };

  const handleApprovalSubmit = async (approved: boolean) => {
    if (!pendingApproval) return;
    await agent.call("submitApproval", [pendingApproval.approvalId, approved]);
    refreshOverview();
  };

  const handleStartWorkflow = async (serviceName: string) => {
    await agent.call("startWorkflowInvestigation", [serviceName]);
    send(
      `Why is ${serviceName} experiencing elevated error rates or operational degradation?`
    );
  };

  // Quick Chips
  const firstWorker = services[0]?.name || "cloudops-agent";
  const promptChips =
    providerType === "cloudflare"
      ? [
          {
            label: `Investigate ${firstWorker}`,
            query: `Investigate Cloudflare Worker ${firstWorker}. Check live health, error rate, and deployment versions.`,
            service: firstWorker
          },
          {
            label: `Deployment history for ${firstWorker}`,
            query: `What is the recent deployment history and changelog for ${firstWorker}?`,
            service: firstWorker
          },
          {
            label: `Check ${firstWorker} database health`,
            query: `Inspect database connection health for ${firstWorker}.`,
            service: firstWorker
          },
          {
            label: "Check historical outages",
            query:
              "Wasn't this the same issue we had last month? Check past incidents.",
            service: firstWorker
          }
        ]
      : [
          {
            label: "Why is payment-api experiencing high latency?",
            query: "Why is payment-api experiencing high latency?",
            service: "payment-api",
            scenario: "payment-api-leak" as IncidentScenarioId
          },
          {
            label: "Wasn't this the same issue we had last month?",
            query:
              "Wasn't this the same issue we had last month? Check past incidents.",
            service: "payment-api",
            scenario: "payment-api-leak" as IncidentScenarioId
          },
          {
            label: "Investigate auth-service crash loops",
            query: "Investigate auth-service crash loops and request failures.",
            service: "auth-service",
            scenario: "auth-service-oom" as IncidentScenarioId
          },
          {
            label: "Check orders-api retry storm",
            query:
              "Why is orders-api experiencing high latency and timeout errors?",
            service: "orders-api",
            scenario: "orders-api-cascade" as IncidentScenarioId
          }
        ];

  return (
    <div className="flex flex-col h-screen bg-kumo-base text-kumo-default">
      {/* ── Top Navigation Bar ────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-kumo-line bg-kumo-surface shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-tight text-base">
                CloudOps Agent
              </span>
              <Badge variant="secondary">SRE Autonomous Ops</Badge>
              {providerType === "cloudflare" ? (
                <Badge variant="primary">Cloudflare Live Infrastructure</Badge>
              ) : (
                <Badge variant="secondary">Synthetic Simulation Mode</Badge>
              )}
            </div>
            <Text size="xs" variant="secondary">
              Cloudflare Agents SDK • Workflows • Workers AI (Llama 3.3) •
              Durable Objects
            </Text>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {providerType === "synthetic" && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-kumo-secondary font-medium mr-1">
                Scenario:
              </span>
              <select
                value={activeScenario || ""}
                onChange={(e) =>
                  handleScenarioChange(e.target.value as IncidentScenarioId)
                }
                className="text-xs bg-kumo-control border border-kumo-line rounded-lg px-2.5 py-1.5 outline-none font-medium"
              >
                <option value="payment-api-leak">
                  Scenario 1: payment-api (DB Pool Leak)
                </option>
                <option value="auth-service-oom">
                  Scenario 2: auth-service (Memory OOM)
                </option>
                <option value="orders-api-cascade">
                  Scenario 3: orders-api (Retry Storm)
                </option>
              </select>
            </div>
          )}

          {latestTelemetryTimestamp && (
            <div className="text-[11px] font-mono text-kumo-secondary hidden md:block">
              Telemetry:{" "}
              {new Date(latestTelemetryTimestamp).toLocaleTimeString()}
            </div>
          )}

          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowsClockwiseIcon size={14} />}
            onClick={() => {
              if (providerType === "synthetic") {
                handleReset();
              } else {
                refreshOverview();
              }
            }}
          >
            {providerType === "synthetic" ? "Reset" : "Refresh"}
          </Button>

          <div className="flex items-center gap-2 pl-2 border-l border-kumo-line">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            <Text size="xs" variant="secondary">
              {connected ? "Agent Online" : "Connecting..."}
            </Text>
          </div>

          <ThemeToggle />
        </div>
      </header>

      {/* ── Main Workspace: Dual Pane ─────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left Pane: Infrastructure Operations Console ───────────── */}
        <div className="w-1/2 border-r border-kumo-line flex flex-col overflow-y-auto p-5 bg-kumo-base/50 gap-5">
          {/* Services Health Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Text size="sm" bold>
                  {providerType === "cloudflare"
                    ? "Monitored Cloudflare Workers"
                    : "Monitored Microservices"}
                </Text>
                <Badge variant="secondary">{services.length} Total</Badge>
              </div>
              <Text size="xs" variant="secondary">
                {providerType === "cloudflare"
                  ? "Live Cloudflare Telemetry"
                  : "Deterministic Simulation"}
              </Text>
            </div>

            {services.length === 0 ? (
              <div className="p-6 rounded-xl border border-kumo-line bg-kumo-base text-center">
                <Text size="xs" variant="secondary">
                  No Cloudflare Workers discovered. Configure
                  CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in Worker
                  secrets.
                </Text>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {services.map((svc) => (
                  <div
                    key={svc.name}
                    className="p-3.5 rounded-xl border border-kumo-line bg-kumo-base flex flex-col justify-between hover:border-kumo-ring transition shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className="font-semibold text-xs truncate"
                          title={svc.name}
                        >
                          {svc.name}
                        </span>
                        <HealthBadge status={svc.status} />
                      </div>

                      <div className="space-y-1 my-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-kumo-secondary">Version:</span>
                          <span
                            className="font-mono font-medium truncate max-w-[110px]"
                            title={svc.version}
                          >
                            {svc.version}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-kumo-secondary">
                            Error rate:
                          </span>
                          <span
                            className={`font-mono font-semibold ${
                              svc.errorRate > 1
                                ? "text-red-500"
                                : "text-emerald-500"
                            }`}
                          >
                            {svc.errorRate.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-kumo-secondary">
                            P95 Latency:
                          </span>
                          <span
                            className={`font-mono font-semibold ${
                              svc.p95LatencyMs > 250
                                ? "text-red-500"
                                : "text-kumo-default"
                            }`}
                          >
                            {svc.p95LatencyMs > 1000
                              ? `${(svc.p95LatencyMs / 1000).toFixed(2)}s`
                              : `${svc.p95LatencyMs}ms`}
                          </span>
                        </div>
                        {svc.lastDeploymentTime && (
                          <div className="flex justify-between text-[10px] text-kumo-secondary pt-0.5 border-t border-kumo-line/50">
                            <span>Deployed:</span>
                            <span className="font-mono truncate max-w-[100px]">
                              {new Date(
                                svc.lastDeploymentTime
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mt-2 text-xs"
                      onClick={() => handleStartWorkflow(svc.name)}
                    >
                      Investigate →
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Human-in-the-loop Approval Callout */}
          {pendingApproval && (
            <div className="p-4 rounded-xl border-2 border-amber-500 bg-amber-500/10 shadow-sm animate-fade-in">
              <div className="flex items-center gap-2 mb-2">
                <WarningCircleIcon size={20} className="text-amber-500" />
                <span className="font-bold text-sm text-amber-500">
                  Human Approval Required (Cloudflare Workflows)
                </span>
              </div>
              <p className="text-xs leading-relaxed text-kumo-default mb-3">
                {pendingApproval.description}
              </p>
              <div className="flex gap-2.5">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<CheckIcon size={14} />}
                  onClick={() => handleApprovalSubmit(true)}
                >
                  Approve Rollback
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<XIcon size={14} />}
                  onClick={() => handleApprovalSubmit(false)}
                >
                  Reject Action
                </Button>
              </div>
            </div>
          )}

          {/* Cloudflare Workflows Durable Stepper */}
          <div className="p-4 rounded-xl border border-kumo-line bg-kumo-base shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <GitBranchIcon size={16} className="text-orange-500" />
                <span className="font-semibold text-xs">
                  Incident Investigation Workflow (Cloudflare Workflows)
                </span>
              </div>
              <Badge variant="secondary">13 Durable Steps</Badge>
            </div>

            <div className="space-y-2">
              {workflowSteps.length > 0 ? (
                workflowSteps.map((stepRecord) => (
                  <div
                    key={stepRecord.step}
                    className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-kumo-control/50"
                  >
                    <div className="flex items-center gap-2">
                      {stepRecord.status === "completed" ? (
                        <CheckCircleIcon
                          size={14}
                          className="text-emerald-500"
                        />
                      ) : stepRecord.status === "running" ? (
                        <div className="h-3.5 w-3.5 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
                      ) : stepRecord.status === "waiting_approval" ? (
                        <ClockIcon
                          size={14}
                          className="text-amber-500 animate-pulse"
                        />
                      ) : stepRecord.status === "failed" ? (
                        <XCircleIcon size={14} className="text-red-500" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-700 ml-1 mr-0.5" />
                      )}
                      <span
                        className={`font-medium ${
                          stepRecord.status === "completed"
                            ? "text-kumo-default"
                            : stepRecord.status === "running"
                              ? "text-orange-500 font-semibold"
                              : stepRecord.status === "waiting_approval"
                                ? "text-amber-500 font-semibold"
                                : "text-kumo-secondary"
                        }`}
                      >
                        {stepRecord.displayName}
                      </span>
                    </div>

                    <span className="text-[11px] text-kumo-secondary font-mono truncate max-w-[220px]">
                      {stepRecord.outputSummary || stepRecord.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-kumo-secondary">
                  No active workflow running. Click &quot;Investigate&quot; on a
                  service or ask a question in chat to trigger workflow
                  execution.
                </div>
              )}
            </div>
          </div>

          {/* Active Incident & AI Diagnosis Card */}
          {activeInvestigation?.status && (
            <div className="p-4 rounded-xl border border-kumo-line bg-kumo-base shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-xs flex items-center gap-2">
                  <BrainIcon size={16} className="text-purple-500" />
                  Active Incident Diagnosis
                </span>
                <Badge
                  variant={
                    activeInvestigation.status === "resolved"
                      ? "primary"
                      : "secondary"
                  }
                >
                  {activeInvestigation.status.toUpperCase()}
                </Badge>
              </div>

              {activeInvestigation.rootCause ? (
                <div className="space-y-2 mt-2">
                  <div>
                    <Text size="xs" variant="secondary" bold>
                      Identified Root Cause:
                    </Text>
                    <p className="text-xs leading-relaxed mt-0.5 text-kumo-default">
                      {activeInvestigation.rootCause}
                    </p>
                  </div>

                  {activeInvestigation.remediationResult && (
                    <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30">
                      <div className="text-xs font-bold text-emerald-500">
                        Remediation Executed:
                      </div>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {activeInvestigation.remediationResult.message}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-kumo-secondary">
                  Agent is executing investigation steps. Diagnosis will appear
                  upon completion.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Right Pane: AI SRE Chat Interface ─────────────────────── */}
        <div className="w-1/2 flex flex-col bg-kumo-base">
          {/* Quick Prompt Chips */}
          <div className="px-5 py-2.5 border-b border-kumo-line bg-kumo-surface flex items-center gap-2 overflow-x-auto shrink-0 no-scrollbar">
            <span className="text-[11px] font-semibold text-kumo-secondary uppercase tracking-wider shrink-0">
              Quick prompts:
            </span>
            {promptChips.map((chip, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if ("scenario" in chip && chip.scenario) {
                    handleScenarioChange(chip.scenario);
                  }
                  send(chip.query);
                }}
                className="text-xs px-2.5 py-1 rounded-full border border-kumo-line bg-kumo-base hover:border-orange-500 hover:text-orange-500 transition whitespace-nowrap"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto py-12">
                <div className="h-12 w-12 rounded-2xl bg-orange-500/10 text-orange-500 flex items-center justify-center mb-4">
                  <LightningIcon size={24} />
                </div>
                <Text size="base" bold>
                  CloudOps Infrastructure Agent Ready
                </Text>
                <div className="mt-1 text-xs text-kumo-secondary leading-relaxed">
                  Ask me to investigate incidents, inspect live telemetry,
                  correlate deployment releases with error spikes, or recall
                  historical outages.
                </div>
              </div>
            )}

            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                >
                  {message.parts.map((part, pIdx) => {
                    const key = `${message.id}-${pIdx}`;

                    if (isToolUIPart(part)) {
                      return (
                        <ToolPartView
                          key={key}
                          part={part}
                          addToolApprovalResponse={addToolApprovalResponse}
                        />
                      );
                    }

                    if (part.type === "reasoning" && part.text?.trim()) {
                      return (
                        <details
                          key={key}
                          className="max-w-[90%] w-full my-1.5"
                          open={isStreaming}
                        >
                          <summary className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs select-none">
                            <BrainIcon size={14} className="text-purple-500" />
                            <span className="font-medium text-purple-400">
                              Investigative Reasoning
                            </span>
                            <CaretDownIcon
                              size={12}
                              className="ml-auto text-kumo-inactive"
                            />
                          </summary>
                          <pre className="mt-1 px-3 py-2 rounded-lg bg-kumo-control text-xs whitespace-pre-wrap max-h-48 overflow-auto">
                            {part.text}
                          </pre>
                        </details>
                      );
                    }

                    if (part.type === "text" && part.text) {
                      if (isUser) {
                        return (
                          <div
                            key={key}
                            className="max-w-[85%] px-4 py-2 rounded-2xl rounded-br-sm bg-orange-600 text-white text-xs leading-relaxed"
                          >
                            {part.text}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={key}
                          className="max-w-[95%] w-full rounded-2xl rounded-bl-sm bg-kumo-surface p-3.5 text-xs leading-relaxed border border-kumo-line my-1"
                        >
                          <Streamdown
                            plugins={{ code }}
                            isAnimating={isStreaming}
                          >
                            {part.text}
                          </Streamdown>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input */}
          <div className="border-t border-kumo-line p-4 bg-kumo-surface shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2 rounded-xl border border-kumo-line bg-kumo-base p-2.5 focus-within:ring-2 focus-within:ring-orange-500 transition"
            >
              <InputArea
                ref={textareaRef}
                value={input}
                onValueChange={setInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask about payment-api latency, auth-service OOM, orders-api..."
                disabled={isStreaming}
                rows={1}
                className="flex-1 ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none text-xs max-h-32"
              />

              {isStreaming ? (
                <Button
                  type="button"
                  variant="secondary"
                  shape="square"
                  icon={<StopIcon size={16} />}
                  onClick={stop}
                  aria-label="Stop generation"
                />
              ) : (
                <Button
                  type="submit"
                  variant="primary"
                  shape="square"
                  disabled={!input.trim()}
                  icon={<PaperPlaneRightIcon size={16} />}
                  aria-label="Send message"
                />
              )}
            </form>
            <div className="flex justify-center mt-2">
              <PoweredByCloudflare href="https://developers.cloudflare.com/agents/" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Toasty>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen text-kumo-inactive text-xs">
            Initializing CloudOps Agent...
          </div>
        }
      >
        <CloudOpsConsole />
      </Suspense>
    </Toasty>
  );
}
