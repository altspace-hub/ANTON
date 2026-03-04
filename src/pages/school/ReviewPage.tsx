import { useState, useEffect } from 'react';
import { getAuthHeader } from '@/lib/api';
import { useTranslation } from 'react-i18next';
import { FlipHorizontal, CheckCircle2, Loader2 } from 'lucide-react';
import SchoolLayout from '@/components/school/SchoolLayout';

interface ReviewCard {
  id: string;
  front: string;
  back: string;
  subject_id: string;
  due_date: string;
}

export default function ReviewPage() {
  const { t } = useTranslation('school');
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewed, setReviewed] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    loadCards();
  }, []);

  async function loadCards() {
    try {
      const res = await fetch('/api/school/review-cards', { headers: getAuthHeader() });
      if (res.ok) {
        const data = await res.json();
        setCards(data.cards ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleQuality(quality: number) {
    const card = cards[currentIndex];
    if (!card) return;

    await fetch(`/api/school/review-cards/${card.id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ quality }),
    });

    setReviewed(r => r + 1);
    setXpEarned(x => x + (quality >= 3 ? 10 : 5));
    setShowBack(false);

    if (currentIndex + 1 >= cards.length) {
      setDone(true);
    } else {
      setCurrentIndex(i => i + 1);
    }
  }

  if (isLoading) {
    return (
      <SchoolLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-adv-teal" />
        </div>
      </SchoolLayout>
    );
  }

  if (done || cards.length === 0) {
    return (
      <SchoolLayout>
        <div className="mx-auto max-w-lg text-center py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-adv-teal/10 mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-adv-teal" />
          </div>
          <h1 className="text-xl font-bold text-adv-white mb-2">
            {cards.length === 0 ? t('review.noCards', 'No cards due today') : t('review.done', 'Done for today!')}
          </h1>
          <p className="text-adv-gray mb-2">
            {reviewed > 0 && `${reviewed} ${t('review.cardsReviewed', 'cards reviewed')} · +${xpEarned} XP`}
          </p>
          {cards.length === 0 && <p className="text-sm text-adv-gray-med">{t('review.noCardsHint', 'Cards are created automatically as you chat with Alma.')}</p>}
        </div>
      </SchoolLayout>
    );
  }

  const card = cards[currentIndex];
  const progress = Math.round(((currentIndex) / cards.length) * 100);

  return (
    <SchoolLayout>
      <div className="mx-auto max-w-lg">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlipHorizontal className="h-4 w-4 text-adv-teal" />
            <span className="text-sm font-semibold text-adv-white">{t('review.title', 'Review')}</span>
          </div>
          <span className="text-xs text-adv-gray">{currentIndex + 1} / {cards.length}</span>
        </div>

        {/* Progress bar */}
        <div className="mb-6 h-1.5 w-full rounded-full bg-adv-dark">
          <div className="h-1.5 rounded-full bg-adv-teal transition-all" style={{ width: `${progress}%` }} />
        </div>

        {/* Card */}
        <div
          className="min-h-48 rounded-2xl border border-border bg-adv-card p-8 text-center cursor-pointer hover:border-adv-teal/30 transition-colors"
          onClick={() => setShowBack(b => !b)}
        >
          {showBack ? (
            <div>
              <p className="text-xs text-adv-teal mb-2 font-medium">{t('review.answer', 'Answer')}</p>
              <p className="text-lg text-adv-off-white">{card.back}</p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-adv-gray-med mb-2">{t('review.tapToFlip', 'Tap to reveal')}</p>
              <p className="text-lg font-medium text-adv-white">{card.front}</p>
            </div>
          )}
        </div>

        {/* Quality buttons — shown after flip */}
        {showBack && (
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[
              { q: 0, label: t('review.blackout', 'Blackout'), color: 'border-adv-red text-adv-red' },
              { q: 2, label: t('review.hard', 'Hard'), color: 'border-adv-gold text-adv-gold' },
              { q: 4, label: t('review.good', 'Good'), color: 'border-adv-teal text-adv-teal' },
              { q: 5, label: t('review.easy', 'Easy'), color: 'border-adv-green text-adv-green' },
            ].map(({ q, label, color }) => (
              <button
                key={q}
                type="button"
                onClick={() => handleQuality(q)}
                className={`rounded-lg border py-2.5 text-sm font-medium transition-colors hover:opacity-80 ${color}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {!showBack && (
          <div className="mt-4 text-center text-xs text-adv-gray-med">
            {t('review.tapToFlip', 'Tap the card to reveal the answer')}
          </div>
        )}
      </div>
    </SchoolLayout>
  );
}
