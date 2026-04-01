"""Modal deployment for Neuroscope API (GPU-backed TRIBE v2 inference)."""

import modal

app = modal.App("neuroscope")

vol = modal.Volume.from_name("neuroscope-cache", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "git", "espeak-ng")
    .pip_install(
        "torch==2.4.1",
        "torchvision==0.19.1",
        "torchaudio==2.4.1",
        "numpy",
        "fastapi[standard]",
        "python-multipart",
        "uvicorn",
        "aiofiles",
        "gTTS",
        "langdetect",
        "spacy",
        "huggingface-hub",
        "pydantic",
    )
    .run_commands(
        "python -m spacy download en_core_web_sm",
        "git clone https://github.com/facebookresearch/tribev2.git /opt/tribev2",
        "cd /opt/tribev2 && pip install -e '.[plotting]'",
    )
    .pip_install("uv")
    .add_local_file("api/server.py", "/app/server.py")
)


@app.function(
    image=image,
    gpu="A10G",
    timeout=600,
    scaledown_window=300,
    volumes={"/cache": vol},
    secrets=[modal.Secret.from_name("huggingface-token")],
)
@modal.concurrent(max_inputs=4)
@modal.asgi_app()
def api():
    import os
    import sys

    os.environ["NEUROSCOPE_CACHE_DIR"] = "/cache"
    os.environ["PATH"] = "/usr/local/bin:" + os.environ.get("PATH", "")

    sys.path.insert(0, "/opt/tribev2")
    sys.path.insert(0, "/app")

    from server import app as fastapi_app

    return fastapi_app
