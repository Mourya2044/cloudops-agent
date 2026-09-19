import type { RemediationResult } from "./infrastructure";

export type IncidentScenarioId =
  | "payment-api-leak"
  | "auth-service-oom"
  | "orders-api-cascade";

export type IncidentStatus =
  | "investigating"
  | "diagnosed"
  | "remediation_pending"
  | "remediation_approved"
  | "remediation_rejected"
  | "resolved";

export interface IncidentRecord {
  id: string;
  scenarioId?: IncidentScenarioId;
  serviceName: string;
  title: string;
  status: IncidentStatus;
  severity: "P1" | "P2" | "P3";
  rootCause: string;
  evidence: string[];
  recommendedAction: string;
  remediationResult?: RemediationResult;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  operatorNotes?: string;
}

export interface ApprovalRequest {
  approvalId: string;
  action: "rollback" | "restart";
  serviceName: string;
  targetVersion?: string;
  description: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  resolvedAt?: string;
  operator?: string;
  reason?: string;
}

export type WorkflowStepName =
  | "parse_incident"
  | "retrieve_service_health"
  | "retrieve_metrics"
  | "retrieve_logs"
  | "retrieve_deployment_history"
  | "retrieve_database_health"
  | "correlate_evidence"
  | "generate_diagnosis"
  | "recommend_remediation"
  | "wait_for_human_approval"
  | "execute_remediation"
  | "verify_service_health"
  | "generate_final_report";

export interface WorkflowStepRecord {
  step: WorkflowStepName;
  displayName: string;
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "skipped"
    | "waiting_approval";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  outputSummary?: string;
  details?: unknown;
  error?: string;
}

export interface InvestigationWorkflowState {
  instanceId: string;
  serviceName: string;
  scenarioId?: IncidentScenarioId;
  status: "running" | "waiting_approval" | "completed" | "failed" | "rejected";
  currentStep: WorkflowStepName;
  steps: WorkflowStepRecord[];
  diagnosis?: {
    rootCause: string;
    confidence: number;
    evidence: string[];
  };
  recommendation?: {
    action: "rollback" | "restart";
    targetVersion?: string;
    description: string;
  };
  approvalDecision?: {
    approved: boolean;
    reason?: string;
    timestamp: string;
  };
  remediationResult?: RemediationResult;
  finalReport?: string;
  startedAt: string;
  completedAt?: string;
}

export interface IncidentParams {
  incidentId: string;
  serviceName: string;
  scenarioId?: IncidentScenarioId;
  initialQuery?: string;
}
