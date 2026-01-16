#!/bin/bash
set -e

echo "=== Deadlock Draft VPS Setup ==="

# Update system
echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install essentials
echo "Installing essential packages..."
sudo apt install -y curl git nginx

# Install Bun
echo "Installing Bun..."
if ! command -v bun &> /dev/null; then
    curl -fsSL https://bun.sh/install | bash
    source ~/.bashrc
fi

# Install PM2 globally
echo "Installing PM2..."
bun install -g pm2

# Install Certbot (optional, for later SSL setup)
echo "Installing Certbot..."
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot

# Create application directory
echo "Creating application directory..."
sudo mkdir -p /var/www/deadlock-draft
sudo chown -R $USER:$USER /var/www/deadlock-draft

# Create data and logs directories
sudo mkdir -p /var/www/deadlock-draft/data
sudo mkdir -p /var/www/deadlock-draft/logs
sudo chown -R $USER:$USER /var/www/deadlock-draft/data
sudo chown -R $USER:$USER /var/www/deadlock-draft/logs

echo ""
echo "=== GitHub Actions SSH Setup ==="
echo ""

# Generate SSH key for GitHub Actions if it doesn't exist
if [ ! -f ~/.ssh/github_actions ]; then
    echo "Generating SSH key for GitHub Actions..."
    ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions -N ""
    cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
    chmod 600 ~/.ssh/authorized_keys
    echo ""
    echo "SSH key generated. Add the following PRIVATE key to GitHub Secrets as VPS_SSH_KEY:"
    echo "============================================================"
    cat ~/.ssh/github_actions
    echo "============================================================"
else
    echo "SSH key already exists. Here's the private key for GitHub Secrets:"
    echo "============================================================"
    cat ~/.ssh/github_actions
    echo "============================================================"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "GitHub Secrets to configure:"
echo "  VPS_HOST     = $(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_VPS_IP')"
echo "  VPS_USER     = $USER"
echo "  VPS_SSH_KEY  = (private key shown above)"
echo "  VPS_PORT     = 22 (or your custom SSH port)"
echo ""
echo "Next steps:"
echo "1. Add the GitHub secrets shown above to your repository"
echo "2. Clone your repository to /var/www/deadlock-draft"
echo "   cd /var/www/deadlock-draft"
echo "   git clone https://github.com/YOUR_USERNAME/deadlock-draft.git ."
echo ""
echo "3. Create .env file with your configuration:"
echo "   cat > .env << 'EOF'"
echo "   NODE_ENV=production"
echo "   PORT=3000"
echo "   APP_URL=http://YOUR_VPS_IP"
echo "   FRONTEND_URL=http://YOUR_VPS_IP"
echo "   DATABASE_URL=./data/deadlock-draft.db"
echo "   STEAM_API_KEY=your_steam_api_key"
echo "   DEADLOCK_API_KEY="
echo "   SESSION_SECRET=generate_a_random_32_char_string_here"
echo "   LOBBY_EXPIRY_HOURS=2"
echo "   EOF"
echo "   cp .env apps/server/.env"
echo ""
echo "4. Install dependencies and build:"
echo "   bun install"
echo "   bun run db:generate"
echo "   bun run db:migrate"
echo "   bun run build:web"
echo ""
echo "5. Start the application:"
echo "   pm2 start pm2.config.cjs"
echo "   pm2 save"
echo "   pm2 startup  # Follow the instructions it prints"
echo ""
echo "6. Configure Nginx (IP-only, no SSL):"
echo "   sudo cp deploy/nginx/deadlock-draft-ip.conf /etc/nginx/sites-available/deadlock-draft"
echo "   sudo ln -s /etc/nginx/sites-available/deadlock-draft /etc/nginx/sites-enabled/"
echo "   sudo rm -f /etc/nginx/sites-enabled/default"
echo "   sudo nginx -t"
echo "   sudo systemctl reload nginx"
echo ""
echo "7. (Optional) Add domain and SSL later:"
echo "   - Point DNS A record to your VPS IP"
echo "   - Update nginx config with domain name"
echo "   - Run: sudo certbot --nginx -d yourdomain.com"
echo "   - Update .env files with https URLs"
echo ""
