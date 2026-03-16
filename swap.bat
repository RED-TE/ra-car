@echo off
copy index.html blogbot.html
if %ERRORLEVEL% EQU 0 (
    echo Successfully copied index.html to blogbot.html
    del index.html
    ren landing.html index.html
    echo Successfully renamed landing.html to index.html
) else (
    echo Failed to copy index.html
)
