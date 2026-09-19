import { describe, it, expect, beforeEach } from "vitest";
import { IncidentHistoryManager } from "../src/incidents/history";

describe("Persistent Incident State & Historical Memory", () => {
  let history: IncidentHistoryManager;

  beforeEach(() => {
    history = new IncidentHistoryManager();
  });

  it("stores and retrieves incidents by ID and service name", () => {
    const list = history.listAll();
    expect(list.length).toBeGreaterThanOrEqual(3);

    const payIncident = history.getById("INC-2026-08-14-PAY");
    expect(payIncident).toBeDefined();
    expect(payIncident?.serviceName).toBe("payment-api");
    expect(payIncident?.status).toBe("resolved");
  });

  it("answers 'Wasn't this the same issue we had last month?' by finding previous connection pool incident", () => {
    // Search by query and service
    const results = history.search({
      serviceName: "payment-api",
      query: "connection pool"
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    const lastMonthIncident = results[0];
    expect(lastMonthIncident.id).toBe("INC-2026-08-14-PAY");
    expect(lastMonthIncident.createdAt).toContain("2026-08-14");
    expect(lastMonthIncident.rootCause).toContain(
      "Database connection pool exhaustion"
    );
    expect(lastMonthIncident.remediationResult?.newVersion).toBe("v1.7.8");
  });

  it("saves new investigation incidents into history", () => {
    const newIncident = {
      id: "INC-2026-09-19-TEST",
      serviceName: "orders-api",
      title: "Orders API retry storm post-mortem",
      status: "resolved" as const,
      severity: "P2" as const,
      rootCause: "Downstream vendor timeout coupled with client retries",
      evidence: ["External timeout > 5000ms", "Retry rate 3.5x"],
      recommendedAction: "Rollback to v1.12.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    history.save(newIncident);

    const retrieved = history.getById("INC-2026-09-19-TEST");
    expect(retrieved).toBeDefined();
    expect(retrieved?.title).toBe("Orders API retry storm post-mortem");
  });
});
