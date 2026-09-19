import { routeAgentRequest } from "agents";
import { CloudOpsAgent } from "./agent/CloudOpsAgent";
import { IncidentInvestigationWorkflow } from "./workflows/incidentWorkflow";
import { getInfrastructureProvider } from "./infrastructure";
import { defaultIncidentHistory } from "./incidents/history";

// Export CloudOpsAgent as well as ChatAgent class for backward-compatible bindings
export class ChatAgent extends CloudOpsAgent {}
export { CloudOpsAgent, IncidentInvestigationWorkflow };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // REST API helpers for external consumers, health checks, and console monitoring
    if (url.pathname === "/api/services") {
      const provider = getInfrastructureProvider(env);
      const services = await provider.listServices();
      return Response.json({ services });
    }

    if (url.pathname === "/api/history") {
      const history = defaultIncidentHistory.listAll();
      return Response.json({ incidents: history });
    }

    if (url.pathname === "/api/scenarios/reset" && request.method === "POST") {
      const provider = getInfrastructureProvider(env);
      provider.resetScenario();
      defaultIncidentHistory.reset();
      return Response.json({
        success: true,
        message: "All infrastructure scenarios reset."
      });
    }

    // Route Cloudflare Agents RPC and WebSocket chat requests
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) {
      return agentResponse;
    }

    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
