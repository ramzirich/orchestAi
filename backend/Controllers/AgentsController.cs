using Microsoft.AspNetCore.Mvc;
using OrchestAI.Api.Agents;
using OrchestAI.Api.Services;

namespace OrchestAI.Api.Controllers;

[ApiController]
[Route("[controller]")]
public class AgentsController : ControllerBase
{
    private readonly IReadOnlyDictionary<string, IAgent> _agents;
    private readonly AgentRunner _runner;

    public AgentsController(IEnumerable<IAgent> agents, AgentRunner runner)
    {
        _agents = agents.ToDictionary(a => a.Id, StringComparer.OrdinalIgnoreCase);
        _runner = runner;
    }

    [HttpGet]
    public IActionResult List() => Ok(_agents.Keys.OrderBy(k => k));

    [HttpPost("{id}/run")]
    public async Task<IActionResult> Run(
        string id,
        [FromBody] AgentRunRequest req,
        CancellationToken cancellationToken)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Input))
            return BadRequest(new { error = "input is required" });

        if (!_agents.TryGetValue(id, out var agent))
            return NotFound(new { error = $"agent '{id}' not found" });

        var runId = string.IsNullOrWhiteSpace(req.RunId)
            ? Guid.NewGuid().ToString("N")
            : req.RunId;

        try
        {
            var result = await _runner.RunAsync(agent, req.Input, runId, cancellationToken);
            return Ok(new
            {
                runId,
                agent = agent.Id,
                output = result.Output,
                inputTokens = result.InputTokens,
                outputTokens = result.OutputTokens,
            });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { runId, error = ex.Message });
        }
    }
}

public record AgentRunRequest(string Input, string? RunId);
