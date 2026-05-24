import { clsx } from "clsx";

interface StatusBadgeProps {
  status: string;
}

const colorMap: Record<string, string> = {
  approved: "bg-green-900/50 text-green-400",
  active: "bg-green-900/50 text-green-400",
  pending: "bg-yellow-900/50 text-yellow-400",
  in_review: "bg-blue-900/50 text-blue-400",
  rejected: "bg-red-900/50 text-red-400",
  revoked: "bg-red-900/50 text-red-400",
  expired: "bg-gray-800 text-gray-400",
  inactive: "bg-gray-800 text-gray-400",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        "text-xs px-2 py-0.5 rounded-full font-medium capitalize",
        colorMap[status] ?? "bg-gray-800 text-gray-400",
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}
