# Neuroscope

**See how any media lights up the brain.**

Neuroscope is an open-source web app that lets you upload any video, audio, or text and visualize predicted brain activity in an interactive 3D viewer — powered by Meta's [TRIBE v2](https://github.com/facebookresearch/tribev2) foundation model.

## Live Demo

**https://neuroscanner.vercel.app**

Try it now — no install required:

1. Open the link above
2. Click **"Load Demo Visualization"** to see pre-computed brain activity instantly
3. Click **"Text"**, type any sentence, and click **"Analyze Text"** to run real TRIBE v2 inference
4. Use **"Open / Closed"** buttons to split the brain hemispheres like a book
5. Drag to rotate, scroll to zoom the 3D brain

> **First-request caveat:** The GPU backend runs on [Modal](https://modal.com) and scales to zero when idle. The very first request after inactivity triggers a cold start (~2-3 minutes) while the container boots and loads ~10 GB of model weights. If your first request fails or times out, **simply try again** — the second attempt will succeed and subsequent requests will be fast while the container stays warm (5-minute idle window).

---

## How it works

1. Upload a video, audio file, or type text
2. TRIBE v2 predicts fMRI brain activity across ~20,000 cortical vertices
3. A 3D brain viewer shows activation patterns in real-time with a timeline scrubber
4. A region breakdown panel shows which brain networks are most active

## Architecture

```
Neuroscope/
├── web/          # Next.js frontend (Three.js 3D brain viewer)
├── api/          # FastAPI backend (TRIBE v2 inference)
└── README.md
```

- **Frontend**: Next.js 16, Three.js via @react-three/fiber, TailwindCSS
- **Backend**: FastAPI serving TRIBE v2 on GPU
- **Brain mesh**: fsaverage5 cortical surface (~20k vertices, exported from nilearn)

---

## VM Setup (Full Guide)

This guide covers setting up Neuroscope from scratch on a fresh Ubuntu VM with an NVIDIA GPU.

### Prerequisites

| Requirement | Minimum |
|---|---|
| OS | Ubuntu 22.04 or 24.04 LTS |
| GPU | NVIDIA with >= 16 GB VRAM (e.g. A10, A100, RTX 4090) |
| CUDA | Drivers installed and `nvidia-smi` working |
| RAM | 16 GB system RAM |
| Disk | 30 GB free (model weights are ~10 GB) |

### 1. Install system dependencies

```bash
sudo apt update && sudo apt install -y \
  git curl wget build-essential \
  ffmpeg \
  python3 python3-pip python3-venv
```

Install Node.js 20+ (via NodeSource):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Install `uv` (needed for WhisperX audio transcription):

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
# Ensure ~/.local/bin is in your PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### 2. Clone the repository

```bash
cd ~
git clone <your-repo-url> neuroscope
cd neuroscope
```

### 3. Set up the backend (API)

#### Create Python virtual environment

```bash
cd ~/neuroscope/api
python3 -m venv venv
source venv/bin/activate
```

#### Install Python dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

#### Install PyTorch with CUDA

Choose the correct command for your CUDA version from https://pytorch.org/get-started/locally/. Example for CUDA 12.x:

```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
```

#### Install TRIBE v2

```bash
cd ~/neuroscope
git clone https://github.com/facebookresearch/tribev2.git
cd tribev2
pip install -e ".[plotting]"
cd ..
```

#### Install additional Python packages

These are required by TRIBE v2's text/audio processing pipeline:

```bash
pip install gTTS langdetect spacy numpy
python -m spacy download en_core_web_sm
```

#### Configure HuggingFace token

TRIBE v2 uses LLaMA 3.2-3B (a gated model). You need a HuggingFace token with access granted:

1. Go to https://huggingface.co/meta-llama/Llama-3.2-3B and request access
2. Create a token at https://huggingface.co/settings/tokens
3. Log in on the VM:

```bash
pip install huggingface-hub
huggingface-cli login
# Paste your token when prompted
```

Or set the environment variable:

```bash
export HF_TOKEN="hf_your_token_here"
```

#### Verify GPU access

```bash
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}, Devices: {torch.cuda.device_count()}')"
```

### 4. Set up the frontend

```bash
cd ~/neuroscope/web
npm install
```

#### Generate brain mesh data

The frontend needs `web/public/data/brain_mesh.json` (fsaverage5 cortical surface). Generate it with:

```bash
source ~/neuroscope/api/venv/bin/activate
python3 - << 'MESHSCRIPT'
import json
import numpy as np
from nilearn import datasets, surface

fsaverage = datasets.fetch_surf_fsaverage("fsaverage5")
lh_coords, lh_faces = surface.load_surf_mesh(fsaverage["pial_left"])
rh_coords, rh_faces = surface.load_surf_mesh(fsaverage["pial_right"])

n_left = len(lh_coords)
vertices = np.vstack([lh_coords, rh_coords])
faces = np.vstack([lh_faces, rh_faces + n_left])

mesh = {
    "vertices": vertices.flatten().tolist(),
    "faces": faces.flatten().tolist(),
    "n_vertices": len(vertices),
    "n_left": n_left,
}

with open("web/public/data/brain_mesh.json", "w") as f:
    json.dump(mesh, f)

print(f"Wrote brain_mesh.json: {len(vertices)} vertices, {len(faces)} faces, n_left={n_left}")
MESHSCRIPT
```

If `nilearn` is not installed: `pip install nilearn`.

#### Generate demo predictions (optional)

This creates mock data so the "Load Demo Visualization" button works without the GPU model:

```bash
python3 - << 'DEMOSCRIPT'
import json, random
n_vertices = 20484
n_timesteps = 36
preds = [[round(random.random(), 4) for _ in range(n_vertices)] for _ in range(n_timesteps)]
with open("web/public/data/mock_predictions.json", "w") as f:
    json.dump({"predictions": preds, "n_timesteps": n_timesteps, "n_vertices": n_vertices, "fps": 1}, f)
print(f"Wrote mock_predictions.json: {n_timesteps} frames x {n_vertices} vertices")
DEMOSCRIPT
```

#### Build the production frontend

```bash
cd ~/neuroscope/web
npx next build
```

### 5. Open firewall ports

The frontend runs on port **80** and the API on port **8000**.

#### iptables (on the VM)

```bash
sudo iptables -I INPUT 1 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 1 -p tcp --dport 8000 -j ACCEPT

# Persist across reboots
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

#### Cloud provider security rules

Also open TCP ports **80** and **8000** in your cloud provider's security list / firewall rules (e.g. OCI Security Lists, AWS Security Groups, GCP Firewall Rules).

### 6. Start the application

#### Start the backend API

```bash
cd ~/neuroscope/api
source venv/bin/activate
export HF_TOKEN="hf_your_token_here"

# Run in background
nohup python server.py > ~/neuroscope/api.log 2>&1 &
```

The first request will take ~60 seconds as the TRIBE v2 model loads into GPU memory. Subsequent requests are fast.

#### Start the frontend

```bash
cd ~/neuroscope/web

# Production (port 80, requires sudo)
sudo npx next start -p 80 > ~/neuroscope/web.log 2>&1 &

# Or development mode (port 3000, no sudo)
npm run dev
```

#### Verify

```bash
# Backend health check
curl http://localhost:8000/api/health

# Frontend
curl -s -o /dev/null -w '%{http_code}' http://localhost:80
```

Visit `http://<your-vm-ip>` in a browser.

---

## Development (Local)

### Frontend only (no GPU needed)

```bash
cd web
npm install
npm run dev
```

The 3D brain viewer and demo visualization work without the backend. Open http://localhost:3000.

### Backend (requires NVIDIA GPU)

```bash
cd api
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# ... install torch, tribev2, etc. (see steps 3 above)
python server.py
```

The API starts on http://localhost:8000. The frontend proxies `/api/*` requests to it via `next.config.ts` rewrites.

---

## Configuration

| Setting | Location | Description |
|---|---|---|
| API URL | `NEXT_PUBLIC_API_URL` env var | Set to Modal URL for cloud deploy; omit for on-prem (defaults to `hostname:8000`) |
| API proxy | `web/next.config.ts` | `/api/*` → `localhost:8000` (dev mode only) |
| GPU device | `api/server.py` | Auto-selects CUDA; uses `cuda:1` when multiple GPUs present |
| Model cache | `api/server.py` | Weights cached in `../cache/` relative to `api/` |
| CORS | `api/server.py` | Allows all origins by default |

---

## Troubleshooting

### Model fails with `GatedRepoError`
You need a HuggingFace token with LLaMA 3.2-3B access. Run `huggingface-cli login` or set `HF_TOKEN`.

### `Language not supported: so`
The `langdetect` library misidentifies short English text. The server monkey-patches this to always return `"en"`. Ensure you're running the latest `server.py`.

### File upload fails / times out
- Check that port 8000 is open in both iptables and your cloud provider's security rules.
- For large files, the upload uses XHR with progress. The proxy timeout is 5 minutes.

### `ImportError: cannot import name 'TribeModel' from 'tribev2'`
The correct import path is `from tribev2.demo_utils import TribeModel`. Ensure tribev2 is installed in editable mode (`pip install -e ".[plotting]"`).

### CUDA out of memory
TRIBE v2 needs ~14-16 GB VRAM. Close other GPU processes or use a larger GPU. Check with `nvidia-smi`.

---

## License

This application code is licensed under the [MIT License](LICENSE).

**Note:** The TRIBE v2 model weights are licensed under [CC-BY-NC-4.0](https://creativecommons.org/licenses/by-nc/4.0/) by Meta Platforms, Inc. See the [TRIBE v2 repository](https://github.com/facebookresearch/tribev2) for details.

## Acknowledgements

- [TRIBE v2](https://github.com/facebookresearch/tribev2) by Meta FAIR
- Brain mesh from [FreeSurfer](https://surfer.nmr.mgh.harvard.edu/) fsaverage5 via [nilearn](https://nilearn.github.io/)
