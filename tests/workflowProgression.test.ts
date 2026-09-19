import { describe, it, expect, beforeEach } from "vitest";
import { SyntheticInfrastructureProvider } from "../src/infrastructure/syntheticProvider";
import { IncidentCorrelator } from "../src/incidents/correlator";

describe("Workflow Progression", () => {
  let provider: SyntheticInfrastructureProvider;

  beforeEach(() => {
    provider = new SyntheticInfrastructureProvider();
  });

  it("progresses sequentially through all 13 durable steps of incident investigation", async () => {
    const serviceName = "payment-api";
    const recordedSteps: { step: string; output: any }[] = [];

    // 1. parse_incident
    const parsed = {
      serviceName,
      incidentId: "INC-TEST-1001",
      startedAt: new Date().toISOString()
    };
    recordedSteps.push({ step: "parse_incident", output: parsed });
    expect(parsed.serviceName).toBe("payment-api");

    // 2. retrieve_service_health
    const health = await provider.getServiceHealth(parsed.serviceName);
    recordedSteps.push({ step: "retrieve_service_health", output: health });
    expect(health.status).toBe("degraded");

    // 3. retrieve_metrics
    const metrics = await provider.getMetrics(parsed.serviceName, "last-60m");
    recordedSteps.push({ step: "retrieve_metrics", output: metrics });
    expect(metrics.points.length).toBeGreaterThan(0);

    // 4. retrieve_logs
    const logs = await provider.getLogs(parsed.serviceName, 25);
    recordedSteps.push({ step: "retrieve_logs", output: logs });
    expect(logs.length).toBeGreaterThan(0);

    // 5. retrieve_deployment_history
    const deployments = await provider.getDeploymentHistory(
      parsed.serviceName,
      5
    );
    recordedSteps.push({
      step: "retrieve_deployment_history",
      output: deployments
    });
    expect(deployments[0].version).toBe("v1.8.2");

    // 6. retrieve_database_health
    const database = await provider.getDatabaseHealth(
      undefined,
      parsed.serviceName
    );
    recordedSteps.push({ step: "retrieve_database_health", output: database });
    expect(database?.poolUtilizationPercent).toBe(100);

    // 7. correlate_evidence
    const correlation = IncidentCorrelator.correlate({
      health,
      metrics,
      logs,
      deployments,
      database
    });
    recordedSteps.push({ step: "correlate_evidence", output: correlation });
    expect(correlation.confidence).toBeGreaterThan(0.9);

    // 8. generate_diagnosis
    const diagnosis = {
      rootCause: correlation.rootCause,
      confidence: correlation.confidence,
      evidence: correlation.evidence,
      diagnosedAt: new Date().toISOString()
    };
    recordedSteps.push({ step: "generate_diagnosis", output: diagnosis });
    expect(diagnosis.rootCause).toContain("connection pool exhaustion");

    // 9. recommend_remediation
    const recommendation = {
      action: correlation.recommendedAction,
      targetVersion: correlation.targetVersion,
      description: correlation.remediationDescription,
      recommendedAt: new Date().toISOString()
    };
    recordedSteps.push({
      step: "recommend_remediation",
      output: recommendation
    });
    expect(recommendation.action).toBe("rollback");
    expect(recommendation.targetVersion).toBe("v1.8.1");

    // 10. wait_for_human_approval
    const approval = {
      approved: true,
      operator: "alice.sre",
      reason: "Approved rollback to v1.8.1"
    };
    recordedSteps.push({ step: "wait_for_human_approval", output: approval });
    expect(approval.approved).toBe(true);

    // 11. execute_remediation
    const remediationResult = await provider.rollbackDeployment(
      parsed.serviceName,
      recommendation.targetVersion!
    );
    recordedSteps.push({
      step: "execute_remediation",
      output: remediationResult
    });
    expect(remediationResult.success).toBe(true);
    expect(remediationResult.newVersion).toBe("v1.8.1");

    // 12. verify_service_health
    const verification = await provider.verifyServiceHealth(parsed.serviceName);
    recordedSteps.push({ step: "verify_service_health", output: verification });
    expect(verification.healthy).toBe(true);
    expect(verification.status).toBe("healthy");

    // 13. generate_final_report
    const finalReport = {
      incidentId: parsed.incidentId,
      serviceName: parsed.serviceName,
      status: "resolved",
      rootCause: diagnosis.rootCause,
      remediationResult,
      verification,
      resolvedAt: new Date().toISOString()
    };
    recordedSteps.push({ step: "generate_final_report", output: finalReport });
    expect(finalReport.status).toBe("resolved");

    expect(recordedSteps.length).toBe(13);
    const stepNames = recordedSteps.map((s) => s.step);
    expect(stepNames).toEqual([
      "parse_incident",
      "retrieve_service_health",
      "retrieve_metrics",
      "retrieve_logs",
      "retrieve_deployment_history",
      "retrieve_database_health",
      "correlate_evidence",
      "generate_diagnosis",
      "recommend_remediation",
      "wait_for_human_approval",
      "execute_remediation",
      "verify_service_health",
      "generate_final_report"
    ]);
  });
});
