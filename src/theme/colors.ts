export const colors = {
  'adv-dark': '#0B1426',
  'adv-dark-2': '#0F1B2D',
  'adv-card': '#152238',
  'adv-teal': '#2DD4A8',
  'adv-teal-dark': '#1BA882',
  'adv-teal-dim': '#144D3C',
  'adv-teal-soft': '#0D2E3A',
  'adv-white': '#FFFFFF',
  'adv-off-white': '#E0E0E0',
  'adv-gray': '#B0B0B0',
  'adv-gray-med': '#707070',
  'adv-gold': '#F5A623',
  'adv-red': '#E74C3C',
  'adv-green': '#27AE60',
  'adv-blue': '#3498DB',
} as const;

export const moduleColors: Record<string, string> = {
  'gap-analysis': colors['adv-teal'],
  'document-creation': colors['adv-blue'],
  'sanctions-advisory': colors['adv-gold'],
  'regulatory-monitor': colors['adv-green'],
  'training-content': colors['adv-teal'],
  'data-management': colors['adv-blue'],
  'risk-assessment': colors['adv-gold'],
  'investigation-support': colors['adv-red'],
};
