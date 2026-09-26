import { useMemo } from 'react';
import { useDemoStore } from '@/stores/useDemoStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { demoCatalogue, type DemoCatalogue } from '@/lib/demo-catalogue';

/**
 * The module catalogue as the signed-in person may see it: on a public demo a
 * visitor is not shown the modules and areas kept off it (src/lib/demo-catalogue.ts).
 * Admins and ordinary servers get the whole catalogue.
 */
export function useDemoCatalogue(): DemoCatalogue {
  const cfg = useDemoStore((s) => s.config);
  const role = useAuthStore((s) => s.user?.role);
  return useMemo(() => demoCatalogue(cfg, role), [cfg, role]);
}
