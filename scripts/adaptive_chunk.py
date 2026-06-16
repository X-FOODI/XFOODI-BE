import sys
import os
import json
import re
import numpy as np

# Add adaptive-chunking source directory to sys.path
src_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'adaptive-chunking', 'src'))
sys.path.insert(0, src_path)

from adaptive_chunking.splitters import RecursiveSplitter
from adaptive_chunking.metrics import (
    compute_size_compliance,
    compute_intrachunk_cohesion,
    compute_block_integrity,
    compute_contextual_coherence
)

# Load a lightweight local embedding model
# Hide warnings during import
os.environ["TOKENIZERS_PARALLELISM"] = "false"
try:
    from sentence_transformers import SentenceTransformer
    # Using a small, fast model
    model = SentenceTransformer('all-MiniLM-L6-v2', device='cpu')
except Exception as e:
    sys.stderr.write(f"Error loading SentenceTransformer: {str(e)}\n")
    sys.exit(1)

def get_split_points(text):
    # Find all paragraph breaks or section headers as block boundaries
    split_points = []
    for match in re.finditer(r'\n\n+|\n(?=#)', text):
        split_points.append(match.start())
    return split_points

def main():
    # Read input text
    if len(sys.argv) > 1 and os.path.exists(sys.argv[1]):
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            text = f.read()
    else:
        text = sys.stdin.read()

    if not text.strip():
        print(json.dumps([]))
        return

    # Define chunking strategies to evaluate
    strategies = {
        "recursive_600": RecursiveSplitter(
            chunk_size=600,
            chunk_overlap=50,
            merging="small_only",
            min_chunk_tokens=100
        ),
        "recursive_1100": RecursiveSplitter(
            chunk_size=1100,
            chunk_overlap=100,
            merging="small_only",
            min_chunk_tokens=150
        ),
        "paragraph": "PARAGRAPH"
    }

    results = {}
    split_points = get_split_points(text)

    for name, splitter in strategies.items():
        if splitter == "PARAGRAPH":
            chunks = [p.strip() for p in text.split('\n\n') if p.strip()]
        else:
            chunks = splitter.split_text(text)

        if not chunks:
            continue

        # Evaluate metrics
        sc = compute_size_compliance(chunks, min_tokens=100, max_tokens=1100) or 0.0
        bi = compute_block_integrity(chunks, split_points, text) or 0.0

        try:
            icc = compute_intrachunk_cohesion(
                chunks=chunks,
                full_text=text,
                split_points=split_points,
                model=model
            ) or 0.0
        except Exception:
            icc = 0.0

        try:
            dcc = compute_contextual_coherence(
                chunks=chunks,
                full_text=text,
                model=model
            ) or 0.0
        except Exception:
            dcc = 0.0

        avg_score = (sc + bi + icc + dcc) / 4.0

        results[name] = {
            "chunks": chunks,
            "score": avg_score
        }

    # Select strategy with highest score
    if not results:
        print(json.dumps([]))
        return

    best_strategy = max(results.keys(), key=lambda k: results[k]["score"])
    best_chunks = results[best_strategy]["chunks"]

    # Print only the JSON array of chunks to stdout
    print(json.dumps(best_chunks, ensure_ascii=False))

if __name__ == '__main__':
    main()
