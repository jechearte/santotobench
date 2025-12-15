interface StatsCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  color?: "default" | "green" | "amber" | "blue" | "purple";
}

const colorClasses = {
  default: {
    bg: "bg-gradient-to-br from-pizarra-50 to-pizarra-100",
    border: "border-pizarra-200",
    text: "text-pizarra-700",
    icon: "bg-pizarra-200",
  },
  green: {
    bg: "bg-gradient-to-br from-green-50 to-emerald-100",
    border: "border-green-200",
    text: "text-green-700",
    icon: "bg-green-200",
  },
  amber: {
    bg: "bg-gradient-to-br from-amber-50 to-orange-100",
    border: "border-amber-200",
    text: "text-amber-700",
    icon: "bg-amber-200",
  },
  blue: {
    bg: "bg-gradient-to-br from-blue-50 to-indigo-100",
    border: "border-blue-200",
    text: "text-blue-700",
    icon: "bg-blue-200",
  },
  purple: {
    bg: "bg-gradient-to-br from-purple-50 to-violet-100",
    border: "border-purple-200",
    text: "text-purple-700",
    icon: "bg-purple-200",
  },
};

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  color = "default",
}: StatsCardProps) {
  const styles = colorClasses[color];
  
  return (
    <div className={`rounded-2xl p-4 border ${styles.bg} ${styles.border} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between mb-3">
        <p className={`text-xs font-semibold uppercase tracking-wide ${styles.text} opacity-70`}>
          {title}
        </p>
        <span className={`w-8 h-8 rounded-lg ${styles.icon} flex items-center justify-center text-lg`}>
          {icon}
        </span>
      </div>
      <p className={`text-2xl font-bold ${styles.text}`}>{value}</p>
      {subtitle && (
        <p className={`text-xs mt-1 ${styles.text} opacity-60`}>{subtitle}</p>
      )}
    </div>
  );
}
