#!/usr/bin/env bash
cd "$(dirname "$0")"
echo
echo "=========================================="
echo "  Sniper Range V1 - Local Web Server"
echo "=========================================="
echo
echo "Open: http://localhost:8000"
echo "Press CTRL+C to stop."
echo
python3 -m http.server 8000
