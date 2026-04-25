import type { Choice } from '@/lib/types';

interface Props {
  choices: Choice[];
  disabled?: boolean;
  onPick: (choiceId: string) => void;
}

export function ChoiceList({ choices, disabled, onPick }: Props) {
  return (
    <div className="grid" style={{ gap: 12 }}>
      {choices.map((c) => (
        <button
          key={c.id}
          type="button"
          className="choice-card"
          disabled={disabled}
          onClick={() => onPick(c.id)}
        >
          <div className="choice-label">{c.label}</div>
          <div className="choice-desc">{c.description}</div>
        </button>
      ))}
    </div>
  );
}
