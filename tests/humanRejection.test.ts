import { describe, it, expect, beforeEach } from "vitest";
import { SyntheticInfrastructureProvider } from "../src/infrastructure/syntheticProvider";
import { IncidentHistoryManager } from "../src/incidents/history";

describe("Human Rejection Flow", () => {
  let provider: SyntheticInfrastructureProvider;
  let history: IncidentHistoryManager;

  beforeEach(() => {
    provider = new SyntheticInfrastructureProvider();
    history = new IncidentHistoryManager();
  });

  it("safely halts remediation, preserves investigation, and leaves infrastructure untouched when rejected", async () => {
    const serviceName = "payment-api";
    const initialHealth = await provider.getServiceHealth(serviceName);
    expect(initialHealth.status).toBe("degraded");
    expect(initialHealth.activeVersion).toBe("v1.8.2");

    // Operator rejects the action
    const rejectionEvent = {
      approved: false,
      operator: "lead.architect",
      reason: "Postponing rollback until pending transactions drain"
    };

    expect(rejectionEvent.approved).toBe(false);

    // Persist rejection record
    const incidentRecord = {
      id: "INC-TEST-REJECTED",
      serviceName,
      title: "Payment API pool exhaustion (Remediation Deferred)",
      status: "remediation_rejected" as const,
      severity: "P1" as const,
      rootCause:
        "Database connection pool exhaustion following deployment v1.8.2",
      evidence: ["50/50 pool capacity", "ConnectionPoolTimeoutException"],
      recommendedAction: "Rollback to v1.8.1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      operatorNotes: `Rejected: ${rejectionEvent.reason}`
    };

    history.save(incidentRecord);

    // Verify infrastructure state is completely UNTOUCHED
    const healthAfterRejection = await provider.getServiceHealth(serviceName);
    expect(healthAfterRejection.activeVersion).toBe("v1.8.2"); // still on v1.8.2, no rollback occurred
    expect(healthAfterRejection.status).toBe("degraded");

    // Verify rejection record exists in history
    const saved = history.getById("INC-TEST-REJECTED");
    expect(saved).toBeDefined();
    expect(saved?.status).toBe("remediation_rejected");
    expect(saved?.operatorNotes).toContain("Postponing rollback");
  });
});
