import type { InfrastructureProvider } from "./provider";
import type {
  ServiceHealth,
  ServiceMetrics,
  LogEntry,
  LogLevel,
  DeploymentRecord,
  DatabaseHealth,
  RemediationResult,
  HealthVerificationResult,
  ServiceSummary
} from "../types/infrastructure";
import { SCENARIOS, type ScenarioDefinition } from "../data/scenarios";
import type { IncidentScenarioId } from "../types/incident";

interface ServiceInternalState {
  health: ServiceHealth;
  metrics: ServiceMetrics;
  logs: LogEntry[];
  deployments: DeploymentRecord[];
  database?: DatabaseHealth;
  isRemediated: boolean;
  remediationHistory: RemediationResult[];
}

export class SyntheticInfrastructureProvider implements InfrastructureProvider {
  private serviceStates: Map<string, ServiceInternalState> = new Map();
  private activeScenarioMap: Map<string, IncidentScenarioId> = new Map();

  constructor() {
    this.resetAll();
  }

  public resetAll(): void {
    this.serviceStates.clear();
    this.activeScenarioMap.clear();

    for (const scenario of Object.values(SCENARIOS)) {
      this.initScenario(scenario);
    }
  }

  private initScenario(scenario: ScenarioDefinition): void {
    this.activeScenarioMap.set(scenario.serviceName, scenario.id);
    this.serviceStates.set(scenario.serviceName, {
      health: JSON.parse(JSON.stringify(scenario.health)),
      metrics: JSON.parse(JSON.stringify(scenario.metrics)),
      logs: JSON.parse(JSON.stringify(scenario.logs)),
      deployments: JSON.parse(JSON.stringify(scenario.deployments)),
      database: scenario.database
        ? JSON.parse(JSON.stringify(scenario.database))
        : undefined,
      isRemediated: false,
      remediationHistory: []
    });
  }

  public resetScenario(scenarioId?: IncidentScenarioId): void {
    if (scenarioId && SCENARIOS[scenarioId]) {
      this.initScenario(SCENARIOS[scenarioId]);
    } else {
      this.resetAll();
    }
  }

  public getActiveScenarioId(serviceName: string): IncidentScenarioId | null {
    return this.activeScenarioMap.get(serviceName) || null;
  }

  public async getServiceHealth(serviceName: string): Promise<ServiceHealth> {
    const state = this.serviceStates.get(serviceName);
    if (!state) {
      throw new Error(
        `Service '${serviceName}' not found in infrastructure inventory.`
      );
    }
    return JSON.parse(JSON.stringify(state.health));
  }

  public async getMetrics(
    serviceName: string,
    _timeWindow?: string
  ): Promise<ServiceMetrics> {
    const state = this.serviceStates.get(serviceName);
    if (!state) {
      throw new Error(
        `Service '${serviceName}' not found in infrastructure inventory.`
      );
    }
    return JSON.parse(JSON.stringify(state.metrics));
  }

  public async getLogs(
    serviceName: string,
    limit = 50,
    level?: LogLevel
  ): Promise<LogEntry[]> {
    const state = this.serviceStates.get(serviceName);
    if (!state) {
      throw new Error(
        `Service '${serviceName}' not found in infrastructure inventory.`
      );
    }

    let logs = state.logs;
    if (level) {
      logs = logs.filter((l) => l.level === level);
    }
    return JSON.parse(JSON.stringify(logs.slice(-limit)));
  }

  public async getDeploymentHistory(
    serviceName: string,
    limit = 10
  ): Promise<DeploymentRecord[]> {
    const state = this.serviceStates.get(serviceName);
    if (!state) {
      throw new Error(
        `Service '${serviceName}' not found in infrastructure inventory.`
      );
    }
    return JSON.parse(JSON.stringify(state.deployments.slice(0, limit)));
  }

  public async getDatabaseHealth(
    databaseName?: string,
    serviceName?: string
  ): Promise<DatabaseHealth | null> {
    // If serviceName provided, find by service
    if (serviceName) {
      const state = this.serviceStates.get(serviceName);
      if (state && state.database) {
        return JSON.parse(JSON.stringify(state.database));
      }
    }

    // If databaseName provided, search across all states
    if (databaseName) {
      for (const state of this.serviceStates.values()) {
        if (state.database && state.database.databaseName === databaseName) {
          return JSON.parse(JSON.stringify(state.database));
        }
      }
    }

    // Default to payment-api database if exists
    const paymentState = this.serviceStates.get("payment-api");
    return paymentState?.database
      ? JSON.parse(JSON.stringify(paymentState.database))
      : null;
  }

  public async rollbackDeployment(
    serviceName: string,
    targetVersion: string
  ): Promise<RemediationResult> {
    const state = this.serviceStates.get(serviceName);
    if (!state) {
      throw new Error(`Cannot rollback unknown service '${serviceName}'.`);
    }

    const previousVersion = state.health.activeVersion;

    // Idempotency check: if already at target version
    if (state.health.activeVersion === targetVersion && state.isRemediated) {
      return {
        success: true,
        action: "rollback",
        serviceName,
        previousVersion,
        newVersion: targetVersion,
        message: `Service '${serviceName}' is already at target version '${targetVersion}' (idempotent rollback).`,
        timestamp: new Date().toISOString()
      };
    }

    const scenarioId = this.activeScenarioMap.get(serviceName);
    const scenario = scenarioId ? SCENARIOS[scenarioId] : null;

    if (scenario) {
      // Transition state to remediated health
      state.health = JSON.parse(JSON.stringify(scenario.remediatedHealth));
      state.health.activeVersion = targetVersion;
      state.metrics = JSON.parse(JSON.stringify(scenario.remediatedMetrics));

      if (state.database) {
        state.database.status = "healthy";
        state.database.activeConnections = 13;
        state.database.waitingConnections = 0;
        state.database.poolUtilizationPercent = 26;
        state.database.connectionTimeoutsLast10m = 0;
      }
    } else {
      state.health.activeVersion = targetVersion;
      state.health.status = "healthy";
      state.health.errorRate = 0.05;
      state.health.p95LatencyMs = 80;
    }

    state.isRemediated = true;

    // Add deployment record for rollback
    const rollbackRecord: DeploymentRecord = {
      version: targetVersion,
      deployedAt: new Date().toISOString(),
      deployedBy: "CloudOps Agent (Human Approved)",
      gitCommit: "rollback-" + targetVersion,
      changelog: `Automated rollback from ${previousVersion} to ${targetVersion} due to operational incident.`,
      isRollback: true,
      previousVersion
    };
    state.deployments.unshift(rollbackRecord);

    // Add log entry
    state.logs.push({
      timestamp: new Date().toISOString(),
      level: "INFO",
      service: serviceName,
      message: `Rollback completed: ${serviceName} reverted from ${previousVersion} to ${targetVersion}. Health checks passing.`
    });

    const result: RemediationResult = {
      success: true,
      action: "rollback",
      serviceName,
      previousVersion,
      newVersion: targetVersion,
      message: `Successfully rolled back ${serviceName} from ${previousVersion} to ${targetVersion}. Service health restored to healthy.`,
      timestamp: new Date().toISOString()
    };

    state.remediationHistory.push(result);
    return result;
  }

  public async restartService(
    serviceName: string,
    graceful = true
  ): Promise<RemediationResult> {
    const state = this.serviceStates.get(serviceName);
    if (!state) {
      throw new Error(`Cannot restart unknown service '${serviceName}'.`);
    }

    const previousVersion = state.health.activeVersion;
    const scenarioId = this.activeScenarioMap.get(serviceName);
    const scenario = scenarioId ? SCENARIOS[scenarioId] : null;

    // A rolling restart clears memory leaks / pool locks temporarily
    if (scenario) {
      state.health.healthyReplicas = state.health.replicaCount;
      state.health.status = "healthy";
      state.health.errorRate = 0.05;
      state.health.p95LatencyMs = Math.min(state.health.p95LatencyMs, 100);

      if (state.database) {
        state.database.waitingConnections = 0;
        state.database.activeConnections = 15;
        state.database.poolUtilizationPercent = 30;
      }
    }

    state.logs.push({
      timestamp: new Date().toISOString(),
      level: "INFO",
      service: serviceName,
      message: `Rolling restart initiated for ${serviceName} (${state.health.replicaCount} replicas, graceful=${graceful}).`
    });

    const result: RemediationResult = {
      success: true,
      action: "restart",
      serviceName,
      previousVersion,
      newVersion: state.health.activeVersion,
      message: `Successfully performed rolling restart of ${serviceName}. All ${state.health.replicaCount} pods re-initialized.`,
      timestamp: new Date().toISOString(),
      restartDetails: {
        graceful,
        restartedPods: state.health.replicaCount
      }
    };

    state.remediationHistory.push(result);
    return result;
  }

  public async verifyServiceHealth(
    serviceName: string
  ): Promise<HealthVerificationResult> {
    const state = this.serviceStates.get(serviceName);
    if (!state) {
      throw new Error(`Cannot verify unknown service '${serviceName}'.`);
    }

    const isHealthy =
      state.health.status === "healthy" &&
      state.health.errorRate < 1.0 &&
      state.health.p95LatencyMs < 250;

    return {
      serviceName,
      healthy: isHealthy,
      status: state.health.status,
      currentMetrics: {
        p95LatencyMs: state.health.p95LatencyMs,
        errorRate: state.health.errorRate,
        activeVersion: state.health.activeVersion
      },
      message: isHealthy
        ? `Service '${serviceName}' is HEALTHY. Error rate is ${state.health.errorRate}% (nominal < 1%) and p95 latency is ${state.health.p95LatencyMs}ms (nominal < 250ms).`
        : `Service '${serviceName}' is still UNHEALTHY (${state.health.status}). Error rate: ${state.health.errorRate}%, p95 latency: ${state.health.p95LatencyMs}ms.`,
      timestamp: new Date().toISOString()
    };
  }

  public async listServices(): Promise<ServiceSummary[]> {
    const summaries: ServiceSummary[] = [];
    for (const [name, state] of this.serviceStates.entries()) {
      summaries.push({
        name,
        displayName: name.toUpperCase().replace("-", " "),
        status: state.health.status,
        version: state.health.activeVersion,
        errorRate: state.health.errorRate,
        p95LatencyMs: state.health.p95LatencyMs,
        type: name.includes("api") ? "api" : "service"
      });
    }
    return summaries;
  }
}

// Global singleton instance for runtime operations
export const defaultInfrastructureProvider =
  new SyntheticInfrastructureProvider();
