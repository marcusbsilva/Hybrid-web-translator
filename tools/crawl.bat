@echo off
setlocal
cd /d "%~dp0\.."
python tools\corpus_crawler.py %*
set "CRAWL_EXIT=%errorlevel%"
if not "%CRAWL_EXIT%"=="0" echo Crawler stopped with an error. Check the message above.
exit /b %CRAWL_EXIT%
