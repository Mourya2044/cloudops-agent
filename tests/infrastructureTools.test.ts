import { describe, it, expect, beforeEach } from "vitest";
import { SyntheticInfrastructureProvider } from "../src/infrastructure/syntheticProvider";
import { IncidentHistoryManager } from "../src/incidents/history";
import { createInfrastructureTools } from "../src/tools/infrastructureTools";

describe("Infrastructure Tools", () => {
  let provider: SyntheticInfrastructureProvider;
  let history: IncidentHistoryManager;
  let tools: ReturnType<typeof createInfrastructureTools>;

  beforeEach(() => {
    provider = new SyntheticInfrastructureProvider();
    history = new IncidentHistoryManager();
    tools = createInfrastructureTools(provider, history);
  });

  it("getServiceHealth returns real-time status and telemetry for payment-api", async () => {
    const health = await (tools.getServiceHealth.execute as any)({
      serviceName: "payment-api"
    });

    expect(health).toBeDefined();
    expect(health.serviceName).toBe("payment-api");
    expect(health.status).toBe("degraded");
    expect(health.activeVersion).toBe("v1.8.2");
    expect(health.errorRate).toBe(8.7);
    expect(health.p95LatencyMs).toBe(1840);
    expect(health.replicaCount).toBe(8);
  });

  it("getMetrics returns time-series points and aggregate summary", async () => {
    const metrics = await (tools.getMetrics.execute as any)({
      serviceName: "payment-api",
      timeWindow: "last-60m"
    });

    expect(metrics).toBeDefined();
    expect(metrics.serviceName).toBe("payment-api");
    expect(metrics.points.length).toBeGreaterThan(0);
    expect(metrics.summary.peakErrorRate).toBe(8.7);
    expect(metrics.summary.peakP95LatencyMs).toBe(1840);
  });

  it("getLogs returns filtered logs and includes stack traces", async () => {
    const errorLogs = await (tools.getLogs.execute as any)({
      serviceName: "payment-api",
      limit: 10,
      level: "ERROR"
    });

    expect(errorLogs).toBeDefined();
    expect(Array.isArray(errorLogs)).toBe(true);
    expect(errorLogs.length).toBeGreaterThan(0);
    expect(errorLogs.every((l: any) => l.level === "ERROR")).toBe(true);
    expect(
      errorLogs.some((l: any) =>
        l.message.includes("ConnectionPoolTimeoutException")
      )
    ).toBe(true);
  });

  it("getDeploymentHistory returns recent release records and git commits", async () => {
    const deployments = await (tools.getDeploymentHistory.execute as any)({
      serviceName: "payment-api",
      limit: 5
    });

    expect(deployments).toBeDefined();
    expect(deployments.length).toBeGreaterThanOrEqual(2);
    expect(deployments[0].version).toBe("v1.8.2");
    expect(deployments[0].rollbackVersion).toBe("v1.8.1");
    expect(deployments[0].changelog).toContain("connection management");
  });

  it("getDatabaseHealth returns connection pool utilization and waiting threads", async () => {
    const db = await (tools.getDatabaseHealth.execute as any)({
      serviceName: "payment-api"
    });

    expect(db).toBeDefined();
    expect(db.databaseName).toBe("payments-primary-db");
    expect(db.poolUtilizationPercent).toBe(100);
    expect(db.activeConnections).toBe(50);
    expect(db.waitingConnections).toBe(142);
    expect(db.connectionTimeoutsLast10m).toBeGreaterThan(0);
  });

  it("searchIncidentHistory recalls past similar incidents", async () => {
    const result = await (tools.searchIncidentHistory.execute as any)({
      serviceName: "payment-api",
      query: "connection pool"
    });

    expect(result.totalMatches).toBeGreaterThanOrEqual(1);
    expect(result.incidents[0].id).toBe("INC-2026-08-14-PAY");
    expect(result.incidents[0].rootCause).toContain(
      "Database connection pool exhaustion"
    );
  });

  it("handles queries for non-existent service gracefully", async () => {
    const health = await (tools.getServiceHealth.execute as any)({
      serviceName: "unknown-service"
    });

    expect(health.error).toBeDefined();
    expect(health.error).toContain("not found in infrastructure inventory");
  });
});
