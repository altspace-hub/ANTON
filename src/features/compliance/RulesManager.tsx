import { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Trash2, ToggleLeft, ToggleRight, Shield, Brain, Loader2, ChevronDown, ChevronRight } from 'lucide-react';

interface ComplianceRule {
  id: number;
  rule_code: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  regulatory_source: string | null;
  rule_logic: string;
  active: number;
  auto_remediate: number;
  created_at: string;
  updated_at: string;
}

interface RuleSuggestion {
  name: string; description: string; category: string; condition: string; severity: string; rationale: string;
}

export default function RulesManager() {
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedRule, setSelectedRule] = useState<ComplianceRule | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [suggestions, setSuggestions] = useState<RuleSuggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    fetchRules();
  }, [categoryFilter]);

  async function fetchRules() {
    try {
      const url = categoryFilter === 'all'
        ? '/api/compliance/rules'
        : `/api/compliance/rules?category=${categoryFilter}`;
      const response = await fetch(url, { headers: getAuthHeader() });
      const data = await response.json();
      if (data.success) {
        setRules(data.rules || []);
      }
    } catch (error) {
      console.error('Failed to fetch rules:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleRuleActive(rule: ComplianceRule) {
    try {
      const response = await fetch(`/api/compliance/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ active: rule.active === 1 ? 0 : 1 })
      });
      const data = await response.json();
      if (data.success) {
        await fetchRules();
      }
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  }

  async function deleteRule(id: number) {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      const response = await fetch(`/api/compliance/rules/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader()
      });
      const data = await response.json();
      if (data.success) {
        await fetchRules();
      }
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  }

  async function suggestRules() {
    setSuggestLoading(true);
    setShowSuggestions(true);
    try {
      const r = await fetch('/api/ai-assist/compliance-suggest-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ existingRules: rules.map(r => ({ name: r.title, description: r.description })), goal: 'Improve AI output quality and governance' }),
      });
      if (r.ok) { const { suggestions: s } = await r.json(); setSuggestions(s as RuleSuggestion[]); }
    } catch { /* ignore */ } finally { setSuggestLoading(false); }
  }

  function getAuthHeader(): Record<string, string> {
    const token = localStorage.getItem('openexpert-token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const filteredRules = rules.filter(rule =>
    rule.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rule.rule_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    rule.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'kyc', label: 'KYC' },
    { value: 'transaction_monitoring', label: 'Transaction Monitoring' },
    { value: 'sanctions', label: 'Sanctions' },
    { value: 'reporting', label: 'Reporting' },
    { value: 'governance', label: 'Governance' },
    { value: 'data_quality', label: 'Data Quality' },
    { value: 'operational', label: 'Operational' }
  ];

  const severityColors = {
    critical: 'bg-adv-red/20 text-adv-red border-adv-red/30',
    high: 'bg-adv-gold/20 text-adv-gold border-adv-gold/30',
    medium: 'bg-adv-blue/20 text-adv-blue border-adv-blue/30',
    low: 'bg-adv-gray/20 text-adv-gray border-adv-gray/30'
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-adv-gray" />
          <input
            type="text"
            placeholder="Search rules..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-adv-card border border-border rounded-lg text-sm text-adv-off-white placeholder-adv-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2 bg-adv-card border border-border rounded-lg text-sm text-adv-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal"
        >
          {categories.map(cat => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>

        <button
          onClick={suggestRules}
          disabled={suggestLoading}
          className="flex items-center gap-2 px-3 py-2 border border-adv-teal/40 bg-adv-teal/10 text-adv-teal rounded-lg text-sm hover:bg-adv-teal/20 disabled:opacity-40 transition-colors"
          title="Let AI suggest new compliance rules based on your existing rules"
        >
          {suggestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          AI Suggest
        </button>

        <button
          onClick={() => {
            setSelectedRule(null);
            setShowEditor(true);
          }}
          className="px-4 py-2 bg-adv-teal text-adv-dark rounded-lg text-sm font-medium hover:bg-adv-teal-dark transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Rule
        </button>
      </div>

      {/* AI Rule Suggestions */}
      {showSuggestions && (
        <div className="rounded-xl border border-adv-teal/30 bg-adv-teal-soft p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-adv-teal" />
              <span className="text-sm font-semibold text-adv-off-white">AI Rule Suggestions</span>
            </div>
            <button onClick={() => setShowSuggestions(false)} className="text-xs text-adv-gray hover:text-adv-off-white">Dismiss</button>
          </div>
          {suggestLoading && <p className="text-sm text-adv-gray animate-pulse">Generating suggestions…</p>}
          {!suggestLoading && suggestions.length === 0 && <p className="text-sm text-adv-gray">No suggestions generated.</p>}
          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <div key={i} className="rounded-lg bg-adv-card border border-border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="h-3.5 w-3.5 text-adv-teal" />
                  <span className="text-sm font-medium text-adv-off-white">{s.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-adv-dark text-adv-gray capitalize">{s.category}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded capitalize ml-auto ${s.severity === 'error' ? 'text-adv-red' : 'text-adv-gold'}`}>{s.severity}</span>
                </div>
                <p className="text-xs text-adv-gray mb-1">{s.description}</p>
                <p className="text-xs text-adv-off-white"><span className="text-adv-gray">Condition:</span> {s.condition}</p>
                <p className="text-xs text-adv-gray mt-1 italic">{s.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rules Table */}
      {loading ? (
        <div className="text-center py-12 text-adv-gray">Loading rules...</div>
      ) : filteredRules.length === 0 ? (
        <div className="text-center py-12">
          <Shield className="h-12 w-12 text-adv-gray mx-auto mb-3" />
          <div className="text-adv-gray">No rules found</div>
        </div>
      ) : (
        <div className="bg-adv-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-adv-dark-2 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-adv-gray uppercase">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-adv-gray uppercase">Title</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-adv-gray uppercase">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-adv-gray uppercase">Severity</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-adv-gray uppercase">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-adv-gray uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((rule, idx) => (
                  <tr
                    key={rule.id}
                    className={`border-b border-border hover:bg-adv-dark-2 transition-colors ${
                      idx === filteredRules.length - 1 ? 'border-b-0' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono text-adv-teal">{rule.rule_code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-adv-off-white">{rule.title}</div>
                        {rule.description && (
                          <div className="text-xs text-adv-gray mt-1 line-clamp-1">{rule.description}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-adv-gray capitalize bg-adv-dark-2 px-2 py-1 rounded">
                        {rule.category.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded border capitalize ${
                        severityColors[rule.severity as keyof typeof severityColors]
                      }`}>
                        {rule.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleRuleActive(rule)}
                        className="flex items-center gap-1.5 text-sm"
                      >
                        {rule.active === 1 ? (
                          <>
                            <ToggleRight className="h-5 w-5 text-adv-green" />
                            <span className="text-adv-green">Active</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-5 w-5 text-adv-gray" />
                            <span className="text-adv-gray">Inactive</span>
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedRule(rule);
                            setShowEditor(true);
                          }}
                          className="p-1.5 rounded-lg text-adv-gray hover:text-adv-teal hover:bg-adv-dark-2 transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="p-1.5 rounded-lg text-adv-gray hover:text-adv-red hover:bg-adv-dark-2 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Editor Modal - Placeholder */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-adv-card border border-border rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-auto">
            <h2 className="text-lg font-semibold text-adv-white mb-4">
              {selectedRule ? 'Edit Rule' : 'Create Rule'}
            </h2>
            <p className="text-sm text-adv-gray mb-4">
              Rule editor UI coming soon. Use API or database directly for now.
            </p>
            <button
              onClick={() => setShowEditor(false)}
              className="px-4 py-2 bg-adv-teal text-adv-dark rounded-lg text-sm font-medium hover:bg-adv-teal-dark transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
