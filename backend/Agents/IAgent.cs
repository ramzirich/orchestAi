namespace OrchestAI.Api.Agents;

public record AgentResult(string Output, int InputTokens, int OutputTokens);

public interface IAgent
{
    string Id { get; }

    Task<AgentResult> RunAsync(
        string input,
        Func<string, Task>? onChunk,
        CancellationToken cancellationToken);
}
