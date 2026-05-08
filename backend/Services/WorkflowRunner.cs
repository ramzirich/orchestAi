using Microsoft.AspNetCore.SignalR;
using OrchestAI.Api.Agents;
using OrchestAI.Api.Hubs;
using OrchestAI.Api.Workflows;

namespace OrchestAI.Api.Services;

public class WorkflowRunner
{
    private readonly IReadOnlyDictionary<string, IAgent> _agents;
    private readonly AgentRunner _agentRunner;
    private readonly IHubContext<WorkflowHub> _hub;
    private readonly ILogger<WorkflowRunner> _logger;

    public WorkflowRunner(
        IEnumerable<IAgent> agents,
        AgentRunner agentRunner,
        IHubContext<WorkflowHub> hub,
        ILogger<WorkflowRunner> logger)
    {
        _agents = agents.ToDictionary(a => a.Id, StringComparer.OrdinalIgnoreCase);
        _agentRunner = agentRunner;
        _hub = hub;
        _logger = logger;
    }

    public async Task<WorkflowResult> RunAsync(
        WorkflowDefinition definition,
        string topic,
        string runId,
        CancellationToken cancellationToken)
    {
        await Emit(runId, new { runId, workflow = definition.Id, type = "start" }, cancellationToken);

        var outputs = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var totalIn = 0;
        var totalOut = 0;
        string? lastOutput = null;

        try
        {
            foreach (var step in definition.Steps)
            {
                if (!_agents.TryGetValue(step.AgentId, out var agent))
                    throw new InvalidOperationException($"agent '{step.AgentId}' is not registered");

                var input = Render(step.InputTemplate, topic, outputs);
                var result = await _agentRunner.RunAsync(agent, input, runId, cancellationToken);

                outputs[step.AgentId] = result.Output;
                lastOutput = result.Output;
                totalIn += result.InputTokens;
                totalOut += result.OutputTokens;
            }

            await Emit(
                runId,
                new
                {
                    runId,
                    workflow = definition.Id,
                    type = "end",
                    inputTokens = totalIn,
                    outputTokens = totalOut,
                },
                cancellationToken);

            return new WorkflowResult(lastOutput ?? "", outputs, totalIn, totalOut);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Workflow {WorkflowId} failed for runId {RunId}", definition.Id, runId);
            await Emit(
                runId,
                new { runId, workflow = definition.Id, type = "error", message = ex.Message },
                cancellationToken);
            throw;
        }
    }

    private static string Render(
        string template,
        string topic,
        IReadOnlyDictionary<string, string> outputs)
    {
        var rendered = template.Replace("{topic}", topic);
        foreach (var (id, output) in outputs)
            rendered = rendered.Replace($"{{{id}.output}}", output);
        return rendered;
    }

    private Task Emit(string runId, object payload, CancellationToken ct) =>
        _hub.Clients.Group(runId).SendAsync("workflowEvent", payload, ct);
}
