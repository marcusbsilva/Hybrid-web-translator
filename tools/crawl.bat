@echo off
cd /d "%~dp0\.."
python tools\corpus_crawler.py ^
  --zh-dictionary dictionaries\zh.js ^
  --vi-dictionary dictionaries\vi.js ^
  %*
