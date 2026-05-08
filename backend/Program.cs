using OrchestAI.Api.Agents;
using OrchestAI.Api.Hubs;
using OrchestAI.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSignalR();

builder.Services.AddCors(options =>
{
    options.AddPolicy("FrontendDev", policy => policy
        .WithOrigins("http://localhost:3000")
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});

var anthropicKey =
    builder.Configuration["Anthropic:ApiKey"]
    ?? Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY")
    ?? throw new InvalidOperationException(
        "Anthropic API key not found. Set Anthropic:ApiKey via user-secrets or ANTHROPIC_API_KEY env var.");

builder.Services.AddSingleton(new AnthropicOptions { ApiKey = anthropicKey });
builder.Services.AddHttpClient<AnthropicMessageClient>(c =>
{
    c.Timeout = TimeSpan.FromMinutes(5);
});

builder.Services.AddScoped<AgentRunner>();
builder.Services.AddScoped<IAgent, ResearcherAgent>();
builder.Services.AddScoped<IAgent, WriterAgent>();
builder.Services.AddScoped<IAgent, CriticAgent>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("FrontendDev");
app.UseAuthorization();

app.MapControllers();
app.MapHub<WorkflowHub>("/hubs/workflow");

app.Run();
