import { useState, useEffect } from 'react';
import { fetchQuotes, quoteForOccurrence, Quote, QuotesData } from '../data/quotes';

export type { Quote };

export function useQuotes() {
  const [quotes, setQuotes] = useState<QuotesData>([]);

  useEffect(() => {
    fetchQuotes().then(data => { if (data.length > 0) setQuotes(data); }).catch(() => {});
  }, []);

  return {
    quotes,
    /** The deterministic quote for a specific (dateKey, prayerKey) occurrence — same result on
     *  every device/platform, no state consumed. */
    quoteForOccurrence: (dateKey: string, prayerKey: string) => quoteForOccurrence(dateKey, prayerKey, quotes),
  };
}
