import { describe, it, expect } from "vitest";
import {
  serviceNameSchema,
  versionTagSchema,
  logLimitSchema,
  rollbackDeploymentSchema,
  restartServiceSchema
} from "../src/tools/validator";

describe("Tool Argument Validation & Security", () => {
  it("validates legitimate service names", () => {
    expect(serviceNameSchema.parse("payment-api")).toBe("payment-api");
    expect(serviceNameSchema.parse("auth-service")).toBe("auth-service");
    expect(serviceNameSchema.parse("orders-api")).toBe("orders-api");
  });

  it("rejects invalid or malicious service names", () => {
    // Shell command injection attempts
    expect(() => serviceNameSchema.parse("payment-api; rm -rf /")).toThrow();
    expect(() => serviceNameSchema.parse("auth-service && echo 1")).toThrow();
    expect(() => serviceNameSchema.parse("orders$(whoami)")).toThrow();
    expect(() => serviceNameSchema.parse("")).toThrow();
    expect(() => serviceNameSchema.parse("a")).toThrow(); // min length 2
    expect(() => serviceNameSchema.parse("UPPERCASE_SERVICE")).toThrow(); // lowercase alphanumeric + hyphens only
  });

  it("validates legitimate software version tags", () => {
    expect(versionTagSchema.parse("v1.8.2")).toBe("v1.8.2");
    expect(versionTagSchema.parse("v2.4.0")).toBe("v2.4.0");
    expect(versionTagSchema.parse("1.0.0")).toBe("1.0.0");
    expect(versionTagSchema.parse("v1.12.0-rc1")).toBe("v1.12.0-rc1");
  });

  it("rejects invalid version strings", () => {
    expect(() => versionTagSchema.parse("latest; drop database")).toThrow();
    expect(() =>
      versionTagSchema.parse("invalid version with spaces")
    ).toThrow();
    expect(() => versionTagSchema.parse("v")).toThrow();
  });

  it("validates log limit ranges strictly", () => {
    expect(logLimitSchema.parse(50)).toBe(50);
    expect(logLimitSchema.parse(1)).toBe(1);
    expect(logLimitSchema.parse(100)).toBe(100);

    // Out of range limits
    expect(() => logLimitSchema.parse(0)).toThrow();
    expect(() => logLimitSchema.parse(101)).toThrow();
    expect(() => logLimitSchema.parse(-5)).toThrow();
  });

  it("validates complete rollback arguments correctly", () => {
    const valid = rollbackDeploymentSchema.parse({
      serviceName: "payment-api",
      targetVersion: "v1.8.1",
      reason: "Emergency rollback due to connection leak"
    });

    expect(valid.serviceName).toBe("payment-api");
    expect(valid.targetVersion).toBe("v1.8.1");

    // Rejects missing targetVersion
    expect(() =>
      rollbackDeploymentSchema.parse({
        serviceName: "payment-api"
      })
    ).toThrow();
  });

  it("validates restart arguments with defaults", () => {
    const parsed = restartServiceSchema.parse({
      serviceName: "auth-service"
    });

    expect(parsed.serviceName).toBe("auth-service");
    expect(parsed.graceful).toBe(true); // default true
  });
});
