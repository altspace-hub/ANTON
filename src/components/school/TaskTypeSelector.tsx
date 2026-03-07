import { useTranslation } from 'react-i18next';
import { BookOpenCheck, Brain, PenLine } from 'lucide-react';

type TaskType = 'homework' | 'studying' | 'practice';

interface TaskOption {
  id: TaskType;
  labelKey: string;
  icon: React.ReactNode;
  descKey: string;
}

const TASK_OPTIONS: TaskOption[] = [
  {
    id: 'homework',
    labelKey: 'chat.taskTypes.homework',
    icon: <BookOpenCheck className="h-5 w-5" />,
    descKey: 'chat.assistanceLevel.L1',
  },
  {
    id: 'studying',
    labelKey: 'chat.taskTypes.studying',
    icon: <Brain className="h-5 w-5" />,
    descKey: 'chat.assistanceLevel.L2',
  },
  {
    id: 'practice',
    labelKey: 'chat.taskTypes.practice',
    icon: <PenLine className="h-5 w-5" />,
    descKey: 'chat.assistanceLevel.L3',
  },
];

interface TaskTypeSelectorProps {
  onSelect: (taskType: TaskType) => void;
}

export default function TaskTypeSelector({ onSelect }: TaskTypeSelectorProps) {
  const { t } = useTranslation('school');

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
      {TASK_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onSelect(option.id)}
          className="flex items-center gap-3 rounded-xl border border-border bg-adv-card px-4 py-3 text-start transition-colors hover:border-adv-teal/40 hover:bg-adv-teal/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-adv-teal/10 text-adv-teal">
            {option.icon}
          </span>
          <div>
            <p className="text-sm font-medium text-adv-off-white">{t(option.labelKey)}</p>
            <p className="text-xs text-adv-gray">{t(option.descKey)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}
