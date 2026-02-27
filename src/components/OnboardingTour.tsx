import { useState, useEffect } from 'react';
import {
  LayoutGrid,
  ShieldCheck,
  Brain,
  Cpu,
  HardDrive,
  X,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

const TOUR_STORAGE_KEY = 'openexpert-tour-completed';

interface TourStep {
  stepNumber: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    stepNumber: 1,
    icon: <LayoutGrid className="h-8 w-8 text-adv-teal" />,
    title: '238+ expert modules across 29 domains',
    description:
      'Browse the sidebar to discover modules built for Financial Crime Prevention, Legal & Regulatory, Audit & Assurance, Consulting, HR, Strategy, and many more. Every module comes pre-configured with expert defaults so you can get professional results with a single click.',
  },
  {
    stepNumber: 2,
    icon: <ShieldCheck className="h-8 w-8 text-adv-teal" />,
    title: 'Trust Score on every output',
    description:
      'Every AI-generated output includes a transparency indicator that shows how the answer was produced — which sources were used, whether web search was active, and what thinking depth was applied. You always know what you can rely on.',
  },
  {
    stepNumber: 3,
    icon: <Brain className="h-8 w-8 text-adv-teal" />,
    title: 'Choose your thinking depth',
    description:
      'Set how deeply the AI should reason before responding. Quick mode gives fast answers for simple questions. Think Hard and Investigate modes apply extended reasoning for complex gap analyses, risk assessments, and multi-document reviews — matching the quality you would expect from a senior consultant.',
  },
  {
    stepNumber: 4,
    icon: <Cpu className="h-8 w-8 text-adv-teal" />,
    title: 'Use any AI model',
    description:
      'Switch between Claude Opus, Sonnet, and Haiku models depending on your task. Opus delivers the highest quality analysis for board-level deliverables. Haiku is faster and more cost-efficient for routine drafting. You choose — the interface adjusts automatically.',
  },
  {
    stepNumber: 5,
    icon: <HardDrive className="h-8 w-8 text-adv-teal" />,
    title: 'Your data never leaves your machine',
    description:
      'This application runs entirely on your local computer. Client documents, uploaded files, and session history are stored only on your device. Only the text you send to Claude passes through the Anthropic API — nothing is stored in any cloud database.',
  },
];

interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OnboardingTour({ isOpen, onClose }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);

  // Reset to first step whenever the tour is opened
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  function handleClose() {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch {
      // localStorage may be unavailable in some environments; ignore silently
    }
    onClose();
  }

  function handleNext() {
    if (isLast) {
      handleClose();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }

  function handlePrev() {
    if (!isFirst) {
      setCurrentStep((prev) => prev - 1);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Getting started tour"
      onClick={(e) => {
        // Close if the user clicks the backdrop itself
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Modal panel */}
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-adv-card shadow-2xl">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-adv-gray-med transition-colors hover:bg-adv-dark hover:text-adv-off-white focus:outline-none focus:ring-2 focus:ring-adv-teal"
          aria-label="Close tour"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Content area */}
        <div className="px-8 pb-6 pt-8">
          {/* Step icon */}
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-adv-teal/10">
            {step.icon}
          </div>

          {/* Step counter label */}
          <p className="mb-2 text-center text-xs font-medium uppercase tracking-widest text-adv-teal">
            Step {step.stepNumber} of {TOUR_STEPS.length}
          </p>

          {/* Title */}
          <h2 className="mb-3 text-center text-lg font-bold text-adv-white">
            {step.title}
          </h2>

          {/* Description */}
          <p className="text-center text-sm leading-relaxed text-adv-gray">
            {step.description}
          </p>
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 pb-4">
          {TOUR_STEPS.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentStep(idx)}
              className={`h-2 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-adv-teal ${
                idx === currentStep
                  ? 'w-6 bg-adv-teal'
                  : 'w-2 bg-adv-gray-med hover:bg-adv-gray'
              }`}
              aria-label={`Go to step ${idx + 1}`}
              aria-current={idx === currentStep ? 'step' : undefined}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between border-t border-border px-8 py-4">
          <button
            onClick={handlePrev}
            disabled={isFirst}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm text-adv-gray transition-colors hover:border-adv-teal hover:text-adv-teal disabled:cursor-not-allowed disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-adv-teal"
            aria-label="Previous step"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>

          <button
            onClick={handleNext}
            className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-5 py-2 text-sm font-medium text-adv-dark transition-colors hover:bg-adv-teal-dark focus:outline-none focus:ring-2 focus:ring-adv-teal focus:ring-offset-2 focus:ring-offset-adv-card"
            aria-label={isLast ? 'Finish tour' : 'Next step'}
          >
            {isLast ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Get Started
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Returns true if the user has not yet completed the onboarding tour.
 * Use this to decide whether to open the tour automatically on first load.
 */
export function shouldShowTour(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) !== 'true';
  } catch {
    return false;
  }
}
