# Entregable 2 — Despliegue de la IA local (Ollama + FastAPI)

Modelo LLM servido localmente desde Ollama en Docker, expuesto mediante un
backend FastAPI que responde por HTTP. Preparado para una instancia EC2 sin GPU
(Ubuntu 26.04, 2 vCPU, 3.7 GB RAM).

## Arquitectura

```
Cliente (curl / navegador / app)
        |
        v
 nginx :80  --->  FastAPI (ia-backend) :8000  --->  Ollama :11434 (Docker)
                  /api/*  (proxy)                    modelo llama3.2:latest
                                                     volumen ollama_storage
```

| Componente | Detalle |
|---|---|
| Modelo | `llama3.2:latest` (3.2B, Q4_K_M, ~2.0 GB) |
| Inferencia | Ollama `ollama/ollama:latest` en contenedor `ollama`, `restart: unless-stopped` |
| Persistencia | Volumen Docker `ollama_storage` montado en `/root/.ollama` |
| Backend | FastAPI + uvicorn, servicio systemd `ia-backend`, puerto 8000 |
| Proxy | nginx `location /api/` → `127.0.0.1:8000/` |

## Estructura del proyecto

```
/home/ubuntu/ia-backend/
├── app/
│   ├── __init__.py
│   └── main.py               # API: /, /health, /models, /chat
├── scripts/
│   ├── smoke_test.sh         # prueba de humo de todos los endpoints
│   └── demo_client.py        # cliente CLI de ejemplo
├── ia-backend.service        # unidad systemd
├── nginx-ia-api.conf         # snippet de proxy para nginx
└── requirements.txt          # dependencias congeladas
```

El compose de Ollama queda en `/home/ubuntu/ollama/docker-compose.yml`.

## Puesta en marcha desde cero

```bash
# 1. Ollama en Docker con volumen persistente
mkdir -p ~/ollama && cd ~/ollama
cat > docker-compose.yml <<'YAML'
services:
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ollama_storage:/root/.ollama

volumes:
  ollama_storage:
    name: ollama_storage
YAML
sudo docker compose up -d
sudo docker exec -it ollama ollama pull llama3.2

# 2. Backend
sudo apt-get install -y python3-venv python3-pip
cd ~/ia-backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 3. Servicio systemd
sudo cp ia-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ia-backend

# 4. Proxy nginx (opcional, para publicar en :80/api)
sudo cp nginx-ia-api.conf /etc/nginx/snippets/ia-api.conf
sudo sed -i '/root \/var\/www\/html;/a\	include snippets/ia-api.conf;' /etc/nginx/sites-available/default
sudo nginx -t && sudo systemctl reload nginx
```

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Info del servicio y configuración |
| GET | `/health` | Estado del backend + modelos disponibles en Ollama |
| GET | `/models` | Modelos instalados (proxy de `/api/tags` de Ollama) |
| POST | `/chat` | Envía `{"message": "...", "temperature": 0.7}` y devuelve la respuesta del modelo |
| GET | `/docs` | Swagger UI (directo en `:8000/docs`) |

### Ejemplos

```bash
# Estado
curl -s http://localhost:8000/health

# Chat (a través de nginx)
curl -s -X POST http://localhost/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Explica qué es Docker en una frase."}'

# Chat (directo al backend)
curl -s -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Hola"}'

# API nativa de Ollama
curl -s http://localhost:11434/api/tags
```

Respuesta de `/chat`:

```json
{
  "model": "llama3.2:latest",
  "reply": "Docker es una tecnología que permite...",
  "elapsed_ms": 38609,
  "total_duration_ms": 38592,
  "eval_count": 59
}
```

Cliente CLI de ejemplo:

```bash
python3 scripts/demo_client.py "¿Qué es un contenedor?"
```

## Evidencias de la checklist

| Ítem | Cómo se verificó |
|---|---|
| Ollama en Docker | `sudo docker ps` → contenedor `ollama` con `0.0.0.0:11434->11434/tcp` |
| Modelo adecuado a los recursos | `llama3.2:latest` (3.2B Q4, ~2 GB) funciona en 3.7 GB RAM / 2 vCPU |
| Volúmenes persistentes | `sudo docker inspect ollama` → volumen `ollama_storage` en `/root/.ollama`; tras `docker restart ollama` el modelo sigue disponible |
| API de Ollama | `curl localhost:11434/api/tags` y `POST /api/chat` |
| Backend FastAPI conectado | `ia-backend` activo; `/chat` devuelve texto generado por el modelo |
| Entregable: modelo respondiendo desde la API | `POST http://<host>/api/chat` responde con `reply` del modelo |

## Operación

```bash
sudo systemctl status ia-backend     # estado del backend
sudo journalctl -u ia-backend -f     # logs en vivo
sudo systemctl restart ia-backend    # reinicio
sudo docker logs -f ollama           # logs del modelo
sudo docker compose -f ~/ollama/docker-compose.yml up -d   # levantar Ollama
```

## Notas

- **Rendimiento**: sin GPU, con 2 vCPU, la generación ronda 1.5–3 tokens/s
  (21 s en frío para 2 tokens; 38 s para 59 tokens). Para respuestas más ágiles
  considerar `llama3.2:1b`, que ocupa menos RAM y genera más rápido.
- **Seguridad**: la instancia expone 80, 8000 y 11434. Para producción conviene
  cerrar 8000/11434 en el Security Group y dejar solo 80 detrás de nginx
  (idealmente con TLS).
- **Concurrencia**: con 3.7 GB RAM, una sola inferencia a la vez es lo
  recomendable; el modelo 1B da más margen si se esperan peticiones simultáneas.

## Chatbot web (frontend)

`frontend/` contiene una interfaz simple (HTML/CSS/JS sin dependencias) que nginx sirve en `/`
y que llama a `/api/chat` (FastAPI → Ollama). `/chat` acepta `history` para mantener contexto.

Despliegue en la EC2:

```bash
git clone https://github.com/Piewp1/ia-chatbot.git ~/ia-chatbot   # primera vez
cd ~/ia-chatbot && git pull && ./deploy.sh
```
