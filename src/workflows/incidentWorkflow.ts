import { AgentWorkflow, WorkflowRejectedError } from "agents/workflows";
import type { AgentWorkflowEvent, AgentWorkflowStep } from "agents/workflows";
import { NonRetryableError } from "cloudflare:workflows";
import type { CloudOpsAgent } from "../agent/CloudOpsAgent";
import type { IncidentParams } from "../types/incident";
import type {
  ServiceHealth,
  ServiceMetrics,
  LogEntry,
  DeploymentRecord,
  DatabaseHealth,
  DatabaseHealthResult,
  RemediationResult,
  HealthVerificationResult
} from "../types/infrastructure";
import { getInfrastructureProvider } from "../infrastructure";
import {
  IncidentCorrelator,
  type DiagnosisResult
} from "../incidents/correlator";
import { defaultIncidentHistory } from "../incidents/history";

export interface IncidentProgressPayload {
  step: string;
  displayName: string;
  status: "running" | "completed" | "failed" | "waiting_approval";
  percent: number;
  message: string;
  details?: unknown;
}

export class IncidentInvestigationWorkflow extends AgentWorkflow<
  CloudOpsAgent,
  IncidentParams,
  IncidentProgressPayload,
  Env
> {
  async run(
    event: AgentWorkflowEvent<IncidentParams>,
    step: AgentWorkflowStep
  ) {
    const params = event.payload;
    const provider = getInfrastructureProvider(this.env);
    const history = defaultIncidentHistory;

    // 1. Step: Parse & validate incident parameters
    const parsed = await step.do("parse_incident", async () => {
      if (!params || !params.serviceName) {
        throw new NonRetryableError(
          "Service name is required to start incident investigation."
        );
      }

      const services = await provider.listServices();
      const knownServiceNames = services.map((s) => s.name);
      const isKnown =
        knownServiceNames.includes(params.serviceName) ||
        ["payment-api", "auth-service", "orders-api"].includes(
          params.serviceName
        ) ||
        /^[a-zA-Z0-9_-]{1,64}$/.test(params.serviceName);

      if (!isKnown) {
        throw new NonRetryableError(
          `Invalid or unrecognized service name '${params.serviceName}'. Must be alphanumeric with hyphens/underscores.`
        );
      }

      return {
        serviceName: params.serviceName,
        incidentId:
          params.incidentId || `INC-${Date.now().toString(36).toUpperCase()}`,
        scenarioId:
          params.scenarioId ||
          provider.getActiveScenarioId(params.serviceName) ||
          undefined,
        startedAt: new Date().toISOString()
      };
    });

    await this.reportProgress({
      step: "parse_incident",
      displayName: "Parse Incident",
      status: "completed",
      percent: 0.08,
      message: `Parsed incident ${parsed.incidentId} for target service ${parsed.serviceName}.`
    });

    // 2. Step: Retrieve service health
    const health = (await step.do(
      "retrieve_service_health",
      { retries: { limit: 3, delay: "1 second", backoff: "exponential" } },
      async () => {
        return await provider.getServiceHealth(parsed.serviceName);
      }
    )) as ServiceHealth;

    await this.reportProgress({
      step: "retrieve_service_health",
      displayName: "Retrieve Service Health",
      status: "completed",
      percent: 0.16,
      message: `Retrieved health for ${parsed.serviceName}: status=${health.status}, version=${health.activeVersion}, errorRate=${health.errorRate}%.`,
      details: health
    });

    // 3. Step: Retrieve metrics
    const metrics = (await step.do(
      "retrieve_metrics",
      { retries: { limit: 3, delay: "1 second", backoff: "exponential" } },
      async () => {
        return await provider.getMetrics(parsed.serviceName, "last-60m");
      }
    )) as ServiceMetrics;

    await this.reportProgress({
      step: "retrieve_metrics",
      displayName: "Retrieve Metrics",
      status: "completed",
      percent: 0.24,
      message: `Retrieved metrics: peak error rate ${metrics.summary.peakErrorRate}%, peak p95 latency ${metrics.summary.peakP95LatencyMs}ms.`,
      details: metrics
    });

    // 4. Step: Retrieve logs
    const logs = (await step.do(
      "retrieve_logs",
      { retries: { limit: 3, delay: "1 second", backoff: "exponential" } },
      async () => {
        return await provider.getLogs(parsed.serviceName, 25);
      }
    )) as LogEntry[];

    await this.reportProgress({
      step: "retrieve_logs",
      displayName: "Retrieve Logs",
      status: "completed",
      percent: 0.32,
      message: `Retrieved ${logs.length} log lines for ${parsed.serviceName}.`,
      details: logs
    });

    // 5. Step: Retrieve deployment history
    const deployments = (await step.do(
      "retrieve_deployment_history",
      { retries: { limit: 3, delay: "1 second", backoff: "exponential" } },
      async () => {
        return await provider.getDeploymentHistory(parsed.serviceName, 5);
      }
    )) as DeploymentRecord[];

    await this.reportProgress({
      step: "retrieve_deployment_history",
      displayName: "Retrieve Deployment History",
      status: "completed",
      percent: 0.4,
      message: `Retrieved ${deployments.length} deployment revisions. Latest: ${deployments[0]?.version}.`,
      details: deployments
    });

    // 6. Step: Retrieve database health
    const database = (await step.do("retrieve_database_health", async () => {
      return await provider.getDatabaseHealth(undefined, parsed.serviceName);
    })) as DatabaseHealthResult | null;

    let dbMessage = "No direct database dependencies detected.";
    if (database) {
      if ("supported" in database && !database.supported) {
        dbMessage =
          "Database telemetry not available (serverless Worker without connection pool).";
      } else {
        const db = database as DatabaseHealth;
        dbMessage = `Database ${db.databaseName} pool utilization: ${db.poolUtilizationPercent}%, active connections: ${db.activeConnections}/${db.maxConnections}.`;
      }
    }

    await this.reportProgress({
      step: "retrieve_database_health",
      displayName: "Retrieve Database Health",
      status: "completed",
      percent: 0.48,
      message: dbMessage,
      details: database
    });

    // 7. Step: Correlate evidence
    const correlation = (await step.do("correlate_evidence", async () => {
      return IncidentCorrelator.correlate({
        health,
        metrics,
        logs,
        deployments,
        database
      });
    })) as DiagnosisResult;

    await this.reportProgress({
      step: "correlate_evidence",
      displayName: "Correlate Evidence",
      status: "completed",
      percent: 0.56,
      message: `Correlated ${correlation.evidence.length} signals with ${(correlation.confidence * 100).toFixed(0)}% confidence.`,
      details: correlation
    });

    // 8. Step: Generate diagnosis
    const diagnosis = (await step.do("generate_diagnosis", async () => {
      return {
        rootCause: correlation.rootCause,
        confidence: correlation.confidence,
        evidence: correlation.evidence,
        similarPastIncident: correlation.similarPastIncident,
        diagnosedAt: new Date().toISOString()
      };
    })) as {
      rootCause: string;
      confidence: number;
      evidence: string[];
      similarPastIncident?: {
        id: string;
        title: string;
        similarityReason: string;
      };
      diagnosedAt: string;
    };

    await this.reportProgress({
      step: "generate_diagnosis",
      displayName: "Generate Diagnosis",
      status: "completed",
      percent: 0.64,
      message: `Root Cause: ${diagnosis.rootCause}`,
      details: diagnosis
    });

    // 9. Step: Recommend remediation
    const recommendation = (await step.do("recommend_remediation", async () => {
      return {
        action: correlation.recommendedAction,
        targetVersion: correlation.targetVersion,
        description: correlation.remediationDescription,
        recommendedAt: new Date().toISOString()
      };
    })) as {
      action: "rollback" | "restart";
      targetVersion?: string;
      description: string;
      recommendedAt: string;
    };

    await this.reportProgress({
      step: "recommend_remediation",
      displayName: "Recommend Remediation",
      status: "completed",
      percent: 0.72,
      message: `Recommended Action: ${recommendation.action.toUpperCase()} ${parsed.serviceName}${recommendation.targetVersion ? ` to ${recommendation.targetVersion}` : ""}.`,
      details: recommendation
    });

    // 10. Step: Wait for human approval (Cloudflare Workflows human-in-the-loop)
    await this.reportProgress({
      step: "wait_for_human_approval",
      displayName: "Wait for Human Approval",
      status: "waiting_approval",
      percent: 0.8,
      message: `Awaiting human operator approval: ${recommendation.description}`,
      details: { recommendation }
    });

    try {
      await this.waitForApproval<{
        approved: boolean;
        reason?: string;
        operator?: string;
      }>(step, {
        stepName: "await_operator_approval",
        timeout: "24 hours",
        eventType: "approval"
      });
    } catch (err) {
      if (err instanceof WorkflowRejectedError) {
        // Human explicitly rejected the remediation
        await step.do("record_rejection", async () => {
          const rejectionRecord = {
            status: "remediation_rejected",
            serviceName: parsed.serviceName,
            reason: err.reason || "Operator rejected remediation request.",
            timestamp: new Date().toISOString()
          };
          history.save({
            id: parsed.incidentId,
            scenarioId: parsed.scenarioId,
            serviceName: parsed.serviceName,
            title: `Incident ${parsed.incidentId}: ${parsed.serviceName} degradation (Remediation Rejected)`,
            status: "remediation_rejected",
            severity: "P1",
            rootCause: diagnosis.rootCause,
            evidence: diagnosis.evidence,
            recommendedAction: recommendation.description,
            createdAt: parsed.startedAt,
            updatedAt: new Date().toISOString(),
            operatorNotes: `Remediation rejected by operator: ${err.reason || "No reason provided"}`
          });
          return rejectionRecord;
        });

        await this.reportProgress({
          step: "execute_remediation",
          displayName: "Remediation Aborted",
          status: "failed",
          percent: 0.9,
          message: `Remediation was REJECTED by operator. Investigation preserved. No changes applied.`
        });

        return {
          incidentId: parsed.incidentId,
          status: "remediation_rejected",
          serviceName: parsed.serviceName,
          diagnosis,
          recommendation,
          remediationExecuted: false,
          summary:
            "Remediation rejected by operator. Investigation and evidence preserved."
        };
      }
      throw err;
    }

    // 11. Step: Execute remediation (Approved)
    const remediationResult = (await step.do(
      "execute_remediation",
      { retries: { limit: 2, delay: "2 seconds", backoff: "exponential" } },
      async () => {
        if (
          recommendation.action === "rollback" &&
          recommendation.targetVersion
        ) {
          return await provider.rollbackDeployment(
            parsed.serviceName,
            recommendation.targetVersion
          );
        } else {
          return await provider.restartService(parsed.serviceName, true);
        }
      }
    )) as RemediationResult;

    await this.reportProgress({
      step: "execute_remediation",
      displayName: "Execute Remediation",
      status: "completed",
      percent: 0.88,
      message: `Remediation executed: ${remediationResult.message}`,
      details: remediationResult
    });

    // 12. Step: Verify service health
    const verification = (await step.do(
      "verify_service_health",
      { retries: { limit: 3, delay: "2 seconds", backoff: "exponential" } },
      async () => {
        return await provider.verifyServiceHealth(parsed.serviceName);
      }
    )) as HealthVerificationResult;

    await this.reportProgress({
      step: "verify_service_health",
      displayName: "Verify Service Health",
      status: "completed",
      percent: 0.94,
      message: `Health Verification: ${verification.message}`,
      details: verification
    });

    // 13. Step: Generate final incident report
    const finalReport = await step.do("generate_final_report", async () => {
      const resolvedAt = new Date().toISOString();
      const report = {
        incidentId: parsed.incidentId,
        serviceName: parsed.serviceName,
        status: "resolved" as const,
        severity: "P1" as const,
        rootCause: diagnosis.rootCause,
        evidence: diagnosis.evidence,
        recommendedAction: recommendation.description,
        remediationResult,
        verification,
        resolvedAt,
        summary: `Incident ${parsed.incidentId} on ${parsed.serviceName} diagnosed and resolved. Root cause: ${diagnosis.rootCause}. Remediation: ${remediationResult.message}. Post-verification: ${verification.message}.`
      };

      history.save({
        id: parsed.incidentId,
        scenarioId: parsed.scenarioId,
        serviceName: parsed.serviceName,
        title: `Incident ${parsed.incidentId}: ${parsed.serviceName} operational recovery`,
        status: "resolved",
        severity: "P1",
        rootCause: diagnosis.rootCause,
        evidence: diagnosis.evidence,
        recommendedAction: recommendation.description,
        remediationResult,
        createdAt: parsed.startedAt,
        updatedAt: resolvedAt,
        resolvedAt,
        operatorNotes: `Resolved via CloudOps Workflow with operator approval.`
      });

      return report;
    });

    await this.reportProgress({
      step: "generate_final_report",
      displayName: "Generate Final Report",
      status: "completed",
      percent: 1.0,
      message: `Incident resolved successfully. Final post-mortem report archived.`,
      details: finalReport
    });

    await step.reportComplete(finalReport);
    return finalReport;
  }
}
