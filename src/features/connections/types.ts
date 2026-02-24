export type ConnectionType = 'database' | 'api' | 'filesystem' | 'email' | 'script_library' | 'channel_bridge';

export type ChannelType = 'whatsapp' | 'telegram' | 'sms' | 'voice' | 'generic_http';

export interface BridgeConfig {
  channel_type: ChannelType;
  token: string;
  allowed_modules: string[];
  default_module: string;
  rate_limit_rpm: number;
  max_response_length: number;
  language_hint: string;
  call_count: number;
  last_called_at: string | null;
}

export interface ChannelBridge {
  id: string;
  display_name: string;
  type: 'channel_bridge';
  status: 'pending' | 'active' | 'disabled' | 'error';
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
  endpoint_url: string;
  config: BridgeConfig;
  token_plain?: string; // Only present on creation response
  _notice?: string;
}
export type ConnectionStatus = 'pending' | 'active' | 'disabled' | 'error';

export interface Connection {
  id: string;
  display_name: string;
  type: ConnectionType;
  config: Record<string, unknown>;
  permissions: string[];
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  status: ConnectionStatus;
  last_tested?: string;
  last_test_result?: string;
  created_at: string;
  updated_at: string;
}

export interface Script {
  id: string;
  display_name: string;
  description?: string;
  language: 'python' | 'bash' | 'r' | 'powershell' | 'node';
  script_path: string;
  parameters?: Record<string, unknown>;
  expected_outputs?: Record<string, unknown>;
  max_runtime_seconds: number;
  memory_limit_mb: number;
  sandbox: boolean;
  network_access: boolean;
  file_hash?: string;
  version: string;
  approved_by?: string;
  approved_at?: string;
  status: string;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  connection_id: string;
  execution_id?: string;
  action: string;
  details?: Record<string, unknown>;
  result_summary?: string;
  executed_at: string;
  executed_by: string;
}
