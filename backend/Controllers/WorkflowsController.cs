using Microsoft.AspNetCore.Mvc;
using OrchestAI.Api.Services;
using OrchestAI.Api.Workflows;

namespace OrchestAI.Api.Controllers;

[ApiController]
[Route("[controller]")]
public class WorkflowsController : ControllerBase
{
    private readonly IReadOnlyDictionary<string, WorkflowDefinition> _workflows;
    private readonly WorkflowRunner _runner;

    public WorkflowsController(IEnumerable<WorkflowDefinition> definitions, WorkflowRunner runner)
    {
        _workflows = definitions.ToDictionary(d => d.Id, StringComparer.OrdinalIgnoreCase);
        _runner = runner;
    }

    [HttpGet]
    public IActionResult List() => Ok(_workflows.Keys.OrderBy(k => k));

    [HttpPost("{id}/run")]
    public async Task<IActionResult> Run(
        string id,
        [FromBody] WorkflowRunRequest req,
        CancellationToken cancellationToken)
    {
        if (req is null || string.IsNullOrWhiteSpace(req.Topic))
            return BadRequest(new { error = "topic is required" });

        if (!_workflows.TryGetValue(id, out var definition))
            return NotFound(new { error = $"workflow '{id}' not found" });

        var runId = string.IsNullOrWhiteSpace(req.RunId)
            ? Guid.NewGuid().ToString("N")
            : req.RunId;

        try
        {
            var result = await _runner.RunAsync(definition, req.Topic, runId, cancellationToken);
            return Ok(new
            {
                runId,
                workflow = definition.Id,
                output = result.FinalOutput,
                outputs = result.Outputs,
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

public record WorkflowRunRequest(string Topic, string? RunId);
