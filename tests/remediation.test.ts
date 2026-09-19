import { describe, it, expect, beforeEach } from "vitest";
import { SyntheticInfrastructureProvider } from "../src/infrastructure/syntheticProvider";

describe("Remediation Execution & Idempotency", () => {
  let provider: SyntheticInfrastructureProvider;

  beforeEach(() => {
    provider = new SyntheticInfrastructureProvider();
  });

  it("rollbackDeployment successfully reverts service version and restores metrics", async () => {
    const result = await provider.rollbackDeployment("payment-api", "v1.8.1");
    expect(result.success).toBe(true);
    expect(result.previousVersion).toBe("v1.8.2");
    expect(result.newVersion).toBe("v1.8.1");

    const health = await provider.getServiceHealth("payment-api");
    expect(health.activeVersion).toBe("v1.8.1");
    expect(health.status).toBe("healthy");
    expect(health.errorRate).toBe(0.04);
  });

  it("rollbackDeployment is idempotent when called repeatedly", async () => {
    // First rollback
    const res1 = await provider.rollbackDeployment("payment-api", "v1.8.1");
    expect(res1.success).toBe(true);
    expect(res1.newVersion).toBe("v1.8.1");

    // Duplicate rollback to same target version
    const res2 = await provider.rollbackDeployment("payment-api", "v1.8.1");
    expect(res2.success).toBe(true);
    expect(res2.message).toContain("idempotent");
    expect(res2.newVersion).toBe("v1.8.1");

    const health = await provider.getServiceHealth("payment-api");
    expect(health.activeVersion).toBe("v1.8.1");
  });

  it("restartService initiates a rolling restart of all replicas", async () => {
    const restartResult = await provider.restartService("auth-service", true);
    expect(restartResult.success).toBe(true);
    expect(restartResult.action).toBe("restart");
    expect(restartResult.restartDetails?.graceful).toBe(true);
    expect(restartResult.restartDetails?.restartedPods).toBe(6);

    const health = await provider.getServiceHealth("auth-service");
    expect(health.healthyReplicas).toBe(6);
    expect(health.status).toBe("healthy");
  });
});
