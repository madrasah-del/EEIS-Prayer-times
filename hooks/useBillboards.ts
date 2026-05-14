import { useState, useEffect, useCallback } from 'react';
import {
  fetchBillboardConfig,
  getActiveSlidesForPrayer,
  Billboard,
  BillboardConfig,
} from '../data/billboards';

export type { Billboard };

export function useBillboards() {
  const [config, setConfig] = useState<BillboardConfig | null>(null);

  useEffect(() => {
    fetchBillboardConfig()
      .then(cfg => { if (cfg) setConfig(cfg); })
      .catch(() => {});
  }, []);

  /** Returns slides for the first active campaign matching today + the given prayer. */
  const getSlidesForPrayer = useCallback(
    (prayer: string): Billboard[] => {
      if (!config) return [];
      return getActiveSlidesForPrayer(prayer, config);
    },
    [config],
  );

  return { getSlidesForPrayer };
}
