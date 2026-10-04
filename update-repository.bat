@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
if errorlevel 1 goto failed

where git >nul 2>&1
if errorlevel 1 (
    echo Git was not found. Install Git and reopen this script.
    goto failed
)
rem This file must be in the project root, not inside another repository.
if exist ".git" goto check_history
git rev-parse --show-toplevel >nul 2>&1
if not errorlevel 1 (
    echo This folder is inside another Git repository. Place the BAT at its root.
    goto failed
)
git init
if errorlevel 1 goto failed

:check_history
git rev-parse --verify HEAD >nul 2>&1
if not errorlevel 1 goto repository_ready

rem First setup only: attach existing remote history without changing local files.
set "repositoryUrl=https://github.com/marcusbsilva/Hybrid-web-translator.git"
git remote get-url origin >nul 2>&1
if not errorlevel 1 goto bootstrap_origin_exists
git remote add origin "%repositoryUrl%"
if errorlevel 1 goto failed
goto bootstrap_fetch

:bootstrap_origin_exists
set "existingUrl="
for /f "delims=" %%U in ('git remote get-url origin') do set "existingUrl=%%U"
if /i not "%existingUrl%"=="%repositoryUrl%" (
    echo Origin points to another URL. Setup stopped to avoid using the wrong repository.
    git remote -v
    goto failed
)

:bootstrap_fetch
echo.
echo Connecting this folder to the existing Hybrid-web-translator repository...
git fetch origin
if errorlevel 1 goto failed
git remote set-head origin --auto
if errorlevel 1 goto failed
set "remoteBranch="
for /f "delims=" %%B in ('git symbolic-ref --short refs/remotes/origin/HEAD') do set "remoteBranch=%%B"
if not defined remoteBranch goto failed
set "localBranch=%remoteBranch:~7%"
git check-ref-format --branch "%localBranch%" >nul 2>&1
if errorlevel 1 goto failed
git symbolic-ref HEAD "refs/heads/%localBranch%"
if errorlevel 1 goto failed
git reset --mixed "%remoteBranch%"
if errorlevel 1 goto failed
git branch --set-upstream-to="%remoteBranch%" "%localBranch%"
if errorlevel 1 goto failed

:repository_ready
git remote get-url origin
if errorlevel 1 (
    echo No origin remote configured. Add the GitHub URL before running this script.
    goto failed
)
git symbolic-ref --quiet HEAD >nul 2>&1
if errorlevel 1 (
    echo Detached HEAD detected. Switch to a branch before updating.
    goto failed
)

git config user.name "Marcus Silva"
if errorlevel 1 goto failed
git config user.email "marcus.silva@ads.fsa.br"
if errorlevel 1 goto failed

echo.
git status
if errorlevel 1 goto failed
git add -A
if errorlevel 1 goto failed

git diff --cached --quiet
if errorlevel 2 goto failed
if not errorlevel 1 goto no_changes

:ask_message
echo.
set "commitMessage="
set /p "commitMessage=Enter the commit message (Ctrl+C to cancel): "
if not defined commitMessage (
    echo The commit message cannot be empty.
    goto ask_message
)

:choose_temp
set "commitFile=%TEMP%\git-update-%RANDOM%-%RANDOM%.txt"
if exist "%commitFile%" goto choose_temp
rem Delayed expansion keeps message characters out of CMD command parsing.
setlocal EnableDelayedExpansion
>"!commitFile!" echo(!commitMessage!
endlocal
if not exist "%commitFile%" goto failed

git -c i18n.commitEncoding=UTF-8 commit -F "%commitFile%"
set "commitResult=%ERRORLEVEL%"
del /q "%commitFile%" >nul 2>&1
if not "%commitResult%"=="0" goto failed
goto push_changes

:no_changes
echo.
echo No staged changes. Checking for commits to push.

:push_changes
echo.
git push -u origin HEAD
if errorlevel 1 goto failed
echo.
echo Repository update completed successfully.
pause
exit /b 0

:failed
echo.
echo Update stopped because a command failed. Review the output above.
pause
exit /b 1
