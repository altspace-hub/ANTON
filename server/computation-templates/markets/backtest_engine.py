"""
Backtest Engine
Input JSON: { "signals": [{ "date_idx": int, "direction": "long"|"short", "confidence": float }], "prices": [float], "initial_capital": float (default 100000) }
Output JSON: { "total_return": float, "sharpe": float, "max_drawdown": float, "win_rate": float, "avg_win": float, "avg_loss": float, "equity_curve": [float], "num_trades": int }
"""
import json, sys, math

def main():
    data = json.loads(sys.stdin.read())
    signals = data.get("signals", [])
    prices = [float(p) for p in data.get("prices", [])]
    initial_capital = float(data.get("initial_capital", 100000))

    if len(prices) < 2:
        print(json.dumps({"error": "Need at least 2 prices"}))
        return

    if len(signals) < 1:
        print(json.dumps({"error": "Need at least 1 signal"}))
        return

    if initial_capital <= 0:
        print(json.dumps({"error": "initial_capital must be positive"}))
        return

    # Sort signals by date_idx
    sorted_signals = sorted(signals, key=lambda s: int(s.get("date_idx", 0)))

    # Simulate trades: enter at signal, exit at next signal or end
    equity = initial_capital
    peak = equity
    max_dd = 0.0
    trades = []
    equity_curve = [equity]

    for i, sig in enumerate(sorted_signals):
        entry_idx = int(sig.get("date_idx", 0))
        direction = sig.get("direction", "long")
        confidence = float(sig.get("confidence", 0.5))

        if entry_idx < 0 or entry_idx >= len(prices):
            continue

        # Exit at next signal's date or end of prices
        if i + 1 < len(sorted_signals):
            exit_idx = int(sorted_signals[i + 1].get("date_idx", len(prices) - 1))
            exit_idx = min(exit_idx, len(prices) - 1)
        else:
            exit_idx = len(prices) - 1

        if exit_idx <= entry_idx:
            continue

        entry_price = prices[entry_idx]
        exit_price = prices[exit_idx]

        if entry_price <= 0:
            continue

        # Position size proportional to confidence (0.5-1.0 of equity)
        position_pct = 0.5 + 0.5 * min(confidence, 1.0)

        if direction == "long":
            pnl_pct = (exit_price - entry_price) / entry_price
        else:
            pnl_pct = (entry_price - exit_price) / entry_price

        trade_pnl = equity * position_pct * pnl_pct
        equity += trade_pnl

        trades.append({
            "entry_idx": entry_idx,
            "exit_idx": exit_idx,
            "direction": direction,
            "pnl_pct": round(pnl_pct, 8),
            "pnl_amount": round(trade_pnl, 2),
        })

        # Track equity curve and drawdown
        equity_curve.append(round(equity, 2))
        if equity > peak:
            peak = equity
        dd = (peak - equity) / peak if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd

    # Trade statistics
    num_trades = len(trades)
    if num_trades == 0:
        print(json.dumps({"error": "No valid trades executed"}))
        return

    wins = [t for t in trades if t["pnl_pct"] > 0]
    losses = [t for t in trades if t["pnl_pct"] < 0]

    win_rate = len(wins) / num_trades
    avg_win = sum(t["pnl_pct"] for t in wins) / len(wins) if wins else 0.0
    avg_loss = sum(t["pnl_pct"] for t in losses) / len(losses) if losses else 0.0

    total_return = (equity - initial_capital) / initial_capital

    # Sharpe ratio from trade returns
    trade_returns = [t["pnl_pct"] for t in trades]
    mean_tr = sum(trade_returns) / len(trade_returns)
    std_tr = math.sqrt(sum((r - mean_tr) ** 2 for r in trade_returns) / max(len(trade_returns) - 1, 1))
    sharpe = (mean_tr / std_tr) * math.sqrt(252 / max(num_trades, 1)) if std_tr > 0 else 0.0

    # Profit factor
    gross_profit = sum(t["pnl_amount"] for t in wins) if wins else 0
    gross_loss = abs(sum(t["pnl_amount"] for t in losses)) if losses else 0
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')

    # Sample equity curve (max 50 points)
    step = max(1, len(equity_curve) // 50)
    sampled = [equity_curve[i] for i in range(0, len(equity_curve), step)]
    if sampled[-1] != equity_curve[-1]:
        sampled.append(equity_curve[-1])

    print(json.dumps({
        "total_return": round(total_return, 6),
        "sharpe": round(sharpe, 4),
        "max_drawdown": round(max_dd, 6),
        "win_rate": round(win_rate, 4),
        "avg_win": round(avg_win, 6),
        "avg_loss": round(avg_loss, 6),
        "equity_curve": sampled,
        "num_trades": num_trades,
        "final_equity": round(equity, 2),
        "initial_capital": initial_capital,
        "profit_factor": round(profit_factor, 4) if profit_factor != float('inf') else None,
        "gross_profit": round(gross_profit, 2),
        "gross_loss": round(gross_loss, 2),
    }))

if __name__ == "__main__":
    main()
