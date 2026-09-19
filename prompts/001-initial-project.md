I am building a technical assignment for a Cloudflare Software Engineer position.

Use the existing Cloudflare Agents starter project in this repository as the foundation. Do NOT replace the Agents SDK architecture with a generic Workers application.

The project should become a production-quality AI-powered infrastructure operations agent called **CloudOps Agent**.

First inspect the existing project, package versions, Wrangler configuration, Agent implementation, frontend, and Cloudflare bindings.

Use the current Cloudflare Agents SDK APIs and current official Cloudflare documentation. Do not rely on outdated examples or invent APIs.

The application must satisfy all four requirements from the assignment:

1. LLM
2. Workflow / coordination
3. User input through chat
4. Memory / state

It should use Cloudflare-native technologies wherever appropriate.

## Core product

Build an AI infrastructure operations agent.

A developer should be able to open a chat and ask:

"Why is payment-api experiencing high latency?"

The agent should investigate the problem using backend tools rather than simply generating an answer.

The agent should have tools for:

- getServiceHealth
- getMetrics
- getLogs
- getDeploymentHistory
- getDatabaseHealth

The data can be deterministic synthetic infrastructure data, but it should be realistic and architected behind clean interfaces so the mock provider could later be replaced with real infrastructure APIs.

## LLM

Use Cloudflare Workers AI with Llama 3.3 if the current Cloudflare environment supports it.

The LLM must be able to:

- understand the user's incident request
- select appropriate investigation tools
- consume tool results
- correlate multiple signals
- generate a diagnosis
- explain the evidence behind the diagnosis
- recommend remediation when appropriate

Do not put all infrastructure data into the system prompt and have the LLM simply summarize it.

The agent must actually call tools.

## Agents SDK

Use the existing `agents` package and Cloudflare Agents runtime.

Use the current appropriate Agent/chat APIs from the starter.

Preserve the Cloudflare Agent architecture rather than implementing an unrelated custom WebSocket/chat framework.

Use the Agent's durable state capabilities for conversation/session state.

If the current Cloudflare chat architecture recommends `AIChatAgent` and `@cloudflare/ai-chat`, use the current recommended implementation rather than an older chat API.

## Infrastructure investigation

Create three deterministic incident scenarios.

### Scenario 1

payment-api:

- deployment v1.8.2 at 10:27
- database connection pool becomes exhausted
- connection timeouts increase
- 5xx rate increases
- p95 latency increases

### Scenario 2

auth-service:

- deployment v2.4.1
- memory usage continuously increases
- service eventually experiences OOM/restart
- request failures increase

### Scenario 3

orders-api:

- external dependency becomes slow
- request timeout rate increases
- retries amplify traffic
- p95 latency increases

The agent should have to correlate multiple signals to diagnose these scenarios.

## Workflow

Use Cloudflare Workflows for the durable incident investigation.

The workflow should conceptually perform:

1. Parse the incident
2. Retrieve service health
3. Retrieve metrics
4. Retrieve logs
5. Retrieve deployment history
6. Retrieve database health when relevant
7. Correlate evidence
8. Generate diagnosis
9. Recommend remediation
10. Wait for human approval when remediation is requested
11. Execute remediation
12. Verify service health
13. Generate final incident report

Use durable workflow steps and retries appropriately.

Do not fake a workflow by creating an ordinary function called "workflow".

The workflow should demonstrate why Cloudflare Workflows are useful for this application.

## Human-in-the-loop remediation

Implement at least:

- rollbackDeployment
- restartService

These must be treated as mutating/dangerous tools.

The LLM must never execute them automatically.

Instead, the agent should generate an approval request:

"Rollback payment-api from v1.8.2 to v1.8.1?"

The user should be able to:

[Approve]

[Reject]

If approved:

- resume the workflow
- perform the simulated remediation
- verify service health
- report the result

If rejected:

- persist the rejection
- stop remediation
- preserve the investigation

Use the current Cloudflare Agents human-in-the-loop/tool approval mechanisms where appropriate.

## Memory and state

Persist:

- conversation messages
- current investigation
- selected service
- findings
- tool results required for the investigation
- remediation decision
- incident history

The agent should support follow-up questions such as:

"Wasn't this the same issue we had last month?"

It should be able to retrieve a previous incident and explain similarities.

Use the current Agents/Durable Object state and appropriate persistent storage.

Do not build a fake in-memory global variable for persistence.

## UI

Keep the UI simple and engineering-focused.

Create an infrastructure operations console containing:

- service list
- service health
- active incident
- investigation timeline
- metrics summary
- AI diagnosis
- remediation recommendation
- approval/rejection controls
- chat interface

Example:

Service:
payment-api

Status:
Degraded

Error rate:
8.7%

P95 latency:
1.84s

Deployment:
v1.8.2

AI Diagnosis:
Database connection pool exhaustion following deployment v1.8.2.

Recommended action:
Rollback to v1.8.1.

[Approve Rollback] [Reject]

The UI should also show investigation progress:

✓ Retrieved service health
✓ Retrieved metrics
✓ Retrieved logs
✓ Retrieved deployment history
→ Correlating evidence
→ Generating diagnosis

Do not spend excessive time on frontend styling.

## Reliability

Treat this as infrastructure software.

Implement:

- input validation
- explicit error handling
- retryable operations
- idempotent remediation
- clear separation between read-only and mutating tools
- structured logging
- workflow failure handling
- workflow retry handling
- state consistency

Tool arguments generated by the LLM must be validated before execution.

The LLM must never be able to execute arbitrary infrastructure commands.

## Testing

Add automated tests for:

- infrastructure tools
- tool validation
- incident diagnosis
- workflow progression
- workflow failure/retry
- human approval
- human rejection
- remediation
- post-remediation verification
- persistent incident state

Use deterministic mock data so tests are reliable.

## Project structure

Adapt the existing Agents starter rather than blindly creating a new structure.

Aim for clear separation between:

agent/
workflows/
tools/
infrastructure/
incidents/
data/
types/
frontend/
tests/

Keep the implementation modular.

## README

Create a technically accurate README containing:

1. Problem statement
2. Architecture
3. Mermaid architecture diagram
4. Cloudflare services used
5. Agents SDK usage
6. Workers AI usage
7. Workflow design
8. Memory/state design
9. Tool architecture
10. Human approval flow
11. Incident scenarios
12. Reliability design
13. Security design
14. Testing
15. Local development
16. Deployment
17. Example investigation
18. Known limitations
19. Future improvements

Do not claim features that aren't actually implemented.

## Prompt history

Create:

prompts/001-initial-project.md

and put this exact prompt into it.

Do not fabricate future prompt history.

I will add subsequent prompts manually as the project evolves.

## Development process

Do not only give me a plan.

Implement the application.

Before making Cloudflare-specific changes, inspect the current installed package versions and official/current API patterns.

After implementation:

1. Run type checking.
2. Run tests.
3. Run the local application/build.
4. Fix errors.
5. Verify Wrangler configuration.
6. Verify Cloudflare bindings.
7. Verify the Agent can communicate with the frontend.
8. Verify the workflow can execute.
9. Verify approval/rejection works.
10. Verify state persists.
11. Update the README to describe the actual implementation.

At the end, report:

- files created/modified
- architecture
- Cloudflare services used
- commands to run locally
- test commands
- deployment command
- known limitations
- any manual Cloudflare configuration still required
