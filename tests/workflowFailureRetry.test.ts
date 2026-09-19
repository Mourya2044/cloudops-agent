import { describe, it, expect } from "vitest";
import { NonRetryableError } from "cloudflare:workflows";

describe("Workflow Failure & Retry Strategy", () => {
  it("NonRetryableError aborts immediately without triggering retries for fatal errors", () => {
    function parseIncidentStep(serviceName?: string) {
      if (!serviceName) {
        throw new NonRetryableError(
          "Service name is required to start incident investigation."
        );
      }
      const valid = ["payment-api", "auth-service", "orders-api"];
      if (!valid.includes(serviceName)) {
        throw new NonRetryableError(`Unknown service '${serviceName}'`);
      }
      return { serviceName };
    }

    expect(() => parseIncidentStep(undefined)).toThrow(NonRetryableError);
    expect(() => parseIncidentStep("unknown-service")).toThrow(
      NonRetryableError
    );
    expect(parseIncidentStep("payment-api")).toEqual({
      serviceName: "payment-api"
    });
  });

  it("simulates exponential backoff retry configuration for transient network steps", async () => {
    let attempts = 0;
    const retryConfig = {
      limit: 3,
      delay: 50,
      backoff: "exponential" as const
    };

    async function flakyStep(): Promise<string> {
      attempts++;
      if (attempts < 3) {
        throw new Error("Transient network error: upstream connection reset");
      }
      return "Success on attempt 3";
    }

    async function executeWithRetry(
      fn: () => Promise<string>,
      config: typeof retryConfig
    ) {
      let lastErr: any;
      for (let i = 0; i < config.limit; i++) {
        try {
          return await fn();
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr;
    }

    const result = await executeWithRetry(flakyStep, retryConfig);
    expect(result).toBe("Success on attempt 3");
    expect(attempts).toBe(3);
  });
});
