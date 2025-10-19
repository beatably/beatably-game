#!/bin/bash
# Clean Backend Restart Script
# Kills all backend processes and starts fresh to reload updated database

echo "============================================================"
echo "CLEAN BACKEND RESTART"
echo "============================================================"
echo ""

# Kill processes on port 3001
echo "1. Killing processes on port 3001..."
lsof -ti:3001 | xargs kill -9 2>/dev/null
if [ $? -eq 0 ]; then
  echo "   ✓ Killed process on port 3001"
else
  echo "   ℹ No process found on port 3001"
fi

# Kill any node backend processes
echo ""
echo "2. Killing any node backend processes..."
ps aux | grep "node.*backend" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null
if [ $? -eq 0 ]; then
  echo "   ✓ Killed node backend processes"
else
  echo "   ℹ No node backend processes found"
fi

# Wait a moment
sleep 2

# Verify no processes on port 3001
echo ""
echo "3. Verifying port 3001 is free..."
if lsof -ti:3001 > /dev/null 2>&1; then
  echo "   ✗ ERROR: Port 3001 still in use!"
  echo "   Please manually kill the process and try again"
  exit 1
else
  echo "   ✓ Port 3001 is free"
fi

echo ""
echo "4. Starting backend..."
echo "   (Backend will load updated curated-songs.json from disk)"
echo ""
echo "============================================================"
echo ""

cd "$(dirname "$0")/.." && npm start &

echo ""
echo "Backend starting in background..."
echo ""
echo "NEXT STEPS:"
echo "  1. Wait 5-10 seconds for backend to fully start"
echo "  2. Open admin page: http://localhost:3001/admin.html"
echo "  3. Do a HARD REFRESH in browser:"
echo "     • Mac: Cmd+Shift+R"
echo "     • Windows/Linux: Ctrl+Shift+R"
echo ""
echo "If you still see old data after hard refresh, check the"
echo "backend console logs to ensure it loaded the correct file."
echo ""
