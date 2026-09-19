import { tool } from "ai";
import {
  getServiceHealthSchema,
  getMetricsSchema,
  getLogsSchema,
  getDeploymentHistorySchema,
  getDatabaseHealthSchema,
  searchIncidentHistorySchema
} from "./validator";
import type { InfrastructureProvider } from "../infrastructure/provider";
import type { IncidentHistoryManager } from "../incidents/history";

export function createInfrastructureTools(
  provider: InfrastructureProvider,
  historyManager: IncidentHistoryManager
) {
  return {
    getServiceHealth: tool({
      description:
        "Retrieve the current real-time health status, active software version, replica availability, error rate, and p95 latency for a microservice.",
      inputSchema: getServiceHealthSchema,
      execute: async ({ serviceName }) => {
        try {
          return await provider.getServiceHealth(serviceName);
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
            serviceName
          };
        }
      }
    }),

    getMetrics: tool({
      description:
        "Fetch time-series operational metrics (p95 latency, error rate %, request throughput RPS, CPU %, memory %, active connections) for a microservice over a recent time window.",
      inputSchema: getMetricsSchema,
      execute: async ({ serviceName, timeWindow }) => {
        try {
          return await provider.getMetrics(serviceName, timeWindow);
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
            serviceName
          };
        }
      }
    }),

    getLogs: tool({
      description:
        "Retrieve recent structured system, application, and error log entries for a microservice, with optional filtering by severity (INFO, WARN, ERROR).",
      inputSchema: getLogsSchema,
      execute: async ({ serviceName, limit, level }) => {
        try {
          return await provider.getLogs(serviceName, limit, level);
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
            serviceName
          };
        }
      }
    }),

    getDeploymentHistory: tool({
      description:
        "Fetch recent software deployment records, git commit hashes, deployer identity, and release changelogs for a microservice.",
      inputSchema: getDeploymentHistorySchema,
      execute: async ({ serviceName, limit }) => {
        try {
          return await provider.getDeploymentHistory(serviceName, limit);
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
            serviceName
          };
        }
      }
    }),

    getDatabaseHealth: tool({
      description:
        "Inspect database connection pool utilization, active/waiting connections, connection timeout exceptions, and slow queries for the database backing a microservice. Note: Cloudflare Workers without Hyperdrive/D1 do not maintain traditional in-memory connection pools.",
      inputSchema: getDatabaseHealthSchema,
      execute: async ({ databaseName, serviceName }) => {
        try {
          const db = await provider.getDatabaseHealth(
            databaseName,
            serviceName
          );
          if (!db) {
            return {
              supported: false,
              status: "not_available",
              message: `No dedicated database metrics found for service '${serviceName || databaseName}'. Telemetry for database connection pools is not applicable.`
            };
          }
          return db;
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }),

    searchIncidentHistory: tool({
      description:
        "Search past operational incidents, post-mortems, and resolution notes by service name or keywords (e.g. 'connection pool', 'OOM', 'latency spike'). Use this when operators ask if an issue occurred before.",
      inputSchema: searchIncidentHistorySchema,
      execute: async ({ serviceName, query }) => {
        try {
          const incidents = historyManager.search({ serviceName, query });
          return {
            totalMatches: incidents.length,
            incidents: incidents.slice(0, 5)
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    })
  };
}
