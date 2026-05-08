using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using OrchestAI.Api.Agents;
using OrchestAI.Api.Hubs;

namespace OrchestAI.Api.Controllers;

[ApiController]
[Route("[controller]")]
public class AgentsController : ControllerBase
{
    private readonly ResearcherAgent _researcher;
    private readonly IHubContext<WorkflowHub> _hub;
    private readonly ILogger<AgentsController> _logger;

    public AgentsController(
        ResearcherAgent researcher,
        IHubContext<WorkflowHub> hub,
        ILogger<AgentsController> logger)
    {
        _researcher = researcher;
        _hub = hub;
        _logger = logger;
    }

    [HttpPost("research")]
    public async Task<IActionResult> Research(
        [FromBody] ResearchRequest req,
        CancellationToken cancellationToken)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Topic))
            return BadRequest(new { error = "topic is required" });

        var runId = string.IsNullOrWhiteSpace(req.RunId)
            ? Guid.NewGuid().ToString("N")
            : req.RunId;

        await _hub.Clients.Group(runId).SendAsync(
            "agentEvent",
            new { runId, agent = _researcher.Id, type = "start", topic = req.Topic },
            cancellationToken);

        try
        {
            var result = await _researcher.RunAsync(
                req.Topic,
                async chunk =>
                {
                    await _hub.Clients.Group(runId).SendAsync(
                        "agentEvent",
                        new { runId, agent = _researcher.Id, type = "chunk", text = chunk },
                        cancellationToken);
                },
                cancellationToken);

            await _hub.Clients.Group(runId).SendAsync(
                "agentEvent",
                new
                {
                    runId,
                    agent = _researcher.Id,
                    type = "end",
                    inputTokens = result.InputTokens,
                    outputTokens = result.OutputTokens,
                },
                cancellationToken);

            return Ok(new
            {
                runId,
                agent = _researcher.Id,
                output = result.Output,
                inputTokens = result.InputTokens,
                outputTokens = result.OutputTokens,
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Researcher run failed for runId {RunId}", runId);
            await _hub.Clients.Group(runId).SendAsync(
                "agentEvent",
                new { runId, agent = _researcher.Id, type = "error", message = ex.Message },
                cancellationToken);
            return StatusCode(500, new { runId, error = ex.Message });
        }
    }
}

public record ResearchRequest(string Topic, string? RunId);
