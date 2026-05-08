using OrchestAI.Api.Services;

namespace OrchestAI.Api.Agents;

public class WriterAgent : IAgent
{
    private const string SystemPrompt = """
You are a writer agent in a multi-agent pipeline.

Your job: given research notes (bullet points), produce a coherent short-form draft article.

Output format:
- 3 to 5 short paragraphs
- Plain prose, no bullets, no headings, no markdown
- Faithful to the notes — do not invent facts
- Direct, concrete language
""";

    private readonly AnthropicMessageClient _client;

    public WriterAgent(AnthropicMessageClient client) => _client = client;

    public string Id => "writer";

    public async Task<AgentResult> RunAsync(
        string input,
        Func<string, Task>? onChunk,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(input))
            throw new ArgumentException("research notes are required", nameof(input));

        var msg = await _client.StreamAsync(
            model: "claude-opus-4-7",
            system: SystemPrompt,
            userMessage: $"Research notes:\n{input}",
            maxTokens: 1024,
            onChunk: onChunk,
            cancellationToken: cancellationToken);

        return new AgentResult(msg.Text, msg.InputTokens, msg.OutputTokens);
    }
}
