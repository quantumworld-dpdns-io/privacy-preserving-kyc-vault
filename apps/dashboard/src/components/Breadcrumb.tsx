import { Fragment } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

interface Crumb {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  crumbs: Crumb[];
}

export default function Breadcrumb({ crumbs }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500 mb-4">
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <Fragment key={idx}>
            {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
            {crumb.href && !isLast ? (
              <Link to={crumb.href} className="hover:text-gray-300 transition-colors">
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? "text-gray-300 font-medium" : ""}>{crumb.label}</span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
