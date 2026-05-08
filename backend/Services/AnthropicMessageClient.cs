using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace OrchestAI.Api.Services;

public record StreamedMessage(string Text, int InputTokens, int OutputTokens);

public class AnthropicOptions
{
    public string ApiKey { get; set; } = "";
    public string BaseUrl { get; set; } = "https://api.anthropic.com";
    public string Version { get; set; } = "2023-06-01";
}

public class AnthropicMessageClient
{
    private const string MessagesPath = "/v1/messages";

    private readonly HttpClient _http;
    private readonly AnthropicOptions _options;
    private readonly ILogger<AnthropicMessageClient> _logger;

    public AnthropicMessageClient(
        HttpClient http,
        AnthropicOptions options,
        ILogger<AnthropicMessageClient> logger)
    {
        _http = http;
        _options = options;
        _logger = logger;

        if (string.IsNullOrWhiteSpace(_options.ApiKey))
            throw new InvalidOperationException("Anthropic:ApiKey is not configured");

        _http.BaseAddress = new Uri(_options.BaseUrl);
    }

    public async Task<StreamedMessage> StreamAsync(
        string model,
        string system,
        string userMessage,
        int maxTokens,
        Func<string, Task>? onChunk,
        CancellationToken cancellationToken)
    {
        var body = JsonSerializer.Serialize(new
        {
            model,
            max_tokens = maxTokens,
            system,
            messages = new[] { new { role = "user", content = userMessage } },
            stream = true,
        });

        using var request = new HttpRequestMessage(HttpMethod.Post, MessagesPath)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("x-api-key", _options.ApiKey);
        request.Headers.Add("anthropic-version", _options.Version);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));

        using var response = await _http.SendAsync(
            request,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new HttpRequestException(
                $"Anthropic API error {(int)response.StatusCode}: {error}");
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);

        var text = new StringBuilder();
        var inputTokens = 0;
        var outputTokens = 0;

        while (!reader.EndOfStream)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var line = await reader.ReadLineAsync(cancellationToken);
            if (string.IsNullOrEmpty(line)) continue;
            if (!line.StartsWith("data:")) continue;

            var json = line.Substring("data:".Length).Trim();
            if (json == "[DONE]") break;

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (!root.TryGetProperty("type", out var typeProp)) continue;
            var type = typeProp.GetString();

            switch (type)
            {
                case "message_start":
                    if (root.TryGetProperty("message", out var message) &&
                        message.TryGetProperty("usage", out var usage) &&
                        usage.TryGetProperty("input_tokens", out var inTok))
                    {
                        inputTokens = inTok.GetInt32();
                    }
                    break;

                case "content_block_delta":
                    if (root.TryGetProperty("delta", out var delta) &&
                        delta.TryGetProperty("type", out var dt) &&
                        dt.GetString() == "text_delta" &&
                        delta.TryGetProperty("text", out var t))
                    {
                        var chunk = t.GetString() ?? "";
                        text.Append(chunk);
                        if (onChunk != null) await onChunk(chunk);
                    }
                    break;

                case "message_delta":
                    if (root.TryGetProperty("usage", out var deltaUsage) &&
                        deltaUsage.TryGetProperty("output_tokens", out var outTok))
                    {
                        outputTokens = outTok.GetInt32();
                    }
                    break;

                case "error":
                    var err = root.TryGetProperty("error", out var e) ? e.ToString() : json;
                    throw new HttpRequestException($"Anthropic stream error: {err}");
            }
        }

        return new StreamedMessage(text.ToString().Trim(), inputTokens, outputTokens);
    }
}
