@echo off
REM Windows: compile and run the backend (double-click, or run in the VS Code terminal)
cd /d "%~dp0"
if not exist out mkdir out
javac -cp "lib\*" -d out src\*.java
if errorlevel 1 exit /b 1
java -cp "out;lib\*" Main
