using OrchestAI.Api.Services;

namespace OrchestAI.Api.Agents;

public class CriticAgent : IAgent
{
    private const string SystemPrompt = """
You are a critic agent in a multi-agent pipeline.

Your job: given a draft article, produce a focused critique that a downstream Summarizer agent can act on.

Output format:
- 3 to 6 bullet points
- Each bullet: one specific, actionable issue (clarity, accuracy, structure, tone, missing context)
- Quote or paraphrase the offending phrase when relevant
- No praise, no preamble, no conclusion
- Plain text only
""";

    private readonly AnthropicMessageClient _client;

    public CriticAgent(AnthropicMessageClient client) => _client = client;

    public string Id => "critic";

    public async Task<AgentResult> RunAsync(
        string input,
        Func<string, Task>? onChunk,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(input))
            throw new ArgumentException("draft is required", nameof(input));

        var msg = await _client.StreamAsync(
            model: "claude-opus-4-7",
            system: SystemPrompt,
            userMessage: $"Draft:\n{input}",
            maxTokens: 1024,
            onChunk: onChunk,
            cancellationToken: cancellationToken);

        return new AgentResult(msg.Text, msg.InputTokens, msg.OutputTokens);
    }
}
