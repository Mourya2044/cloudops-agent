import { describe, it, expect, vi, beforeEach } from "vitest";
import { CloudflareInfrastructureProvider } from "../src/infrastructure/cloudflareProvider";

describe("CloudflareInfrastructureProvider", () => {
  const mockAccountId = "test-account-123456";
  const mockApiToken = "cf-test-token-abcdef";

  let mockFetch: ReturnType<typeof vi.fn>;
  let provider: CloudflareInfrastructureProvider;

  beforeEach(() => {
    mockFetch = vi.fn();
    provider = new CloudflareInfrastructureProvider({
      accountId: mockAccountId,
      apiToken: mockApiToken,
      baseUrl: "https://api.cloudflare.com/client/v4",
      fetchFn: mockFetch as any
    });
  });

  it("lists services via official Cloudflare Workers scripts API", async () => {
    // Mock scripts response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        errors: [],
        messages: [],
        result: [
          { id: "payment-worker", modified_on: "2026-09-19T10:00:00Z" },
          { id: "auth-worker", modified_on: "2026-09-19T09:30:00Z" }
        ]
      })
    });

    // Mock getServiceHealth for each (deployments + metrics)
    // payment-worker deployments
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: {
          deployments: [
            {
              id: "dep-pay-1",
              created_on: "2026-09-19T10:00:00Z",
              annotations: { "workers/message": "Release v1.2" }
            }
          ]
        }
      })
    });
    // payment-worker metrics (GraphQL)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          viewer: {
            accounts: [
              {
                workersInvocationsAdaptive: [
                  {
                    dimensions: {
                      datetime: "2026-09-19T10:15:00Z",
                      status: "success"
                    },
                    quantiles: { cpuTimeP99: 45000 },
                    sum: { requests: 1200, errors: 6 }
                  }
                ]
              }
            ]
          }
        }
      })
    });

    // auth-worker deployments
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: {
          deployments: [
            {
              id: "dep-auth-1",
              created_on: "2026-09-19T09:30:00Z",
              annotations: { "workers/message": "Auth patch" }
            }
          ]
        }
      })
    });
    // auth-worker metrics (GraphQL)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          viewer: {
            accounts: [
              {
                workersInvocationsAdaptive: []
              }
            ]
          }
        }
      })
    });

    const services = await provider.listServices();

    expect(services).toHaveLength(2);
    expect(services[0].name).toBe("payment-worker");
    expect(services[0].type).toBe("worker");
    expect(services[0].providerType).toBe("cloudflare");
    expect(services[0].errorRate).toBe(0.5); // 6 / 1200 * 100
    expect(services[0].status).toBe("healthy");

    expect(services[1].name).toBe("auth-worker");
    expect(services[1].status).toBe("healthy");
  });

  it("filters services to explicit CLOUDFLARE_WORKER_NAMES allowlist when provided", async () => {
    const customProvider = new CloudflareInfrastructureProvider({
      accountId: mockAccountId,
      apiToken: mockApiToken,
      workerNames: ["targeted-api"],
      fetchFn: mockFetch as any
    });

    // Mock deployment + metrics for targeted-api
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: {
          deployments: [{ id: "dep-1", created_on: "2026-09-19T10:00:00Z" }]
        }
      })
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: { viewer: { accounts: [{ workersInvocationsAdaptive: [] }] } }
      })
    });

    const services = await customProvider.listServices();

    expect(services).toHaveLength(1);
    expect(services[0].name).toBe("targeted-api");
    // Ensure scripts listing endpoint /workers/scripts was NOT called because allowlist was provided
    expect(mockFetch).not.toHaveBeenCalledWith(
      "https://api.cloudflare.com/client/v4/accounts/test-account-123456/workers/scripts",
      expect.anything()
    );
  });

  it("parses GraphQL workersInvocationsAdaptive metrics accurately", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          viewer: {
            accounts: [
              {
                workersInvocationsAdaptive: [
                  {
                    dimensions: {
                      datetime: "2026-09-19T11:00:00Z",
                      status: "success"
                    },
                    quantiles: { cpuTimeP50: 20000, cpuTimeP99: 120000 }, // 120ms
                    sum: { requests: 500, errors: 25 } // 5%
                  }
                ]
              }
            ]
          }
        }
      })
    });

    const metrics = await provider.getMetrics("my-worker", "last-60m");

    expect(metrics.serviceName).toBe("my-worker");
    expect(metrics.points).toHaveLength(1);
    expect(metrics.points[0].p95LatencyMs).toBe(120);
    expect(metrics.points[0].errorRate).toBe(5);
    expect(metrics.summary.peakErrorRate).toBe(5);
    expect(metrics.summary.peakP95LatencyMs).toBe(120);
  });

  it("parses deployment history from Cloudflare Deployments API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        errors: [],
        messages: [],
        result: {
          deployments: [
            {
              id: "dep-uuid-2",
              number: 2,
              created_on: "2026-09-19T11:30:00Z",
              author_email: "sre@example.com",
              source: "wrangler",
              annotations: {
                "workers/message": "Fix memory usage",
                "workers/tag": "v1.4.1"
              },
              versions: [{ version_id: "ver-222", percentage: 100 }]
            },
            {
              id: "dep-uuid-1",
              number: 1,
              created_on: "2026-09-19T10:00:00Z",
              author_email: "sre@example.com",
              source: "wrangler",
              annotations: { "workers/message": "Initial release" },
              versions: [{ version_id: "ver-111", percentage: 100 }]
            }
          ]
        }
      })
    });

    const deployments = await provider.getDeploymentHistory("my-worker");

    expect(deployments).toHaveLength(2);
    expect(deployments[0].version).toBe("ver-222");
    expect(deployments[0].deployedBy).toBe("sre@example.com");
    expect(deployments[0].gitCommit).toBe("v1.4.1");
    expect(deployments[0].changelog).toBe("Fix memory usage");
    expect(deployments[0].rollbackVersion).toBe("ver-111");
  });

  it("returns invocation telemetry logs with explicit notice for raw logs", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          viewer: {
            accounts: [
              {
                workersInvocationsAdaptive: [
                  {
                    dimensions: {
                      datetime: "2026-09-19T11:45:00Z",
                      status: "exceededMemory"
                    },
                    sum: { requests: 10, errors: 10 }
                  }
                ]
              }
            ]
          }
        }
      })
    });

    const logs = await provider.getLogs("my-worker");

    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs[0].level).toBe("INFO");
    expect(logs[0].message).toContain("Cloudflare Telemetry Notice");
    expect(logs[1].level).toBe("ERROR");
    expect(logs[1].message).toContain("exceededMemory");
  });

  it("returns unsupported result for database health when worker has no Hyperdrive/D1", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: [] // No Hyperdrive configs
      })
    });

    const dbHealth = await provider.getDatabaseHealth(undefined, "my-worker");

    expect(dbHealth).toBeDefined();
    expect((dbHealth as any).supported).toBe(false);
    expect((dbHealth as any).status).toBe("not_available");
    expect((dbHealth as any).message).toContain("serverless edge isolates");
  });

  it("handles Cloudflare API authentication failure (401)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({
        success: false,
        errors: [{ code: 10000, message: "Authentication error" }],
        messages: [],
        result: null
      })
    });

    await expect(provider.listServices()).rejects.toThrow(
      "Authentication error"
    );
  });

  it("handles Cloudflare API rate limiting (429) with retry", async () => {
    // First call returns 429
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: new Headers({ "Retry-After": "0" }),
      json: async () => ({
        success: false,
        errors: [{ code: 10013, message: "Rate limited" }]
      })
    });

    // Retry returns 200 OK
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: [{ id: "recovered-worker" }]
      })
    });

    // Mock subsequent deployment and metrics calls
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, result: { deployments: [] } })
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: { viewer: { accounts: [{ workersInvocationsAdaptive: [] }] } }
      })
    });

    const services = await provider.listServices();
    expect(services).toHaveLength(1);
    expect(services[0].name).toBe("recovered-worker");
  });

  it("redacts API token from error messages to protect credentials", async () => {
    mockFetch.mockRejectedValueOnce(
      new Error(`Request failed with token ${mockApiToken} in header`)
    );

    await expect(provider.listServices()).rejects.toThrow("[REDACTED_TOKEN]");
  });
});
