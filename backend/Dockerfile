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
COPY --from=build /app/publish ./

# Tell ASP.NET Core to listen on 5100 inside the container, on all interfaces.
# (By default it binds to localhost only, which would be unreachable from outside.)
ENV ASPNETCORE_URLS=http://+:5100
EXPOSE 5100

ENTRYPOINT ["dotnet", "OrchestAI.Api.dll"]
