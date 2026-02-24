@echo off
setlocal EnableDelayedExpansion

set "LOGFILE=%~dp0setup-log.txt"
echo [%DATE% %TIME%] SETUP.bat starting... > "%LOGFILE%"

title VegaMCP v3.0 - API Key Setup
color 0B

set "ENVFILE=%~dp0.env"
set "VAL_OPENROUTER_API_KEY="
set "VAL_DEEPSEEK_API_KEY="
set "VAL_KIMI_API_KEY="
set "VAL_OLLAMA_URL=http://localhost:11434"
set "VAL_TAVILY_API_KEY="
set "VAL_SEARXNG_URL="
set "VAL_GITHUB_TOKEN="
set "VAL_SENTRY_AUTH_TOKEN="
set "VAL_SENTRY_ORG="
set "VAL_SENTRY_PROJECT="
set "VAL_TOKEN_DAILY_BUDGET_USD=5.00"
set "VAL_TOKEN_HOURLY_BUDGET_USD=1.00"
set "VAL_VEGAMCP_TOOL_PROFILE=full"
set "VAL_DATA_DIR=./data"
set "VAL_LOG_LEVEL=info"
set "VAL_BROWSER_ALLOW_EXTERNAL=false"
set "VAL_BROWSER_INACTIVITY_TIMEOUT=300000"
set "VAL_WORKSPACE_ROOT=%~dp0"
set "VAL_WORKSPACE_ROOT=!VAL_WORKSPACE_ROOT:\=/!"
if "!VAL_WORKSPACE_ROOT:~-1!"=="/" set "VAL_WORKSPACE_ROOT=!VAL_WORKSPACE_ROOT:~0,-1!"

echo [%DATE% %TIME%] Parsing .env... >> "%LOGFILE%"
if exist "%ENVFILE%" (
    for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ENVFILE%") do (
        if not "%%B"=="" set "VAL_%%A=%%B"
    )
)
echo [%DATE% %TIME%] Ready >> "%LOGFILE%"

:MAIN_MENU
cls
echo.
echo   ========================================================
echo     VegaMCP v3.0 -- API Key Configuration
echo   ========================================================
echo.
echo     1  Reasoning Models   2  Local AI / Ollama
echo     3  Web Search         4  GitHub Integration
echo     5  Sentry Monitoring  6  Token Budgets
echo     7  Tool Profile       8  General Settings
echo     9  View Config        0  Save and Exit
echo.
echo   ========================================================
echo.
choice /c 1234567890 /n /m "  Press a number [0-9]: "
set "CH=!ERRORLEVEL!"
echo [%DATE% %TIME%] Choice: !CH! >> "%LOGFILE%"
if !CH!==1 goto REASONING
if !CH!==2 goto OLLAMA
if !CH!==3 goto WEBSEARCH
if !CH!==4 goto GITHUB
if !CH!==5 goto SENTRY
if !CH!==6 goto BUDGET
if !CH!==7 goto PROFILE
if !CH!==8 goto GENERAL
if !CH!==9 goto VIEW_CONFIG
if !CH!==10 goto SAVE_EXIT
goto MAIN_MENU

:REASONING
cls
echo.
echo   === 1. Reasoning Models ===
echo.
echo   You need at least ONE for the AI reasoning router.
echo   OpenRouter recommended: one key for ALL models.
echo.
echo   Current keys:
call :SHOW_KEY "  OpenRouter" "OPENROUTER_API_KEY"
call :SHOW_KEY "  DeepSeek  " "DEEPSEEK_API_KEY"
call :SHOW_KEY "  Kimi      " "KIMI_API_KEY"
echo.
echo   1  Set OpenRouter   (openrouter.ai/keys)
echo   2  Set DeepSeek     (platform.deepseek.com)
echo   3  Set Kimi         (platform.moonshot.cn)
echo   0  Back
echo.
choice /c 1230 /n /m "  Press [1-3 or 0]: "
set "RC=!ERRORLEVEL!"
if !RC!==1 (
    echo.
    echo   Get key: https://openrouter.ai/keys
    echo.
    set /p "VAL_OPENROUTER_API_KEY=  OpenRouter Key: "
    echo   Saved.
)
if !RC!==2 (
    echo.
    echo   Get key: https://platform.deepseek.com/api_keys
    echo.
    set /p "VAL_DEEPSEEK_API_KEY=  DeepSeek Key: "
    echo   Saved.
)
if !RC!==3 (
    echo.
    echo   Get key: https://platform.moonshot.cn/console/api-keys
    echo.
    set /p "VAL_KIMI_API_KEY=  Kimi Key: "
    echo   Saved.
)
if !RC!==4 goto MAIN_MENU
goto REASONING

:OLLAMA
cls
echo.
echo   === 2. Local AI / Ollama (FREE) ===
echo.
echo   Install: https://ollama.com
echo   Then run: ollama pull llama3
echo.
echo   Current: !VAL_OLLAMA_URL!
echo.
echo   1  Change Ollama URL
echo   0  Back
echo.
choice /c 10 /n /m "  Press [1 or 0]: "
if !ERRORLEVEL!==1 (
    set /p "VAL_OLLAMA_URL=  Ollama URL: "
    echo   Saved.
)
goto MAIN_MENU

:WEBSEARCH
cls
echo.
echo   === 3. Web Search ===
echo.
echo   Tavily: AI search, 1000 free/month
echo   SearXNG: self-hosted fallback
echo.
call :SHOW_KEY "  Tavily" "TAVILY_API_KEY"
echo   SearXNG: !VAL_SEARXNG_URL!
echo.
echo   1  Set Tavily Key   (tavily.com)
echo   2  Set SearXNG URL
echo   0  Back
echo.
choice /c 120 /n /m "  Press [1, 2, or 0]: "
set "WC=!ERRORLEVEL!"
if !WC!==1 (
    echo.
    set /p "VAL_TAVILY_API_KEY=  Tavily Key: "
    echo   Saved.
)
if !WC!==2 (
    set /p "VAL_SEARXNG_URL=  SearXNG URL: "
    echo   Saved.
)
if !WC!==3 goto MAIN_MENU
goto WEBSEARCH

:GITHUB
cls
echo.
echo   === 4. GitHub Token ===
echo.
echo   Without: 60 req/hr   With: 5,000 req/hr
echo.
call :SHOW_KEY "  Token" "GITHUB_TOKEN"
echo.
echo   1  Set GitHub Token  (github.com/settings/tokens)
echo   0  Back
echo.
choice /c 10 /n /m "  Press [1 or 0]: "
if !ERRORLEVEL!==1 (
    echo.
    set /p "VAL_GITHUB_TOKEN=  GitHub Token: "
    echo   Saved.
)
goto MAIN_MENU

:SENTRY
cls
echo.
echo   === 5. Sentry Monitoring ===
echo.
echo   Optional error tracking. Leave blank to skip.
echo.
call :SHOW_KEY "  Token  " "SENTRY_AUTH_TOKEN"
echo   Org:     !VAL_SENTRY_ORG!
echo   Project: !VAL_SENTRY_PROJECT!
echo.
echo   1  Set Auth Token   2  Set Org   3  Set Project   0  Back
echo.
choice /c 1230 /n /m "  Press [1-3 or 0]: "
set "SC=!ERRORLEVEL!"
if !SC!==1 (
    set /p "VAL_SENTRY_AUTH_TOKEN=  Auth Token: "
    echo   Saved.
)
if !SC!==2 (
    set /p "VAL_SENTRY_ORG=  Org slug: "
    echo   Saved.
)
if !SC!==3 (
    set /p "VAL_SENTRY_PROJECT=  Project slug: "
    echo   Saved.
)
if !SC!==4 goto MAIN_MENU
goto SENTRY

:BUDGET
cls
echo.
echo   === 6. Token Budgets ===
echo.
echo   Auto-switches to cheaper models when budget gets low.
echo.
echo   Daily:  $!VAL_TOKEN_DAILY_BUDGET_USD!/day
echo   Hourly: $!VAL_TOKEN_HOURLY_BUDGET_USD!/hr
echo.
echo   1  Set daily    2  Set hourly    0  Back
echo.
choice /c 120 /n /m "  Press [1, 2, or 0]: "
set "BC=!ERRORLEVEL!"
if !BC!==1 (
    set /p "VAL_TOKEN_DAILY_BUDGET_USD=  Daily USD: "
    echo   Saved.
)
if !BC!==2 (
    set /p "VAL_TOKEN_HOURLY_BUDGET_USD=  Hourly USD: "
    echo   Saved.
)
if !BC!==3 goto MAIN_MENU
goto BUDGET

:PROFILE
cls
echo.
echo   === 7. Tool Profile ===
echo.
echo   Current: !VAL_VEGAMCP_TOOL_PROFILE!
echo.
echo   1 full      All 47 tools
echo   2 minimal   ~10 tools
echo   3 research  ~28 tools
echo   4 coding    ~25 tools
echo   5 ops       ~32 tools
echo   0 Back
echo.
choice /c 123450 /n /m "  Press [1-5 or 0]: "
set "PC=!ERRORLEVEL!"
if !PC!==1 set "VAL_VEGAMCP_TOOL_PROFILE=full" & echo   Set: full
if !PC!==2 set "VAL_VEGAMCP_TOOL_PROFILE=minimal" & echo   Set: minimal
if !PC!==3 set "VAL_VEGAMCP_TOOL_PROFILE=research" & echo   Set: research
if !PC!==4 set "VAL_VEGAMCP_TOOL_PROFILE=coding" & echo   Set: coding
if !PC!==5 set "VAL_VEGAMCP_TOOL_PROFILE=ops" & echo   Set: ops
timeout /t 1 >nul 2>&1
goto MAIN_MENU

:GENERAL
cls
echo.
echo   === 8. General Settings ===
echo.
echo   Workspace: !VAL_WORKSPACE_ROOT!
echo   Data dir:  !VAL_DATA_DIR!
echo   Log level: !VAL_LOG_LEVEL!
echo.
echo   1  Workspace root   2  Data dir   3  Log level   0  Back
echo.
choice /c 1230 /n /m "  Press [1-3 or 0]: "
set "XC=!ERRORLEVEL!"
if !XC!==1 (
    set /p "VAL_WORKSPACE_ROOT=  Workspace: "
    echo   Saved.
)
if !XC!==2 (
    set /p "VAL_DATA_DIR=  Data dir: "
    echo   Saved.
)
if !XC!==3 (
    set /p "VAL_LOG_LEVEL=  Log level: "
    echo   Saved.
)
if !XC!==4 goto MAIN_MENU
goto GENERAL

:VIEW_CONFIG
cls
echo.
echo   === Current Configuration ===
echo.
set "KC=0"
if not "!VAL_OPENROUTER_API_KEY!"=="" set /a KC+=1
if not "!VAL_DEEPSEEK_API_KEY!"=="" set /a KC+=1
if not "!VAL_KIMI_API_KEY!"=="" set /a KC+=1
if not "!VAL_TAVILY_API_KEY!"=="" set /a KC+=1
if not "!VAL_GITHUB_TOKEN!"=="" set /a KC+=1
if not "!VAL_SENTRY_AUTH_TOKEN!"=="" set /a KC+=1
echo   API Keys: !KC! / 6
echo.
if not "!VAL_OPENROUTER_API_KEY!"=="" (echo   [Y] OpenRouter) else (echo   [ ] OpenRouter)
if not "!VAL_DEEPSEEK_API_KEY!"=="" (echo   [Y] DeepSeek) else (echo   [ ] DeepSeek)
if not "!VAL_KIMI_API_KEY!"=="" (echo   [Y] Kimi) else (echo   [ ] Kimi)
if not "!VAL_TAVILY_API_KEY!"=="" (echo   [Y] Tavily) else (echo   [ ] Tavily)
if not "!VAL_GITHUB_TOKEN!"=="" (echo   [Y] GitHub) else (echo   [ ] GitHub)
if not "!VAL_SENTRY_AUTH_TOKEN!"=="" (echo   [Y] Sentry) else (echo   [ ] Sentry)
echo.
echo   Ollama:    !VAL_OLLAMA_URL!
echo   Profile:   !VAL_VEGAMCP_TOOL_PROFILE!
echo   Budget:    $!VAL_TOKEN_DAILY_BUDGET_USD!/day  $!VAL_TOKEN_HOURLY_BUDGET_USD!/hr
echo   Workspace: !VAL_WORKSPACE_ROOT!
echo   Data dir:  !VAL_DATA_DIR!
echo   Log level: !VAL_LOG_LEVEL!
echo.
echo   Press any key to go back...
pause >nul
goto MAIN_MENU

:SAVE_EXIT
echo [%DATE% %TIME%] Saving... >> "%LOGFILE%"
> "%ENVFILE%" echo # VegaMCP v3.0 Configuration
>> "%ENVFILE%" echo # Generated by SETUP.bat on %DATE% %TIME%
>> "%ENVFILE%" echo.
>> "%ENVFILE%" echo WORKSPACE_ROOT=!VAL_WORKSPACE_ROOT!
>> "%ENVFILE%" echo.
>> "%ENVFILE%" echo # Reasoning Models
>> "%ENVFILE%" echo OPENROUTER_API_KEY=!VAL_OPENROUTER_API_KEY!
>> "%ENVFILE%" echo DEEPSEEK_API_KEY=!VAL_DEEPSEEK_API_KEY!
>> "%ENVFILE%" echo KIMI_API_KEY=!VAL_KIMI_API_KEY!
>> "%ENVFILE%" echo.
>> "%ENVFILE%" echo # Local AI
>> "%ENVFILE%" echo OLLAMA_URL=!VAL_OLLAMA_URL!
>> "%ENVFILE%" echo.
>> "%ENVFILE%" echo # Web Search
>> "%ENVFILE%" echo TAVILY_API_KEY=!VAL_TAVILY_API_KEY!
>> "%ENVFILE%" echo SEARXNG_URL=!VAL_SEARXNG_URL!
>> "%ENVFILE%" echo.
>> "%ENVFILE%" echo # GitHub
>> "%ENVFILE%" echo GITHUB_TOKEN=!VAL_GITHUB_TOKEN!
>> "%ENVFILE%" echo.
>> "%ENVFILE%" echo # Sentry
>> "%ENVFILE%" echo SENTRY_AUTH_TOKEN=!VAL_SENTRY_AUTH_TOKEN!
>> "%ENVFILE%" echo SENTRY_ORG=!VAL_SENTRY_ORG!
>> "%ENVFILE%" echo SENTRY_PROJECT=!VAL_SENTRY_PROJECT!
>> "%ENVFILE%" echo.
>> "%ENVFILE%" echo # Token Budget
>> "%ENVFILE%" echo TOKEN_DAILY_BUDGET_USD=!VAL_TOKEN_DAILY_BUDGET_USD!
>> "%ENVFILE%" echo TOKEN_HOURLY_BUDGET_USD=!VAL_TOKEN_HOURLY_BUDGET_USD!
>> "%ENVFILE%" echo.
>> "%ENVFILE%" echo # Tool Profile
>> "%ENVFILE%" echo VEGAMCP_TOOL_PROFILE=!VAL_VEGAMCP_TOOL_PROFILE!
>> "%ENVFILE%" echo.
>> "%ENVFILE%" echo # Browser
>> "%ENVFILE%" echo BROWSER_ALLOW_EXTERNAL=!VAL_BROWSER_ALLOW_EXTERNAL!
>> "%ENVFILE%" echo BROWSER_INACTIVITY_TIMEOUT=!VAL_BROWSER_INACTIVITY_TIMEOUT!
>> "%ENVFILE%" echo.
>> "%ENVFILE%" echo # General
>> "%ENVFILE%" echo DATA_DIR=!VAL_DATA_DIR!
>> "%ENVFILE%" echo LOG_LEVEL=!VAL_LOG_LEVEL!

echo [%DATE% %TIME%] Saved OK >> "%LOGFILE%"

set "KC=0"
if not "!VAL_OPENROUTER_API_KEY!"=="" set /a KC+=1
if not "!VAL_DEEPSEEK_API_KEY!"=="" set /a KC+=1
if not "!VAL_KIMI_API_KEY!"=="" set /a KC+=1
if not "!VAL_TAVILY_API_KEY!"=="" set /a KC+=1
if not "!VAL_GITHUB_TOKEN!"=="" set /a KC+=1
if not "!VAL_SENTRY_AUTH_TOKEN!"=="" set /a KC+=1

cls
echo.
echo   ========================================================
echo     Configuration Saved!
echo   ========================================================
echo.
echo   File: .env
echo   API Keys: !KC! / 6
echo.
echo   Next steps:
echo     1. npm run build
echo     2. Restart VegaMCP server
echo.
echo   ========================================================
echo.
echo   Press any key to exit...
pause >nul
goto :EOF

:SHOW_KEY
set "KEYNAME=VAL_%~2"
set "KEYVAL=!%KEYNAME%!"
if "!KEYVAL!"=="" (
    echo   %~1: [not set]
) else (
    set "MASKED=!KEYVAL:~0,6!...!KEYVAL:~-4!"
    echo   %~1: !MASKED!
)
goto :EOF
