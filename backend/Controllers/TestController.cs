using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using OrchestAI.Api.Hubs;

namespace OrchestAI.Api.Controllers;

[ApiController]
[Route("[controller]")]
public class TestController : ControllerBase
{
    private readonly IHubContext<WorkflowHub> _hub;

    public TestController(IHubContext<WorkflowHub> hub) => _hub = hub;

    [HttpPost("broadcast")]
    public async Task<IActionResult> Broadcast([FromBody] BroadcastRequest req)
    {
        var payload = new
        {
            runId = req.RunId,
            message = req.Message ?? "hello from server",
            timestamp = DateTime.UtcNow
        };

        await _hub.Clients.Group(req.RunId).SendAsync("agentEvent", payload);
        return Ok(payload);
    }
}

public record BroadcastRequest(string RunId, string? Message);
