import type { IncrementStrategyType } from '../types';

export interface StrategyConfig {
  fixed_inc_cents?: number;
  pct?: number;
  floor_cents?: number;
  mult?: number;
}

export interface IncrementStrategy {
  type: IncrementStrategyType;
  name: string;
  description: string;
  calculateRequiredScore(holderScoreDollars: number, config?: StrategyConfig): number;
}

export const strategies: Record<IncrementStrategyType, IncrementStrategy> = {
  fixed: {
    type: 'fixed',
    name: 'Fixed Increment (+ $0.10)',
    description: 'High velocity. Adds a flat $0.10 to the target score to displace.',
    calculateRequiredScore: (holderScoreDollars: number, config?: StrategyConfig) => {
      const inc = (config?.fixed_inc_cents ?? 10) / 100;
      return Number((holderScoreDollars + inc).toFixed(2));
    },
  },
  percent: {
    type: 'percent',
    name: 'Percentage (+10%, min $0.50)',
    description: 'Recommended default. Adds 10% over the target score with a $0.50 minimum jump.',
    calculateRequiredScore: (holderScoreDollars: number, config?: StrategyConfig) => {
      const pct = config?.pct ?? 0.10;
      const floor = (config?.floor_cents ?? 50) / 100;
      const delta = Math.max(holderScoreDollars * pct, floor);
      return Number((holderScoreDollars + delta).toFixed(2));
    },
  },
  expo: {
    type: 'expo',
    name: 'Exponential (× 2.0)',
    description: 'Doubling Day events only. Displacing requires double the current score.',
    calculateRequiredScore: (holderScoreDollars: number, config?: StrategyConfig) => {
      const mult = config?.mult ?? 2.0;
      return Number((holderScoreDollars * mult).toFixed(2));
    },
  },
};

export function getRequiredScoreToDisplace(
  strategyType: IncrementStrategyType,
  holderScoreDollars: number,
  config?: StrategyConfig
): number {
  const strategy = strategies[strategyType] || strategies.percent;
  return strategy.calculateRequiredScore(holderScoreDollars, config);
}
