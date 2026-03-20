"""
Fundamental Trends Calculator
Analyzes multi-period financial data for trend detection.
Input: Array of period data (quarterly or annual) with revenue, margins, debt, etc.
Output: CAGR, margin trajectories, debt trajectory, earnings quality flags.
"""
import json
import sys
import math

def main():
    data = json.loads(sys.stdin.read())
    periods = data.get('periods', [])

    if len(periods) < 2:
        print(json.dumps({"error": "Need at least 2 periods for trend analysis", "trends": {}}))
        return

    # Sort by date (most recent first)
    periods.sort(key=lambda p: p.get('calendarYear', '') + p.get('period', ''), reverse=True)

    results = {}

    # Revenue trend
    revenues = [float(p.get('revenue', 0)) for p in periods if p.get('revenue')]
    if len(revenues) >= 2:
        latest = revenues[0]
        oldest = revenues[-1]
        years = len(revenues) - 1
        if oldest > 0 and years > 0:
            cagr = (latest / oldest) ** (1.0 / years) - 1
            results['revenue_cagr'] = round(cagr * 100, 2)

        # Recent vs historical growth
        if len(revenues) >= 3:
            recent_growth = (revenues[0] - revenues[1]) / revenues[1] if revenues[1] != 0 else 0
            older_growth = (revenues[1] - revenues[2]) / revenues[2] if revenues[2] != 0 else 0
            results['revenue_acceleration'] = round((recent_growth - older_growth) * 100, 2)
            results['revenue_accelerating'] = recent_growth > older_growth

    # Margin trends
    for margin_key in ['grossProfitMargin', 'operatingIncomeRatio', 'netIncomeRatio']:
        margins = [float(p.get(margin_key, 0)) for p in periods if p.get(margin_key) is not None]
        if len(margins) >= 2:
            slope = (margins[0] - margins[-1]) / len(margins)
            direction = 'expanding' if slope > 0.005 else 'contracting' if slope < -0.005 else 'stable'
            results[f'{margin_key}_trend'] = direction
            results[f'{margin_key}_latest'] = round(margins[0] * 100, 2)
            results[f'{margin_key}_change'] = round((margins[0] - margins[-1]) * 100, 2)

    # Debt trajectory
    debt_ratios = [float(p.get('debtToEquityRatio', p.get('totalDebt', 0) / max(p.get('totalEquity', 1), 1)))
                   for p in periods if p.get('debtToEquityRatio') or p.get('totalDebt')]
    if len(debt_ratios) >= 2:
        results['debt_equity_latest'] = round(debt_ratios[0], 3)
        results['debt_equity_trend'] = 'improving' if debt_ratios[0] < debt_ratios[-1] else 'deteriorating' if debt_ratios[0] > debt_ratios[-1] else 'stable'

    # FCF trajectory
    fcfs = [float(p.get('freeCashFlow', 0)) for p in periods if p.get('freeCashFlow')]
    if len(fcfs) >= 2:
        results['fcf_latest'] = fcfs[0]
        results['fcf_trend'] = 'improving' if fcfs[0] > fcfs[-1] else 'deteriorating'
        results['fcf_positive'] = fcfs[0] > 0

    # Earnings quality flag
    net_incomes = [float(p.get('netIncome', 0)) for p in periods if p.get('netIncome')]
    if len(net_incomes) >= 2 and len(fcfs) >= 2:
        ni_growth = (net_incomes[0] - net_incomes[-1]) / abs(net_incomes[-1]) if net_incomes[-1] != 0 else 0
        fcf_growth = (fcfs[0] - fcfs[-1]) / abs(fcfs[-1]) if fcfs[-1] != 0 else 0
        results['earnings_quality_warning'] = ni_growth > 0.1 and fcf_growth < 0
        results['earnings_quality_note'] = 'Net income growing but cash flow declining — potential quality issue' if results['earnings_quality_warning'] else 'Earnings quality appears sound'

    # Red flags
    red_flags = []
    if results.get('grossProfitMargin_trend') == 'contracting':
        red_flags.append('Gross margin contraction — competitive pressure or cost inflation')
    if results.get('debt_equity_trend') == 'deteriorating':
        red_flags.append('Rising debt levels relative to equity')
    if results.get('revenue_accelerating') == False and results.get('revenue_acceleration', 0) < -5:
        red_flags.append(f'Revenue growth decelerating ({results.get("revenue_acceleration", 0):.1f}pp slowdown)')
    if results.get('earnings_quality_warning'):
        red_flags.append('Earnings quality concern — profits growing faster than cash flow')
    if results.get('fcf_positive') == False:
        red_flags.append('Negative free cash flow')

    results['red_flags'] = red_flags
    results['red_flag_count'] = len(red_flags)

    print(json.dumps(results))

if __name__ == "__main__":
    main()
