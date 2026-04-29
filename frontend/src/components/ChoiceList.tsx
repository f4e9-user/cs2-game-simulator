import type { Choice } from '@/lib/types';

interface Props {
  choices: Choice[];
  disabled?: boolean;
  onPick: (choiceId: string) => void;
}

export function ChoiceList({ choices, disabled, onPick }: Props) {
  return (
    <div className="cs-choices">
      {choices.map((c, i) => (
        <button
          key={c.id}
          type="button"
          className="cs-choice"
          disabled={disabled}
          onClick={() => onPick(c.id)}
        >
          <span className="cs-choice-num">{i + 1}</span>
          <div className="cs-choice-label">{c.label}</div>
          <div className="cs-choice-desc">{c.description}</div>
        </button>
      ))}
    </div>
  );
}
