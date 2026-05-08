namespace OrchestAI.Api.Workflows;

public record WorkflowStep(string AgentId, string InputTemplate);

public record WorkflowDefinition(string Id, IReadOnlyList<WorkflowStep> Steps);

public record WorkflowResult(
    string FinalOutput,
    IReadOnlyDictionary<string, string> Outputs,
    int InputTokens,
    int OutputTokens);
