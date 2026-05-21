#!/bin/bash

# Neon Vault Production Deployment Script
# This script automates the deployment process on AWS EC2

set -e

echo "================================"
echo "Neon Vault Deployment Starting"
echo "================================"

# Step 1: Pull latest code from main branch
echo "[1/4] Pulling latest code from remote..."
git pull origin main

# Step 2: Stop and remove existing containers
echo "[2/4] Stopping existing containers..."
docker-compose down

# Step 3: Build and start new containers
echo "[3/4] Building and starting new containers..."
docker-compose up -d --build

# Step 4: Run database migrations
echo "[4/4] Running database migrations..."
docker exec neon-app npx prisma migrate deploy

echo "================================"
echo "Deployment Complete!"
echo "================================"
echo "Application is running at:"
echo "- HTTP: http://localhost"
echo "- HTTPS: https://localhost (with proper certificate)"
echo ""
echo "Database: PostgreSQL on neon-db:5432"
echo "Backend: Socket server on neon-backend:5000"
echo "Redis: Running on neon-redis:6379"
echo "================================"
