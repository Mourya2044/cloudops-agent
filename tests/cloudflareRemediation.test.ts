import { describe, it, expect, vi, beforeEach } from "vitest";
import { CloudflareInfrastructureProvider } from "../src/infrastructure/cloudflareProvider";
import { createRemediationTools } from "../src/tools/remediationTools";

describe("Cloudflare Remediation & Human Approval", () => {
  const mockAccountId = "test-account-123456";
  const mockApiToken = "cf-test-token-abcdef";

  let mockFetch: ReturnType<typeof vi.fn>;
  let provider: CloudflareInfrastructureProvider;
  let tools: ReturnType<typeof createRemediationTools>;

  beforeEach(() => {
    mockFetch = vi.fn();
    provider = new CloudflareInfrastructureProvider({
      accountId: mockAccountId,
      apiToken: mockApiToken,
      baseUrl: "https://api.cloudflare.com/client/v4",
      fetchFn: mockFetch as any
    });
    tools = createRemediationTools(provider);
  });

  it("enforces needsApproval = true on rollbackDeployment tool", async () => {
    const fn = tools.rollbackDeployment.needsApproval as unknown as (
      input: unknown
    ) => Promise<boolean>;
    const requiresApproval = await fn({
      serviceName: "payment-worker",
      targetVersion: "v1.2.0"
    });

    expect(requiresApproval).toBe(true);
  });

  it("enforces needsApproval = true on restartService tool", async () => {
    const fn = tools.restartService.needsApproval as unknown as (
      input: unknown
    ) => Promise<boolean>;
    const requiresApproval = await fn({
      serviceName: "payment-worker"
    });

    expect(requiresApproval).toBe(true);
  });

  it("executes real rollback via Cloudflare Deployments API and verifies health", async () => {
    // 1. Mock Deployments POST
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        errors: [],
        messages: [],
        result: {
          id: "deployment-new-uuid",
          number: 3,
          created_on: "2026-09-19T12:00:00Z"
        }
      })
    });

    // 2. Mock verifyServiceHealth -> getDeploymentHistory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: {
          deployments: [
            {
              id: "deployment-new-uuid",
              versions: [{ version_id: "ver-stable-1", percentage: 100 }],
              created_on: "2026-09-19T12:00:00Z"
            }
          ]
        }
      })
    });

    // 3. Mock verifyServiceHealth -> getMetrics
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
                      datetime: "2026-09-19T12:05:00Z",
                      status: "success"
                    },
                    quantiles: { cpuTimeP99: 30000 },
                    sum: { requests: 800, errors: 0 }
                  }
                ]
              }
            ]
          }
        }
      })
    });

    const result = await (tools.rollbackDeployment.execute as any)({
      serviceName: "payment-worker",
      targetVersion: "ver-stable-1"
    });

    expect(result.status).toBe("executed");
    expect(result.remediation.success).toBe(true);
    expect(result.remediation.action).toBe("rollback");
    expect(result.remediation.status).toBe("executed");
    expect(result.remediation.newVersion).toBe("ver-stable-1");
    expect(result.remediation.message).toContain(
      "Successfully executed rollback"
    );

    // Post-remediation verification
    expect(result.verification.healthy).toBe(true);
    expect(result.verification.status).toBe("healthy");
    expect(result.verification.message).toContain("HEALTHY");

    // Ensure Cloudflare Deployments API was invoked with target version
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/workers/scripts/payment-worker/deployments"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("ver-stable-1")
      })
    );
  });

  it("handles Cloudflare rollback API failure gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({
        success: false,
        errors: [{ code: 10025, message: "Target version does not exist" }]
      })
    });

    const result = await (tools.rollbackDeployment.execute as any)({
      serviceName: "payment-worker",
      targetVersion: "invalid-version-uuid"
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("Target version does not exist");
  });

  it("returns unsupported_operation for restartService on serverless Workers", async () => {
    // 1. Mock verifyServiceHealth -> getDeploymentHistory
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: { deployments: [] }
      })
    });

    // 2. Mock verifyServiceHealth -> getMetrics
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: { viewer: { accounts: [{ workersInvocationsAdaptive: [] }] } }
      })
    });

    const result = await (tools.restartService.execute as any)({
      serviceName: "payment-worker"
    });

    expect(result.status).toBe("executed");
    expect(result.restart.success).toBe(false);
    expect(result.restart.action).toBe("restart");
    expect(result.restart.status).toBe("unsupported_operation");
    expect(result.restart.message).toContain("unsupported_operation");
    expect(result.restart.message).toContain(
      "serverless stateless edge isolates"
    );
  });
});
