import { useState } from 'react';
import type { Choice } from '@/lib/types';

interface Props {
  choices: Choice[];
  disabled?: boolean;
  aiActive?: boolean;
  onPick: (choiceId: string, customAction?: string) => void;
}

export function ChoiceList({ choices, disabled, aiActive, onPick }: Props) {
  const [customText, setCustomText] = useState('');

  const submitCustom = () => {
    const text = customText.trim();
    if (!text || disabled) return;
    onPick(choices[0]!.id, text);
    setCustomText('');
  };

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

      {aiActive && (
        <div className="cs-choice-custom">
          <textarea
            className="cs-choice-custom-input"
            placeholder="或者，输入你的行动…（最多 50 字）"
            value={customText}
            disabled={disabled}
            rows={2}
            maxLength={50}
            onChange={(e) => setCustomText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitCustom();
              }
            }}
          />
          <button
            type="button"
            className="cs-choice-custom-submit"
            disabled={disabled || !customText.trim()}
            onClick={submitCustom}
          >
            确认
          </button>
        </div>
      )}
    </div>
  );
}
