import { useState } from 'react';
import { ShieldCheck, Settings, AlertTriangle, Activity, Download, Loader2 } from 'lucide-react';
import ComplianceDashboard from '@/features/compliance/ComplianceDashboard';
import RulesManager from '@/features/compliance/RulesManager';
import ViolationsManager from '@/features/compliance/ViolationsManager';
import ExecutionsLog from '@/features/compliance/ExecutionsLog';
import { exportComplianceRulesetAnton } from '@/lib/api';

type Tab = 'dashboard' | 'rules' | 'violations' | 'executions';

export default function CompliancePage() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [exportingAnton, setExportingAnton] = useState(false);

  const handleExportAnton = async () => {
    if (exportingAnton) return;
    setExportingAnton(true);
    try {
      const blob = await exportComplianceRulesetAnton({ name: 'Compliance Ruleset', description: 'Exported compliance rules' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compliance-ruleset-${Date.now()}.anton`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* non-fatal */ }
    finally { setExportingAnton(false); }
  };

  const tabs = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: ShieldCheck },
    { id: 'rules' as const, label: 'Rules', icon: Settings },
    { id: 'violations' as const, label: 'Violations', icon: AlertTriangle },
    { id: 'executions' as const, label: 'Executions', icon: Activity }
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-adv-white flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-adv-teal" />
              Compliance-as-Code
            </h1>
            <p className="text-sm text-adv-gray mt-1">
              Automated compliance rule engine for quality assurance and governance
            </p>
          </div>
          <button
            onClick={handleExportAnton}
            disabled={exportingAnton}
            className="flex items-center gap-2 rounded-lg border border-adv-teal/30 bg-adv-teal/10 px-3 py-1.5 text-xs font-medium text-adv-teal hover:bg-adv-teal/20 transition-colors disabled:opacity-50"
            title="Export all active compliance rules as a shareable .anton file"
          >
            {exportingAnton ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export Rules as .anton
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-4">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-adv-teal text-adv-dark'
                    : 'text-adv-gray hover:bg-adv-card hover:text-adv-off-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'dashboard' && <ComplianceDashboard />}
        {activeTab === 'rules' && <RulesManager />}
        {activeTab === 'violations' && <ViolationsManager />}
        {activeTab === 'executions' && <ExecutionsLog />}
      </div>
    </div>
  );
}
