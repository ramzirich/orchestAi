# ---------- Stage 1: build ----------
# Use the .NET 8 SDK image (has compilers, NuGet, etc.) just to build.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy the csproj first and restore. Doing this BEFORE copying the rest
# means Docker can cache the "restore" layer and skip it on rebuilds
# when only your .cs files changed.
COPY OrchestAI.Api.csproj ./
RUN dotnet restore

# Now copy the rest of the source and publish a release build.
# /app/publish will contain the compiled DLLs + the Workflows json files
# (the csproj has CopyToOutputDirectory=PreserveNewest for them).
COPY . .
RUN dotnet publish -c Release -o /app/publish --no-restore

# ---------- Stage 2: runtime ----------
# Smaller image — only the ASP.NET runtime, no SDK. This is what actually ships.
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

# curl is needed by the HEALTHCHECK below and isn't in the base image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# The official aspnet image ships with a non-root 'app' user (UID 1654);
# chown the published output so the dotnet process can read it after USER app.
COPY --from=build --chown=app:app /app/publish ./

ENV ASPNETCORE_URLS=http://+:5100
EXPOSE 5100

# Drop root before running the app.
USER app

# Compose's depends_on: service_healthy waits on this. start-period gives the
# runtime time to JIT and bind the port before failed checks count.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
    CMD curl --fail --silent http://localhost:5100/health || exit 1

ENTRYPOINT ["dotnet", "OrchestAI.Api.dll"]
