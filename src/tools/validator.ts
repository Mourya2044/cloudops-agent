import { z } from "zod";

// Safe service name regex: lowercase alphanumeric and hyphens only
export const serviceNameSchema = z
  .string()
  .min(2, "Service name must be at least 2 characters")
  .max(64, "Service name cannot exceed 64 characters")
  .regex(
    /^[a-z0-9-]+$/,
    "Service name must contain only lowercase letters, numbers, and hyphens"
  )
  .describe(
    "The name of the infrastructure microservice (e.g. 'payment-api', 'auth-service', 'orders-api')"
  );

// Semantic version schema: e.g. 'v1.8.2', 'v2.4.1'
export const versionTagSchema = z
  .string()
  .min(2)
  .max(32)
  .regex(
    /^v?[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-zA-Z0-9.]+)?$/,
    "Must be a valid version string (e.g. 'v1.8.1')"
  )
  .describe("Target software release version (e.g. 'v1.8.1')");

export const timeWindowSchema = z
  .enum(["last-15m", "last-30m", "last-60m", "last-24h"])
  .default("last-60m")
  .describe("Time window for metrics retrieval");

export const logLevelSchema = z
  .enum(["INFO", "WARN", "ERROR"])
  .optional()
  .describe("Filter log entries by severity level");

export const logLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(25)
  .describe("Maximum number of log lines to retrieve (1-100)");

export const historyLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(20)
  .default(5)
  .describe("Maximum deployment records to return");

// Input schemas for each tool
export const getServiceHealthSchema = z.object({
  serviceName: serviceNameSchema
});

export const getMetricsSchema = z.object({
  serviceName: serviceNameSchema,
  timeWindow: timeWindowSchema.optional()
});

export const getLogsSchema = z.object({
  serviceName: serviceNameSchema,
  limit: logLimitSchema.optional(),
  level: logLevelSchema
});

export const getDeploymentHistorySchema = z.object({
  serviceName: serviceNameSchema,
  limit: historyLimitSchema.optional()
});

export const getDatabaseHealthSchema = z.object({
  databaseName: z
    .string()
    .max(64)
    .optional()
    .describe("Database instance name"),
  serviceName: serviceNameSchema
    .optional()
    .describe("Service associated with the database")
});

export const searchIncidentHistorySchema = z.object({
  serviceName: serviceNameSchema
    .optional()
    .describe("Filter past incidents by service"),
  query: z
    .string()
    .max(100)
    .optional()
    .describe("Search keywords in historical incident descriptions")
});

export const rollbackDeploymentSchema = z.object({
  serviceName: serviceNameSchema,
  targetVersion: versionTagSchema,
  reason: z
    .string()
    .min(5)
    .max(200)
    .optional()
    .describe("Operational rationale for rollback")
});

export const restartServiceSchema = z.object({
  serviceName: serviceNameSchema,
  graceful: z
    .boolean()
    .default(true)
    .describe("Whether to perform a graceful rolling restart"),
  reason: z
    .string()
    .min(5)
    .max(200)
    .optional()
    .describe("Operational rationale for restart")
});
