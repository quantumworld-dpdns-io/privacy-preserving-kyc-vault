import { useState, useMemo, type ReactNode } from "react";
import { clsx } from "clsx";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import Pagination from "./Pagination";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  filterable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string | number;
  pageSize?: number;
  searchable?: boolean;
  searchKeys?: (keyof T)[];
  filterable?: boolean;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyExtractor,
  pageSize = 10,
  searchable = false,
  searchKeys,
  filterable = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    let result = [...data];

    if (search && searchKeys) {
      const q = search.toLowerCase();
      result = result.filter((row) =>
        searchKeys.some((key) => String(row[key]).toLowerCase().includes(q)),
      );
    }

    if (filterable) {
      for (const [key, value] of Object.entries(filters)) {
        if (value) {
          result = result.filter((row) => String(row[key]) === value);
        }
      }
    }

    if (sortKey) {
      result.sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, search, searchKeys, filters, filterable, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const uniqueFilterValues = (key: string): string[] => {
    const values = new Set(data.map((r) => String(r[key])));
    return Array.from(values).sort();
  };

  return (
    <div className="space-y-3">
      {searchable && (
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
          {Object.entries(filters).map(([key, value]) =>
            value ? (
              <button
                key={key}
                onClick={() => setFilters((f) => ({ ...f, [key]: "" }))}
                className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded-full"
              >
                {key}: {value} &times;
              </button>
            ) : null,
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 border-b border-gray-800">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={clsx(
                    "px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider",
                    col.sortable && "cursor-pointer select-none hover:text-white",
                  )}
                  onClick={() => col.sortable && toggleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <span className="inline-block">
                        {sortKey === col.key ? (
                          sortDir === "asc" ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="w-3.5 h-3.5 text-gray-600" />
                        )}
                      </span>
                    )}
                  </span>
                  {filterable && col.filterable && (
                    <select
                      value={filters[col.key] ?? ""}
                      onChange={(e) => {
                        setFilters((f) => ({ ...f, [col.key]: e.target.value }));
                        setCurrentPage(1);
                      }}
                      className="block mt-1 text-xs bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-gray-300"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">All</option>
                      {uniqueFilterValues(col.key).map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                  No results found.
                </td>
              </tr>
            ) : (
              paginated.map((row) => (
                <tr key={keyExtractor(row)} className="hover:bg-gray-800/50">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-gray-300">
                      {col.render ? col.render(row) : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination current={currentPage} total={totalPages} onChange={setCurrentPage} />
    </div>
  );
}
