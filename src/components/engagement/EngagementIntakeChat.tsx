/**
 * EngagementIntakeChat — ANTON interviews the consultant.
 *
 * The Scope and Client Intelligence phases were forms, and every March
 * engagement on this instance stalled on them. This panel runs the intake as a
 * conversation: ANTON asks the two or three most valuable questions, proposes
 * what it can infer from the engagement letter (and, when authorised, what it
 * can find about the client online), and writes confirmed answers into the
 * same rows the forms edit — the forms stay as the editable record.
 */
import IntakeChat, { type IntakeTurn } from '@/components/shared/IntakeChat';

interface Props {
  engagementId: string;
  /** engagements.intake_conversation as stored (JSON string or parsed). */
  conversation: string | IntakeTurn[] | null | undefined;
  /** Called after ANTON has written confirmed values, so the form reloads. */
  onApplied: () => void;
  researchAllowed?: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function EngagementIntakeChat({ engagementId, conversation, onApplied, researchAllowed }: Props) {
  return (
    <IntakeChat
      endpoint={`/api/engagements/${engagementId}/intake/turn`}
      conversation={conversation}
      updateType="intake_update"
      blockTag="intake_update"
      title="Let ANTON interview you"
      subtitle={researchAllowed ? 'Online research authorised — ANTON may look the client up.' : 'Answers are written into the form below.'}
      intro="Instead of filling in every field, answer a few questions. ANTON reads the engagement letter first and only asks what it cannot infer."
      startLabel="Start the interview"
      onUpdate={(frame) => {
        const a = (frame.applied ?? {}) as Record<string, number | boolean>;
        const parts: string[] = [];
        if (Number(a.client_intelligence)) parts.push(plural(Number(a.client_intelligence), 'client field', 'client fields'));
        if (Number(a.scope_items)) parts.push(plural(Number(a.scope_items), 'scope item', 'scope items'));
        if (Number(a.boundaries)) parts.push(plural(Number(a.boundaries), 'boundary', 'boundaries'));
        if (parts.length > 0) { onApplied(); return `Saved: ${parts.join(', ')}.`; }
        return a.done ? 'Intake complete — nothing more to add.' : null;
      }}
    />
  );
}
