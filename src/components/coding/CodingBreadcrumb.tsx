import { Link } from 'react-router-dom';
import { ChevronRight, Terminal } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface CodingBreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function CodingBreadcrumb({ items, className = '' }: CodingBreadcrumbProps) {
  return (
    <nav className={`flex items-center gap-1 text-xs ${className}`}>
      <Link to="/coding" className="flex items-center gap-1 text-adv-gray hover:text-adv-teal transition-colors">
        <Terminal className="h-3.5 w-3.5" />
        <span>Coding</span>
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-adv-gray" />
          {item.href ? (
            <Link to={item.href} className="text-adv-gray hover:text-adv-teal transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-adv-off-white font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
