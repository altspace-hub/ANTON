import { create } from 'zustand';
import type { WorkflowDefinition, WorkflowStep, WorkflowStepType } from '@/lib/workflow-definitions';

const STORAGE_KEY = 'openexpert-custom-workflows';

interface CustomWorkflowMetadata {
  name: string;
  description: string;
  category: string;
  estimatedTime: string;
}

interface WorkflowStore {
  customWorkflows: WorkflowDefinition[];
  loadWorkflows: () => void;
  saveWorkflow: (workflow: WorkflowDefinition) => void;
  deleteWorkflow: (id: string) => void;
  getWorkflow: (id: string) => WorkflowDefinition | undefined;
}

function loadFromStorage(): WorkflowDefinition[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore parse errors
  }
  return [];
}

function saveToStorage(workflows: WorkflowDefinition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows));
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  customWorkflows: loadFromStorage(),

  loadWorkflows: () => {
    set({ customWorkflows: loadFromStorage() });
  },

  saveWorkflow: (workflow) => {
    const current = get().customWorkflows;
    const idx = current.findIndex((w) => w.id === workflow.id);
    const updated = idx >= 0
      ? current.map((w, i) => (i === idx ? workflow : w))
      : [...current, workflow];
    saveToStorage(updated);
    set({ customWorkflows: updated });
  },

  deleteWorkflow: (id) => {
    const updated = get().customWorkflows.filter((w) => w.id !== id);
    saveToStorage(updated);
    set({ customWorkflows: updated });
  },

  getWorkflow: (id) => {
    return get().customWorkflows.find((w) => w.id === id);
  },
}));

// Helper: create a blank step for any step type
export function createBlankStep(type: WorkflowStepType): WorkflowStep {
  const id = `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const defaults: Record<WorkflowStepType, { label: string; description: string; config: WorkflowStep['config'] }> = {
    input: {
      label: 'User Input',
      description: 'Collect information from the user',
      config: {
        inputFields: [
          { id: 'field1', label: 'Input field', type: 'textarea', required: true, placeholder: 'Enter information...' },
        ],
      },
    },
    claude: {
      label: 'AI Analysis',
      description: 'Claude analyses the input',
      config: {
        thinking: 'think_hard',
        creativity: 'balanced',
        promptTemplate: 'Analyze the following:\n\n{{field1}}',
      },
    },
    export: {
      label: 'Export',
      description: 'Export the results',
      config: { exportFormat: 'docx' },
    },
    conditional: {
      label: 'Conditional',
      description: 'Branch based on a condition',
      config: { condition: '' },
    },
    api_call: {
      label: 'API Call',
      description: 'Call an external API endpoint',
      config: { method: 'GET', endpointPath: '', outputVariable: 'api_response' },
    },
    database_query: {
      label: 'Database Query',
      description: 'Execute a SQL query',
      config: { queryTemplate: 'SELECT * FROM table LIMIT 100', maxRows: 100, outputVariable: 'query_result' },
    },
    file_read: {
      label: 'Read File',
      description: 'Read files from a filesystem connection',
      config: { pathPattern: '', outputVariable: 'file_content' },
    },
    file_write: {
      label: 'Write File',
      description: 'Write output to a filesystem connection',
      config: { outputPath: '/outputs/{{date}}.md' },
    },
    script: {
      label: 'Run Script',
      description: 'Run an approved script from the library',
      config: { parameterMapping: {}, outputVariable: 'script_result' },
    },
    email_send: {
      label: 'Send Email',
      description: 'Send an email notification',
      config: { toTemplate: '', subjectTemplate: '', bodyTemplate: '' },
    },
    decision_gate: {
      label: 'Decision Gate',
      description: 'Conditional branch: continue or skip',
      config: {
        decisionCondition: { leftOperand: '{{step_1.field}}', operator: '==', rightOperand: 'expected' },
      },
    },
    transform: {
      label: 'Transform Data',
      description: 'Map and transform data between steps',
      config: { fieldMappings: [], outputVariable: 'transformed_data' },
    },
    loop: {
      label: 'Loop',
      description: 'Execute steps for each item in a list',
      config: { inputListPath: '{{step_1.items}}', loopSteps: [], maxIterations: 100 },
    },
    parallel: {
      label: 'Parallel',
      description: 'Execute multiple steps simultaneously',
      config: { parallelGroups: [] },
    },
    wait: {
      label: 'Wait',
      description: 'Pause for a duration or until a condition',
      config: { waitSeconds: 60 },
    },
    sub_workflow: {
      label: 'Sub-workflow',
      description: 'Execute another saved workflow as a step',
      config: { subWorkflowInputMapping: {}, outputVariable: 'sub_workflow_result' },
    },
    notification: {
      label: 'Send Notification',
      description: 'Send a Slack/Teams webhook notification',
      config: { messageTemplate: 'Workflow {{workflow.label}} update' },
    },
    checkpoint: {
      label: 'Human Checkpoint',
      description: 'Pause for human review and approval',
      config: { checkpointMessage: 'Please review before continuing.' },
    },
    data_import: {
      label: 'Import Data',
      description: 'Load a dataset from a file, database, or saved dataset',
      config: { importSource: 'file' as const },
    },
    data_transform: {
      label: 'Transform Data',
      description: 'Apply transformation operations to a dataset',
      config: { transformOperations: [] },
    },
    data_merge: {
      label: 'Merge Datasets',
      description: 'Join or combine two datasets',
      config: { mergeType: 'join' as const, joinType: 'inner' as const },
    },
    data_export: {
      label: 'Export Dataset',
      description: 'Save a dataset to a file or database',
      config: { exportDestination: 'file' as const, exportFileType: 'csv' as const },
    },
    messaging_notification: {
      label: 'Messaging Notification',
      description: 'Send a message to a Slack or Teams channel',
      config: { level: 'info' as const },
    },
    llm: {
      label: 'LLM Call',
      description: 'Run a prompt through a cost-efficient model (server-side, headless).',
      config: {},
    },
    approval: {
      label: 'Approval Gate',
      description: 'Pause the workflow until a human explicitly approves.',
      config: {},
    },
  };

  const def = defaults[type];
  return { id, label: def.label, description: def.description, type, config: def.config };
}

// Helper: create a blank custom workflow
export function createBlankWorkflow(): WorkflowDefinition {
  return {
    id: `custom-${Date.now()}`,
    label: 'New Custom Workflow',
    shortLabel: 'Custom',
    icon: 'ClipboardList',
    description: '',
    category: 'assessment' as WorkflowDefinition['category'],
    estimatedTime: '5-10 min',
    steps: [],
    tags: ['custom'],
  };
}
