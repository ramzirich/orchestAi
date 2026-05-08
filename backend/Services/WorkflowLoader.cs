using System.Text.Json;
using OrchestAI.Api.Workflows;

namespace OrchestAI.Api.Services;

public static class WorkflowLoader
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public static IReadOnlyList<WorkflowDefinition> LoadAll(string directory)
    {
        if (!Directory.Exists(directory))
            return Array.Empty<WorkflowDefinition>();

        var defs = new List<WorkflowDefinition>();
        foreach (var file in Directory.EnumerateFiles(directory, "*.json"))
        {
            var json = File.ReadAllText(file);
            var def = JsonSerializer.Deserialize<WorkflowDefinition>(json, Options)
                ?? throw new InvalidOperationException($"Failed to parse workflow definition: {file}");
            defs.Add(def);
        }
        return defs;
    }
}
