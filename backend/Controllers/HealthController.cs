using Microsoft.AspNetCore.Mvc;

namespace OrchestAI.Api.Controllers;

[ApiController]
[Route("[controller]")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        status = "ok",
        service = "OrchestAI.Api",
        timestamp = DateTime.UtcNow
    });
}
