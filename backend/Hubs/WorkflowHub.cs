using Microsoft.AspNetCore.SignalR;

namespace OrchestAI.Api.Hubs;

public class WorkflowHub : Hub
{
    public Task JoinRun(string runId) =>
        Groups.AddToGroupAsync(Context.ConnectionId, runId);

    public Task LeaveRun(string runId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, runId);
}
