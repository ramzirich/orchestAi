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

    [HttpGet("{id}")]
    public IActionResult Get(string id)
    {
        if (!_workflows.TryGetValue(id, out var definition))
            return NotFound(new { error = $"workflow '{id}' not found" });
        return Ok(definition);
    }

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

        return await ExecuteAsync(definition, req.Topic, req.RunId, cancellationToken);
    }

    [HttpPost("run-inline")]
    public async Task<IActionResult> RunInline(
        [FromBody] InlineWorkflowRunRequest req,
        CancellationToken cancellationToken)
    {
        if (req is null || req.Definition is null)
            return BadRequest(new { error = "definition is required" });
        if (string.IsNullOrWhiteSpace(req.Topic))
            return BadRequest(new { error = "topic is required" });
        if (req.Definition.Steps is null || req.Definition.Steps.Count == 0)
            return BadRequest(new { error = "definition must have at least one step" });
        if (string.IsNullOrWhiteSpace(req.Definition.Id))
            return BadRequest(new { error = "definition.id is required" });

        return await ExecuteAsync(req.Definition, req.Topic, req.RunId, cancellationToken);
    }

    private async Task<IActionResult> ExecuteAsync(
        WorkflowDefinition definition,
        string topic,
        string? requestedRunId,
        CancellationToken cancellationToken)
    {
        var runId = string.IsNullOrWhiteSpace(requestedRunId)
            ? Guid.NewGuid().ToString("N")
            : requestedRunId;

        try
        {
            var result = await _runner.RunAsync(definition, topic, runId, cancellationToken);
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

public record InlineWorkflowRunRequest(WorkflowDefinition Definition, string Topic, string? RunId);
