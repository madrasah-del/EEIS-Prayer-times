import { useState, useEffect } from 'react';
import { fetchQuotes, getRandomQuote, Quote, QuotesData } from '../data/quotes';

export type { Quote };

export function useQuotes() {
  const [quotes, setQuotes] = useState<QuotesData>([]);

  useEffect(() => {
    fetchQuotes().then(data => { if (data.length > 0) setQuotes(data); }).catch(() => {});
  }, []);

  return {
    quotes,
    getRandomQuote: () => getRandomQuote(quotes),
  };
}
