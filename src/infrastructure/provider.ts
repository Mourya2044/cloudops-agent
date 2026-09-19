import type {
  ServiceHealth,
  ServiceMetrics,
  LogEntry,
  LogLevel,
  DeploymentRecord,
  DatabaseHealthResult,
  RemediationResult,
  HealthVerificationResult,
  ServiceSummary
} from "../types/infrastructure";
import type { IncidentScenarioId } from "../types/incident";

export interface InfrastructureProvider {
  getServiceHealth(serviceName: string): Promise<ServiceHealth>;
  getMetrics(serviceName: string, timeWindow?: string): Promise<ServiceMetrics>;
  getLogs(
    serviceName: string,
    limit?: number,
    level?: LogLevel
  ): Promise<LogEntry[]>;
  getDeploymentHistory(
    serviceName: string,
    limit?: number
  ): Promise<DeploymentRecord[]>;
  getDatabaseHealth(
    databaseName?: string,
    serviceName?: string
  ): Promise<DatabaseHealthResult | null>;
  rollbackDeployment(
    serviceName: string,
    targetVersion: string
  ): Promise<RemediationResult>;
  restartService(
    serviceName: string,
    graceful?: boolean
  ): Promise<RemediationResult>;
  verifyServiceHealth(serviceName: string): Promise<HealthVerificationResult>;
  listServices(): Promise<ServiceSummary[]>;
  resetScenario(scenarioId?: IncidentScenarioId): void;
  getActiveScenarioId(serviceName: string): IncidentScenarioId | null;
}
