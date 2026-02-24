import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, XCircle, Filter } from 'lucide-react';

interface Violation {
  id: number;
  rule_id: number;
  execution_id: number;
  severity: string;
  description: string;
  affected_entity: string;
  remediation_status: string;
  remediated_at: string | null;
  remediated_by: string | null;
  notes: string | null;
  created_at: string;
}

export default function ViolationsManager() {
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null);

  useEffect(() => {
    fetchViolations();
  }, [statusFilter, severityFilter]);

  async function fetchViolations() {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (severityFilter !== 'all') params.append('severity', severityFilter);

      const response = await fetch(`/api/compliance/violations?${params}`, {
        headers: getAuthHeader()
      });
      const data = await response.json();
      if (data.success) {
        setViolations(data.violations || []);
      }
    } catch (error) {
      console.error('Failed to fetch violations:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateViolationStatus(id: number, status: string) {
    try {
      const response = await fetch(`/api/compliance/violations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          remediation_status: status,
          remediated_at: status !== 'open' ? new Date().toISOString() : null,
          remediated_by: 'current_user' // Replace with actual user context
        })
      });
      const data = await response.json();
      if (data.success) {
        fetchViolations();
        setSelectedViolation(null);
      }
    } catch (error) {
      console.error('Failed to update violation:', error);
    }
  }

  function getAuthHeader(): Record<string, string> {
    const token = localStorage.getItem('openexpert-token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const severityColors = {
    critical: 'bg-adv-red/20 text-adv-red border-adv-red/30',
    high: 'bg-adv-gold/20 text-adv-gold border-adv-gold/30',
    medium: 'bg-adv-blue/20 text-adv-blue border-adv-blue/30',
    low: 'bg-adv-gray/20 text-adv-gray border-adv-gray/30'
  };

  const statusColors = {
    open: 'bg-adv-red/20 text-adv-red',
    remediated: 'bg-adv-green/20 text-adv-green',
    accepted_risk: 'bg-adv-gold/20 text-adv-gold',
    false_positive: 'bg-adv-gray/20 text-adv-gray'
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-adv-gray" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-adv-card border border-border rounded-lg text-sm text-adv-off-white focus:outline-none focus:ring-2 focus:ring-adv-teal"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="remediated">Remediated</option>
            <option value="accepted_risk">Accepted Risk</option>
            <option value="false_positive">False Positive</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-4 py-2 bg-adv-card border border-border rounded-lg text-sm text-adv-off-white focus:outline-none focus:ring-2 focus:ring-adv-teal"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="ml-auto text-sm text-adv-gray">
          {violations.length} violation{violations.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Violations List */}
      {loading ? (
        <div className="text-center py-12 text-adv-gray">Loading violations...</div>
      ) : violations.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle className="h-12 w-12 text-adv-green mx-auto mb-3" />
          <div className="text-adv-off-white font-medium mb-1">No violations found</div>
          <div className="text-sm text-adv-gray">All compliance rules are passing</div>
        </div>
      ) : (
        <div className="space-y-3">
          {violations.map(violation => (
            <div
              key={violation.id}
              className="bg-adv-card border border-border rounded-lg p-4 hover:border-adv-teal/50 transition-colors cursor-pointer"
              onClick={() => setSelectedViolation(violation)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-medium px-2 py-1 rounded border capitalize ${
                      severityColors[violation.severity as keyof typeof severityColors]
                    }`}>
                      {violation.severity}
                    </span>
                    <span className={`text-xs font-medium px-2 py-1 rounded capitalize ${
                      statusColors[violation.remediation_status as keyof typeof statusColors]
                    }`}>
                      {violation.remediation_status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="text-sm text-adv-off-white mb-1">{violation.description}</div>
                  <div className="flex items-center gap-4 text-xs text-adv-gray">
                    <span>Rule ID: {violation.rule_id}</span>
                    <span>Entity: {violation.affected_entity.substring(0, 50)}...</span>
                    <span>{new Date(violation.created_at).toLocaleString()}</span>
                  </div>
                </div>
                <AlertTriangle className="h-5 w-5 text-adv-gold shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Violation Detail Modal */}
      {selectedViolation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-adv-card border border-border rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-auto">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-adv-white">Violation Details</h2>
              <button
                onClick={() => setSelectedViolation(null)}
                className="text-adv-gray hover:text-adv-off-white transition-colors"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs text-adv-gray mb-1">Severity</div>
                <span className={`text-xs font-medium px-2 py-1 rounded border capitalize ${
                  severityColors[selectedViolation.severity as keyof typeof severityColors]
                }`}>
                  {selectedViolation.severity}
                </span>
              </div>

              <div>
                <div className="text-xs text-adv-gray mb-1">Status</div>
                <span className={`text-xs font-medium px-2 py-1 rounded capitalize ${
                  statusColors[selectedViolation.remediation_status as keyof typeof statusColors]
                }`}>
                  {selectedViolation.remediation_status.replace('_', ' ')}
                </span>
              </div>

              <div>
                <div className="text-xs text-adv-gray mb-1">Description</div>
                <div className="text-sm text-adv-off-white">{selectedViolation.description}</div>
              </div>

              <div>
                <div className="text-xs text-adv-gray mb-1">Affected Entity</div>
                <div className="text-sm text-adv-off-white font-mono bg-adv-dark-2 p-2 rounded break-all">
                  {selectedViolation.affected_entity}
                </div>
              </div>

              <div>
                <div className="text-xs text-adv-gray mb-1">Created</div>
                <div className="text-sm text-adv-off-white">
                  {new Date(selectedViolation.created_at).toLocaleString()}
                </div>
              </div>

              {selectedViolation.notes && (
                <div>
                  <div className="text-xs text-adv-gray mb-1">Notes</div>
                  <div className="text-sm text-adv-off-white">{selectedViolation.notes}</div>
                </div>
              )}

              {selectedViolation.remediation_status === 'open' && (
                <div className="pt-4 border-t border-border">
                  <div className="text-sm font-medium text-adv-white mb-3">Update Status</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateViolationStatus(selectedViolation.id, 'remediated')}
                      className="px-4 py-2 bg-adv-green text-adv-dark rounded-lg text-sm font-medium hover:bg-adv-green/80 transition-colors"
                    >
                      Mark Remediated
                    </button>
                    <button
                      onClick={() => updateViolationStatus(selectedViolation.id, 'accepted_risk')}
                      className="px-4 py-2 bg-adv-gold text-adv-dark rounded-lg text-sm font-medium hover:bg-adv-gold/80 transition-colors"
                    >
                      Accept Risk
                    </button>
                    <button
                      onClick={() => updateViolationStatus(selectedViolation.id, 'false_positive')}
                      className="px-4 py-2 bg-adv-gray text-adv-dark rounded-lg text-sm font-medium hover:bg-adv-gray/80 transition-colors"
                    >
                      False Positive
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
