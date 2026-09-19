import { tool } from "ai";
import { rollbackDeploymentSchema, restartServiceSchema } from "./validator";
import type { InfrastructureProvider } from "../infrastructure/provider";

export function createRemediationTools(provider: InfrastructureProvider) {
  return {
    rollbackDeployment: tool({
      description:
        "DANGEROUS MUTATING ACTION: Revert a service deployment to a previous known-good version. Requires mandatory human-in-the-loop operator approval before executing.",
      inputSchema: rollbackDeploymentSchema,
      needsApproval: async (_input) => {
        // ALWAYS require human approval for deployment rollbacks
        return true;
      },
      execute: async ({ serviceName, targetVersion }) => {
        try {
          const remediationResult = await provider.rollbackDeployment(
            serviceName,
            targetVersion
          );

          if (!remediationResult.success) {
            return {
              status: "failed",
              error: remediationResult.message,
              serviceName,
              targetVersion
            };
          }

          const verification = await provider.verifyServiceHealth(serviceName);

          return {
            status: "executed",
            remediation: remediationResult,
            verification,
            summary: `Rollback to ${targetVersion} executed successfully. Post-remediation verification: ${verification.message}`
          };
        } catch (error) {
          return {
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
            serviceName,
            targetVersion
          };
        }
      }
    }),

    restartService: tool({
      description:
        "DANGEROUS MUTATING ACTION: Perform a rolling restart of all replicas for a service to clear stuck connections, memory leaks, or transient errors. Requires mandatory human-in-the-loop operator approval before executing.",
      inputSchema: restartServiceSchema,
      needsApproval: async (_input) => {
        // ALWAYS require human approval for service restarts
        return true;
      },
      execute: async ({ serviceName, graceful }) => {
        try {
          const restartResult = await provider.restartService(
            serviceName,
            graceful
          );

          if (restartResult.status === "unsupported_operation") {
            return {
              status: "executed",
              restart: restartResult,
              summary: restartResult.message
            };
          }

          if (!restartResult.success) {
            return {
              status: "failed",
              error: restartResult.message,
              serviceName
            };
          }

          const verification = await provider.verifyServiceHealth(serviceName);

          return {
            status: "executed",
            restart: restartResult,
            verification,
            summary: `Restart of ${serviceName} executed successfully. Post-restart verification: ${verification.message}`
          };
        } catch (error) {
          return {
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
            serviceName
          };
        }
      }
    })
  };
}
