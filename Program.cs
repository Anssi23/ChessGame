using ChessGame.Data;
using ChessGame.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllersWithViews();

// Allow common dev origins (React dev server and Visual Studio SPA HTTPS) to connect to SignalR and API during development
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactDev", policy =>
    {
        policy.WithOrigins("http://localhost:3000", "http://localhost:44409")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

builder.Services.AddDbContext<ChessContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));//lisätty 13.11.2025 AAi

// SignalR for real-time updates
builder.Services.AddSignalR();
// Register GameService with hub context injected to ensure broadcasts work
builder.Services.AddSingleton<GameService>(sp => new GameService(sp.GetRequiredService<Microsoft.AspNetCore.SignalR.IHubContext<ChessGame.Hubs.ChessHub>>()));

// Ensure console logging is enabled so server logs appear in the terminal
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();
var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();

if (app.Environment.IsDevelopment())
{
    app.UseCors("AllowReactDev");
}

app.MapHub<ChessGame.Hubs.ChessHub>("/chesshub");

app.MapControllerRoute(
    name: "default",
    pattern: "{controller}/{action=Index}/{id?}");

app.MapFallbackToFile("index.html");

app.Run();
