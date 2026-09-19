export type ServiceHealthStatus =
  | "healthy"
  | "degraded"
  | "critical"
  | "unknown";

export interface ServiceHealth {
  serviceName: string;
  status: ServiceHealthStatus;
  activeVersion: string;
  errorRate: number; // Percentage, e.g. 8.7 for 8.7%
  p95LatencyMs: number;
  replicaCount: number;
  healthyReplicas: number;
  updatedAt: string;
  environment: "production" | "staging";
}

export interface MetricPoint {
  timestamp: string;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRate: number; // Percentage
  requestRateRps: number;
  cpuPercent: number;
  memoryPercent: number;
  activeConnections?: number;
  waitingConnections?: number;
}

export interface ServiceMetrics {
  serviceName: string;
  timeWindow: string; // e.g. "last-60m", "last-15m"
  points: MetricPoint[];
  summary: {
    avgP95LatencyMs: number;
    peakP95LatencyMs: number;
    avgErrorRate: number;
    peakErrorRate: number;
    avgCpuPercent: number;
    peakMemoryPercent: number;
  };
}

export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: Record<string, string | number | boolean | null>;
  traceId?: string;
}

export interface DeploymentRecord {
  version: string;
  deployedAt: string;
  deployedBy: string;
  gitCommit: string;
  changelog: string;
  isRollback?: boolean;
  previousVersion?: string;
  rollbackVersion?: string;
}

export interface DatabaseHealth {
  databaseName: string;
  serviceName: string;
  status: "healthy" | "degraded" | "critical";
  activeConnections: number;
  maxConnections: number;
  waitingConnections: number;
  poolUtilizationPercent: number;
  connectionTimeoutsLast10m: number;
  slowQueriesCount: number;
  replicationLagMs?: number;
}

export interface UnsupportedTelemetryResult {
  supported: false;
  status: "not_available" | "unsupported";
  serviceName?: string;
  resourceName?: string;
  reason: string;
  message: string;
}

export type DatabaseHealthResult = DatabaseHealth | UnsupportedTelemetryResult;

export interface RemediationResult {
  success: boolean;
  action: "rollback" | "restart";
  status?: "executed" | "unsupported_operation" | "failed";
  serviceName: string;
  previousVersion?: string;
  newVersion?: string;
  message: string;
  timestamp: string;
  restartDetails?: {
    graceful: boolean;
    restartedPods: number;
  };
}

export interface HealthVerificationResult {
  serviceName: string;
  healthy: boolean;
  status: ServiceHealthStatus;
  currentMetrics: {
    p95LatencyMs: number;
    errorRate: number;
    activeVersion: string;
  };
  message: string;
  timestamp: string;
}

export interface ServiceSummary {
  name: string;
  displayName: string;
  status: ServiceHealthStatus;
  version: string;
  errorRate: number;
  p95LatencyMs: number;
  type: "api" | "service" | "worker";
  providerType?: "cloudflare" | "synthetic";
  lastDeploymentTime?: string;
}
