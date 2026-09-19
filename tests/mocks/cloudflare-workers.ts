export class WorkflowEntrypoint {
  constructor(
    public ctx: unknown,
    public env: unknown
  ) {}
}

export type WorkflowEvent<T = unknown> = {
  instanceId: string;
  payload: T;
  timestamp: Date;
};

export interface WorkflowStep {
  do<T = unknown>(
    name: string,
    callbackOrConfig: any,
    callback?: any
  ): Promise<T>;
  sleep(name: string, duration: any): Promise<void>;
  waitForEvent(name: string, options: any): Promise<any>;
}
