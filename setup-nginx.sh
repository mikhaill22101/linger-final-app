#!/bin/bash
set -e

echo "=== Установка nginx ==="
sudo apt-get update
sudo apt-get install -y nginx

echo "=== Удаление стандартного конфига ==="
sudo rm -f /etc/nginx/sites-enabled/default

echo "=== Создание директории ==="
sudo mkdir -p /var/www/linger

echo "=== Создание конфигурации nginx ==="
sudo tee /etc/nginx/sites-available/linger > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;
    root /var/www/linger;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

echo "=== Активация конфига ==="
sudo ln -sf /etc/nginx/sites-available/linger /etc/nginx/sites-enabled/linger

echo "=== Очистка /var/www/html ==="
sudo rm -rf /var/www/html/*

echo "=== Копирование файлов из dist ==="
# Убедитесь, что вы находитесь в директории проекта перед запуском скрипта
if [ -d "./dist" ]; then
    sudo cp -r ./dist/* /var/www/linger/
else
    echo "ОШИБКА: Папка ./dist не найдена. Убедитесь, что вы находитесь в директории проекта."
    exit 1
fi

echo "=== Проверка конфигурации nginx ==="
sudo nginx -t

echo "=== Перезапуск nginx ==="
sudo systemctl restart nginx

echo "=== Статус nginx ==="
sudo systemctl status nginx --no-pager -l | head -20

echo ""
echo "=== ИНФОРМАЦИЯ ==="
echo "IP сервера: $(hostname -I | awk '{print $1}')"
echo "Команда для проверки статуса: sudo systemctl status nginx"
echo "Проверка доступности: curl -I http://localhost"
echo ""
echo "Сайт доступен по адресу: http://$(hostname -I | awk '{print $1}')"
