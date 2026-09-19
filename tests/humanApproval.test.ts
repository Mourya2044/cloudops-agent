import { describe, it, expect, beforeEach } from "vitest";
import { SyntheticInfrastructureProvider } from "../src/infrastructure/syntheticProvider";
import { IncidentHistoryManager } from "../src/incidents/history";

describe("Human Approval Flow", () => {
  let provider: SyntheticInfrastructureProvider;
  let history: IncidentHistoryManager;

  beforeEach(() => {
    provider = new SyntheticInfrastructureProvider();
    history = new IncidentHistoryManager();
  });

  it("executes remediation and verifies recovery upon operator approval", async () => {
    const serviceName = "payment-api";
    const initialHealth = await provider.getServiceHealth(serviceName);
    expect(initialHealth.status).toBe("degraded");
    expect(initialHealth.activeVersion).toBe("v1.8.2");

    // Approval payload received from human operator
    const approvalEvent = {
      approved: true,
      operator: "sre.oncall",
      reason: "Approved rollback after verifying DB pool exhaustion",
      targetVersion: "v1.8.1"
    };

    expect(approvalEvent.approved).toBe(true);

    // Remediation executes
    const remediationResult = await provider.rollbackDeployment(
      serviceName,
      approvalEvent.targetVersion
    );
    expect(remediationResult.success).toBe(true);
    expect(remediationResult.newVersion).toBe("v1.8.1");

    // Post-remediation verification
    const verification = await provider.verifyServiceHealth(serviceName);
    expect(verification.healthy).toBe(true);
    expect(verification.currentMetrics.activeVersion).toBe("v1.8.1");
    expect(verification.currentMetrics.errorRate).toBeLessThan(1.0);
    expect(verification.currentMetrics.p95LatencyMs).toBeLessThan(250);

    // Persist resolved incident
    history.save({
      id: "INC-TEST-APPROVED",
      serviceName,
      title: "Payment API pool exhaustion resolved",
      status: "resolved",
      severity: "P1",
      rootCause: "Database pool exhaustion post-v1.8.2",
      evidence: ["50/50 pool capacity", "ConnectionPoolTimeoutException"],
      recommendedAction: "Rollback to v1.8.1",
      remediationResult,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString()
    });

    const saved = history.getById("INC-TEST-APPROVED");
    expect(saved).toBeDefined();
    expect(saved?.status).toBe("resolved");
    expect(saved?.remediationResult?.newVersion).toBe("v1.8.1");
  });
});
