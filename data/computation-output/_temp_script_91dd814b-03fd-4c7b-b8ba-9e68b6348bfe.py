
import sys
import io

# Provide input data via stdin
sys.stdin = io.StringIO("{\"series\":{},\"window\":30,\"method\":\"pearson\"}")

"""
Correlation Map Refresh
Input JSON: { "entities": [{ "id": str, "returns": [float] }] }
Output JSON: { "correlation_matrix": {}, "strongest_pairs": [...], "weakest_pairs": [...], "changed_significantly": [...], "avg_correlation": float }
"""
import json, sys, math

def pearson_corr(x, y):
    """Pearson correlation between two equal-length lists."""
    n = len(x)
    if n < 2:
        return 0.0
    mx = sum(x) / n
    my = sum(y) / n
    cov = sum((x[i] - mx) * (y[i] - my) for i in range(n))
    sx = math.sqrt(sum((v - mx) ** 2 for v in x))
    sy = math.sqrt(sum((v - my) ** 2 for v in y))
    if sx == 0 or sy == 0:
        return 0.0
    return cov / (sx * sy)

def main():
    data = json.loads(sys.stdin.read())
    entities = data.get("entities", [])

    if len(entities) < 2:
        print(json.dumps({"error": "Need at least 2 entities"}))
        return

    # Validate
    ids = []
    returns_map = {}
    min_len = None

    for e in entities:
        eid = str(e.get("id", ""))
        rets = [float(r) for r in e.get("returns", [])]
        if not eid:
            print(json.dumps({"error": "Each entity needs an id"}))
            return
        if len(rets) < 5:
            print(json.dumps({"error": f"Entity {eid} needs at least 5 returns"}))
            return
        ids.append(eid)
        returns_map[eid] = rets
        if min_len is None or len(rets) < min_len:
            min_len = len(rets)

    # Truncate all to min length
    for eid in ids:
        returns_map[eid] = returns_map[eid][-min_len:]

    # Compute full correlation matrix
    n_entities = len(ids)
    matrix = {}
    all_pairs = []

    for i in range(n_entities):
        matrix[ids[i]] = {}
        for j in range(n_entities):
            if i == j:
                matrix[ids[i]][ids[j]] = 1.0
            elif j < i:
                matrix[ids[i]][ids[j]] = matrix[ids[j]][ids[i]]
            else:
                corr = pearson_corr(returns_map[ids[i]], returns_map[ids[j]])
                matrix[ids[i]][ids[j]] = round(corr, 6)
                all_pairs.append({
                    "entity_a": ids[i],
                    "entity_b": ids[j],
                    "correlation": round(corr, 6),
                })

    if not all_pairs:
        print(json.dumps({"error": "No pairs computed"}))
        return

    # Sort pairs
    sorted_by_corr = sorted(all_pairs, key=lambda p: p["correlation"], reverse=True)
    top_n = min(5, len(sorted_by_corr))

    strongest = sorted_by_corr[:top_n]
    weakest = sorted_by_corr[-top_n:]

    # Average correlation
    avg_corr = sum(p["correlation"] for p in all_pairs) / len(all_pairs)

    # Check for significant changes: compare first-half vs second-half correlations
    half = min_len // 2
    changed = []

    if half >= 5:
        for pair in all_pairs:
            a = pair["entity_a"]
            b = pair["entity_b"]
            first_half_corr = pearson_corr(returns_map[a][:half], returns_map[b][:half])
            second_half_corr = pearson_corr(returns_map[a][half:], returns_map[b][half:])
            change = second_half_corr - first_half_corr
            if abs(change) > 0.2:
                changed.append({
                    "entity_a": a,
                    "entity_b": b,
                    "previous_correlation": round(first_half_corr, 6),
                    "current_correlation": round(second_half_corr, 6),
                    "change": round(change, 6),
                })

    print(json.dumps({
        "correlation_matrix": matrix,
        "strongest_pairs": strongest,
        "weakest_pairs": weakest,
        "changed_significantly": changed,
        "avg_correlation": round(avg_corr, 6),
        "num_entities": n_entities,
        "num_pairs": len(all_pairs),
        "data_points_per_entity": min_len,
    }))

if __name__ == "__main__":
    main()

