
import sys
import io

# Provide input data via stdin
sys.stdin = io.StringIO("{\"atoms\":[]}")

"""
Atom Decay Calculator
Input JSON: { "atoms": [{ "confidence": float, "age_days": int, "atom_type": str }], "half_life_days": int (default 30) }
Output JSON: { "decayed_atoms": [{ "original_confidence": float, "decayed_confidence": float, "decay_factor": float }], "total_expired": int, "avg_decay": float }
"""
import json, sys, math

def main():
    data = json.loads(sys.stdin.read())
    atoms = data.get("atoms", [])
    half_life = int(data.get("half_life_days", 30))

    if len(atoms) < 1:
        print(json.dumps({"error": "Need at least 1 atom"}))
        return

    if half_life <= 0:
        print(json.dumps({"error": "half_life_days must be positive"}))
        return

    # Decay constant: lambda = ln(2) / half_life
    decay_constant = math.log(2) / half_life

    decayed_atoms = []
    total_expired = 0
    total_decay = 0.0
    by_type = {}

    for atom in atoms:
        confidence = float(atom.get("confidence", 0.5))
        age_days = int(atom.get("age_days", 0))
        atom_type = str(atom.get("atom_type", "unknown"))

        # Exponential decay
        decay_factor = math.exp(-decay_constant * age_days)
        decayed_confidence = confidence * decay_factor

        # Consider expired if decayed below 0.05
        is_expired = decayed_confidence < 0.05
        if is_expired:
            total_expired += 1

        decay_amount = confidence - decayed_confidence
        total_decay += decay_amount

        decayed_atoms.append({
            "original_confidence": round(confidence, 6),
            "decayed_confidence": round(decayed_confidence, 6),
            "decay_factor": round(decay_factor, 6),
            "age_days": age_days,
            "atom_type": atom_type,
            "is_expired": is_expired,
        })

        # Aggregate by type
        if atom_type not in by_type:
            by_type[atom_type] = {"count": 0, "total_original": 0.0, "total_decayed": 0.0, "expired": 0}
        by_type[atom_type]["count"] += 1
        by_type[atom_type]["total_original"] += confidence
        by_type[atom_type]["total_decayed"] += decayed_confidence
        if is_expired:
            by_type[atom_type]["expired"] += 1

    n = len(atoms)
    avg_decay = total_decay / n if n > 0 else 0.0

    # Summary by type
    type_summary = {}
    for atype, stats in by_type.items():
        type_summary[atype] = {
            "count": stats["count"],
            "avg_original": round(stats["total_original"] / stats["count"], 6),
            "avg_decayed": round(stats["total_decayed"] / stats["count"], 6),
            "expired": stats["expired"],
        }

    avg_original = sum(a["original_confidence"] for a in decayed_atoms) / n
    avg_decayed = sum(a["decayed_confidence"] for a in decayed_atoms) / n

    print(json.dumps({
        "decayed_atoms": decayed_atoms,
        "total_expired": total_expired,
        "avg_decay": round(avg_decay, 6),
        "avg_original_confidence": round(avg_original, 6),
        "avg_decayed_confidence": round(avg_decayed, 6),
        "type_summary": type_summary,
        "half_life_days": half_life,
        "total_atoms": n,
        "pct_expired": round(total_expired / n, 4) if n > 0 else 0.0,
    }))

if __name__ == "__main__":
    main()

