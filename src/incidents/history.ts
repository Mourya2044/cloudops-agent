import type { IncidentRecord } from "../types/incident";
import { HISTORICAL_INCIDENTS } from "../data/scenarios";

export class IncidentHistoryManager {
  private incidents: Map<string, IncidentRecord> = new Map();

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.incidents.clear();
    for (const inc of HISTORICAL_INCIDENTS) {
      this.incidents.set(inc.id, JSON.parse(JSON.stringify(inc)));
    }
  }

  public listAll(): IncidentRecord[] {
    return Array.from(this.incidents.values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getById(id: string): IncidentRecord | undefined {
    return this.incidents.get(id);
  }

  public save(incident: IncidentRecord): void {
    this.incidents.set(incident.id, JSON.parse(JSON.stringify(incident)));
  }

  public search({
    serviceName,
    query,
    status
  }: {
    serviceName?: string;
    query?: string;
    status?: IncidentRecord["status"];
  }): IncidentRecord[] {
    let results = this.listAll();

    if (serviceName) {
      results = results.filter(
        (inc) => inc.serviceName.toLowerCase() === serviceName.toLowerCase()
      );
    }

    if (status) {
      results = results.filter((inc) => inc.status === status);
    }

    if (query) {
      const q = query.toLowerCase();
      results = results.filter(
        (inc) =>
          inc.title.toLowerCase().includes(q) ||
          inc.rootCause.toLowerCase().includes(q) ||
          inc.evidence.some((e) => e.toLowerCase().includes(q)) ||
          (inc.operatorNotes && inc.operatorNotes.toLowerCase().includes(q))
      );
    }

    return results;
  }
}

export const defaultIncidentHistory = new IncidentHistoryManager();
