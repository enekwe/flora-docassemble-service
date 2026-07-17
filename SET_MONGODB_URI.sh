#!/bin/bash

# Script to set MONGODB_URI for flora-docassemble-service on Railway
# Generated: 2026-07-16

echo "=================================================="
echo "Setting MongoDB URI for flora-docassemble-service"
echo "=================================================="
echo ""

# The MongoDB connection string
MONGODB_URI="mongodb://mongo:LegGfRDdPGDxZgqDGbqjFJWlWASmCGNB@metro.proxy.rlwy.net:59998/venturestudio"

echo "MongoDB URI to set:"
echo "  Host: metro.proxy.rlwy.net:59998"
echo "  Database: venturestudio"
echo "  User: mongo"
echo ""

# Option 1: Using Railway Dashboard (Recommended if CLI has issues)
echo "OPTION 1: Railway Dashboard (Most Reliable)"
echo "=========================================="
echo "1. Go to: https://railway.app/project/passbook-flora"
echo "2. Click on 'flora-docassemble-service' service"
echo "3. Click 'Variables' tab"
echo "4. Click '+ New Variable'"
echo "5. Set:"
echo "   Name: MONGODB_URI"
echo "   Value: ${MONGODB_URI}"
echo "6. Click 'Add'"
echo "7. Service will auto-redeploy"
echo ""

# Option 2: Using Railway CLI
echo "OPTION 2: Railway CLI"
echo "===================="
echo "Run this command:"
echo ""
echo "railway variables --set MONGODB_URI=\"${MONGODB_URI}\""
echo ""
echo "Note: You may need to link to the correct service first:"
echo "  railway link"
echo "  (Select: Passbook Flora -> production -> flora-docassemble-service)"
echo ""

# Option 3: Direct API call (if user has Railway API token)
echo "OPTION 3: Railway API (Advanced)"
echo "================================"
echo "If you have a Railway API token, you can use:"
echo ""
echo "curl -X POST https://backboard.railway.app/graphql/v2 \\"
echo "  -H 'Authorization: Bearer \$RAILWAY_TOKEN' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"query\":\"mutation { variableUpsert(input: { name: \\\"MONGODB_URI\\\", value: \\\"${MONGODB_URI}\\\", serviceId: \\\"<SERVICE_ID>\\\" }) { id } }\"}'"
echo ""

echo "=================================================="
echo "After setting the variable, verify with:"
echo "  railway logs"
echo ""
echo "You should see:"
echo "  ✅ MongoDB connected successfully"
echo "  ✅ Server running on port <PORT>"
echo "=================================================="
