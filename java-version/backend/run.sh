#!/bin/bash
# Mac / Linux: compile and run the backend
cd "$(dirname "$0")"
mkdir -p out
javac -cp "lib/*" -d out src/*.java || exit 1
java -cp "out:lib/*" Main
