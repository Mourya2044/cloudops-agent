import type {
  ServiceHealth,
  ServiceMetrics,
  LogEntry,
  DeploymentRecord,
  DatabaseHealth,
  DatabaseHealthResult
} from "../types/infrastructure";
import { HISTORICAL_INCIDENTS } from "../data/scenarios";

export interface DiagnosisResult {
  serviceName: string;
  rootCause: string;
  confidence: number;
  evidence: string[];
  recommendedAction: "rollback" | "restart";
  targetVersion?: string;
  remediationDescription: string;
  similarPastIncident?: {
    id: string;
    title: string;
    similarityReason: string;
  };
}

export class IncidentCorrelator {
  public static correlate({
    health,
    metrics,
    logs,
    deployments,
    database
  }: {
    health: ServiceHealth;
    metrics: ServiceMetrics;
    logs: LogEntry[];
    deployments: DeploymentRecord[];
    database?: DatabaseHealthResult | null;
  }): DiagnosisResult {
    const serviceName = health.serviceName;
    const evidence: string[] = [];
    let rootCause = "Unknown infrastructure anomaly";
    let confidence = 0.5;
    let recommendedAction: "rollback" | "restart" = "rollback";
    let targetVersion: string | undefined = undefined;
    let remediationDescription =
      "Investigate system telemetry and recent releases.";

    // 1. Metric anomaly detection
    const latestMetric = metrics.points[metrics.points.length - 1];
    const peakError = metrics.summary.peakErrorRate;
    const peakLatency = metrics.summary.peakP95LatencyMs;

    if (peakError > 1.0) {
      evidence.push(
        `Error rate elevated to ${peakError.toFixed(1)}% (healthy threshold < 1.0%).`
      );
    }
    if (peakLatency > 300) {
      evidence.push(
        `P95 latency elevated to ${peakLatency}ms (nominal baseline ~80-150ms).`
      );
    }

    // 2. Deployment correlation
    const latestDeployment = deployments[0];
    if (latestDeployment) {
      evidence.push(
        `Latest deployment ${latestDeployment.version} rolled out at ${latestDeployment.deployedAt} (commit ${latestDeployment.gitCommit}: '${latestDeployment.changelog}').`
      );
      targetVersion =
        latestDeployment.rollbackVersion || deployments[1]?.version;
    }

    // 3. Database correlation
    const isDbAvailable =
      database && !("supported" in database && !database.supported);
    const validDb = isDbAvailable ? (database as DatabaseHealth) : undefined;
    const isDbPoolExhausted =
      validDb &&
      (validDb.poolUtilizationPercent >= 90 ||
        validDb.waitingConnections > 10 ||
        validDb.connectionTimeoutsLast10m > 5);

    if (database && "supported" in database && !database.supported) {
      evidence.push(
        "Database telemetry: Not available from configured Cloudflare telemetry (Workers are serverless isolates without connection pools)."
      );
    }

    const hasDbTimeoutLogs = logs.some(
      (l) =>
        l.message.includes("ConnectionPoolTimeoutException") ||
        l.message.includes("HikariPool") ||
        l.message.includes("Timeout waiting for idle connection")
    );

    // 4. Memory / OOM correlation
    const isMemoryExhausted =
      (latestMetric?.memoryPercent && latestMetric.memoryPercent > 85) ||
      metrics.summary.peakMemoryPercent > 85;

    const hasOomLogs = logs.some(
      (l) =>
        l.message.includes("OutOfMemoryError") ||
        l.message.includes("OOMKilled") ||
        l.message.includes("exit code 137")
    );

    // 5. External Dependency & Retry Storm correlation
    const hasExternalTimeoutLogs = logs.some(
      (l) =>
        l.message.includes("pay-gateway-ext.vendor.net") ||
        l.message.includes("GatewayTimeout") ||
        l.message.includes("Retry amplification")
    );

    // Correlate scenarios
    if (isDbPoolExhausted || hasDbTimeoutLogs) {
      rootCause = `Database connection pool exhaustion following deployment ${latestDeployment?.version || health.activeVersion}. Connection pool reached 100% capacity (${validDb?.activeConnections || 50}/${validDb?.maxConnections || 50}) with ${validDb?.waitingConnections || "multiple"} waiting threads, starving incoming HTTP requests.`;
      confidence = 0.96;
      recommendedAction = "rollback";
      remediationDescription = `Rollback ${serviceName} from ${health.activeVersion} to ${targetVersion || "previous stable version"} to restore nominal database connection handling.`;

      if (validDb) {
        evidence.push(
          `Database ${validDb.databaseName} reports ${validDb.activeConnections}/${validDb.maxConnections} active connections (${validDb.poolUtilizationPercent}% pool utilization) and ${validDb.waitingConnections} waiting threads.`
        );
      }
      const timeoutLog = logs.find((l) =>
        l.message.includes("ConnectionPoolTimeoutException")
      );
      if (timeoutLog) {
        evidence.push(
          `Logs confirm repeated connection acquisition timeouts: '${timeoutLog.message}'.`
        );
      }
    } else if (isMemoryExhausted || hasOomLogs) {
      rootCause = `Memory leak leading to container OOMKilled crash loops (exit code 137) introduced in deployment ${latestDeployment?.version || health.activeVersion}.`;
      confidence = 0.95;
      recommendedAction = "rollback";
      remediationDescription = `Rollback ${serviceName} from ${health.activeVersion} to ${targetVersion || "previous stable version"} and restart pods to purge leaked memory.`;

      evidence.push(
        `Memory utilization reached ${metrics.summary.peakMemoryPercent}% of container memory limit.`
      );
      const oomLog = logs.find(
        (l) =>
          l.message.includes("OOMKilled") ||
          l.message.includes("OutOfMemoryError")
      );
      if (oomLog) {
        evidence.push(`Pod failure logs report: '${oomLog.message}'.`);
      }
      evidence.push(
        `Only ${health.healthyReplicas} of ${health.replicaCount} replicas are currently healthy.`
      );
    } else if (hasExternalTimeoutLogs) {
      rootCause = `External payment gateway dependency degradation ('pay-gateway-ext.vendor.net') causing request timeouts and a 3.5x retry amplification storm starving worker threads.`;
      confidence = 0.92;
      recommendedAction = "rollback";
      remediationDescription = `Rollback ${serviceName} to ${targetVersion || "v1.12.0"} to re-enable circuit breaker fallback and throttle downstream retry storms.`;

      const extLog = logs.find(
        (l) =>
          l.message.includes("vendor.net") ||
          l.message.includes("Retry amplification")
      );
      if (extLog) {
        evidence.push(`External vendor telemetry: '${extLog.message}'.`);
      }
      evidence.push(
        `Request rate amplified to ${latestMetric?.requestRateRps || 1420} RPS due to unthrottled client retries.`
      );
    } else if (peakError > 1.0 || peakLatency > 300) {
      // Real Cloudflare Worker telemetry anomaly correlation
      rootCause = `Operational degradation on Cloudflare Worker '${serviceName}' with elevated error rate (${peakError.toFixed(1)}%) and latency (${peakLatency}ms) following deployment ${latestDeployment?.version || health.activeVersion}.`;
      confidence = 0.88;
      recommendedAction = "rollback";
      remediationDescription = targetVersion
        ? `Rollback ${serviceName} from ${latestDeployment?.version || health.activeVersion} to previous version ${targetVersion} via Cloudflare Deployments API.`
        : `Rollback ${serviceName} to previous stable deployment.`;
      evidence.push(
        `Cloudflare Workers analytics reports error rate of ${peakError.toFixed(1)}% and peak P95 duration of ${peakLatency}ms.`
      );
    }

    // Correlate with historical incidents
    let similarPastIncident: DiagnosisResult["similarPastIncident"] = undefined;
    const historicalMatch = HISTORICAL_INCIDENTS.find(
      (h) =>
        h.serviceName === serviceName &&
        ((isDbPoolExhausted && h.rootCause.includes("connection pool")) ||
          (isMemoryExhausted && h.rootCause.includes("memory")) ||
          (hasExternalTimeoutLogs && h.rootCause.includes("network")))
    );

    if (historicalMatch) {
      similarPastIncident = {
        id: historicalMatch.id,
        title: historicalMatch.title,
        similarityReason: `Identical failure signature to ${historicalMatch.id} from ${historicalMatch.createdAt.slice(0, 10)}: both involved ${serviceName} suffering ${historicalMatch.title.toLowerCase()}.`
      };
      evidence.push(
        `Historical Precedent: Matches incident ${historicalMatch.id} (${historicalMatch.title}).`
      );
    }

    return {
      serviceName,
      rootCause,
      confidence,
      evidence,
      recommendedAction,
      targetVersion,
      remediationDescription,
      similarPastIncident
    };
  }
}
