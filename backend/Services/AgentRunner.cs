using Microsoft.AspNetCore.SignalR;
using OrchestAI.Api.Agents;
using OrchestAI.Api.Hubs;

namespace OrchestAI.Api.Services;

public class AgentRunner
{
    private readonly IHubContext<WorkflowHub> _hub;
    private readonly ILogger<AgentRunner> _logger;

    public AgentRunner(IHubContext<WorkflowHub> hub, ILogger<AgentRunner> logger)
    {
        _hub = hub;
        _logger = logger;
    }

    public async Task<AgentResult> RunAsync(
        IAgent agent,
        string input,
        string runId,
        CancellationToken cancellationToken)
    {
        await Emit(runId, new { runId, agent = agent.Id, type = "start" }, cancellationToken);

        try
        {
            var result = await agent.RunAsync(
                input,
                chunk => Emit(
                    runId,
                    new { runId, agent = agent.Id, type = "chunk", text = chunk },
                    cancellationToken),
                cancellationToken);

            await Emit(
                runId,
                new
                {
                    runId,
                    agent = agent.Id,
                    type = "end",
                    inputTokens = result.InputTokens,
                    outputTokens = result.OutputTokens,
                },
                cancellationToken);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Agent {AgentId} failed for runId {RunId}", agent.Id, runId);
            await Emit(
                runId,
                new { runId, agent = agent.Id, type = "error", message = ex.Message },
                cancellationToken);
            throw;
        }
    }

    private Task Emit(string runId, object payload, CancellationToken ct) =>
        _hub.Clients.Group(runId).SendAsync("agentEvent", payload, ct);
}
