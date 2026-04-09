# Schedge
 
> An AI-powered academic advising chatbot that helps university students with course planning, schedule building, and degree requirement tracking.
 
---
 
## Table of Contents
 
- [Description](#description)
- [Platform & Requirements](#platform--requirements)
- [Installation & Setup](#installation--setup)
- [Ollama Setup](#ollama-setup)
- [Cloudflare Tunnel Setup](#cloudflare-tunnel-setup)
- [Running the Application](#running-the-application)
- [Contributing](#contributing)
- [Authors](#authors)
- [License](#license)
- [Support](#support)
 
---
 
## Description
 
Academic advising is critical in guiding students through their degree requirements, but the process is often inefficient. Simple questions — like which courses to take next — can require students to wait in long lines or schedule appointments weeks in advance.
 
Schedge addresses this problem by providing a chatbot system that assists students with course planning and schedule advising. By uploading your degree audit, you receive AI-powered recommendations on what classes to take next, when to take them, and how they fit into your overall academic plan.
 
The software is designed primarily for college students, but it also benefits academic advisors by automating routine planning tasks — freeing them to focus on deeper, more personalized guidance. Key features include:
 
- Accessible, user-friendly interface
- Integration with degree audit data
- AI-driven course selection and scheduling logic
- Schedule builder with prerequisite tracking
- Multi-semester academic planning
 
---
 
## Platform & Requirements
 
**Runs on:** Linux, macOS, Windows (via Docker)
 
### Prerequisites
 
| Dependency | Version | Notes |
|---|---|---|
| Docker | 20.10+ | Required for containerized deployment |
| Docker Compose | 2.0+ | For multi-service orchestration |
| Node.js | 18+ | Frontend (React/TypeScript) |
| Python | 3.10+ | Backend (FastAPI) |
| PostgreSQL | 14+ | Database (included in Docker Compose) |
 
### Extra Libraries
 
**Backend (Python):**
- `fastapi` — REST API framework
- `uvicorn` — ASGI server
- `sqlalchemy` — ORM and database access
- `psycopg2-binary` — PostgreSQL adapter
- `pydantic` — Data validation
- `beautifulsoup4` — Course web scraping
- `requests` — HTTP client
 
**Frontend (Node.js):**
- `react` + `react-dom` — UI framework
- `typescript` — Type safety
- All dependencies listed in `package.json`
 
---
 
## Installation & Setup
 
### 1. Clone the Repository
 
```bash
git clone https://gitlab.com/your-group/schedge.git
cd schedge
```
 
### 2. Configure Environment Variables
 
Copy the example environment file and fill in your values:
 
```bash
cp .env.example .env
```
 
Edit `.env` with your configuration:
 
```env
# Database
DATABASE_URL=postgresql://schedge_user:your_password@db:5432/schedge_db
POSTGRES_USER=schedge_user
POSTGRES_PASSWORD=your_password
POSTGRES_DB=schedge_db
 
# Backend
BACKEND_PORT=8000
 
# Frontend
REACT_APP_API_URL=http://localhost:8000
```
 
### 3. Build the Docker Image
 
```bash
docker compose build
```
 
> **Note:** Any code changes require a full image rebuild. Run `docker compose build` again after modifying source files.
 
---
 
## Ollama Setup
 
Schedge uses [Ollama](https://ollama.com) to run the `gemma3n` language model locally. Ollama must be installed and running on the **host machine** (not inside Docker) so the backend container can reach it at `http://localhost:11434`.
 
### 1. Install Ollama
 
**Linux / macOS:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
```
 
**Windows:** Download the installer from [https://ollama.com/download](https://ollama.com/download).
 
### 2. Pull the Model
 
```bash
ollama pull gemma3n:latest
```
 
This downloads the model (~3–4 GB). Only needs to be done once.
 
### 3. Start the Ollama Server
 
```bash
ollama serve
```
 
Ollama will listen on `http://localhost:11434` by default. Leave this running in a separate terminal while the application is active.
 
### 4. Verify It's Working
 
```bash
curl http://localhost:11434/api/tags
```
 
You should see `gemma3n:latest` listed in the response.
 
> **Docker note:** Because Ollama runs on the host and the backend runs inside Docker, the backend must reach Ollama via `host.docker.internal` on macOS/Windows, or the host's bridge IP (`172.17.0.1`) on Linux. Ensure your `docker-compose.yml` or backend config sets the Ollama base URL accordingly (e.g., `OLLAMA_BASE_URL=http://host.docker.internal:11434`).
 
---
 
## Cloudflare Tunnel Setup
 
The Next.js frontend runs on port `3000` and is exposed publicly via a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), allowing access from outside your local network without opening firewall ports.
 
### 1. Install `cloudflared`
 
**Linux:**
```bash
wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```
 
**macOS:**
```bash
brew install cloudflared
```
 
**Windows:** Download from [https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
 
### 2. Authenticate
 
```bash
cloudflared tunnel login
```
 
This opens a browser window to authorize with your Cloudflare account.
 
### 3. Create a Tunnel
 
```bash
cloudflared tunnel create schedge
```
 
Note the tunnel ID printed in the output — you'll need it in the next step.
 
### 4. Configure the Tunnel
 
Create `~/.cloudflared/config.yml`:
 
```yaml
tunnel: <your-tunnel-id>
credentials-file: /root/.cloudflared/<your-tunnel-id>.json
 
ingress:
 - hostname: your-domain.example.com
   service: http://localhost:3000
 - service: http_status:404
```
 
Replace `your-domain.example.com` with the domain or subdomain you've configured in Cloudflare DNS.
 
### 5. Start the Tunnel
 
```bash
cloudflared tunnel run schedge
```
 
The frontend will now be publicly accessible at your configured domain. The tunnel does **not** need to be restarted when you rebuild the Docker container — only restart it if the host machine reboots or the tunnel process stops.
 
### Architecture Overview
 
```
Browser (public)
   ↓ HTTPS
Cloudflare Edge
   ↓
cloudflared tunnel (host machine)
   ↓ http://localhost:3000
Next.js Frontend (host machine, port 3000)
   ↓ HTTP
Docker Container (FastAPI backend + PostgreSQL)
```
 
---
 
## Running the Application
 
### Start All Services
 
```bash
docker compose up -d
```
 
This starts:
- **PostgreSQL** database on port `5432`
- **FastAPI** backend on port `8000`
- **Next.js** frontend on port `3000`
 
### Access the App
 
Open your browser and navigate to:
 
```
http://localhost:3000
```
 
The API documentation (Swagger UI) is available at:
 
```
http://localhost:8000/docs
```
 
### Stop the Application
 
```bash
docker compose down
```
 
### View Logs
 
```bash
# All services
docker compose logs -f
 
# Specific service
docker compose logs -f backend
docker compose logs -f frontend
```
 
### Rebuild After Code Changes
 
```bash
docker compose down
docker compose build
docker compose up -d
```
 
---
 
## Contributing
 
We welcome contributions! To get started:
 
1. **Fork** the repository and create a feature branch:
  ```bash
  git checkout -b feature/your-feature-name
  ```
 
2. **Set up** your development environment following the [Installation](#installation--setup) steps above.
 
3. **Make your changes.** Ensure your code is:
  - Professionally commented
  - Consistent with the existing style
  - Tested where applicable
 
4. **Run linting** before submitting:
  ```bash
  # Backend
  cd backend && flake8 .
 
  # Frontend
  cd frontend && npm run lint
  ```
 
5. **Submit a merge request** with a clear description of what you changed and why.
 
Please open an issue first for significant changes so the team can discuss the approach before implementation.
 
---
 
## Authors
 
- **Abdulahad Asim**
- **Valentin Motta De Castro**
- **Iran Paz Ocando**
- **Patrick Schlegel**
 
---
 
## License
 
This project is licensed under the **MIT License**.
 
```
MIT License
 
Copyright (c) 2024 Schedge Contributors
 
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
 
---
 
## Support
 
For questions or support, contact **Patrick Schlegel** at [u1289242@utah.edu](mailto:u1289242@utah.edu).
 
For bugs or feature requests, open an issue in the GitLab repository.

