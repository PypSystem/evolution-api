# 📋 Resumo Executivo - Dockerização da Evolution API

## 🎯 Objetivo

Migrar a Evolution API de **PM2 (processo no host)** para **Docker**, integrando-a na mesma rede Docker (`ai-curation-network`) que já está sendo usada pelo backend NestJS e frontend Vue.

---

## 📦 O que foi criado

### Arquivos novos

1. **`docker-compose.prod.yml`** - Configuração Docker para produção
2. **`.env.production.example`** - Template de variáveis de ambiente para produção
3. **`DEPLOY.md`** - Documentação completa de deploy e troubleshooting
4. **`.gitignore.docker`** - Regras de ignore para arquivos sensíveis
5. **`SETUP-RESUMO.md`** - Este arquivo

### Arquivos já existentes (sem modificação)

- **`Dockerfile`** - Já existe e funciona perfeitamente
- **`.env.example`** - Mantido para desenvolvimento

---

## 🔄 Mudanças necessárias no servidor

### 1. Preparação inicial (uma vez só)

```bash
# Conectar ao servidor
ssh root@45.79.152.52

# Ir para o diretório da Evolution API
cd /var/www/evolution-api

# Criar arquivo .env.production
cp .env.production.example .env.production
nano .env.production  # Configurar variáveis
```

**Variáveis CRÍTICAS no `.env.production`:**

```env
# PostgreSQL (use 172.17.0.1 para acessar do container)
DATABASE_CONNECTION_URI=postgresql://user:password@172.17.0.1:5432/evolution?schema=evolution_api

# Redis (use 172.17.0.1 para acessar do container)
CACHE_REDIS_URI=redis://172.17.0.1:6379/6

# Chave de API segura
AUTHENTICATION_API_KEY=sua-chave-segura-aqui

# URL pública
SERVER_URL=http://45.79.152.52:8080
```

### 2. Parar PM2 (uma vez só)

```bash
# Ver processos
pm2 list

# Parar Evolution API
pm2 stop evolution-api

# Remover do PM2
pm2 delete evolution-api
pm2 save
```

### 3. Deploy inicial com Docker

```bash
cd /var/www/evolution-api

# Build e iniciar container
docker-compose -f docker-compose.prod.yml up -d --build

# Ver logs
docker logs -f evolution-api
```

---

## 🚀 Novo processo de deploy

### Antes (PM2)

```bash
ssh root@45.79.152.52
cd /var/www/evolution-api
git pull
npm install
npm run build
pm2 restart evolution-api
```

### Depois (Docker)

```bash
ssh root@45.79.152.52
cd /var/www/evolution-api
git pull
docker-compose -f docker-compose.prod.yml up -d --build
```

**O comando faz automaticamente:**

✅ Build da nova imagem Docker
✅ Para container antigo
✅ Inicia novo container
✅ Mantém volumes de dados (instâncias do WhatsApp)

---

## 🏗️ Arquitetura antes vs depois

### ❌ ANTES

```
Servidor (45.79.152.52)
├── PostgreSQL (host:5432)
├── Redis (host:6379)
├── Backend NestJS (Docker)     → network: ai-curation-network
├── Frontend Vue (Docker)        → network: ai-curation-network
└── Evolution API (PM2)          → SEM network Docker ❌
```

**Problemas:**
- Evolution API isolada, não está na rede Docker
- Precisa expor portas públicas
- Difícil comunicação entre serviços
- Deploy manual e propenso a erros

### ✅ DEPOIS

```
Servidor (45.79.152.52)
├── PostgreSQL (host:5432) ← acessível via 172.17.0.1
├── Redis (host:6379)      ← acessível via 172.17.0.1
└── Docker Network: ai-curation-network
    ├── Backend NestJS (api)
    ├── Frontend Vue (ai-curation-web-prod)
    └── Evolution API (evolution-api) ✅
```

**Benefícios:**
- ✅ Todos na mesma rede Docker
- ✅ Comunicação interna via nome: `http://evolution-api:8080`
- ✅ Deploy automatizado e seguro
- ✅ Rollback fácil
- ✅ Logs centralizados
- ✅ Isolamento e limites de recursos

---

## 🔗 Integração com Backend NestJS

### Atualizar URL da Evolution API no backend

Se o backend NestJS precisa chamar a Evolution API, atualize a variável de ambiente:

**No GitHub Secrets do repositório `ai-curation-nest-api`:**

```env
# Antes (chamada externa)
EVOLUTION_API_URL=http://localhost:8080

# Depois (chamada interna na mesma rede Docker)
EVOLUTION_API_URL=http://evolution-api:8080
```

**Vantagens:**
- Comunicação mais rápida (não sai da rede Docker)
- Mais segura (não expõe porta publicamente)
- Não depende de IP externo

---

## 📊 Comandos úteis

### Gerenciamento

```bash
# Ver status
docker ps | grep evolution-api

# Ver logs em tempo real
docker logs -f evolution-api

# Reiniciar
docker restart evolution-api

# Parar
docker stop evolution-api

# Iniciar
docker start evolution-api

# Acessar shell
docker exec -it evolution-api /bin/bash

# Ver recursos (CPU, RAM)
docker stats evolution-api
```

### Rollback

```bash
# Listar backups
docker images | grep evolution-api

# Fazer rollback para backup específico
docker tag evolution-api:backup-20250122-143000 evolution-api:latest
docker-compose -f docker-compose.prod.yml up -d
```

### Backup de dados

```bash
# Backup de instâncias do WhatsApp
docker run --rm -v evolution-api_evolution_instances:/data \
  -v $(pwd):/backup alpine \
  tar czf /backup/instances_backup.tar.gz -C /data .

# Backup do banco de dados
pg_dump -U postgres evolution > evolution_backup_$(date +%Y%m%d).sql
```

---

## ⚠️ Pontos de atenção

### 1. PostgreSQL e Redis precisam aceitar conexões de containers

**PostgreSQL** (`/etc/postgresql/*/main/postgresql.conf`):
```conf
listen_addresses = '*'
```

**PostgreSQL** (`/etc/postgresql/*/main/pg_hba.conf`):
```conf
host all all 172.17.0.0/16 md5
```

**Redis** (`/etc/redis/redis.conf`):
```conf
bind 0.0.0.0
protected-mode no  # OU configure senha
```

Depois:
```bash
sudo systemctl restart postgresql
sudo systemctl restart redis
```

### 2. Network Docker deve existir

```bash
# Verificar
docker network ls | grep ai-curation-network

# Criar se não existir
docker network create ai-curation-network
```

### 3. Firewall (se aplicável)

Certifique-se de que as portas estão abertas:

```bash
# Porta da Evolution API
sudo ufw allow 8080/tcp

# PostgreSQL (apenas para rede Docker)
sudo ufw allow from 172.17.0.0/16 to any port 5432

# Redis (apenas para rede Docker)
sudo ufw allow from 172.17.0.0/16 to any port 6379
```

### 4. Não commitar arquivos sensíveis

```bash
# Adicionar .env.production ao .gitignore
echo ".env.production" >> .gitignore
```

---

## ✅ Checklist de migração

### Antes de começar

- [ ] Fazer backup do banco de dados: `pg_dump -U postgres evolution > backup.sql`
- [ ] Fazer backup das instâncias do WhatsApp: `tar -czf instances_backup.tar.gz ./instances`
- [ ] Fazer backup do `.env` atual: `cp .env .env.backup`
- [ ] Verificar se Docker e Docker Compose estão instalados
- [ ] Verificar se a network `ai-curation-network` existe

### Durante a migração

- [ ] Criar arquivo `.env.production` com variáveis corretas
- [ ] Parar PM2: `pm2 stop evolution-api && pm2 delete evolution-api`
- [ ] Configurar PostgreSQL para aceitar conexões de containers
- [ ] Configurar Redis para aceitar conexões de containers
- [ ] Build e iniciar: `docker-compose -f docker-compose.prod.yml up -d --build`
- [ ] Verificar se o container está rodando: `docker ps | grep evolution-api`
- [ ] Testar API: `curl http://localhost:8080`

### Depois da migração

- [ ] Atualizar `EVOLUTION_API_URL` no backend NestJS (GitHub Secrets)
- [ ] Fazer deploy do backend para usar nova URL
- [ ] Testar comunicação entre containers
- [ ] Configurar backups automáticos
- [ ] Adicionar `.env.production` ao `.gitignore`
- [ ] Deletar processos PM2 antigos: `pm2 delete all && pm2 save`

---

## 🆘 Problemas comuns

### Container não inicia

```bash
# Ver logs de erro
docker logs evolution-api --tail 100
```

### Não conecta no PostgreSQL

```bash
# Testar conexão do container
docker exec -it evolution-api ping 172.17.0.1

# Verificar configuração do PostgreSQL
sudo nano /etc/postgresql/*/main/postgresql.conf
sudo nano /etc/postgresql/*/main/pg_hba.conf
sudo systemctl restart postgresql
```

### Instâncias do WhatsApp perdidas

```bash
# Verificar volume
docker volume inspect evolution-api_evolution_instances

# Restaurar backup
docker run --rm -v evolution-api_evolution_instances:/data \
  -v /tmp:/backup alpine \
  tar xzf /backup/instances_backup.tar.gz -C /data
```

---

## 📚 Documentação completa

Para instruções detalhadas, consulte:

- **`DEPLOY.md`** - Guia completo de deploy, troubleshooting e rollback
- **`.env.production.example`** - Template de variáveis de ambiente

---

## 🎓 Próximos passos (opcional)

1. **GitHub Actions**: Criar workflow para deploy automático (similar ao backend)
2. **Monitoring**: Adicionar Prometheus metrics (já configurado no `.env`)
3. **SSL**: Configurar HTTPS com Let's Encrypt
4. **Nginx Reverse Proxy**: Adicionar nginx na frente para SSL e load balancing

---

**Criado em:** 2025-10-22
**Versão:** 1.0.0
**Autor:** AI Curation Team
