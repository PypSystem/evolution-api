# 🚀 Guia de Deploy - Evolution API com Docker

Este guia explica como fazer deploy da Evolution API em produção usando Docker, mantendo compatibilidade com a rede Docker existente (`ai-curation-network`) que já possui o backend NestJS e o frontend Vue.

---

## 📋 Índice

1. [Arquitetura Atual](#-arquitetura-atual)
2. [Pré-requisitos](#-pré-requisitos)
3. [Migração de PM2 para Docker](#-migração-de-pm2-para-docker)
4. [Deploy Inicial](#-deploy-inicial)
5. [Atualizações (Deploy Contínuo)](#-atualizações-deploy-contínuo)
6. [Gerenciamento do Container](#-gerenciamento-do-container)
7. [Rollback](#-rollback)
8. [Troubleshooting](#-troubleshooting)

---

## 🏗️ Arquitetura Atual

### Antes (PM2 no host)
```
Servidor (45.79.152.52)
├── PostgreSQL (host:5432)
├── Redis (host:6379)
├── ai-curation-api (Docker - container: api)
├── ai-curation-web (Docker - container: ai-curation-web-prod)
└── evolution-api (PM2 - processo no host) ❌
```

### Depois (Tudo em Docker)
```
Servidor (45.79.152.52)
├── PostgreSQL (host:5432)
├── Redis (host:6379)
└── Docker Network: ai-curation-network
    ├── ai-curation-api (container: api)
    ├── ai-curation-web (container: ai-curation-web-prod)
    └── evolution-api (container: evolution-api) ✅
```

**Benefícios:**
- ✅ Todas as aplicações no mesmo network Docker
- ✅ Comunicação interna entre containers via nome (ex: `http://evolution-api:8080`)
- ✅ Isolamento e gerenciamento unificado
- ✅ Fácil rollback e versionamento
- ✅ Logs centralizados

---

## ✅ Pré-requisitos

### No servidor de produção

1. **Docker e Docker Compose instalados**
   ```bash
   docker --version
   docker-compose --version
   ```

2. **Network Docker criada** (provavelmente já existe)
   ```bash
   # Verificar se existe
   docker network ls | grep ai-curation-network

   # Se não existir, criar:
   docker network create ai-curation-network
   ```

3. **PostgreSQL e Redis rodando no host**
   ```bash
   # Verificar PostgreSQL
   sudo systemctl status postgresql

   # Verificar Redis
   sudo systemctl status redis
   ```

4. **Banco de dados Evolution criado**
   ```bash
   # Acessar PostgreSQL
   sudo -u postgres psql

   # Criar database se não existir
   CREATE DATABASE evolution;

   # Sair
   \q
   ```

---

## 🔄 Migração de PM2 para Docker

### Passo 1: Backup dos dados atuais

```bash
# Conectar ao servidor
ssh root@45.79.152.52

# Ir para o diretório da Evolution API
cd /var/www/evolution-api  # ou onde estiver instalada

# Fazer backup do banco de dados
pg_dump -U postgres evolution > /tmp/evolution_backup_$(date +%Y%m%d).sql

# Fazer backup dos arquivos de instâncias do WhatsApp (sessions)
tar -czf /tmp/evolution_instances_backup_$(date +%Y%m%d).tar.gz ./instances

# Fazer backup do .env atual
cp .env .env.backup
```

### Passo 2: Parar o PM2

```bash
# Ver processos do PM2
pm2 list

# Parar a Evolution API
pm2 stop evolution-api  # ou o nome que você deu

# Remover do PM2 (opcional - recomendado para evitar conflitos)
pm2 delete evolution-api
pm2 save
```

### Passo 3: Preparar variáveis de ambiente

```bash
# Criar arquivo .env.production baseado no .env.production.example
cd /var/www/evolution-api
cp .env.production.example .env.production

# Editar com suas credenciais reais
nano .env.production
```

**Variáveis IMPORTANTES para configurar:**

```env
# Database - PostgreSQL no host (use 172.17.0.1 para acessar do container)
DATABASE_CONNECTION_URI=postgresql://user:password@172.17.0.1:5432/evolution?schema=evolution_api

# Redis - Redis no host (use 172.17.0.1 para acessar do container)
CACHE_REDIS_URI=redis://172.17.0.1:6379/6

# Chave de API (ALTERE para uma chave segura!)
AUTHENTICATION_API_KEY=sua-chave-api-segura-aqui

# URL do servidor
SERVER_URL=http://45.79.152.52:8080
```

> **⚠️ IMPORTANTE:** Use `172.17.0.1` para acessar PostgreSQL e Redis do container!

---

## 🚀 Deploy Inicial

### Passo 1: Build da imagem Docker

```bash
cd /var/www/evolution-api

# Build da imagem
docker-compose -f docker-compose.prod.yml build
```

### Passo 2: Restaurar dados de instâncias (se tiver backup)

```bash
# Criar volume e copiar dados antigos
docker volume create evolution-api_evolution_instances

# Copiar backup das instâncias para o volume
tar -xzf /tmp/evolution_instances_backup_*.tar.gz -C /var/lib/docker/volumes/evolution-api_evolution_instances/_data/
```

### Passo 3: Iniciar o container

```bash
# Iniciar o container
docker-compose -f docker-compose.prod.yml up -d

# Ver logs em tempo real
docker-compose -f docker-compose.prod.yml logs -f evolution-api
```

### Passo 4: Verificar se está funcionando

```bash
# Verificar se o container está rodando
docker ps | grep evolution-api

# Testar a API
curl http://localhost:8080

# Verificar logs
docker logs evolution-api --tail 100 -f
```

### Passo 5: Atualizar URLs no backend NestJS

Se o backend NestJS estiver chamando a Evolution API, atualize a variável de ambiente:

```bash
# No repositório ai-curation-nest-api
# Atualizar no GitHub Secrets: EVOLUTION_API_URL

# De:
EVOLUTION_API_URL=http://localhost:8080

# Para (se chamando de dentro do Docker):
EVOLUTION_API_URL=http://evolution-api:8080
```

---

## 🔄 Atualizações (Deploy Contínuo)

### Processo manual (substituindo git pull + npm i + build + pm2 restart)

```bash
# 1. Conectar ao servidor
ssh root@45.79.152.52

# 2. Ir para o diretório
cd /var/www/evolution-api

# 3. Fazer pull das mudanças
git pull origin main  # ou sua branch principal

# 4. Rebuild e restart (tudo em um comando)
docker-compose -f docker-compose.prod.yml up -d --build

# 5. Ver logs
docker logs -f evolution-api
```

**O que o comando faz:**
- ✅ Faz build da nova imagem
- ✅ Para o container antigo automaticamente
- ✅ Inicia o novo container
- ✅ Mantém os volumes de dados (instâncias do WhatsApp)

---

## 🔧 Gerenciamento do Container

### Comandos úteis

```bash
# Ver status
docker ps | grep evolution-api

# Ver logs em tempo real
docker logs -f evolution-api

# Ver logs das últimas 100 linhas
docker logs evolution-api --tail 100

# Reiniciar container
docker restart evolution-api

# Parar container
docker stop evolution-api

# Iniciar container
docker start evolution-api

# Acessar shell do container
docker exec -it evolution-api /bin/bash

# Ver uso de recursos
docker stats evolution-api

# Inspecionar container
docker inspect evolution-api
```

### Gerenciar volumes

```bash
# Listar volumes
docker volume ls | grep evolution

# Inspecionar volume
docker volume inspect evolution-api_evolution_instances

# Backup de volume
docker run --rm -v evolution-api_evolution_instances:/data -v $(pwd):/backup alpine tar czf /backup/evolution_instances_backup.tar.gz -C /data .

# Restaurar volume
docker run --rm -v evolution-api_evolution_instances:/data -v $(pwd):/backup alpine tar xzf /backup/evolution_instances_backup.tar.gz -C /data
```

---

## ⏮️ Rollback

### Rollback rápido usando imagem de backup

```bash
# 1. Listar imagens de backup
docker images | grep evolution-api

# 2. Parar container atual
docker-compose -f docker-compose.prod.yml down

# 3. Fazer tag da imagem de backup como latest
docker tag evolution-api:backup-20250122-143000 evolution-api:latest

# 4. Iniciar com a imagem antiga
docker-compose -f docker-compose.prod.yml up -d

# 5. Verificar
docker logs -f evolution-api
```

### Rollback completo (código + container)

```bash
# 1. Rollback do código
git log --oneline -5  # ver commits recentes
git reset --hard <commit-hash>

# 2. Rebuild e restart
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## 🐛 Troubleshooting

### Container não inicia

```bash
# Ver logs completos
docker logs evolution-api

# Verificar se as portas estão disponíveis
sudo netstat -tlnp | grep 8080

# Verificar configuração do docker-compose
docker-compose -f docker-compose.prod.yml config
```

### Não conecta no PostgreSQL

```bash
# Testar conexão do container para o host
docker exec -it evolution-api ping 172.17.0.1

# Verificar se PostgreSQL está aceitando conexões externas
sudo nano /etc/postgresql/*/main/postgresql.conf
# listen_addresses = '*'

sudo nano /etc/postgresql/*/main/pg_hba.conf
# Adicionar: host all all 172.17.0.0/16 md5

sudo systemctl restart postgresql
```

### Não conecta no Redis

```bash
# Testar conexão do container para o Redis
docker exec -it evolution-api redis-cli -h 172.17.0.1 ping

# Verificar se Redis está aceitando conexões externas
sudo nano /etc/redis/redis.conf
# bind 0.0.0.0
# protected-mode no

sudo systemctl restart redis
```

### Instâncias do WhatsApp perdidas

```bash
# Verificar se o volume está montado
docker inspect evolution-api | grep -A 10 Mounts

# Restaurar backup
docker run --rm -v evolution-api_evolution_instances:/data -v /tmp:/backup alpine tar xzf /backup/evolution_instances_backup_*.tar.gz -C /data

# Reiniciar container
docker restart evolution-api
```

### Container consumindo muita memória

```bash
# Ver uso de recursos
docker stats evolution-api

# Ajustar limites no docker-compose.prod.yml
# deploy.resources.limits.memory: 2G -> 1G

# Reiniciar
docker-compose -f docker-compose.prod.yml up -d
```

### Network não encontrada

```bash
# Criar network se não existir
docker network create ai-curation-network

# Verificar se os outros containers estão na mesma network
docker network inspect ai-curation-network
```

---

## 📊 Comparação: PM2 vs Docker

| Aspecto | PM2 (Antes) | Docker (Depois) |
|---------|-------------|-----------------|
| **Deploy** | `git pull && npm i && npm run build && pm2 restart` | `git pull && docker-compose -f docker-compose.prod.yml up -d --build` |
| **Logs** | `pm2 logs evolution-api` | `docker logs evolution-api` |
| **Restart** | `pm2 restart evolution-api` | `docker restart evolution-api` |
| **Status** | `pm2 status` | `docker ps` |
| **Isolamento** | ❌ Processo no host | ✅ Container isolado |
| **Network** | ❌ Não integrado | ✅ `ai-curation-network` |
| **Rollback** | ⚠️ Manual (git revert) | ✅ Tag de imagens |
| **Resources** | ⚠️ Sem limite | ✅ CPU e RAM limitados |

---

## 🔐 Segurança

### Checklist de segurança

- [ ] `.env.production` não está no Git (adicione ao `.gitignore`)
- [ ] `AUTHENTICATION_API_KEY` é uma chave forte e única
- [ ] PostgreSQL só aceita conexões de `172.17.0.0/16`
- [ ] Redis tem `protected-mode` habilitado ou senha configurada
- [ ] Firewall está configurado (portas 8080, 5432, 6379)
- [ ] Backups automáticos do banco de dados estão configurados

---

## 📝 Notas Adicionais

### Integração com backend NestJS

Se o backend NestJS precisar chamar a Evolution API:

**De fora do Docker:**
```env
EVOLUTION_API_URL=http://45.79.152.52:8080
```

**De dentro do Docker (mesma network):**
```env
EVOLUTION_API_URL=http://evolution-api:8080
```

### GitHub Actions (Opcional)

Para automatizar o deploy via GitHub Actions (similar ao backend NestJS), veja o arquivo `.github/workflows/deploy-example.yml` (não incluído, mas pode ser criado).

---

## 📞 Suporte

Em caso de problemas:

1. Verificar logs: `docker logs evolution-api --tail 100 -f`
2. Verificar saúde: `docker inspect evolution-api --format='{{.State.Health.Status}}'`
3. Verificar network: `docker network inspect ai-curation-network`
4. Consultar documentação oficial: https://doc.evolution-api.com/

---

**Última atualização:** 2025-10-22
**Versão:** 1.0.0
