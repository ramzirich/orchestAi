using OrchestAI.Api.Services;

namespace OrchestAI.Api.Agents;

public class ResearcherAgent : IAgent
{
    private const string SystemPrompt = """
You are a research agent in a multi-agent pipeline.

Your job: given a topic, produce concise research notes that a downstream Writer agent can turn into prose.

Output format:
- 5 to 8 bullet points
- Each bullet: one concrete, verifiable fact or angle
- No filler, no introductions, no conclusions
- Plain text only
""";

    private readonly AnthropicMessageClient _client;

    public ResearcherAgent(AnthropicMessageClient client) => _client = client;

    public string Id => "researcher";

    public async Task<AgentResult> RunAsync(
        string input,
        Func<string, Task>? onChunk,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(input))
            throw new ArgumentException("topic is required", nameof(input));

        var msg = await _client.StreamAsync(
            model: "claude-opus-4-7",
            system: SystemPrompt,
            userMessage: $"Topic: {input}",
            maxTokens: 1024,
            onChunk: onChunk,
            cancellationToken: cancellationToken);

        return new AgentResult(msg.Text, msg.InputTokens, msg.OutputTokens);
    }
}
