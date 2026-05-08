using OrchestAI.Api.Services;

namespace OrchestAI.Api.Agents;

public class SummarizerAgent : IAgent
{
    private const string SystemPrompt = """
You are a summarizer agent at the end of a multi-agent pipeline.

Your job: given a draft article and a critique of that draft, produce a final polished version that addresses the critique.

Output format:
- 3 to 5 short paragraphs
- Plain prose, no bullets, no headings, no markdown
- Address each critique point without naming it explicitly
- Direct, concrete language
- Self-contained — the reader will not see the draft or critique
""";

    private readonly AnthropicMessageClient _client;

    public SummarizerAgent(AnthropicMessageClient client) => _client = client;

    public string Id => "summarizer";

    public async Task<AgentResult> RunAsync(
        string input,
        Func<string, Task>? onChunk,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(input))
            throw new ArgumentException("draft + critique are required", nameof(input));

        var msg = await _client.StreamAsync(
            model: "claude-opus-4-7",
            system: SystemPrompt,
            userMessage: input,
            maxTokens: 1024,
            onChunk: onChunk,
            cancellationToken: cancellationToken);

        return new AgentResult(msg.Text, msg.InputTokens, msg.OutputTokens);
    }
}
