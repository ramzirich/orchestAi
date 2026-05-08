namespace OrchestAI.Api.Workflows;

public static class ArticleWorkflow
{
    public static WorkflowDefinition Definition { get; } = new(
        Id: "article",
        Steps: new WorkflowStep[]
        {
            new("researcher", "{topic}"),
            new("writer",     "{researcher.output}"),
            new("critic",     "{writer.output}"),
            new("summarizer", "Draft:\n{writer.output}\n\nCritique:\n{critic.output}"),
        });
}
