# SharVin Production Deployment Runbook

This guide covers deployment procedures for the SharVin B2B SaaS platform across Docker, PM2, and Nginx.

---

## 1. Option A: Docker Compose Deployment (Recommended)

Docker Compose orchestrates the PostgreSQL database, the unified Node.js API with Socket.io, and the Nginx SPA reverse proxy with automatic health checks.

### Prerequisites:
- Docker Engine 24.0+
- Docker Compose v2.20+

### Steps:
1. **Prepare Environment Secrets:**
   ```bash
   cp .env.production.example .env.production
   # Update JWT_SECRET, OTP_SALT, and POSTGRES_PASSWORD with secure cryptographic values
   ```

2. **Build and Launch Containers:**
   ```bash
   docker compose --env-file .env.production up -d --build
   ```

3. **Verify Service Health:**
   ```bash
   docker compose ps
   docker compose logs -f server
   ```

4. **Run Database Migrations Inside Container:**
   ```bash
   docker compose exec server npx prisma migrate deploy
   ```

5. **Access Application:**
   - Web Application: `http://<YOUR_SERVER_IP>`
   - API Health Endpoint: `http://<YOUR_SERVER_IP>/api/v1/health`

---

## 2. Option B: Bare-Metal / VPS Deployment (PM2 + Nginx)

For deployment on Linux virtual machines (Ubuntu / Debian / AWS EC2 / DigitalOcean Droplets).

### Step 1: Install Dependencies & Build
```bash
# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx postgresql postgresql-contrib

# Global process manager
sudo npm install -g pm2

# Install project dependencies
npm ci

# Build server and client workspaces
npm run prisma:generate --workspace=server
npm run build --workspace=server
npm run build --workspace=client
```

### Step 2: Configure PM2 Cluster
```bash
# Launch server in cluster mode
pm2 start ecosystem.config.cjs --env production

# Save process list and enable systemd startup on boot
pm2 save
pm2 startup
```

### Step 3: Configure Host Nginx
Copy `deploy/nginx.conf` (or symlink `/etc/nginx/sites-available/sharvin`):
```nginx
server {
    listen 80;
    server_name app.sharvin.in;

    root /path/to/SharVin/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }
}
```

Enable SSL via Certbot:
```bash
sudo certbot --nginx -d app.sharvin.in
```

---

## 3. Production Healthcheck & Monitoring

- **API Health:** `GET /api/v1/health`
- **OWASP Headers:** Check `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.
- **Logs:** Available under `./logs/` when running with PM2, or `docker compose logs` when running with Docker.
