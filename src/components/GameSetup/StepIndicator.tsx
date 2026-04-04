interface StepIndicatorProps {
  steps: number;
  current: number;
}

export function StepIndicator({ steps, current }: StepIndicatorProps) {
  return (
    <div className="step-indicator">
      {Array.from({ length: steps }, (_, i) => (
        <div
          key={i}
          className={`step-dot ${i < current ? 'done' : ''} ${i === current ? 'active' : ''}`}
        />
      ))}
    </div>
  );
}
