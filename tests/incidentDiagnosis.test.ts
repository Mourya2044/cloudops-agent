import { describe, it, expect, beforeEach } from "vitest";
import { SyntheticInfrastructureProvider } from "../src/infrastructure/syntheticProvider";
import { IncidentCorrelator } from "../src/incidents/correlator";

describe("Incident Diagnosis & Signal Correlation Engine", () => {
  let provider: SyntheticInfrastructureProvider;

  beforeEach(() => {
    provider = new SyntheticInfrastructureProvider();
  });

  it("Scenario 1 (payment-api): accurately diagnoses database pool exhaustion following v1.8.2", async () => {
    provider.resetScenario("payment-api-leak");
    const health = await provider.getServiceHealth("payment-api");
    const metrics = await provider.getMetrics("payment-api");
    const logs = await provider.getLogs("payment-api", 50);
    const deployments = await provider.getDeploymentHistory("payment-api");
    const database = await provider.getDatabaseHealth(undefined, "payment-api");

    const diagnosis = IncidentCorrelator.correlate({
      health,
      metrics,
      logs,
      deployments,
      database
    });

    expect(diagnosis.serviceName).toBe("payment-api");
    expect(diagnosis.confidence).toBeGreaterThanOrEqual(0.9);
    expect(diagnosis.rootCause).toContain(
      "Database connection pool exhaustion"
    );
    expect(diagnosis.rootCause).toContain("v1.8.2");
    expect(diagnosis.recommendedAction).toBe("rollback");
    expect(diagnosis.targetVersion).toBe("v1.8.1");

    // Must correlate with past incident INC-2026-08-14-PAY
    expect(diagnosis.similarPastIncident).toBeDefined();
    expect(diagnosis.similarPastIncident?.id).toBe("INC-2026-08-14-PAY");
    expect(diagnosis.evidence.length).toBeGreaterThanOrEqual(3);
  });

  it("Scenario 2 (auth-service): accurately diagnoses memory leak and OOM crash loop in v2.4.1", async () => {
    provider.resetScenario("auth-service-oom");
    const health = await provider.getServiceHealth("auth-service");
    const metrics = await provider.getMetrics("auth-service");
    const logs = await provider.getLogs("auth-service", 50);
    const deployments = await provider.getDeploymentHistory("auth-service");

    const diagnosis = IncidentCorrelator.correlate({
      health,
      metrics,
      logs,
      deployments
    });

    expect(diagnosis.serviceName).toBe("auth-service");
    expect(diagnosis.confidence).toBeGreaterThanOrEqual(0.9);
    expect(diagnosis.rootCause).toContain("Memory leak");
    expect(diagnosis.rootCause).toContain("OOMKilled");
    expect(diagnosis.recommendedAction).toBe("rollback");
    expect(diagnosis.targetVersion).toBe("v2.4.0");
    expect(
      diagnosis.evidence.some(
        (e) => e.includes("OOMKilled") || e.includes("Memory")
      )
    ).toBe(true);
  });

  it("Scenario 3 (orders-api): accurately diagnoses external gateway degradation and retry storm", async () => {
    provider.resetScenario("orders-api-cascade");
    const health = await provider.getServiceHealth("orders-api");
    const metrics = await provider.getMetrics("orders-api");
    const logs = await provider.getLogs("orders-api", 50);
    const deployments = await provider.getDeploymentHistory("orders-api");

    const diagnosis = IncidentCorrelator.correlate({
      health,
      metrics,
      logs,
      deployments
    });

    expect(diagnosis.serviceName).toBe("orders-api");
    expect(diagnosis.confidence).toBeGreaterThanOrEqual(0.9);
    expect(diagnosis.rootCause).toContain(
      "External payment gateway dependency degradation"
    );
    expect(diagnosis.rootCause).toContain("retry amplification");
    expect(diagnosis.recommendedAction).toBe("rollback");
    expect(diagnosis.targetVersion).toBe("v1.12.0");
  });
});
