import type {
  ServiceHealth,
  ServiceMetrics,
  LogEntry,
  DeploymentRecord,
  DatabaseHealth
} from "../types/infrastructure";
import type { IncidentRecord, IncidentScenarioId } from "../types/incident";

export interface ScenarioDefinition {
  id: IncidentScenarioId;
  serviceName: string;
  name: string;
  description: string;
  health: ServiceHealth;
  metrics: ServiceMetrics;
  logs: LogEntry[];
  deployments: DeploymentRecord[];
  database?: DatabaseHealth;
  expectedRootCause: string;
  evidencePoints: string[];
  recommendedAction: "rollback" | "restart";
  targetVersion?: string;
  remediatedHealth: ServiceHealth;
  remediatedMetrics: ServiceMetrics;
}

export const SCENARIOS: Record<IncidentScenarioId, ScenarioDefinition> = {
  "payment-api-leak": {
    id: "payment-api-leak",
    serviceName: "payment-api",
    name: "Payment API Database Pool Exhaustion",
    description:
      "Deployment v1.8.2 at 10:27 introduced connection leak causing pool starvation, 5xx errors, and high latency.",
    health: {
      serviceName: "payment-api",
      status: "degraded",
      activeVersion: "v1.8.2",
      errorRate: 8.7,
      p95LatencyMs: 1840,
      replicaCount: 8,
      healthyReplicas: 5,
      updatedAt: "2026-09-19T10:45:00Z",
      environment: "production"
    },
    metrics: {
      serviceName: "payment-api",
      timeWindow: "last-60m",
      points: [
        {
          timestamp: "10:00",
          p95LatencyMs: 82,
          p99LatencyMs: 120,
          errorRate: 0.04,
          requestRateRps: 650,
          cpuPercent: 28,
          memoryPercent: 42,
          activeConnections: 12,
          waitingConnections: 0
        },
        {
          timestamp: "10:15",
          p95LatencyMs: 85,
          p99LatencyMs: 125,
          errorRate: 0.05,
          requestRateRps: 670,
          cpuPercent: 30,
          memoryPercent: 43,
          activeConnections: 14,
          waitingConnections: 0
        },
        {
          timestamp: "10:25",
          p95LatencyMs: 88,
          p99LatencyMs: 130,
          errorRate: 0.04,
          requestRateRps: 680,
          cpuPercent: 32,
          memoryPercent: 45,
          activeConnections: 15,
          waitingConnections: 0
        },
        // Deployment v1.8.2 happens at 10:27
        {
          timestamp: "10:30",
          p95LatencyMs: 420,
          p99LatencyMs: 890,
          errorRate: 1.8,
          requestRateRps: 690,
          cpuPercent: 44,
          memoryPercent: 51,
          activeConnections: 42,
          waitingConnections: 18
        },
        {
          timestamp: "10:35",
          p95LatencyMs: 1150,
          p99LatencyMs: 2400,
          errorRate: 5.2,
          requestRateRps: 660,
          cpuPercent: 58,
          memoryPercent: 58,
          activeConnections: 50,
          waitingConnections: 64
        },
        {
          timestamp: "10:40",
          p95LatencyMs: 1680,
          p99LatencyMs: 3200,
          errorRate: 7.9,
          requestRateRps: 640,
          cpuPercent: 62,
          memoryPercent: 61,
          activeConnections: 50,
          waitingConnections: 112
        },
        {
          timestamp: "10:45",
          p95LatencyMs: 1840,
          p99LatencyMs: 3500,
          errorRate: 8.7,
          requestRateRps: 620,
          cpuPercent: 65,
          memoryPercent: 64,
          activeConnections: 50,
          waitingConnections: 142
        }
      ],
      summary: {
        avgP95LatencyMs: 763,
        peakP95LatencyMs: 1840,
        avgErrorRate: 3.4,
        peakErrorRate: 8.7,
        avgCpuPercent: 45,
        peakMemoryPercent: 64
      }
    },
    logs: [
      {
        timestamp: "2026-09-19T10:27:14Z",
        level: "INFO",
        service: "payment-api",
        message: "Deployment v1.8.2 rollout started. 8 replicas targeted."
      },
      {
        timestamp: "2026-09-19T10:28:02Z",
        level: "INFO",
        service: "payment-api",
        message: "Deployment v1.8.2 rollout completed successfully."
      },
      {
        timestamp: "2026-09-19T10:31:45Z",
        level: "WARN",
        service: "payment-api",
        message:
          "HikariPool-1 - Connection pool usage exceeded 80% (41/50 in use)"
      },
      {
        timestamp: "2026-09-19T10:34:11Z",
        level: "ERROR",
        service: "payment-api",
        message:
          "ConnectionPoolTimeoutException: Timeout waiting for idle connection from pool after 30000ms",
        traceId: "trace-pay-9921",
        context: { pool: "HikariPool-1", timeoutMs: 30000, waiting: 48 }
      },
      {
        timestamp: "2026-09-19T10:36:20Z",
        level: "ERROR",
        service: "payment-api",
        message:
          "500 Internal Server Error in POST /v1/payments/charge - Database connection unavailable",
        traceId: "trace-pay-9934",
        context: { path: "/v1/payments/charge", status: 500 }
      },
      {
        timestamp: "2026-09-19T10:41:05Z",
        level: "ERROR",
        service: "payment-api",
        message:
          "ConnectionPoolTimeoutException: Connection acquisition timed out for thread pool-exec-48",
        traceId: "trace-pay-9950"
      },
      {
        timestamp: "2026-09-19T10:44:30Z",
        level: "WARN",
        service: "payment-api",
        message:
          "Health check failing on 3/8 pods due to database connectivity timeouts"
      }
    ],
    deployments: [
      {
        version: "v1.8.2",
        deployedAt: "2026-09-19T10:27:00Z",
        deployedBy: "deploy-bot",
        gitCommit: "9c3f1b4",
        changelog:
          "Refactor checkout transaction handling and database connection management",
        rollbackVersion: "v1.8.1"
      },
      {
        version: "v1.8.1",
        deployedAt: "2026-09-17T14:10:00Z",
        deployedBy: "sarah.chen",
        gitCommit: "4a8e2d0",
        changelog:
          "Fix currency precision calculation for international payments"
      },
      {
        version: "v1.8.0",
        deployedAt: "2026-09-10T09:30:00Z",
        deployedBy: "sarah.chen",
        gitCommit: "1b2c3d4",
        changelog: "Add Apple Pay direct checkout support"
      }
    ],
    database: {
      databaseName: "payments-primary-db",
      serviceName: "payment-api",
      status: "critical",
      activeConnections: 50,
      maxConnections: 50,
      waitingConnections: 142,
      poolUtilizationPercent: 100,
      connectionTimeoutsLast10m: 124,
      slowQueriesCount: 8,
      replicationLagMs: 4
    },
    expectedRootCause:
      "Database connection pool exhaustion caused by connection leak introduced in deployment v1.8.2 at 10:27 UTC.",
    evidencePoints: [
      "Deployment v1.8.2 occurred at 10:27 UTC (commit 9c3f1b4: 'Refactor checkout transaction handling and database connection management').",
      "Hikari connection pool reached 100% capacity (50/50 active connections) with 142 waiting threads shortly after rollout.",
      "ConnectionPoolTimeoutException (30,000ms timeout) appears repeatedly in logs starting at 10:34 UTC.",
      "Error rate spiked from 0.04% to 8.7% and p95 latency degraded from 85ms to 1,840ms."
    ],
    recommendedAction: "rollback",
    targetVersion: "v1.8.1",
    remediatedHealth: {
      serviceName: "payment-api",
      status: "healthy",
      activeVersion: "v1.8.1",
      errorRate: 0.04,
      p95LatencyMs: 82,
      replicaCount: 8,
      healthyReplicas: 8,
      updatedAt: "2026-09-19T11:00:00Z",
      environment: "production"
    },
    remediatedMetrics: {
      serviceName: "payment-api",
      timeWindow: "last-15m",
      points: [
        {
          timestamp: "10:55",
          p95LatencyMs: 84,
          p99LatencyMs: 122,
          errorRate: 0.04,
          requestRateRps: 650,
          cpuPercent: 29,
          memoryPercent: 42,
          activeConnections: 14,
          waitingConnections: 0
        },
        {
          timestamp: "11:00",
          p95LatencyMs: 82,
          p99LatencyMs: 120,
          errorRate: 0.03,
          requestRateRps: 660,
          cpuPercent: 28,
          memoryPercent: 41,
          activeConnections: 13,
          waitingConnections: 0
        }
      ],
      summary: {
        avgP95LatencyMs: 83,
        peakP95LatencyMs: 84,
        avgErrorRate: 0.035,
        peakErrorRate: 0.04,
        avgCpuPercent: 28.5,
        peakMemoryPercent: 42
      }
    }
  },

  "auth-service-oom": {
    id: "auth-service-oom",
    serviceName: "auth-service",
    name: "Auth Service Memory Leak & OOM Crash Loop",
    description:
      "Deployment v2.4.1 introduced in-memory JWT cache without eviction, causing continuous memory exhaustion and crash loops.",
    health: {
      serviceName: "auth-service",
      status: "critical",
      activeVersion: "v2.4.1",
      errorRate: 14.2,
      p95LatencyMs: 950,
      replicaCount: 6,
      healthyReplicas: 2,
      updatedAt: "2026-09-19T10:48:00Z",
      environment: "production"
    },
    metrics: {
      serviceName: "auth-service",
      timeWindow: "last-60m",
      points: [
        {
          timestamp: "09:50",
          p95LatencyMs: 45,
          p99LatencyMs: 70,
          errorRate: 0.01,
          requestRateRps: 1200,
          cpuPercent: 35,
          memoryPercent: 38
        },
        {
          timestamp: "10:05",
          p95LatencyMs: 52,
          p99LatencyMs: 80,
          errorRate: 0.02,
          requestRateRps: 1250,
          cpuPercent: 40,
          memoryPercent: 55
        },
        {
          timestamp: "10:20",
          p95LatencyMs: 75,
          p99LatencyMs: 110,
          errorRate: 0.1,
          requestRateRps: 1230,
          cpuPercent: 48,
          memoryPercent: 74
        },
        {
          timestamp: "10:35",
          p95LatencyMs: 280,
          p99LatencyMs: 520,
          errorRate: 4.8,
          requestRateRps: 1180,
          cpuPercent: 78,
          memoryPercent: 92
        },
        {
          timestamp: "10:45",
          p95LatencyMs: 950,
          p99LatencyMs: 1800,
          errorRate: 14.2,
          requestRateRps: 1100,
          cpuPercent: 88,
          memoryPercent: 98
        }
      ],
      summary: {
        avgP95LatencyMs: 280,
        peakP95LatencyMs: 950,
        avgErrorRate: 3.8,
        peakErrorRate: 14.2,
        avgCpuPercent: 57.8,
        peakMemoryPercent: 98
      }
    },
    logs: [
      {
        timestamp: "2026-09-19T09:15:20Z",
        level: "INFO",
        service: "auth-service",
        message: "Deployment v2.4.1 completed. Rollout to 6 pods finished."
      },
      {
        timestamp: "2026-09-19T10:22:10Z",
        level: "WARN",
        service: "auth-service",
        message:
          "High memory utilization alert: container memory at 78% (1.56GB / 2.0GB)"
      },
      {
        timestamp: "2026-09-19T10:34:55Z",
        level: "ERROR",
        service: "auth-service",
        message:
          "OutOfMemoryError: Java heap space during TokenVerificationSessionCache insertion"
      },
      {
        timestamp: "2026-09-19T10:36:12Z",
        level: "ERROR",
        service: "auth-service",
        message:
          "Pod auth-service-7b9d-4x8k terminated with exit code 137 (OOMKilled)",
        context: { exitCode: 137, restarts: 1 }
      },
      {
        timestamp: "2026-09-19T10:41:00Z",
        level: "ERROR",
        service: "auth-service",
        message:
          "502 Bad Gateway: upstream server unreachable during pod restart",
        context: { path: "/oauth/token", status: 502 }
      },
      {
        timestamp: "2026-09-19T10:44:18Z",
        level: "ERROR",
        service: "auth-service",
        message:
          "Pod auth-service-7b9d-m2q1 terminated with exit code 137 (OOMKilled)",
        context: { exitCode: 137, restarts: 4 }
      },
      {
        timestamp: "2026-09-19T10:47:30Z",
        level: "WARN",
        service: "auth-service",
        message:
          "CrashLoopBackOff detected on 4 out of 6 pods. Only 2 pods available."
      }
    ],
    deployments: [
      {
        version: "v2.4.1",
        deployedAt: "2026-09-19T09:15:00Z",
        deployedBy: "deploy-bot",
        gitCommit: "3e5a7f9",
        changelog:
          "Add in-memory JWT session cache to accelerate token verification",
        rollbackVersion: "v2.4.0"
      },
      {
        version: "v2.4.0",
        deployedAt: "2026-09-12T11:00:00Z",
        deployedBy: "marcus.vance",
        gitCommit: "7b8c9d0",
        changelog: "Upgrade OAuth2 PKCE verification library"
      }
    ],
    expectedRootCause:
      "Memory leak in in-memory JWT session cache introduced in v2.4.1 causing OOMKilled crashes (exit code 137) and 502 Bad Gateway errors.",
    evidencePoints: [
      "Deployment v2.4.1 added an unbounded in-memory JWT session cache.",
      "Memory usage steadily climbed from 38% to 98% (2GB memory ceiling).",
      "Multiple pods terminated with exit code 137 (OOMKilled) with 4 restarts in the last hour.",
      "502 Bad Gateway errors spiked to 14.2% due to insufficient healthy replicas."
    ],
    recommendedAction: "rollback",
    targetVersion: "v2.4.0",
    remediatedHealth: {
      serviceName: "auth-service",
      status: "healthy",
      activeVersion: "v2.4.0",
      errorRate: 0.02,
      p95LatencyMs: 48,
      replicaCount: 6,
      healthyReplicas: 6,
      updatedAt: "2026-09-19T11:00:00Z",
      environment: "production"
    },
    remediatedMetrics: {
      serviceName: "auth-service",
      timeWindow: "last-15m",
      points: [
        {
          timestamp: "10:55",
          p95LatencyMs: 48,
          p99LatencyMs: 72,
          errorRate: 0.02,
          requestRateRps: 1200,
          cpuPercent: 36,
          memoryPercent: 39
        }
      ],
      summary: {
        avgP95LatencyMs: 48,
        peakP95LatencyMs: 48,
        avgErrorRate: 0.02,
        peakErrorRate: 0.02,
        avgCpuPercent: 36,
        peakMemoryPercent: 39
      }
    }
  },

  "orders-api-cascade": {
    id: "orders-api-cascade",
    serviceName: "orders-api",
    name: "Orders API Upstream Degradation & Retry Storm",
    description:
      "External payment gateway dependency degradation causing timeout spikes and client retry amplification.",
    health: {
      serviceName: "orders-api",
      status: "degraded",
      activeVersion: "v1.12.1",
      errorRate: 12.4,
      p95LatencyMs: 4200,
      replicaCount: 10,
      healthyReplicas: 10,
      updatedAt: "2026-09-19T10:46:00Z",
      environment: "production"
    },
    metrics: {
      serviceName: "orders-api",
      timeWindow: "last-60m",
      points: [
        {
          timestamp: "10:00",
          p95LatencyMs: 140,
          p99LatencyMs: 210,
          errorRate: 0.1,
          requestRateRps: 400,
          cpuPercent: 35,
          memoryPercent: 44
        },
        {
          timestamp: "10:15",
          p95LatencyMs: 145,
          p99LatencyMs: 220,
          errorRate: 0.1,
          requestRateRps: 410,
          cpuPercent: 36,
          memoryPercent: 45
        },
        {
          timestamp: "10:30",
          p95LatencyMs: 1850,
          p99LatencyMs: 4100,
          errorRate: 4.2,
          requestRateRps: 780,
          cpuPercent: 62,
          memoryPercent: 55
        },
        {
          timestamp: "10:45",
          p95LatencyMs: 4200,
          p99LatencyMs: 5800,
          errorRate: 12.4,
          requestRateRps: 1420,
          cpuPercent: 89,
          memoryPercent: 78
        }
      ],
      summary: {
        avgP95LatencyMs: 1583,
        peakP95LatencyMs: 4200,
        avgErrorRate: 4.2,
        peakErrorRate: 12.4,
        avgCpuPercent: 55.5,
        peakMemoryPercent: 78
      }
    },
    logs: [
      {
        timestamp: "2026-09-19T10:25:00Z",
        level: "WARN",
        service: "orders-api",
        message:
          "Upstream vendor pay-gateway-ext.vendor.net response time degraded to 4200ms"
      },
      {
        timestamp: "2026-09-19T10:31:14Z",
        level: "ERROR",
        service: "orders-api",
        message:
          "GatewayTimeout: pay-gateway-ext.vendor.net failed to respond within 5000ms",
        traceId: "trace-ord-1142"
      },
      {
        timestamp: "2026-09-19T10:35:40Z",
        level: "WARN",
        service: "orders-api",
        message:
          "Retry amplification detected: incoming RPS increased from 400 to 1420 (3.5x factor)"
      },
      {
        timestamp: "2026-09-19T10:42:19Z",
        level: "ERROR",
        service: "orders-api",
        message:
          "Thread pool exhaustion in OrderPlacementExecutor: 200/200 worker threads blocked"
      }
    ],
    deployments: [
      {
        version: "v1.12.1",
        deployedAt: "2026-09-18T16:00:00Z",
        deployedBy: "alex.kumar",
        gitCommit: "8a1b2c3",
        changelog: "Increase downstream HTTP client timeout to 5000ms",
        rollbackVersion: "v1.12.0"
      },
      {
        version: "v1.12.0",
        deployedAt: "2026-09-14T10:00:00Z",
        deployedBy: "alex.kumar",
        gitCommit: "5d6e7f8",
        changelog:
          "Add circuit breaker fallback for third-party payment gateways"
      }
    ],
    expectedRootCause:
      "External gateway degradation coupled with aggressive client retries (3.5x amplification) and missing circuit breaker fallback.",
    evidencePoints: [
      "External dependency pay-gateway-ext.vendor.net response latency degraded beyond 5000ms.",
      "Incoming request rate amplified from 400 RPS to 1420 RPS due to unthrottled client retries.",
      "Internal executor threads became starved waiting on downstream timeouts.",
      "Rolling back to v1.12.0 re-enables the circuit breaker fallback."
    ],
    recommendedAction: "rollback",
    targetVersion: "v1.12.0",
    remediatedHealth: {
      serviceName: "orders-api",
      status: "healthy",
      activeVersion: "v1.12.0",
      errorRate: 0.1,
      p95LatencyMs: 135,
      replicaCount: 10,
      healthyReplicas: 10,
      updatedAt: "2026-09-19T11:00:00Z",
      environment: "production"
    },
    remediatedMetrics: {
      serviceName: "orders-api",
      timeWindow: "last-15m",
      points: [
        {
          timestamp: "10:55",
          p95LatencyMs: 135,
          p99LatencyMs: 200,
          errorRate: 0.1,
          requestRateRps: 410,
          cpuPercent: 34,
          memoryPercent: 44
        }
      ],
      summary: {
        avgP95LatencyMs: 135,
        peakP95LatencyMs: 135,
        avgErrorRate: 0.1,
        peakErrorRate: 0.1,
        avgCpuPercent: 34,
        peakMemoryPercent: 44
      }
    }
  }
};

export const HISTORICAL_INCIDENTS: IncidentRecord[] = [
  {
    id: "INC-2026-08-14-PAY",
    scenarioId: "payment-api-leak",
    serviceName: "payment-api",
    title: "Database connection pool exhaustion following deployment v1.7.9",
    status: "resolved",
    severity: "P1",
    rootCause:
      "Database connection pool exhaustion following deployment v1.7.9. A leaked unclosed connection in checkout transaction retry logic saturated Hikari pool within 15 minutes of release.",
    evidence: [
      "Deployment v1.7.9 at 14:15 UTC introduced unclosed DB transactions in retry blocks.",
      "Hikari pool hit 50/50 active connections with 130 waiting threads.",
      "ConnectionPoolTimeoutException (30000ms) observed across all payment pods.",
      "Rollback to v1.7.8 immediately cleared waiting connections and restored latency to 80ms."
    ],
    recommendedAction:
      "Rollback to v1.7.8 and add automated connection leak detection.",
    remediationResult: {
      success: true,
      action: "rollback",
      serviceName: "payment-api",
      previousVersion: "v1.7.9",
      newVersion: "v1.7.8",
      message:
        "Successfully rolled back payment-api from v1.7.9 to v1.7.8. Connection pool returned to normal.",
      timestamp: "2026-08-14T15:02:00Z"
    },
    createdAt: "2026-08-14T14:30:00Z",
    updatedAt: "2026-08-14T15:10:00Z",
    resolvedAt: "2026-08-14T15:05:00Z",
    operatorNotes:
      "Identical pattern to previous incidents: connection leak in database transaction handling post-deployment."
  },
  {
    id: "INC-2026-07-02-AUTH",
    scenarioId: "auth-service-oom",
    serviceName: "auth-service",
    title: "Redis cluster failover causing authentication latency spike",
    status: "resolved",
    severity: "P2",
    rootCause:
      "Redis session replica failover triggered connection storms and auth token lookup latency.",
    evidence: [
      "Redis sentinel initiated failover at 03:12 UTC.",
      "Auth service connection pool experienced reconnection thrashing."
    ],
    recommendedAction:
      "Restart auth-service pods and apply exponential backoff on Redis reconnection.",
    createdAt: "2026-07-02T03:15:00Z",
    updatedAt: "2026-07-02T03:45:00Z",
    resolvedAt: "2026-07-02T03:40:00Z"
  },
  {
    id: "INC-2026-06-18-ORD",
    scenarioId: "orders-api-cascade",
    serviceName: "orders-api",
    title: "Downstream inventory service network partition",
    status: "resolved",
    severity: "P2",
    rootCause:
      "Network partition between us-east and us-west regions led to inventory check timeouts.",
    evidence: [
      "Cross-region latency spiked to 900ms due to backbone fiber degradation.",
      "Orders API thread pool saturated on slow inventory RPCs."
    ],
    recommendedAction: "Enable local cache fallback and reroute traffic.",
    createdAt: "2026-06-18T18:20:00Z",
    updatedAt: "2026-06-18T19:00:00Z",
    resolvedAt: "2026-06-18T18:55:00Z"
  }
];
