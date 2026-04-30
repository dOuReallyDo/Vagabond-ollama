import { motion } from 'framer-motion';
import type { ActiveStep } from '../shared/contract-v2';

interface StepIndicatorProps {
  activeStep: ActiveStep;
  step1Completed: boolean;
  step2Completed: boolean;
  step3Completed: boolean;
  onStepClick: (step: ActiveStep) => void;
}

const STEPS: { key: ActiveStep; label: string }[] = [
  { key: 1, label: 'Itinerario' },
  { key: 2, label: 'Alloggi & Trasporti' },
  { key: 3, label: 'Budget' },
];

export default function StepIndicator({
  activeStep,
  step1Completed,
  step2Completed,
  step3Completed,
  onStepClick,
}: StepIndicatorProps) {
  const completedMap: Record<1 | 2 | 3, boolean> = {
    1: step1Completed,
    2: step2Completed,
    3: step3Completed,
  };

  const isStepCompleted = (step: ActiveStep) => completedMap[step];
  const isActive = (step: ActiveStep) => step === activeStep;

  const canClick = (step: ActiveStep): boolean => {
    // Can always click the active step
    if (isActive(step)) return true;
    // Can click completed steps to go back and review
    if (isStepCompleted(step)) return true;
    // Can click the next uncompleted step if the previous one is completed
    if (step === 1) return true;
    if (step === 2 && step1Completed) return true;
    if (step === 3 && step2Completed) return true;
    return false;
  };

  const getStepStatus = (step: ActiveStep): 'completed' | 'active' | 'pending' => {
    if (isStepCompleted(step) && !isActive(step)) return 'completed';
    if (isActive(step)) return 'active';
    return 'pending';
  };

  return (
    <nav aria-label="Progresso del viaggio" className="w-full">
      {/* Desktop: Horizontal layout */}
      <div className="hidden sm:flex items-start justify-center w-full max-w-xl mx-auto">
        {STEPS.map((step, idx) => {
          const status = getStepStatus(step.key);
          const clickable = canClick(step.key);

          return (
            <div key={step.key} className="flex items-start flex-1">
              {/* Circle + Label */}
              <div className="flex flex-col items-center flex-1">
                <motion.button
                  type="button"
                  disabled={!clickable}
                  onClick={() => onStepClick(step.key)}
                  className={`
                    relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                    transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400
                    ${clickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}
                    ${status === 'active' ? 'bg-blue-500 text-white' : ''}
                    ${status === 'completed' ? 'bg-green-500 text-white' : ''}
                    ${status === 'pending' ? 'bg-gray-300 text-gray-600' : ''}
                  `}
                  initial={false}
                  animate={{
                    scale: status === 'active' ? [1, 1.15, 1] : 1,
                  }}
                  transition={{
                    scale: {
                      duration: 1.8,
                      repeat: status === 'active' ? Infinity : 0,
                      ease: 'easeInOut',
                    },
                  }}
                  aria-current={status === 'active' ? 'step' : undefined}
                  aria-label={`Step ${step.key}: ${step.label}${
                    status === 'completed' ? ' (completato)' : ''
                  }${status === 'active' ? ' (attivo)' : ''}`}
                >
                  {/* Pulse ring behind active circle */}
                  {status === 'active' && (
                    <motion.span
                      className="absolute inset-0 rounded-full bg-blue-400"
                      initial={{ opacity: 0.6, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.8 }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeOut',
                      }}
                    />
                  )}

                  {/* Content: checkmark or number */}
                  <motion.span
                    className="relative z-10"
                    key={status}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    {status === 'completed' ? (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      step.key
                    )}
                  </motion.span>
                </motion.button>

                {/* Step label */}
                <motion.span
                  className={`
                    mt-2 text-xs font-medium text-center leading-tight
                    ${status === 'active' ? 'text-blue-600' : ''}
                    ${status === 'completed' ? 'text-green-600' : ''}
                    ${status === 'pending' ? 'text-gray-400' : ''}
                  `}
                  initial={false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {step.label}
                </motion.span>
              </div>

              {/* Connector line between circles (not after last step) */}
              {idx < STEPS.length - 1 && (
                <div className="flex-1 flex items-center pt-3">
                  <motion.div
                    className="w-full h-0.5 rounded-full"
                    initial={false}
                    animate={{
                      backgroundColor:
                        isStepCompleted(step.key) && step.key < activeStep
                          ? '#22c55e' // green-500
                          : step.key === activeStep && isStepCompleted(STEPS[idx + 1].key as ActiveStep)
                          ? '#22c55e'
                          : step.key < activeStep
                          ? '#3b82f6' // blue-500
                          : '#d1d5db', // gray-300
                    }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: Vertical layout */}
      <div className="sm:hidden flex flex-col items-center w-full max-w-xs mx-auto py-2">
        {STEPS.map((step, idx) => {
          const status = getStepStatus(step.key);
          const clickable = canClick(step.key);

          return (
            <div key={step.key} className="flex flex-col items-center w-full">
              {/* Step row: circle + label */}
              <motion.button
                type="button"
                disabled={!clickable}
                onClick={() => onStepClick(step.key)}
                className={`
                  relative flex items-center gap-3 w-full py-3 px-4 rounded-lg
                  transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400
                  ${clickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}
                  ${status === 'active' ? 'bg-blue-50' : ''}
                  ${status === 'completed' ? 'bg-green-50' : ''}
                  ${status === 'pending' ? 'bg-gray-50' : ''}
                `}
                initial={false}
                animate={{ opacity: 1 }}
                aria-current={status === 'active' ? 'step' : undefined}
                aria-label={`Step ${step.key}: ${step.label}${
                  status === 'completed' ? ' (completato)' : ''
                }${status === 'active' ? ' (attivo)' : ''}`}
              >
                {/* Circle */}
                <motion.span
                  className={`
                    relative flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold
                    ${status === 'active' ? 'bg-blue-500 text-white' : ''}
                    ${status === 'completed' ? 'bg-green-500 text-white' : ''}
                    ${status === 'pending' ? 'bg-gray-300 text-gray-600' : ''}
                  `}
                  initial={false}
                  animate={{
                    scale: status === 'active' ? [1, 1.12, 1] : 1,
                  }}
                  transition={{
                    scale: {
                      duration: 1.8,
                      repeat: status === 'active' ? Infinity : 0,
                      ease: 'easeInOut',
                    },
                  }}
                >
                  {/* Pulse ring behind active circle (mobile) */}
                  {status === 'active' && (
                    <motion.span
                      className="absolute inset-0 rounded-full bg-blue-400"
                      initial={{ opacity: 0.6, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.8 }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: 'easeOut',
                      }}
                    />
                  )}

                  <motion.span
                    className="relative z-10"
                    key={status}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    {status === 'completed' ? (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      step.key
                    )}
                  </motion.span>
                </motion.span>

                {/* Label */}
                <motion.span
                  className={`
                    text-sm font-medium text-left
                    ${status === 'active' ? 'text-blue-600' : ''}
                    ${status === 'completed' ? 'text-green-600' : ''}
                    ${status === 'pending' ? 'text-gray-400' : ''}
                  `}
                  initial={false}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {step.label}
                </motion.span>
              </motion.button>

              {/* Connector line between steps (not after last) */}
              {idx < STEPS.length - 1 && (
                <motion.div
                  className="w-0.5 h-6 rounded-full"
                  initial={false}
                  animate={{
                    backgroundColor:
                      isStepCompleted(step.key) ? '#22c55e' : '#d1d5db',
                  }}
                  transition={{ duration: 0.4 }}
                />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}