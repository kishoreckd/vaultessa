import { useQuery } from '@tanstack/react-query';
import { loadStrengthEstimator } from '@/lib/crypto/strength';

export function useStrengthEstimator() {
  return useQuery({
    queryKey: ['password-strength-estimator'],
    queryFn: loadStrengthEstimator,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}
