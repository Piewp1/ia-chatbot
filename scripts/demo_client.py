#!/usr/bin/env python3
"""Small CLI client to talk to the local IA API.

Usage:
    python demo_client.py "Tu pregunta"
    python demo_client.py --url http://127.0.0.1:8000 "Tu pregunta"
"""

import argparse
import json
import sys
import urllib.request


def post_json(url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read())


def main() -> int:
    parser = argparse.ArgumentParser(description="Cliente de la IA local")
    parser.add_argument("question", nargs="*", help="Pregunta a enviar al modelo")
    parser.add_argument("--url", default="http://127.0.0.1:8000", help="Base URL de la API")
    args = parser.parse_args()

    question = " ".join(args.question) or "Preséntate en una frase."
    result = post_json(f"{args.url}/chat", {"message": question})

    print(f"modelo: {result['model']}")
    print(f"latencia: {result['elapsed_ms']} ms")
    print("-" * 60)
    print(result["reply"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
