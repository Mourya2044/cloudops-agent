import { describe, it, expect, beforeEach } from "vitest";
import { SyntheticInfrastructureProvider } from "../src/infrastructure/syntheticProvider";

describe("Post-Remediation Verification", () => {
  let provider: SyntheticInfrastructureProvider;

  beforeEach(() => {
    provider = new SyntheticInfrastructureProvider();
  });

  it("verifies service health returns to normal thresholds after rollback", async () => {
    // Initially degraded
    const preVerification = await provider.verifyServiceHealth("payment-api");
    expect(preVerification.healthy).toBe(false);
    expect(preVerification.currentMetrics.errorRate).toBe(8.7);
    expect(preVerification.currentMetrics.p95LatencyMs).toBe(1840);

    // Rollback
    await provider.rollbackDeployment("payment-api", "v1.8.1");

    // Post-remediation verification
    const postVerification = await provider.verifyServiceHealth("payment-api");
    expect(postVerification.healthy).toBe(true);
    expect(postVerification.status).toBe("healthy");
    expect(postVerification.currentMetrics.activeVersion).toBe("v1.8.1");
    expect(postVerification.currentMetrics.errorRate).toBeLessThan(1.0);
    expect(postVerification.currentMetrics.p95LatencyMs).toBeLessThan(250);
    expect(postVerification.message).toContain("HEALTHY");
  });
});
